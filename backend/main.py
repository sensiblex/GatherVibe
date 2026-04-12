import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

# ── Database ──────────────────────────────────────────────────────────────────
from database import engine
import models.user
import models.event
import models.attendee
import models.party
import models.chat_message
import models.review
import models.notification

models.user.Base.metadata.create_all(bind=engine)
models.event.Base.metadata.create_all(bind=engine)
models.attendee.Base.metadata.create_all(bind=engine)
models.party.Base.metadata.create_all(bind=engine)
models.chat_message.Base.metadata.create_all(bind=engine)
models.review.Base.metadata.create_all(bind=engine)

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
from models.party import EventParty, PartyMember  # noqa: E402
from routers.parties import MemberStatus  # noqa: E402

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="GatherVibe API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
from routers import auth, users, events, parties, reviews, notifications  # noqa: E402

# Order matters: specific /users/me/* routes before wildcard /users/{user_id}
app.include_router(auth.router)
app.include_router(parties.router)    # has /users/me/parties — must precede users
app.include_router(reviews.router)    # has /users/me/reviewable — must precede users
app.include_router(users.router)      # has /users/{user_id} — must be last of users/*
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
    if not party_id or not message_text:
        await sio.emit('error', {'message': 'partyId и message обязательны'}, room=sid)
        db.close()
        return
    if len(message_text) > 2000:
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

    msg = {
        'message':   message_text,
        'userId':    str(user.id),
        'username':  user.username,
        'timestamp': datetime.utcnow().isoformat(),
        'partyId':   party_id,
    }
    try:
        db.add(ChatMessage(
            room=f'party_{party_id}',
            user_id=str(user.id),
            username=user.username,
            message=message_text,
            timestamp=datetime.utcnow(),
        ))
        db.commit()
    finally:
        db.close()
    await sio.emit('receive_party_message', msg, room=f'party_{party_id}')


@sio.on('leave_party_chat')
async def leave_party_chat(sid, data: dict):
    party_id = data['partyId']
    await sio.leave_room(sid, f'party_{party_id}')


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
        db.close()
        return
    user_id = user.id
    if user_id:
        await sio.enter_room(sid, f'creator_{user_id}')
        print(f"[notifications] {sid} subscribed to creator_{user_id}")
    db.close()


@sio.on('subscribe_user_notifications')
async def subscribe_user_notifications(sid, data: dict):
    token = data.get('token')
    if not token:
        return
    db = SessionLocal()
    try:
        user = get_user_from_socket_token(token, db)
        await sio.enter_room(sid, f'user_{user.id}')
        print(f"[notifications] {sid} subscribed to user_{user.id}")
    except ValueError:
        pass
    finally:
        db.close()


# ── ASGI app (entry point for uvicorn) ───────────────────────────────────────
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
