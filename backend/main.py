import asyncio
import logging
import socketio

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

logger = logging.getLogger(__name__)

# ── Database ──────────────────────────────────────────────────────────────────
from database import engine
import models.user
import models.event
import models.attendee
import models.party
import models.chat_message
import models.review
import models.notification
import models.kudago_event
import models.party_coordination
import models.push_subscription
import models.message_reaction

models.user.Base.metadata.create_all(bind=engine)
models.event.Base.metadata.create_all(bind=engine)
models.attendee.Base.metadata.create_all(bind=engine)
models.party.Base.metadata.create_all(bind=engine)
models.chat_message.Base.metadata.create_all(bind=engine)
models.review.Base.metadata.create_all(bind=engine)
models.party_coordination.Base.metadata.create_all(bind=engine)
models.push_subscription.Base.metadata.create_all(bind=engine)
models.message_reaction.Base.metadata.create_all(bind=engine)


def _run_column_migrations():
    """Add new columns to existing tables (idempotent — silently skips if column exists)."""
    from sqlalchemy import text, inspect as sa_inspect
    insp = sa_inspect(engine)
    existing = {c["name"] for c in insp.get_columns("chat_messages")}
    with engine.connect() as conn:
        if "is_system" not in existing:
            conn.execute(text(
                "ALTER TABLE chat_messages ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT FALSE"
            ))
        if "event_type" not in existing:
            conn.execute(text(
                "ALTER TABLE chat_messages ADD COLUMN event_type VARCHAR(50)"
            ))
        if "file_url" not in existing:
            conn.execute(text(
                "ALTER TABLE chat_messages ADD COLUMN file_url TEXT"
            ))
        if "file_type" not in existing:
            conn.execute(text(
                "ALTER TABLE chat_messages ADD COLUMN file_type VARCHAR(50)"
            ))
        if "file_name" not in existing:
            conn.execute(text(
                "ALTER TABLE chat_messages ADD COLUMN file_name VARCHAR(255)"
            ))
        conn.commit()


_run_column_migrations()

# ── Shared dependencies (re-exported so tests can override via main.get_db) ──
from deps import (  # noqa: E402
    get_db,
    get_current_user_from_token,
    get_user_from_socket_token,
    oauth2_scheme,
    oauth2_scheme_optional,
)

# ── Socket.IO ─────────────────────────────────────────────────────────────────
from sio_instance import sio  # noqa: E402
from database import SessionLocal  # noqa: E402
from models.chat_message import ChatMessage  # noqa: E402
from models.message_reaction import MessageReaction  # noqa: E402
from models.party import EventParty, PartyMember  # noqa: E402
from routers.parties import MemberStatus  # noqa: E402

# ── KudaGo cache sync ─────────────────────────────────────────────────────────
import kudago_cache  # noqa: E402

CACHE_SYNC_INTERVAL = 3600  # секунды между синками (1 час)
REMINDER_LOOP_INTERVAL = 900  # 15 минут


async def _cache_sync_loop():
    """Фоновая задача: синхронизирует кэш событий каждый час."""
    while True:
        try:
            loop = asyncio.get_event_loop()
            stats = await loop.run_in_executor(None, kudago_cache.sync_all)
            logger.info("KudaGo cache sync done: %s", stats)
        except Exception as exc:
            logger.error("KudaGo cache sync error: %s", exc)
        await asyncio.sleep(CACHE_SYNC_INTERVAL)


async def _reminder_loop():
    """Фоновая задача: каждые 15 минут проверяет события и рассылает email-напоминания."""
    import time
    from email_helpers import send_event_reminder_email, _hours_label
    from models.party import EventParty, PartyMember
    from models.user import User
    from models.notification import Notification
    from notification_helpers import create_notification

    # Окно ±7 минут вокруг порогового момента (24 ч или 1 ч до события)
    WINDOW = 420  # секунд

    while True:
        await asyncio.sleep(REMINDER_LOOP_INTERVAL)
        try:
            now_ts = int(time.time())
            thresholds = [
                (24 * 3600, "email_reminder_24h"),
                (1 * 3600, "email_reminder_1h"),
            ]
            db = SessionLocal()
            try:
                for delta_secs, notif_type in thresholds:
                    target_low = now_ts + delta_secs - WINDOW
                    target_high = now_ts + delta_secs + WINDOW

                    parties = (
                        db.query(EventParty)
                        .filter(
                            EventParty.event_date_ts.isnot(None),
                            EventParty.event_date_ts >= target_low,
                            EventParty.event_date_ts <= target_high,
                        )
                        .all()
                    )

                    for party in parties:
                        # Собираем accepted-участников + creator
                        accepted_rows = (
                            db.query(PartyMember)
                            .filter(
                                PartyMember.party_id == party.id,
                                PartyMember.status == "accepted",
                            )
                            .all()
                        )
                        recipient_ids = {m.user_id for m in accepted_rows}
                        recipient_ids.add(party.creator_id)

                        # Список username-ов всех принятых (для письма)
                        member_users = (
                            db.query(User)
                            .filter(User.id.in_(recipient_ids))
                            .all()
                        )
                        member_usernames = [u.username for u in member_users]
                        # Build lookup dict to avoid N+1 queries per recipient
                        user_by_id = {u.id: u for u in member_users}
                        event_date = datetime.utcfromtimestamp(party.event_date_ts)
                        hours_before = delta_secs // 3600

                        for uid in recipient_ids:
                            # Dedup: use trailing comma to avoid substring false positives (e.g. 1 vs 10)
                            dedup_fragment = f'%"party_id": {party.id},%'
                            already_sent = (
                                db.query(Notification)
                                .filter(
                                    Notification.user_id == uid,
                                    Notification.type == notif_type,
                                    Notification.data.like(dedup_fragment),
                                )
                                .first()
                            )
                            if already_sent:
                                continue

                            user = user_by_id.get(uid)
                            if not user:
                                continue

                            # Commit dedup record BEFORE sending email to prevent duplicates on crash
                            create_notification(
                                db,
                                uid,
                                notif_type,
                                f"Событие «{party.event_title or party.title}» через {_hours_label(hours_before)}",
                                f"Компания «{party.title}» встречается {event_date.strftime('%d.%m в %H:%M')}",
                                {"party_id": party.id},
                            )
                            db.commit()

                            if user.email_notifications:
                                loop = asyncio.get_event_loop()
                                await loop.run_in_executor(
                                    None,
                                    lambda u=user, pt=party, ed=event_date, hb=hours_before: (
                                        send_event_reminder_email(
                                            to_email=u.email,
                                            username=u.username,
                                            event_title=pt.event_title or pt.title,
                                            event_date=ed,
                                            party_title=pt.title,
                                            party_id=pt.id,
                                            members=member_usernames,
                                            hours_before=hb,
                                        )
                                    ),
                                )
            except Exception as exc:
                logger.error("Reminder loop inner error: %s", exc)
                db.rollback()
            finally:
                db.close()
        except Exception as exc:
            logger.error("Reminder loop error: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_event_loop()
    if not kudago_cache.location_has_cache_direct("kzn"):
        print("[KudaGo] Cache empty — syncing kzn on startup...", flush=True)
        try:
            n = await loop.run_in_executor(None, lambda: kudago_cache.sync_location("kzn", pages=3))
            print(f"[KudaGo] kzn sync done: {n} events", flush=True)
        except Exception as exc:
            print(f"[KudaGo] kzn sync FAILED: {exc}", flush=True)
    else:
        print("[KudaGo] kzn cache already populated, skipping startup sync", flush=True)
    cache_task = asyncio.create_task(_cache_sync_loop())
    reminder_task = asyncio.create_task(_reminder_loop())
    yield
    cache_task.cancel()
    reminder_task.cancel()


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="GatherVibe API", lifespan=lifespan)

from fastapi.staticfiles import StaticFiles  # noqa: E402
import os as _os  # noqa: E402
_os.makedirs("uploads/chat", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
from routers import auth, users, events, parties, reviews, notifications, party_coordination  # noqa: E402
from routers.party_plan import router as party_plan_router  # noqa: E402

# Order matters: specific /users/me/* routes before wildcard /users/{user_id}
app.include_router(auth.router)
app.include_router(parties.router)          # has /users/me/parties — must precede users
app.include_router(party_coordination.router)
app.include_router(party_plan_router)
app.include_router(reviews.router)          # has /users/me/reviewable — must precede users
app.include_router(users.router)            # has /users/{user_id} — must be last of users/*
app.include_router(events.router)
app.include_router(notifications.router)


# ── System endpoints ──────────────────────────────────────────────────────────
@app.get("/")
def read_root():
    return {"message": "GatherVibe API работает!"}


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "gathervibe-backend"}


# ── Socket.IO event handlers ──────────────────────────────────────────────────

@sio.event
async def connect(sid, environ):
    print(f"Client {sid} connected")


@sio.event
async def disconnect(sid):
    print(f"Client {sid} disconnected")


# -- Event chat --

@sio.on('join_event_chat')
async def join_event_chat(sid, data):
    import logging
    logger = logging.getLogger(__name__)
    if not isinstance(data, dict):
        logger.warning(f"join_event_chat: отклонён запрос без токена, sid={sid}")
        await sio.emit('error', {'message': 'Требуется авторизация'}, room=sid)
        return
    token = data.get('token')
    if not token:
        logger.warning(f"join_event_chat: пустой токен, sid={sid}")
        await sio.emit('error', {'message': 'Требуется авторизация'}, room=sid)
        return
    db = SessionLocal()
    try:
        user = get_user_from_socket_token(token, db)
    except ValueError as e:
        logger.warning(f"join_event_chat: невалидный токен, sid={sid}, error={e}")
        await sio.emit('error', {'message': 'Требуется авторизация'}, room=sid)
        db.close()
        return
    event_id = data.get('eventId')
    if not event_id:
        db.close()
        return
    await sio.enter_room(sid, f'event_{event_id}')
    await sio.emit('user_joined', {'sid': sid, 'userId': user.id, 'username': user.username}, room=f'event_{event_id}')
    db.close()


@sio.on('send_message')
async def send_message(sid, data: dict):
    token = data.get('token')
    if not token:
        await sio.emit('error', {'message': 'Токен отсутствует'}, room=sid)
        return
    db = SessionLocal()
    try:
        user = get_user_from_socket_token(token, db)
    except ValueError as e:
        await sio.emit('error', {'message': str(e)}, room=sid)
        db.close()
        return
    event_id = data.get('eventId')
    message_text = data.get('message', '').strip()
    if not event_id or not message_text:
        db.close()
        await sio.emit('error', {'message': 'eventId и message обязательны'}, room=sid)
        return
    if len(message_text) > 2000:
        db.close()
        await sio.emit('error', {'message': 'Сообщение слишком длинное (макс. 2000 символов)'}, room=sid)
        return
    msg = {
        'message':   message_text,
        'userId':    str(user.id),
        'username':  user.username,
        'avatarUrl': user.avatar_url,
        'timestamp': datetime.utcnow().isoformat()
    }
    try:
        db.add(ChatMessage(
            room=f'event_{event_id}',
            user_id=str(user.id),
            username=user.username,
            message=message_text,
            timestamp=datetime.utcnow(),
        ))
        db.commit()
    finally:
        db.close()
    await sio.emit('receive_message', msg, room=f'event_{event_id}')


@sio.on('leave_event_chat')
async def leave_event_chat(sid, event_id: str):
    await sio.leave_room(sid, f'event_{event_id}')


# -- Party chat --

@sio.on('join_party_chat')
async def join_party_chat(sid, data: dict):
    token = data.get('token')
    if not token:
        await sio.emit('error', {'message': 'Токен отсутствует'}, room=sid)
        return
    db = SessionLocal()
    try:
        user = get_user_from_socket_token(token, db)
    except ValueError as e:
        await sio.emit('error', {'message': str(e)}, room=sid)
        db.close()
        return
    party_id = data.get('partyId')
    if not party_id:
        await sio.emit('error', {'message': 'partyId отсутствует'}, room=sid)
        db.close()
        return
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if party is None:
        await sio.emit('error', {'message': 'Пати не найдена'}, room=sid)
        db.close()
        return
    is_creator = party.creator_id == user.id
    is_member = db.query(PartyMember).filter(
        PartyMember.party_id == party_id,
        PartyMember.user_id == user.id,
        PartyMember.status == MemberStatus.accepted,
    ).first() is not None
    if not (is_creator or is_member):
        await sio.emit('error', {'message': 'Нет доступа к этому чату'}, room=sid)
        db.close()
        return
    db.close()
    await sio.enter_room(sid, f'party_{party_id}')
    await sio.emit(
        'party_user_joined',
        {'sid': sid, 'userId': user.id, 'username': user.username},
        room=f'party_{party_id}'
    )


@sio.on('send_party_message')
async def send_party_message(sid, data: dict):
    token = data.get('token')
    if not token:
        await sio.emit('error', {'message': 'Токен отсутствует'}, room=sid)
        return
    db = SessionLocal()
    try:
        user = get_user_from_socket_token(token, db)
    except ValueError as e:
        await sio.emit('error', {'message': str(e)}, room=sid)
        db.close()
        return
    party_id = data.get('partyId')
    message_text = data.get('message', '').strip()
    file_url = data.get('file_url')
    file_type = data.get('file_type')
    file_name = data.get('file_name')
    if not party_id or (not message_text and not file_url):
        await sio.emit('error', {'message': 'partyId и message (или file_url) обязательны'}, room=sid)
        db.close()
        return
    if message_text and len(message_text) > 2000:
        await sio.emit('error', {'message': 'Сообщение слишком длинное (макс. 2000 символов)'}, room=sid)
        db.close()
        return

    db2 = SessionLocal()
    try:
        party = db2.query(EventParty).filter(EventParty.id == party_id).first()
        is_member = party and (
            party.creator_id == user.id or
            db2.query(PartyMember).filter(
                PartyMember.party_id == party_id,
                PartyMember.user_id == user.id,
                PartyMember.status == MemberStatus.accepted,
            ).first() is not None
        )
    finally:
        db2.close()

    if not is_member:
        await sio.emit('error', {'message': 'Нет доступа к этому чату'}, room=sid)
        db.close()
        return

    try:
        chat_msg = ChatMessage(
            room=f'party_{party_id}',
            user_id=str(user.id),
            username=user.username,
            message=message_text,
            timestamp=datetime.utcnow(),
            file_url=file_url,
            file_type=file_type,
            file_name=file_name,
        )
        db.add(chat_msg)
        db.commit()
        db.refresh(chat_msg)
        msg_id = chat_msg.id
        user_id_str  = str(user.id)
        user_username = user.username
        user_avatar   = user.avatar_url
    finally:
        db.close()
    msg = {
        'messageId': msg_id,
        'message':   message_text,
        'userId':    user_id_str,
        'username':  user_username,
        'avatarUrl': user_avatar,
        'timestamp': datetime.utcnow().isoformat(),
        'partyId':   party_id,
        'fileUrl':   file_url,
        'fileType':  file_type,
        'fileName':  file_name,
        'reactions': {},
    }
    await sio.emit('receive_party_message', msg, room=f'party_{party_id}')


@sio.on('leave_party_chat')
async def leave_party_chat(sid, data: dict):
    party_id = data['partyId']
    await sio.leave_room(sid, f'party_{party_id}')


ALLOWED_REACTION_EMOJIS = {'👍', '❤️', '😂'}


@sio.on('add_party_reaction')
async def add_party_reaction(sid, data: dict):
    token = data.get('token')
    if not token:
        await sio.emit('error', {'message': 'Токен отсутствует'}, room=sid)
        return
    party_id = data.get('party_id')
    message_id = data.get('message_id')
    emoji = data.get('emoji')
    if not party_id or not message_id or not emoji:
        await sio.emit('error', {'message': 'party_id, message_id и emoji обязательны'}, room=sid)
        return
    if emoji not in ALLOWED_REACTION_EMOJIS:
        await sio.emit('error', {'message': f'Недопустимый эмодзи. Разрешены: {", ".join(ALLOWED_REACTION_EMOJIS)}'}, room=sid)
        return

    db = SessionLocal()
    try:
        try:
            user = get_user_from_socket_token(token, db)
        except ValueError as e:
            await sio.emit('error', {'message': str(e)}, room=sid)
            return

        party = db.query(EventParty).filter(EventParty.id == party_id).first()
        is_member = party and (
            party.creator_id == user.id or
            db.query(PartyMember).filter(
                PartyMember.party_id == party_id,
                PartyMember.user_id == user.id,
                PartyMember.status == MemberStatus.accepted,
            ).first() is not None
        )
        if not is_member:
            await sio.emit('error', {'message': 'Нет доступа к этому чату'}, room=sid)
            return

        existing = db.query(MessageReaction).filter(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == str(user.id),
            MessageReaction.emoji == emoji,
        ).first()
        if existing:
            db.delete(existing)
        else:
            db.add(MessageReaction(
                message_id=message_id,
                room=f'party_{party_id}',
                user_id=str(user.id),
                emoji=emoji,
            ))
        db.commit()

        reaction_rows = (
            db.query(MessageReaction)
            .filter(MessageReaction.message_id == message_id)
            .all()
        )
        reactions: dict = {}
        for rr in reaction_rows:
            reactions.setdefault(rr.emoji, []).append(rr.user_id)
    finally:
        db.close()

    await sio.emit(
        'party_reaction_updated',
        {
            'messageId': message_id,
            'partyId':   party_id,
            'reactions': reactions,
        },
        room=f'party_{party_id}',
    )


# -- Notifications --

@sio.on('subscribe_notifications')
async def subscribe_notifications(sid, data: dict):
    token = data.get('token')
    if not token:
        await sio.emit('error', {'message': 'Токен отсутствует'}, room=sid)
        return
    db = SessionLocal()
    try:
        user = get_user_from_socket_token(token, db)
    except ValueError as e:
        await sio.emit('error', {'message': str(e)}, room=sid)
        return
    finally:
        db.close()
    await sio.enter_room(sid, f'user_{user.id}')
    print(f"[notifications] {sid} subscribed to user_{user.id}")


# ── ASGI app (entry point for uvicorn) ───────────────────────────────────────
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
