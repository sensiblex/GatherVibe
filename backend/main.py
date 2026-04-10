import asyncio
import socketio
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import engine, SessionLocal
from models.user import User
from schemas import UserCreate, UserResponse, UserUpdate
from schemas import UserLogin, Token
from auth import hash_password
from auth import authenticate_user, create_user_token
import models.user
import models.event
import models.attendee
import models.party
import models.chat_message
from models.attendee import EventAttendee
from models.party import EventParty, PartyMember
from models.chat_message import ChatMessage
from typing import Optional, List
from datetime import datetime
from models.event import Event
from schemas import EventCreate, EventResponse
import kudago_api
from pydantic import BaseModel
import time


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)

models.user.Base.metadata.create_all(bind=engine)
models.event.Base.metadata.create_all(bind=engine)
models.attendee.Base.metadata.create_all(bind=engine)
models.party.Base.metadata.create_all(bind=engine)
models.chat_message.Base.metadata.create_all(bind=engine)


app = FastAPI(title="GatherVibe API")

# ===== SOCKET.IO =====
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=['http://localhost:3000', 'http://127.0.0.1:3000', '*']
)


@sio.event
async def connect(sid, environ):
    print(f"Client {sid} connected")


@sio.event
async def disconnect(sid):
    print(f"Client {sid} disconnected")


# -- Event chat --

@sio.on('join_event_chat')
async def join_event_chat(sid, data: dict):
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
    event_id = data['eventId']
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
    event_id = data['eventId']
    msg = {
        'message':   data['message'],
        'userId':    str(user.id),
        'username':  user.username,
        'timestamp': datetime.utcnow().isoformat()
    }
    # Persist to DB
    try:
        db.add(ChatMessage(
            room=f'event_{event_id}',
            user_id=str(user.id),
            username=user.username,
            message=msg['message'],
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
    party_id = data['partyId']
    await sio.enter_room(sid, f'party_{party_id}')
    await sio.emit(
        'party_user_joined',
        {'sid': sid, 'userId': user.id, 'username': user.username},
        room=f'party_{party_id}'
    )
    db.close()


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
    party_id = data['partyId']
    msg = {
        'message':   data['message'],
        'userId':    str(user.id),
        'username':  user.username,
        'timestamp': datetime.utcnow().isoformat(),
        'partyId':   party_id,
    }
    # Persist to DB
    try:
        db.add(ChatMessage(
            room=f'party_{party_id}',
            user_id=str(user.id),
            username=user.username,
            message=msg['message'],
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
    """Creator subscribes to their personal notification room."""
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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user_from_token(token: str, db: Session) -> User:
    from jwt_handler import verify_token
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Неверный токен")
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Неверный токен")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user


def get_user_from_socket_token(token: str, db: Session) -> User:
    """Аутентификация пользователя по токену для Socket.IO."""
    from jwt_handler import verify_token
    payload = verify_token(token)
    if payload is None:
        raise ValueError("Неверный токен")
    email = payload.get("sub")
    if not email:
        raise ValueError("Неверный токен")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise ValueError("Пользователь не найден")
    return user


# socket_app — главное ASGI-приложение для uvicorn
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)


@app.post("/login", response_model=Token)
def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    user = authenticate_user(user_credentials.email, user_credentials.password, db)
    if not user:
        raise HTTPException(status_code=401, detail="Неверный email или пароль",
                            headers={"WWW-Authenticate": "Bearer"})
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Пользователь заблокирован")
    return create_user_token(user)


@app.get("/users/me", response_model=UserResponse)
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    return get_current_user_from_token(token, db)


@app.patch("/users/me", response_model=UserResponse)
def update_profile(
    data: UserUpdate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    if data.username is not None:
        data.username = data.username.strip()
        if not data.username:
            raise HTTPException(status_code=400, detail="Username не может быть пустым")
        user.username = data.username
    if data.city is not None:
        user.city = data.city.strip() or None
    if data.bio is not None:
        user.bio = data.bio.strip()[:200] or None
    if data.interests is not None:
        user.interests = data.interests.strip() or None
    db.commit()
    db.refresh(user)
    return user


# ===== MESSAGES (chat history) =====

@app.get("/messages/{room}")
def get_messages(
    room: str,
    limit: int = Query(default=50, le=200),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    # Проверяем, что пользователь авторизован
    get_current_user_from_token(token, db)
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.room == room)
        .order_by(ChatMessage.timestamp.asc())
        .limit(limit)
        .all()
    )
    return [
        {
            "message":   r.message,
            "userId":    r.user_id,
            "username":  r.username,
            "timestamp": r.timestamp.isoformat(),
        }
        for r in rows
    ]


# ===== EVENTS =====

@app.get("/events", response_model=List[EventResponse])
def get_events(
    skip: int = 0, limit: int = 20,
    city: Optional[str] = None, category: Optional[str] = None,
    search: Optional[str] = None, db: Session = Depends(get_db)
):
    now = datetime.utcnow()
    query = db.query(Event).filter(Event.is_active == True, Event.date_time >= now)
    if city:
        query = query.filter(Event.city.ilike(f"%{city}%"))
    if category:
        query = query.filter(Event.category == category)
    if search:
        query = query.filter(
            (Event.title.ilike(f"%{search}%")) |
            (Event.description.ilike(f"%{search}%")) |
            (Event.location.ilike(f"%{search}%"))
        )
    return query.order_by(Event.date_time).offset(skip).limit(limit).all()


@app.get("/events/categories")
def get_categories(db: Session = Depends(get_db)):
    categories = db.query(Event.category).distinct().all()
    return {"categories": [cat[0] for cat in categories if cat[0]]}


@app.get("/events/cities")
def get_cities(db: Session = Depends(get_db)):
    cities = db.query(Event.city).distinct().all()
    return {"cities": [city[0] for city in cities if city[0]]}


@app.get("/events/{event_id}", response_model=EventResponse)
def get_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id, Event.is_active == True).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    return event


@app.post("/events", response_model=EventResponse)
def create_event(
    event: EventCreate,
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme),
):
    user = get_current_user_from_token(token, db)
    db_event = Event(**event.dict(), created_by=user.id, current_participants=0)
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event


# ===== KUDAGO =====

@app.get("/kudago/events")
def kudago_get_events(
    location: str = Query(default="kzn"),
    categories: Optional[str] = Query(default=None),
    is_free: Optional[bool] = Query(default=None),
    search: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    actual_since: Optional[int] = Query(default=None),
    actual_until: Optional[int] = Query(default=None),
):
    try:
        now_ts = int(time.time())
        effective_since = max(actual_since, now_ts) if actual_since else now_ts
        effective_until = actual_until

        if search:
            raw = kudago_api.search(
                query=search, ctype="event", location=location,
                is_free=is_free, page=page, page_size=page_size,
                actual_since=effective_since, actual_until=effective_until,
            )
        else:
            raw = kudago_api.get_events(
                location=location, categories=categories, is_free=is_free,
                page=page, page_size=page_size,
                actual_since=effective_since, actual_until=effective_until,
            )
        events = kudago_api.parse_events(raw)
        return {
            "count": raw.get("count", len(events)),
            "next": raw.get("next"),
            "previous": raw.get("previous"),
            "page": page,
            "page_size": page_size,
            "results": events,
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка KudaGo API: {str(e)}")


@app.get("/kudago/events/{event_id}")
def kudago_get_event_detail(event_id: int):
    try:
        return kudago_api.parse_event_detail(kudago_api.get_event_by_id(event_id))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка KudaGo API: {str(e)}")


@app.get("/kudago/today")
def kudago_events_today(location: str = Query(default="kzn")):
    try:
        return kudago_api.get_events_today(location=location)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка KudaGo API: {str(e)}")


@app.get("/kudago/categories")
def kudago_categories():
    try:
        return kudago_api.get_event_categories()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка KudaGo API: {str(e)}")


@app.get("/kudago/locations")
def kudago_locations():
    try:
        return kudago_api.get_locations()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка KudaGo API: {str(e)}")


# ===== MATCHING / ATTENDEES =====

class AttendeeCreateBody(BaseModel):
    comment: Optional[str] = None
    is_looking: bool = True


class AttendeeOut(BaseModel):
    id: int
    user_id: int
    username: str
    city: Optional[str]
    interests: Optional[str]
    comment: Optional[str]
    is_looking: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AttendeeMatchOut(AttendeeOut):
    common_count: int = 0


@app.post("/attendees/{event_id}", response_model=AttendeeOut)
def join_event(
    event_id: str,
    body: AttendeeCreateBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    existing = db.query(EventAttendee).filter(
        EventAttendee.event_id == event_id, EventAttendee.user_id == user.id
    ).first()
    if existing:
        existing.comment = body.comment
        existing.is_looking = body.is_looking
        db.commit()
        db.refresh(existing)
        row = existing
    else:
        row = EventAttendee(
            event_id=event_id,
            user_id=user.id,
            comment=body.comment,
            is_looking=body.is_looking,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

    # Гарантируем, что created_at никогда не будет None
    # (server_default возвращается после refresh, но добавляем fallback на всякий случай)
    created_at = row.created_at or datetime.utcnow()

    return AttendeeOut(
        id=row.id,
        user_id=user.id,
        username=user.username,
        city=user.city,
        interests=user.interests,
        comment=row.comment,
        is_looking=row.is_looking,
        created_at=created_at,
    )


@app.delete("/attendees/{event_id}", status_code=204)
def leave_event(
    event_id: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    db.query(EventAttendee).filter(
        EventAttendee.event_id == event_id, EventAttendee.user_id == user.id
    ).delete()
    db.commit()


@app.get("/attendees/{event_id}/me")
def get_my_attendance(
    event_id: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    row = db.query(EventAttendee).filter(
        EventAttendee.event_id == event_id, EventAttendee.user_id == user.id
    ).first()
    if not row:
        return {"attending": False}
    return {"attending": True, "is_looking": row.is_looking, "comment": row.comment}


@app.get("/attendees/{event_id}/matches", response_model=List[AttendeeMatchOut])
def get_matches(
    event_id: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Returns attendees sorted by number of common interests with the current user."""
    user = get_current_user_from_token(token, db)
    my_interests: set = set(
        i.strip() for i in (user.interests or "").split(",") if i.strip()
    )

    rows = (
        db.query(EventAttendee, User)
        .join(User, EventAttendee.user_id == User.id)
        .filter(EventAttendee.event_id == event_id, EventAttendee.user_id != user.id)
        .all()
    )

    result = []
    for a, u in rows:
        their = set(i.strip() for i in (u.interests or "").split(",") if i.strip())
        common = len(my_interests & their)
        result.append(AttendeeMatchOut(
            id=a.id, user_id=u.id, username=u.username, city=u.city,
            interests=u.interests, comment=a.comment,
            is_looking=a.is_looking,
            created_at=a.created_at or datetime.utcnow(),
            common_count=common,
        ))

    result.sort(key=lambda x: x.common_count, reverse=True)
    return result


@app.get("/attendees/{event_id}", response_model=List[AttendeeOut])
def get_attendees(
    event_id: str,
    only_looking: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    query = db.query(EventAttendee, User).join(User, EventAttendee.user_id == User.id).filter(
        EventAttendee.event_id == event_id
    )
    if only_looking:
        query = query.filter(EventAttendee.is_looking == True)
    rows = query.order_by(EventAttendee.created_at.desc()).all()
    return [
        AttendeeOut(
            id=a.id, user_id=u.id, username=u.username, city=u.city,
            interests=u.interests, comment=a.comment,
            is_looking=a.is_looking,
            created_at=a.created_at or datetime.utcnow(),
        )
        for a, u in rows
    ]


# ===== PARTIES (COMPANY ROOMS) =====

class PartyCreateBody(BaseModel):
    title: str
    description: Optional[str] = None
    max_members: int = 4


class PartyUpdateBody(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    max_members: Optional[int] = None


class PartyKickBody(BaseModel):
    reason: Optional[str] = None


class PartyMemberOut(BaseModel):
    user_id: int
    username: str
    city: Optional[str]
    interests: Optional[str]
    status: str
    joined_at: datetime

    class Config:
        from_attributes = True


class PartyOut(BaseModel):
    id: int
    event_id: str
    title: str
    description: Optional[str]
    max_members: int
    creator_id: int
    creator_username: str
    is_open: bool
    members: List[PartyMemberOut]
    created_at: datetime

    class Config:
        from_attributes = True


def _build_party_out(party: EventParty, db: Session) -> PartyOut:
    creator = db.query(User).filter(User.id == party.creator_id).first()
    members_rows = db.query(PartyMember, User).join(User, PartyMember.user_id == User.id).filter(
        PartyMember.party_id == party.id,
        PartyMember.user_id != party.creator_id,
        PartyMember.status.in_(['pending', 'accepted'])
    ).all()
    members = [
        PartyMemberOut(user_id=u.id, username=u.username, city=u.city,
                       interests=u.interests, status=m.status, joined_at=m.joined_at)
        for m, u in members_rows
    ]
    return PartyOut(
        id=party.id, event_id=party.event_id, title=party.title,
        description=party.description, max_members=party.max_members,
        creator_id=party.creator_id,
        creator_username=creator.username if creator else "?",
        is_open=party.is_open, members=members, created_at=party.created_at,
    )


# ===== NOTIFICATIONS — pending requests for party creators =====

class PendingRequestOut(BaseModel):
    id: int
    user_id: int
    username: str
    party_id: int
    event_title: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


@app.get("/parties/my-pending-requests", response_model=List[PendingRequestOut])
def get_my_pending_requests(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Return all pending join requests for parties created by the current user."""
    current_user = get_current_user_from_token(token, db)
    rows = (
        db.query(PartyMember, User, EventParty)
        .join(User, PartyMember.user_id == User.id)
        .join(EventParty, PartyMember.party_id == EventParty.id)
        .filter(
            EventParty.creator_id == current_user.id,
            PartyMember.status == "pending",
            PartyMember.user_id != current_user.id,
        )
        .order_by(PartyMember.joined_at.desc())
        .all()
    )
    result = []
    for member, user, party in rows:
        result.append(PendingRequestOut(
            id=member.id,
            user_id=user.id,
            username=user.username,
            party_id=party.id,
            event_title=party.title,
            created_at=member.joined_at,
        ))
    return result


@app.get("/parties/by-id/{party_id}", response_model=PartyOut)
def get_party_detail(party_id: int, db: Session = Depends(get_db)):
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    return _build_party_out(party, db)

@app.get("/parties/detail/{party_id}", response_model=PartyOut)
def get_party_detail_public(party_id: int, db: Session = Depends(get_db)):
    """Публичный эндпоинт для получения информации о компании без авторизации."""
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    return _build_party_out(party, db)


@app.get("/parties/{event_id}", response_model=List[PartyOut])
def get_parties(event_id: str, db: Session = Depends(get_db)):
    parties = db.query(EventParty).filter(EventParty.event_id == event_id).order_by(
        EventParty.created_at.desc()
    ).all()
    return [_build_party_out(p, db) for p in parties]


@app.post("/parties/requests/{request_id}/approve", response_model=PartyOut)
def approve_request(
    request_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Approve a pending join request by PartyMember.id."""
    current_user = get_current_user_from_token(token, db)
    member = db.query(PartyMember).filter(PartyMember.id == request_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    party = db.query(EventParty).filter(EventParty.id == member.party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может принимать участников")
    # Создатель не считается как PartyMember со статусом "accepted", поэтому учитываем его отдельно
    creator_is_member = db.query(PartyMember).filter(
        PartyMember.party_id == party.id,
        PartyMember.user_id == party.creator_id,
        PartyMember.status == "accepted"
    ).first() is not None
    
    # Подсчёт принятых участников (без создателя, если он не в members)
    accepted_count = db.query(PartyMember).filter(
        PartyMember.party_id == party.id, PartyMember.status == "accepted"
    ).count()
    
    # Если создатель не в members, то он не учитывается в accepted_count
    # Общее количество участников после принятия = accepted_count + 1 (новый) + (1 если создатель не в members)
    total_after_accept = accepted_count + 1  # новый участник
    if not creator_is_member:
        total_after_accept += 1  # добавляем создателя
    
    if total_after_accept > party.max_members:
        raise HTTPException(status_code=400, detail="Компания уже заполнена")
    
    member.status = "accepted"
    
    # Обновляем флаг is_open, если достигли лимита
    if total_after_accept >= party.max_members:
        party.is_open = False
    db.commit()
    return _build_party_out(party, db)


@app.post("/parties/requests/{request_id}/reject", response_model=PartyOut)
def reject_request(
    request_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Reject a pending join request by PartyMember.id."""
    current_user = get_current_user_from_token(token, db)
    member = db.query(PartyMember).filter(PartyMember.id == request_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    party = db.query(EventParty).filter(EventParty.id == member.party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может отклонять заявки")
    # Вместо удаления меняем статус на 'rejected'
    member.status = 'rejected'
    db.commit()
    return _build_party_out(party, db)


@app.post("/parties/{event_id}", response_model=PartyOut)
def create_party(
    event_id: str,
    body: PartyCreateBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    if body.max_members < 2 or body.max_members > 20:
        raise HTTPException(status_code=400, detail="max_members must be between 2 and 20")
    party = EventParty(
        event_id=event_id,
        title=body.title.strip(),
        description=body.description,
        max_members=body.max_members,
        creator_id=user.id,
        is_open=True,
    )
    db.add(party)
    db.commit()
    db.refresh(party)
    return _build_party_out(party, db)


@app.patch("/parties/{party_id}", response_model=PartyOut)
def update_party(
    party_id: int,
    body: PartyUpdateBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может редактировать компанию")
    if body.title is not None:
        if not body.title.strip():
            raise HTTPException(status_code=400, detail="Название не может быть пустым")
        party.title = body.title.strip()
    if body.description is not None:
        party.description = body.description.strip() or None
    if body.max_members is not None:
        if body.max_members < 2 or body.max_members > 20:
            raise HTTPException(status_code=400, detail="max_members должно быть от 2 до 20")
        accepted_count = db.query(PartyMember).filter(
            PartyMember.party_id == party_id, PartyMember.status == "accepted",
            PartyMember.user_id != party.creator_id
        ).count()
        if body.max_members < accepted_count + 1:
            raise HTTPException(
                status_code=400,
                detail=f"Нельзя уменьшить: уже принято {accepted_count} участников"
            )
        party.max_members = body.max_members
    db.commit()
    return _build_party_out(party, db)


@app.delete("/parties/{party_id}", status_code=200)
def delete_party(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может удалить компанию")
    db.query(PartyMember).filter(PartyMember.party_id == party_id).delete()
    db.delete(party)
    db.commit()
    return {"ok": True}


@app.post("/parties/{party_id}/join", response_model=PartyOut)
async def join_party(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if not party.is_open:
        raise HTTPException(status_code=400, detail="Набор закрыт")
    accepted_count = db.query(PartyMember).filter(
        PartyMember.party_id == party_id, PartyMember.status == "accepted"
    ).count()
    # accepted_count не учитывает создателя, поэтому +1 (создатель) +1 (новый участник) = +2
    if accepted_count + 2 >= party.max_members:
        raise HTTPException(status_code=400, detail="Компания заполнена")
    existing = db.query(PartyMember).filter(
        PartyMember.party_id == party_id, PartyMember.user_id == user.id
    ).first()
    if existing:
        if existing.status == 'rejected':
            # Удаляем старую отклонённую запись, чтобы создать новую
            existing.status = 'pending'  # Reuse instead of deleting
            db.commit()
        elif existing.status == 'left':
            # Пользователь вышел ранее, разрешаем повторную заявку
            existing.status = 'pending'
            db.commit()
        elif existing.status in ['pending', 'accepted']:
            raise HTTPException(status_code=400, detail="Вы уже в этой компании или подали заявку")
    m = PartyMember(party_id=party_id, user_id=user.id, status="pending")
    db.add(m)
    db.commit()

    await sio.emit(
        "new_party_request",
        {
            "party_id": party.id,
            "party_title": party.title,
            "user_id": user.id,
            "username": user.username,
        },
        room=f"creator_{party.creator_id}",
    )

    return _build_party_out(party, db)


@app.delete("/parties/{party_id}/leave", status_code=200)
def leave_party(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id == user.id:
        raise HTTPException(status_code=400, detail="Создатель не может покинуть компанию. Закройте её.")
    member = db.query(PartyMember).filter(
        PartyMember.party_id == party_id, PartyMember.user_id == user.id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Вы не состоите в этой компании")
    if member.status == 'rejected':
        raise HTTPException(status_code=400, detail="Вы не являетесь участником компании")
    # Вместо удаления меняем статус на 'left'
    member.status = 'left'
    db.commit()
    return {"ok": True}


@app.post("/parties/{party_id}/members/{user_id}/accept", response_model=PartyOut)
def accept_member(
    party_id: int,
    user_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может принимать участников")
    accepted_count = db.query(PartyMember).filter(
        PartyMember.party_id == party_id, PartyMember.status == "accepted"
    ).count()
    # accepted_count не учитывает создателя, поэтому +1 (создатель) +1 (новый участник) = +2
    if accepted_count + 2 >= party.max_members:
        raise HTTPException(status_code=400, detail="Компания уже заполнена")
    m = db.query(PartyMember).filter(
        PartyMember.party_id == party_id, PartyMember.user_id == user_id
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    m.status = "accepted"
    new_total = accepted_count + 2
    if new_total >= party.max_members:
        party.is_open = False
    db.commit()
    return _build_party_out(party, db)


@app.post("/parties/{party_id}/members/{user_id}/reject", response_model=PartyOut)
def reject_member(
    party_id: int,
    user_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может отклонять заявки")
    m = db.query(PartyMember).filter(
        PartyMember.party_id == party_id, PartyMember.user_id == user_id
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    # Вместо удаления меняем статус на 'rejected'
    m.status = 'rejected'
    db.commit()
    return _build_party_out(party, db)


@app.post("/parties/{party_id}/close", response_model=PartyOut)
def close_party(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может закрыть компанию")
    party.is_open = False
    db.commit()
    return _build_party_out(party, db)


# ===== SYSTEM =====

@app.get("/")
def read_root():
    return {"message": "GatherVibe API работает!"}


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "gathervibe-backend"}


@app.get("/users", response_model=List[UserResponse])
def get_users(
    token: str = Depends(oauth2_scheme),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    search: Optional[str] = Query(default=None),
    city: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    get_current_user_from_token(token, db)   # auth check only
    query = db.query(User)
    if search:
        query = query.filter(
            (User.username.ilike(f"%{search}%")) |
            (User.interests.ilike(f"%{search}%"))
        )
    if city:
        query = query.filter(User.city.ilike(f"%{city}%"))
    return query.offset(skip).limit(limit).all()


@app.post("/register", response_model=UserResponse)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
    new_user = User(
        email=user.email, username=user.username,
        hashed_password=hash_password(user.password),
        city=user.city, interests=user.interests,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.get("/users/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user
