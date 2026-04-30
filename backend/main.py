import asyncio
import logging
import socketio

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

logger = logging.getLogger(__name__)

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
import models.party_recap
import models.report
import models.audit_log
import models.feature_flag
import models.banned_word
import models.appeal
import models.token_revocation

models.user.Base.metadata.create_all(bind=engine)
models.event.Base.metadata.create_all(bind=engine)
models.attendee.Base.metadata.create_all(bind=engine)
models.party.Base.metadata.create_all(bind=engine)
models.chat_message.Base.metadata.create_all(bind=engine)
models.review.Base.metadata.create_all(bind=engine)
models.party_coordination.Base.metadata.create_all(bind=engine)
models.push_subscription.Base.metadata.create_all(bind=engine)
models.message_reaction.Base.metadata.create_all(bind=engine)
models.party_recap.Base.metadata.create_all(bind=engine)
models.report.Base.metadata.create_all(bind=engine)
models.audit_log.Base.metadata.create_all(bind=engine)
models.feature_flag.Base.metadata.create_all(bind=engine)
models.banned_word.Base.metadata.create_all(bind=engine)
models.appeal.Base.metadata.create_all(bind=engine)
models.token_revocation.Base.metadata.create_all(bind=engine)


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
        event_parties_cols = {c["name"] for c in insp.get_columns("event_parties")}
        if "invite_token" not in event_parties_cols:
            conn.execute(text(
                "ALTER TABLE event_parties ADD COLUMN invite_token VARCHAR(64)"
            ))
            import uuid as _uuid
            existing_ids = [r[0] for r in conn.execute(text("SELECT id FROM event_parties")).fetchall()]
            for pid in existing_ids:
                conn.execute(
                    text("UPDATE event_parties SET invite_token = :tok WHERE id = :pid"),
                    {"tok": _uuid.uuid4().hex, "pid": pid},
                )
            try:
                conn.execute(text(
                    "CREATE UNIQUE INDEX ix_event_parties_invite_token ON event_parties(invite_token)"
                ))
            except Exception:
                pass

        party_members_cols = {c["name"] for c in insp.get_columns("party_members")}
        if "invited_by_user_id" not in party_members_cols:
            conn.execute(text(
                "ALTER TABLE party_members ADD COLUMN invited_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL"
            ))
        if "invite_message" not in party_members_cols:
            conn.execute(text(
                "ALTER TABLE party_members ADD COLUMN invite_message VARCHAR(200)"
            ))

        users_cols = {c["name"] for c in insp.get_columns("users")}
        if "role" not in users_cols:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user'"
            ))
        if "is_banned" not in users_cols:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN is_banned BOOLEAN NOT NULL DEFAULT FALSE"
            ))
        if "banned_until" not in users_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN banned_until TIMESTAMP"))
        if "ban_reason" not in users_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN ban_reason VARCHAR(500)"))
        if "muted_until" not in users_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN muted_until TIMESTAMP"))
        if "warnings_count" not in users_cols:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN warnings_count INTEGER NOT NULL DEFAULT 0"
            ))
        if "created_at" not in users_cols:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()"
            ))

        chat_cols_now = {c["name"] for c in insp.get_columns("chat_messages")}
        if "is_deleted" not in chat_cols_now:
            conn.execute(text(
                "ALTER TABLE chat_messages ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE"
            ))
        if "deleted_by_id" not in chat_cols_now:
            conn.execute(text(
                "ALTER TABLE chat_messages ADD COLUMN deleted_by_id INTEGER REFERENCES users(id)"
            ))
        if "deleted_at" not in chat_cols_now:
            conn.execute(text("ALTER TABLE chat_messages ADD COLUMN deleted_at TIMESTAMP"))
        if "delete_reason" not in chat_cols_now:
            conn.execute(text("ALTER TABLE chat_messages ADD COLUMN delete_reason VARCHAR(200)"))

        ep_cols = {c["name"] for c in insp.get_columns("event_parties")}
        if "is_hidden" not in ep_cols:
            conn.execute(text(
                "ALTER TABLE event_parties ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT FALSE"
            ))
        if "hidden_reason" not in ep_cols:
            conn.execute(text("ALTER TABLE event_parties ADD COLUMN hidden_reason VARCHAR(200)"))

        conn.commit()


try:
    _run_column_migrations()
except Exception:
    # ALTER'ы идемпотентны и выполняются на startup. Если один падает (diskfull,
    # lock), не валим весь процесс: Alembic остаётся главным источником истины.
    import logging as _lg
    _lg.getLogger(__name__).exception("Column migration failed — continuing, schema may be partial")

from deps import (  # noqa: E402
    get_db,
    get_current_user_from_token,
    get_user_from_socket_token,
    oauth2_scheme,
    oauth2_scheme_optional,
)

from sio_instance import sio  # noqa: E402
from database import SessionLocal  # noqa: E402
from models.chat_message import ChatMessage  # noqa: E402
from models.message_reaction import MessageReaction  # noqa: E402
from models.user import User  # noqa: E402
from models.party import EventParty, PartyMember  # noqa: E402
from routers.parties import MemberStatus  # noqa: E402
import chat_push  # noqa: E402

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
                        # Кооперативный yield перед каждой party: даём event-loop
                        # обработать socket-события между синхронными DB-запросами.
                        # Полноценное решение — async session; здесь это bandaid
                        # под текущую нагрузку.
                        await asyncio.sleep(0)
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
                        user_by_id = {u.id: u for u in member_users}
                        event_date = datetime.utcfromtimestamp(party.event_date_ts)
                        hours_before = delta_secs // 3600

                        for uid in recipient_ids:
                            # Dedup: party_id может быть последним ключом (}), middle (,) или рядом с пробелом.
                            # Проверяем обе валидные JSON-формы, чтобы не промахнуться.
                            frag_mid = f'%"party_id": {party.id},%'
                            frag_end = f'%"party_id": {party.id}}}%'
                            already_sent = (
                                db.query(Notification)
                                .filter(
                                    Notification.user_id == uid,
                                    Notification.type == notif_type,
                                    (Notification.data.like(frag_mid) | Notification.data.like(frag_end)),
                                )
                                .first()
                            )
                            if already_sent:
                                continue

                            user = user_by_id.get(uid)
                            if not user:
                                continue

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


async def _post_event_loop():
    """Background task: every 15 min dispatch +2h / +1d / +14d post-event reminders."""
    import time
    from post_event_jobs import run_post_event_jobs

    while True:
        await asyncio.sleep(REMINDER_LOOP_INTERVAL)
        try:
            db = SessionLocal()
            try:
                counts = await asyncio.get_event_loop().run_in_executor(
                    None, run_post_event_jobs, db, int(time.time())
                )
                if any(counts.values()):
                    logger.info("post_event_jobs sent: %s", counts)
            finally:
                db.close()
        except Exception as exc:
            logger.error("Post-event loop error: %s", exc)


async def _invite_expiry_loop():
    """Фоновая задача: каждые 15 минут помечает приглашения declined за 24h до события."""
    from routers.parties import expire_pending_invites

    while True:
        await asyncio.sleep(REMINDER_LOOP_INTERVAL)
        try:
            db = SessionLocal()
            try:
                expired_ids = expire_pending_invites(db)
                if expired_ids:
                    db.commit()
                    logger.info("Expired %d party invites near event start", len(expired_ids))
                    for mid in expired_ids:
                        m = db.query(PartyMember).filter(PartyMember.id == mid).first()
                        if not m or m.invited_by_user_id is None:
                            continue
                        try:
                            await sio.emit(
                                "party_invite_expired",
                                {"invite_id": mid, "party_id": m.party_id},
                                room=f"user_{m.invited_by_user_id}",
                            )
                        except Exception:
                            pass
            except Exception as exc:
                logger.error("Invite expiry inner error: %s", exc)
                db.rollback()
            finally:
                db.close()
        except Exception as exc:
            logger.error("Invite expiry loop error: %s", exc)


async def _db_cleanup_loop():
    """Периодически чистит таблицы, которые растут неограниченно.

    - revoked_tokens: удаляем записи с exp < NOW() (JWT уже истёк — blacklist-check не нужен).

    Интервал: раз в час. Пропуск одного запуска допустим.
    """
    import logging as _lg
    logger = _lg.getLogger(__name__)
    from models.token_revocation import RevokedToken
    from datetime import datetime
    from sqlalchemy import delete as sa_delete
    while True:
        try:
            await asyncio.sleep(3600)
            db = SessionLocal()
            try:
                now = datetime.utcnow()
                try:
                    r1 = db.execute(sa_delete(RevokedToken).where(RevokedToken.exp < now))
                    db.commit()
                    logger.info("db_cleanup: revoked=%s", r1.rowcount)
                except Exception as exc:
                    logger.warning("db_cleanup inner error: %s", exc)
                    db.rollback()
            finally:
                db.close()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("db_cleanup loop error: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    import os as _os_lifespan
    if _os_lifespan.environ.get("SKIP_BACKGROUND_LOOPS") == "1":
        yield
        return
    loop = asyncio.get_event_loop()
    if not kudago_cache.location_has_cache_direct("kzn"):
        logger.info("[KudaGo] Cache empty — syncing kzn on startup...")
        try:
            n = await loop.run_in_executor(None, lambda: kudago_cache.sync_location("kzn", pages=3))
            logger.info(f"[KudaGo] kzn sync done: {n} events")
        except Exception as exc:
            logger.error(f"[KudaGo] kzn sync FAILED: {exc}")
    else:
        logger.info("[KudaGo] kzn cache already populated, skipping startup sync")
    cache_task = asyncio.create_task(_cache_sync_loop())
    reminder_task = asyncio.create_task(_reminder_loop())
    invite_expiry_task = asyncio.create_task(_invite_expiry_loop())
    post_event_task = asyncio.create_task(_post_event_loop())
    db_cleanup_task = asyncio.create_task(_db_cleanup_loop())
    yield
    cache_task.cancel()
    reminder_task.cancel()
    invite_expiry_task.cancel()
    post_event_task.cancel()
    db_cleanup_task.cancel()


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

from routers import auth, users, events, parties, reviews, notifications, party_coordination  # noqa: E402
from routers.party_plan import router as party_plan_router  # noqa: E402
from routers.party_recap import router as party_recap_router  # noqa: E402
from routers.admin import router as admin_router  # noqa: E402
from routers.reports import router as reports_router  # noqa: E402
from routers.appeals import router as appeals_router  # noqa: E402

app.include_router(auth.router)
app.include_router(admin_router)
app.include_router(reports_router)
app.include_router(appeals_router)
app.include_router(parties.router)
app.include_router(party_coordination.router)
app.include_router(party_plan_router)
app.include_router(party_recap_router)
app.include_router(reviews.router)
app.include_router(users.router)
app.include_router(events.router)
app.include_router(notifications.router)


@app.get("/")
def read_root():
    return {"message": "GatherVibe API работает!"}


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "gathervibe-backend"}



def _extract_token_from_environ(environ: dict) -> str | None:
    """Читаем JWT из cookie (HttpOnly или non-HttpOnly) в handshake headers.

    Позволяет фронту не передавать токен в socket.emit явно — достаточно того,
    что браузер сам отправил cookie при установке WS-соединения.
    Делаем unquote: если кто-то percent-encodit токен (напр. `eyJ...%3D`),
    без декодирования JWT потом не провалидируется.
    """
    from urllib.parse import unquote as _unquote
    cookie_header = environ.get("HTTP_COOKIE", "") or ""
    for chunk in cookie_header.split(";"):
        chunk = chunk.strip()
        if chunk.startswith("token="):
            return _unquote(chunk[len("token="):])
    return None


@sio.event
async def connect(sid, environ):
    # Пытаемся аутентифицировать по cookie ещё на handshake и сохранить user_id
    # в сессии sio. Если токена нет / невалиден — соединение остаётся анонимным
    # (события типа join_event_chat потом отклонят такие sid).
    token = _extract_token_from_environ(environ)
    if token:
        db = SessionLocal()
        try:
            user = get_user_from_socket_token(token, db)
            await sio.save_session(sid, {"user_id": user.id, "username": user.username})
        except Exception:
            pass
        finally:
            db.close()
    logger.info(f"Client {sid} connected")


async def _get_session_user(sid, db):
    """Возвращает User из sio-сессии (установленной в connect), либо None."""
    try:
        sess = await sio.get_session(sid)
    except Exception:
        return None
    uid = (sess or {}).get("user_id")
    if not uid:
        return None
    return db.query(User).filter(User.id == uid).first()


async def _authenticate_sid(sid, data, db):
    """Возвращает User для sid. Сначала пытается session (из cookie handshake),
    затем падает на data.get('token') ради обратной совместимости с фронтом,
    который ещё шлёт токен в emit. Raises ValueError если не удалось."""
    user = await _get_session_user(sid, db)
    if user is not None:
        return user
    token = (data or {}).get('token') if isinstance(data, dict) else None
    if not token:
        raise ValueError("Требуется авторизация")
    return get_user_from_socket_token(token, db)


@sio.event
async def disconnect(sid):
    logger.info(f"Client {sid} disconnected")
    chat_push.mark_disconnect(sid)



@sio.on('join_event_chat')
async def join_event_chat(sid, data):
    if data is not None and not isinstance(data, dict):
        data = {}
    db = SessionLocal()
    try:
        user = await _authenticate_sid(sid, data, db)
    except (ValueError, Exception) as e:
        logger.warning(f"join_event_chat: auth failed, sid={sid}, error={e}")
        await sio.emit('error', {'message': 'Требуется авторизация'}, room=sid)
        db.close()
        return
    event_id = (data or {}).get('eventId')
    if not event_id:
        db.close()
        return
    # event_attendees.event_id хранится как строка (поддержка и числовых local id,
    # и KudaGo id). Если для этого event_id есть запись в нашей events-таблице —
    # это локальное событие, требуем attendance. Иначе считаем KudaGo (публичный чат).
    event_id_str = str(event_id)
    from models.attendee import EventAttendee
    from models.event import Event
    is_local = False
    try:
        local_id = int(event_id_str)
        is_local = db.query(Event).filter(Event.id == local_id).first() is not None
    except (ValueError, TypeError):
        pass
    if is_local:
        is_attendee = db.query(EventAttendee).filter(
            EventAttendee.event_id == event_id_str,
            EventAttendee.user_id == user.id,
        ).first()
        if not is_attendee:
            logger.warning(f"join_event_chat: user {user.id} не подписан на event {event_id_str}, sid={sid}")
            await sio.emit('error', {'message': 'Нужно быть участником события'}, room=sid)
            db.close()
            return
    await sio.enter_room(sid, f'event_{event_id}')
    await sio.emit('user_joined', {'sid': sid, 'userId': user.id, 'username': user.username}, room=f'event_{event_id}')
    db.close()


def _socket_sanction_block(user) -> str | None:
    """Возвращает сообщение об ошибке если user забанен/замьючен, иначе None."""
    from deps import _is_user_banned
    if _is_user_banned(user):
        return "Вы заблокированы"
    muted_until = getattr(user, "muted_until", None)
    if muted_until is not None:
        now = datetime.utcnow()
        mu = muted_until.replace(tzinfo=None) if getattr(muted_until, "tzinfo", None) else muted_until
        if mu > now:
            return "Вы временно не можете отправлять сообщения"
    return None


@sio.on('send_message')
async def send_message(sid, data: dict):
    if data is not None and not isinstance(data, dict):
        data = {}
    db = SessionLocal()
    try:
        user = await _authenticate_sid(sid, data or {}, db)
    except (ValueError, Exception) as e:
        await sio.emit('error', {'message': str(e)}, room=sid)
        db.close()
        return
    block = _socket_sanction_block(user)
    if block:
        await sio.emit('error', {'message': block}, room=sid)
        db.close()
        return
    event_id = data.get('eventId')
    message_text = data.get('message', '').strip()
    if not event_id or not message_text:
        db.close()
        await sio.emit('error', {'message': 'eventId и message обязательны'}, room=sid)
        return
    # Same attendance check as join_event_chat: нельзя писать в чат локальных
    # событий, на которое ты не записан. Для KudaGo (отсутствует в events) — публично.
    event_id_str = str(event_id)
    from models.attendee import EventAttendee
    from models.event import Event
    is_local = False
    try:
        local_id = int(event_id_str)
        is_local = db.query(Event).filter(Event.id == local_id).first() is not None
    except (ValueError, TypeError):
        pass
    if is_local:
        is_attendee = db.query(EventAttendee).filter(
            EventAttendee.event_id == event_id_str,
            EventAttendee.user_id == user.id,
        ).first()
        if not is_attendee:
            db.close()
            await sio.emit('error', {'message': 'Нужно быть участником события'}, room=sid)
            return
    if len(message_text) > 2000:
        db.close()
        await sio.emit('error', {'message': 'Сообщение слишком длинное (макс. 2000 символов)'}, room=sid)
        return
    try:
        from services.moderation_filter import filter_text
        message_text, _ = filter_text(db, message_text)
    except Exception:
        pass
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



@sio.on('join_party_chat')
async def join_party_chat(sid, data: dict):
    if data is not None and not isinstance(data, dict):
        data = {}
    db = SessionLocal()
    try:
        user = await _authenticate_sid(sid, data or {}, db)
    except (ValueError, Exception) as e:
        await sio.emit('error', {'message': str(e)}, room=sid)
        db.close()
        return
    party_id = (data or {}).get('partyId')
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
    chat_push.mark_join_party(sid, user.id, party_id)
    await sio.emit(
        'party_user_joined',
        {'sid': sid, 'userId': user.id, 'username': user.username},
        room=f'party_{party_id}'
    )


@sio.on('send_party_message')
async def send_party_message(sid, data: dict):
    if data is not None and not isinstance(data, dict):
        data = {}
    db = SessionLocal()
    try:
        user = await _authenticate_sid(sid, data or {}, db)
    except (ValueError, Exception) as e:
        logger.warning("send_party_message: auth failed sid=%s err=%s", sid, e)
        await sio.emit('error', {'message': str(e)}, room=sid)
        db.close()
        return
    block = _socket_sanction_block(user)
    if block:
        await sio.emit('error', {'message': block}, room=sid)
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
    # Валидация file_url: принимаем только локальные /uploads/* и https URL
    # (без javascript:, data:, file: — иначе stored XSS через href/src).
    if file_url:
        if not isinstance(file_url, str) or len(file_url) > 500:
            await sio.emit('error', {'message': 'Некорректный file_url'}, room=sid)
            db.close()
            return
        if not (file_url.startswith('/uploads/') or file_url.startswith('https://')):
            await sio.emit('error', {'message': 'file_url должен быть /uploads/... или https://...'}, room=sid)
            db.close()
            return
    ALLOWED_FILE_TYPES = {'image', 'document', 'video', 'audio'}
    if file_type and (not isinstance(file_type, str) or file_type not in ALLOWED_FILE_TYPES):
        await sio.emit('error', {'message': 'Некорректный file_type'}, room=sid)
        db.close()
        return
    if file_name and (not isinstance(file_name, str) or len(file_name) > 255):
        await sio.emit('error', {'message': 'Некорректный file_name'}, room=sid)
        db.close()
        return
    if message_text and len(message_text) > 2000:
        await sio.emit('error', {'message': 'Сообщение слишком длинное (макс. 2000 символов)'}, room=sid)
        db.close()
        return
    if message_text:
        try:
            from services.moderation_filter import filter_text
            message_text, _ = filter_text(db, message_text)
        except Exception:
            pass

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

    try:
        push_db = SessionLocal()
        try:
            party_for_push = push_db.query(EventParty).filter(
                EventParty.id == party_id
            ).first()
            if party_for_push is not None:
                await chat_push.notify_chat_message(
                    push_db, party_for_push,
                    sender_id=user.id,
                    sender_username=user.username,
                    message_text=message_text,
                )
        finally:
            push_db.close()
    except Exception as exc:
        logger.warning("chat_push.notify_chat_message failed: %s", exc)


@sio.on('leave_party_chat')
async def leave_party_chat(sid, data: dict):
    party_id = (data or {}).get('partyId')
    if not party_id:
        return
    await sio.leave_room(sid, f'party_{party_id}')
    chat_push.mark_leave_party(sid, party_id)


ALLOWED_REACTION_EMOJIS = {'👍', '❤️', '😂'}


@sio.on('add_party_reaction')
async def add_party_reaction(sid, data: dict):
    if data is not None and not isinstance(data, dict):
        data = {}
    party_id = (data or {}).get('party_id')
    message_id = (data or {}).get('message_id')
    emoji = (data or {}).get('emoji')
    if not party_id or not message_id or not emoji:
        await sio.emit('error', {'message': 'party_id, message_id и emoji обязательны'}, room=sid)
        return
    if emoji not in ALLOWED_REACTION_EMOJIS:
        await sio.emit('error', {'message': f'Недопустимый эмодзи. Разрешены: {", ".join(ALLOWED_REACTION_EMOJIS)}'}, room=sid)
        return

    db = SessionLocal()
    try:
        try:
            user = await _authenticate_sid(sid, data or {}, db)
        except (ValueError, Exception) as e:
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



@sio.on('subscribe_notifications')
async def subscribe_notifications(sid, data: dict):
    if data is not None and not isinstance(data, dict):
        data = {}
    db = SessionLocal()
    try:
        try:
            user = await _authenticate_sid(sid, data or {}, db)
        except (ValueError, Exception) as e:
            await sio.emit('error', {'message': str(e)}, room=sid)
            return
    finally:
        db.close()
    await sio.enter_room(sid, f'user_{user.id}')
    logger.info(f"[notifications] {sid} subscribed to user_{user.id}")


socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
