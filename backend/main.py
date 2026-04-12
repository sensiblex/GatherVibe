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
from auth import hash_password, verify_password
from auth import authenticate_user, create_user_token
import models.user
import models.event
import models.attendee
import models.party
import models.chat_message
import models.review
import models.notification
from models.notification import Notification
from notification_helpers import (
    create_notification,
    get_user_notifications,
    mark_as_read,
    mark_all_as_read,
    get_unread_count,
)
from models.attendee import EventAttendee
from models.party import EventParty, PartyMember
from models.review import PartyReview, ReviewReport as ReviewReportModel
from models.chat_message import ChatMessage
from typing import Optional, List
from datetime import datetime
from models.event import Event
from schemas import EventCreate, EventResponse, EventUpdate
from schemas import ReviewCreate, ReviewOut, ReviewReport, ReviewSummary, ReviewableUser, ALLOWED_REVIEW_TAGS
import kudago_api
from pydantic import BaseModel, Field
from enum import Enum
import time


class MemberStatus(str, Enum):
    """Допустимые статусы участника компании (party_members.status)."""
    pending  = "pending"
    accepted = "accepted"
    rejected = "rejected"
    left     = "left"


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)

models.user.Base.metadata.create_all(bind=engine)
models.event.Base.metadata.create_all(bind=engine)
models.attendee.Base.metadata.create_all(bind=engine)
models.party.Base.metadata.create_all(bind=engine)
models.chat_message.Base.metadata.create_all(bind=engine)
models.review.Base.metadata.create_all(bind=engine)


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
    # Persist to DB
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
    # Verify the user is the creator or an accepted member of this party
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


@sio.on('subscribe_user_notifications')
async def subscribe_user_notifications(sid, data: dict):
    """Applicant subscribes to their personal room to receive request_status_changed events."""
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

    # ── Смена пароля ──
    if data.new_password is not None:
        if not data.old_password:
            raise HTTPException(status_code=400, detail="Укажите текущий пароль")
        if not verify_password(data.old_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Неверный текущий пароль")
        if len(data.new_password) < 6:
            raise HTTPException(status_code=400, detail="Новый пароль должен быть не менее 6 символов")
        user.hashed_password = hash_password(data.new_password)

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

    # ── Аватар ──
    if data.avatar_url is not None:
        if data.avatar_url and not data.avatar_url.startswith("https://"):
            raise HTTPException(status_code=400, detail="avatar_url должен начинаться с https://")
        user.avatar_url = data.avatar_url or None

    db.commit()
    db.refresh(user)
    return user


class PrivacyUpdate(BaseModel):
    show_email:     Optional[bool] = None
    show_city:      Optional[bool] = None
    show_interests: Optional[bool] = None


@app.patch("/users/me/privacy")
def update_privacy(
    data: PrivacyUpdate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    if data.show_email     is not None: user.show_email     = data.show_email
    if data.show_city      is not None: user.show_city      = data.show_city
    if data.show_interests is not None: user.show_interests = data.show_interests
    db.commit()
    db.refresh(user)
    return {
        "show_email":     user.show_email,
        "show_city":      user.show_city,
        "show_interests": user.show_interests,
    }


# ===== MESSAGES (chat history) =====

@app.get("/messages/{room}")
def get_messages(
    room: str,
    limit: int = Query(default=50, le=200),
    before_id: Optional[int] = Query(default=None),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    # Проверяем, что пользователь авторизован
    get_current_user_from_token(token, db)
    query = db.query(ChatMessage).filter(ChatMessage.room == room)
    if before_id is not None:
        query = query.filter(ChatMessage.id < before_id)
    rows = query.order_by(ChatMessage.id.desc()).limit(limit).all()
    rows = list(reversed(rows))  # возвращаем в хронологическом порядке
    return {
        "messages": [
            {
                "id":        r.id,
                "message":   r.message,
                "userId":    r.user_id,
                "username":  r.username,
                "timestamp": r.timestamp.isoformat(),
            }
            for r in rows
        ],
        "has_more":  len(rows) == limit,
        "oldest_id": rows[0].id if rows else None,
    }


# ===== EVENTS =====

@app.get("/events", response_model=List[EventResponse])
def get_events(
    skip: int = 0,
    limit: int = 20,
    city: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    # Фильтры по дате
    date_from: Optional[datetime] = Query(default=None, description="События начиная с даты (ISO 8601)"),
    date_to: Optional[datetime] = Query(default=None, description="События до даты (ISO 8601)"),
    # Фильтры по цене
    is_free: Optional[bool] = Query(default=None, description="True = только бесплатные, False = только платные"),
    max_price: Optional[float] = Query(default=None, ge=0, description="Максимальная цена"),
    # Фильтр по местам
    has_spots: Optional[bool] = Query(default=None, description="True = только с доступными местами"),
    # Сортировка
    sort_by: Optional[str] = Query(default="date", pattern="^(date|price|participants)$"),
    db: Session = Depends(get_db),
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

    # Фильтрация по дате
    if date_from:
        query = query.filter(Event.date_time >= date_from)
    if date_to:
        query = query.filter(Event.date_time <= date_to)

    # Фильтрация по цене
    if is_free is True:
        query = query.filter(
            (Event.price == None) | (Event.price == 0)  # noqa: E711
        )
    elif is_free is False:
        query = query.filter(Event.price > 0)
    if max_price is not None:
        query = query.filter(
            (Event.price == None) | (Event.price <= max_price)  # noqa: E711
        )

    # Фильтрация по свободным местам
    if has_spots is True:
        query = query.filter(
            (Event.max_participants == None) |  # noqa: E711
            (Event.current_participants < Event.max_participants)
        )

    # Сортировка
    if sort_by == "price":
        query = query.order_by(Event.price.asc().nullsfirst())
    elif sort_by == "participants":
        query = query.order_by(Event.current_participants.desc())
    else:
        query = query.order_by(Event.date_time.asc())

    return query.offset(skip).limit(limit).all()


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


@app.patch("/events/{event_id}", response_model=EventResponse)
def update_event(
    event_id: int,
    data: EventUpdate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Редактирование события — только создатель."""
    user = get_current_user_from_token(token, db)
    event = db.query(Event).filter(Event.id == event_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    if event.created_by != user.id:
        raise HTTPException(status_code=403, detail="Только создатель может редактировать событие")

    if data.date_time is not None:
        if data.date_time < datetime.utcnow():
            raise HTTPException(status_code=400, detail="Дата не может быть в прошлом")
        event.date_time = data.date_time
    if data.title is not None:
        event.title = data.title
    if data.description is not None:
        event.description = data.description
    if data.location is not None:
        event.location = data.location
    if data.address is not None:
        event.address = data.address
    if data.city is not None:
        event.city = data.city
    if data.category is not None:
        event.category = data.category
    if data.price is not None:
        event.price = data.price
    if data.max_participants is not None:
        event.max_participants = data.max_participants
    if data.image_url is not None:
        event.image_url = data.image_url
    if data.external_link is not None:
        event.external_link = data.external_link
    if data.is_active is not None:
        event.is_active = data.is_active

    db.commit()
    db.refresh(event)
    return event


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
    # Метаданные события (кешируются для /users/me/events)
    event_title:     Optional[str] = None
    event_date_ts:   Optional[int] = None   # Unix-timestamp начала события
    event_city:      Optional[str] = None
    event_image_url: Optional[str] = None
    event_category:  Optional[str] = None
    event_location:  Optional[str] = None


class AttendeeOut(BaseModel):
    id: int
    user_id: int
    username: str
    city: Optional[str]
    interests: Optional[str]
    comment: Optional[str]
    is_looking: bool
    created_at: datetime
    avatar_url: Optional[str] = None

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
        existing.comment    = body.comment
        existing.is_looking = body.is_looking
        if body.event_title     is not None: existing.event_title     = body.event_title
        if body.event_date_ts   is not None: existing.event_date_ts   = body.event_date_ts
        if body.event_city      is not None: existing.event_city      = body.event_city
        if body.event_image_url is not None: existing.event_image_url = body.event_image_url
        if body.event_category  is not None: existing.event_category  = body.event_category
        if body.event_location  is not None: existing.event_location  = body.event_location
        db.commit()
        db.refresh(existing)
        row = existing
    else:
        row = EventAttendee(
            event_id=event_id,
            user_id=user.id,
            comment=body.comment,
            is_looking=body.is_looking,
            event_title=body.event_title,
            event_date_ts=body.event_date_ts,
            event_city=body.event_city,
            event_image_url=body.event_image_url,
            event_category=body.event_category,
            event_location=body.event_location,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

    created_at = row.created_at or datetime.utcnow()

    # Обновляем счётчик участников для локальных событий (не KudaGo)
    try:
        local_event = db.query(Event).filter(Event.id == int(event_id)).first()
        if local_event:
            local_event.current_participants = (
                db.query(EventAttendee)
                .filter(EventAttendee.event_id == event_id)
                .count()
            )
            db.commit()
    except (ValueError, TypeError):
        pass  # event_id — строка KudaGo, пропускаем

    return AttendeeOut(
        id=row.id,
        user_id=user.id,
        username=user.username,
        city=user.city,
        interests=user.interests,
        comment=row.comment,
        is_looking=row.is_looking,
        created_at=created_at,
        avatar_url=user.avatar_url,
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

    # Обновляем счётчик участников для локальных событий (не KudaGo)
    try:
        local_event = db.query(Event).filter(Event.id == int(event_id)).first()
        if local_event:
            local_event.current_participants = (
                db.query(EventAttendee)
                .filter(EventAttendee.event_id == event_id)
                .count()
            )
            db.commit()
    except (ValueError, TypeError):
        pass  # event_id — строка KudaGo, пропускаем


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
            avatar_url=u.avatar_url,
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
            avatar_url=u.avatar_url,
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


class PartyJoinBody(BaseModel):
    message: Optional[str] = Field(None, max_length=100)


class PartyMemberOut(BaseModel):
    user_id: int
    username: str
    city: Optional[str]
    interests: Optional[str]
    status: MemberStatus
    joined_at: datetime
    message: Optional[str] = None

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
        PartyMember.status.in_([MemberStatus.pending, MemberStatus.accepted])
    ).all()
    members = [
        PartyMemberOut(user_id=u.id, username=u.username, city=u.city,
                       interests=u.interests, status=m.status, joined_at=m.joined_at,
                       message=m.message)
        for m, u in members_rows
    ]
    return PartyOut(
        id=party.id, event_id=party.event_id, title=party.title,
        description=party.description, max_members=party.max_members,
        creator_id=party.creator_id,
        creator_username=creator.username if creator else "?",
        is_open=party.is_open, members=members, created_at=party.created_at,
    )


def _check_and_close_party(party: EventParty, db: Session) -> None:
    """Проверяет вместимость партии. Вызывается ПОСЛЕ db.flush() с уже записанным
    member.status = MemberStatus.accepted, поэтому считаем всех принятых напрямую.
    """
    # Считаем все accepted-строки в party_members (новый участник уже виден через flush)
    accepted_total = (
        db.query(PartyMember).filter(
            PartyMember.party_id == party.id,
            PartyMember.status == MemberStatus.accepted,
        ).count()
        + 1  # +1 за создателя — у него нет строки в party_members
    )

    if accepted_total > party.max_members:
        raise HTTPException(status_code=400, detail="Компания уже заполнена")

    if accepted_total >= party.max_members:
        party.is_open = False


# ===== USER PARTIES =====

@app.get("/users/me/parties", response_model=List[PartyOut])
def get_my_parties(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Возвращает все компании пользователя: созданные им + те, где он принятый участник."""
    user = get_current_user_from_token(token, db)

    created = db.query(EventParty).filter(EventParty.creator_id == user.id).all()

    member_party_ids = db.query(PartyMember.party_id).filter(
        PartyMember.user_id == user.id,
        PartyMember.status == MemberStatus.accepted,
    ).all()
    member_parties = db.query(EventParty).filter(
        EventParty.id.in_([r[0] for r in member_party_ids]),
        EventParty.creator_id != user.id,
    ).all()

    all_parties = list({p.id: p for p in created + member_parties}.values())
    all_parties.sort(key=lambda p: p.created_at or datetime.min, reverse=True)
    return [_build_party_out(p, db) for p in all_parties]


# ===== USER STATS =====

@app.get("/users/me/stats")
def get_my_stats(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)

    parties_created = db.query(EventParty).filter(
        EventParty.creator_id == user.id
    ).count()

    events_attended = db.query(EventAttendee).filter(
        EventAttendee.user_id == user.id
    ).count()

    # matches_found = parties where user is an ACCEPTED member (not creator)
    matches_found = (
        db.query(PartyMember)
        .filter(
            PartyMember.user_id == user.id,
            PartyMember.status == "accepted",
        )
        .join(EventParty, PartyMember.party_id == EventParty.id)
        .filter(EventParty.creator_id != user.id)
        .count()
    )

    return {
        "parties_created": parties_created,
        "events_attended": events_attended,
        "matches_found": matches_found,
    }


# ===== USER EVENTS =====

@app.get("/users/me/events")
def get_my_events(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    import time as _time
    user = get_current_user_from_token(token, db)
    now_ts = int(_time.time())

    # 1. Все события где пользователь кликнул "Иду"
    attendee_rows = db.query(EventAttendee).filter(
        EventAttendee.user_id == user.id
    ).all()

    seen_event_ids = {a.event_id for a in attendee_rows}
    items: dict = {}

    for a in attendee_rows:
        items[a.event_id] = {
            "event_id":   a.event_id,
            "title":      a.event_title or f"Событие #{a.event_id}",
            "date_ts":    a.event_date_ts,
            "city":       a.event_city,
            "category":   a.event_category,
            "image_url":  a.event_image_url,
            "location":   a.event_location,
            "is_looking": a.is_looking,
            "comment":    a.comment,
        }

    # 2. События из партий: accepted member ИЛИ creator
    member_event_ids = set(
        row[0] for row in (
            db.query(EventParty.event_id)
            .join(PartyMember, PartyMember.party_id == EventParty.id)
            .filter(
                PartyMember.user_id == user.id,
                PartyMember.status == "accepted",
            )
            .all()
        )
    )
    creator_event_ids = set(
        row[0] for row in (
            db.query(EventParty.event_id)
            .filter(EventParty.creator_id == user.id)
            .all()
        )
    )
    party_event_ids = (member_event_ids | creator_event_ids) - seen_event_ids

    # Для событий из партий без записи в EventAttendee — подтягиваем из KudaGo
    for event_id in party_event_ids:
        try:
            raw = kudago_api.get_event_by_id(int(event_id))
            dates = raw.get("dates") or []
            date_ts: Optional[int] = None
            for d in dates:
                ts = d.get("start")
                if ts:
                    date_ts = int(ts)
                    break
            images = raw.get("images") or []
            image_url = images[0].get("image") if images else None
            cats = raw.get("categories") or []
            category = cats[0] if cats else None
            place = raw.get("place") or {}
            location = place.get("address") or place.get("title") or None
            items[event_id] = {
                "event_id":   event_id,
                "title":      raw.get("title") or f"Событие #{event_id}",
                "date_ts":    date_ts,
                "city":       None,
                "category":   category,
                "image_url":  image_url,
                "location":   location,
                "is_looking": False,
                "comment":    None,
            }
        except Exception:
            pass  # KudaGo недоступен или ID не числовой — пропускаем

    upcoming: list = []
    past: list = []
    for item in sorted(items.values(), key=lambda x: x["date_ts"] or 0):
        if (item["date_ts"] or 0) >= now_ts:
            upcoming.append(item)
        else:
            past.append(item)

    return {"upcoming": upcoming, "past": past}


# ===== NOTIFICATIONS — pending requests for party creators =====

class PendingRequestOut(BaseModel):
    id: int
    user_id: int
    username: str
    party_id: int
    event_title: Optional[str] = None
    created_at: datetime
    message: Optional[str] = None

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
            PartyMember.status == MemberStatus.pending,
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
            message=member.message,
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
    # Для локальных событий (числовой event_id) — не показываем компании
    # если событие уже прошло
    try:
        local_event = db.query(Event).filter(Event.id == int(event_id)).first()
        if local_event and local_event.date_time < datetime.utcnow():
            return []
    except (ValueError, TypeError):
        pass  # event_id — строка KudaGo, пропускаем проверку

    parties = db.query(EventParty).filter(EventParty.event_id == event_id).order_by(
        EventParty.created_at.desc()
    ).all()
    return [_build_party_out(p, db) for p in parties]


@app.post("/parties/requests/{request_id}/approve", response_model=PartyOut)
async def approve_request(
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
    member.status = MemberStatus.accepted
    db.flush()                        # делаем статус видимым для _check_and_close_party
    _check_and_close_party(party, db)
    notif = create_notification(
        db, member.user_id, "request_status_changed",
        "Заявка принята",
        f"Вас приняли в компанию «{party.title}»",
        {"party_id": party.id, "status": "accepted"},
    )
    db.commit()
    # Уведомляем заявителя о принятии
    await sio.emit(
        "request_status_changed",
        {"status": "accepted", "party_id": party.id, "party_title": party.title,
         "notification_id": notif.id},
        room=f"user_{member.user_id}",
    )
    return _build_party_out(party, db)


@app.post("/parties/requests/{request_id}/reject", response_model=PartyOut)
async def reject_request(
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
    member.status = MemberStatus.rejected
    notif = create_notification(
        db, member.user_id, "request_status_changed",
        "Заявка отклонена",
        f"Заявка в компанию «{party.title}» отклонена",
        {"party_id": party.id, "status": "rejected"},
    )
    db.commit()
    # Уведомляем заявителя об отклонении
    await sio.emit(
        "request_status_changed",
        {"status": "rejected", "party_id": party.id, "party_title": party.title,
         "notification_id": notif.id},
        room=f"user_{member.user_id}",
    )
    return _build_party_out(party, db)


@app.post("/parties/event/{event_id}", response_model=PartyOut)
def create_party(
    event_id: str,
    body: PartyCreateBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    if body.max_members < 2 or body.max_members > 20:
        raise HTTPException(status_code=400, detail="max_members must be between 2 and 20")
    # Защита от дублей: не более 2 открытых компаний на одного создателя на одно событие
    existing_count = db.query(EventParty).filter(
        EventParty.event_id == event_id,
        EventParty.creator_id == user.id,
        EventParty.is_open == True,
    ).count()
    if existing_count >= 2:
        raise HTTPException(
            status_code=400,
            detail="Нельзя создать более 2 активных компаний для одного события",
        )
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
            PartyMember.party_id == party_id, PartyMember.status == MemberStatus.accepted,
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
async def delete_party(
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
    # Уведомляем всех участников о роспуске компании до удаления
    await sio.emit(
        "party_deleted",
        {"party_id": party.id, "party_title": party.title},
        room=f"party_{party.id}",
    )
    db.query(PartyMember).filter(PartyMember.party_id == party_id).delete()
    db.delete(party)
    db.commit()
    return {"ok": True}


@app.post("/parties/{party_id}/join", response_model=PartyOut)
async def join_party(
    party_id: int,
    body: PartyJoinBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if not party.is_open:
        raise HTTPException(status_code=400, detail="Набор закрыт")
    # Проверяем, что событие ещё не прошло (только для локальных событий)
    try:
        local_event = db.query(Event).filter(Event.id == int(party.event_id)).first()
        if local_event and local_event.date_time < datetime.utcnow():
            raise HTTPException(status_code=400, detail="Событие уже прошло")
    except (ValueError, TypeError):
        pass  # event_id — строка KudaGo, пропускаем проверку
    accepted_count = db.query(PartyMember).filter(
        PartyMember.party_id == party_id, PartyMember.status == MemberStatus.accepted
    ).count()
    # +1 за создателя (он всегда занимает слот); pending не считается в лимит
    if accepted_count + 1 >= party.max_members:
        raise HTTPException(status_code=400, detail="Компания заполнена")
    existing = db.query(PartyMember).filter(
        PartyMember.party_id == party_id, PartyMember.user_id == user.id
    ).first()
    if existing:
        if existing.status == MemberStatus.rejected:
            existing.status = MemberStatus.pending
            existing.message = body.message
            notif = create_notification(
                db, party.creator_id, "new_party_request",
                "Новая заявка в компанию",
                f"{user.username} хочет вступить в компанию «{party.title}»",
                {"party_id": party.id, "user_id": user.id, "username": user.username},
            )
            db.commit()
            await sio.emit(
                "new_party_request",
                {"party_id": party.id, "party_title": party.title,
                 "user_id": user.id, "username": user.username,
                 "notification_id": notif.id},
                room=f"creator_{party.creator_id}",
            )
            return _build_party_out(party, db)
        elif existing.status == MemberStatus.left:
            existing.status = MemberStatus.pending
            existing.message = body.message
            notif = create_notification(
                db, party.creator_id, "new_party_request",
                "Новая заявка в компанию",
                f"{user.username} хочет вступить в компанию «{party.title}»",
                {"party_id": party.id, "user_id": user.id, "username": user.username},
            )
            db.commit()
            await sio.emit(
                "new_party_request",
                {"party_id": party.id, "party_title": party.title,
                 "user_id": user.id, "username": user.username,
                 "notification_id": notif.id},
                room=f"creator_{party.creator_id}",
            )
            return _build_party_out(party, db)
        elif existing.status in [MemberStatus.pending, MemberStatus.accepted]:
            raise HTTPException(status_code=400, detail="Вы уже в этой компании или подали заявку")
    m = PartyMember(party_id=party_id, user_id=user.id, status="pending", message=body.message)
    db.add(m)
    notif = create_notification(
        db, party.creator_id, "new_party_request",
        "Новая заявка в компанию",
        f"{user.username} хочет вступить в компанию «{party.title}»",
        {"party_id": party.id, "user_id": user.id, "username": user.username},
    )
    db.commit()
    await sio.emit(
        "new_party_request",
        {"party_id": party.id, "party_title": party.title,
         "user_id": user.id, "username": user.username,
         "notification_id": notif.id},
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
    if member.status == MemberStatus.rejected:
        raise HTTPException(status_code=400, detail="Вы не являетесь участником компании")
    member.status = MemberStatus.left
    db.commit()
    return {"ok": True}


@app.post("/parties/{party_id}/members/{user_id}/kick", response_model=PartyOut)
async def kick_member(
    party_id: int,
    user_id: int,
    body: PartyKickBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Исключить принятого участника из компании (только создатель)."""
    current_user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может исключать участников")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя исключить самого себя")
    member = db.query(PartyMember).filter(
        PartyMember.party_id == party_id,
        PartyMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Участник не найден в компании")
    if member.status != MemberStatus.accepted:
        raise HTTPException(status_code=400, detail="Можно исключить только принятого участника")
    member.status = MemberStatus.rejected
    # Если компания была закрыта из-за заполненности — снова открываем
    if not party.is_open:
        accepted_after = db.query(PartyMember).filter(
            PartyMember.party_id == party_id,
            PartyMember.status == MemberStatus.accepted,
            PartyMember.user_id != user_id,
            PartyMember.user_id != party.creator_id,
        ).count()
        # создатель (1) + оставшиеся принятые
        if 1 + accepted_after < party.max_members:
            party.is_open = True
    notif = create_notification(
        db, user_id, "kicked_from_party",
        "Вы исключены из компании",
        f"Вас исключили из компании «{party.title}»",
        {"party_id": party.id},
    )
    db.commit()
    # Уведомляем исключённого участника в реальном времени
    await sio.emit(
        "kicked_from_party",
        {"party_id": party.id, "party_title": party.title,
         "notification_id": notif.id},
        room=f"user_{user_id}",
    )
    return _build_party_out(party, db)


@app.post("/parties/{party_id}/members/{user_id}/accept", response_model=PartyOut)
async def accept_member(
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
    m = db.query(PartyMember).filter(
        PartyMember.party_id == party_id, PartyMember.user_id == user_id
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    m.status = MemberStatus.accepted
    db.flush()                        # делаем статус видимым для _check_and_close_party
    _check_and_close_party(party, db)
    notif = create_notification(
        db, m.user_id, "request_status_changed",
        "Заявка принята",
        f"Вас приняли в компанию «{party.title}»",
        {"party_id": party.id, "status": "accepted"},
    )
    db.commit()
    # Уведомляем заявителя о принятии
    await sio.emit(
        "request_status_changed",
        {"status": "accepted", "party_id": party.id, "party_title": party.title,
         "notification_id": notif.id},
        room=f"user_{m.user_id}",
    )
    return _build_party_out(party, db)


@app.post("/parties/{party_id}/members/{user_id}/reject", response_model=PartyOut)
async def reject_member(
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
    m.status = MemberStatus.rejected
    notif = create_notification(
        db, m.user_id, "request_status_changed",
        "Заявка отклонена",
        f"Заявка в компанию «{party.title}» отклонена",
        {"party_id": party.id, "status": "rejected"},
    )
    db.commit()
    # Уведомляем заявителя об отклонении
    await sio.emit(
        "request_status_changed",
        {"status": "rejected", "party_id": party.id, "party_title": party.title,
         "notification_id": notif.id},
        room=f"user_{m.user_id}",
    )
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


@app.get("/users")
def get_users(
    token: str = Depends(oauth2_scheme),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    search: Optional[str] = Query(default=None),
    city: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    get_current_user_from_token(token, db)
    query = db.query(User)
    if search:
        query = query.filter(
            (User.username.ilike(f"%{search}%")) |
            (User.interests.ilike(f"%{search}%"))
        )
    if city:
        query = query.filter(User.city.ilike(f"%{city}%"))
    users = query.offset(skip).limit(limit).all()
    # Apply privacy settings — never expose email in list view
    return [
        {
            "id":        u.id,
            "username":  u.username,
            "email":     u.email if u.show_email else None,
            "city":      u.city if u.show_city else None,
            "interests": u.interests if u.show_interests else None,
            "bio":       u.bio,
            "avatar_url": u.avatar_url,
            "is_active": u.is_active,
        }
        for u in users
    ]


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


# ─── Reviews ──────────────────────────────────────────────────────────────────

REVIEW_WINDOW_DAYS = 30


@app.post("/reviews/", response_model=ReviewOut)
def create_review(
    payload: ReviewCreate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)

    if payload.reviewed_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя оценивать самого себя")

    # Validate tags
    tags = payload.tags or []
    if len(tags) > 3:
        raise HTTPException(status_code=400, detail="Максимум 3 тега")
    invalid = [t for t in tags if t not in ALLOWED_REVIEW_TAGS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Недопустимые теги: {invalid}")

    # Check party exists
    party = db.query(EventParty).filter(EventParty.id == payload.party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Пати не найдена")

    # Determine event timestamp
    now_ts = int(datetime.utcnow().timestamp())
    event_ts: int | None = None
    attendee_row = db.query(EventAttendee).filter(
        EventAttendee.event_id == party.event_id,
    ).first()
    if attendee_row and attendee_row.event_date_ts:
        event_ts = attendee_row.event_date_ts
    else:
        try:
            raw = kudago_api.get_event_by_id(int(party.event_id))
            dates = raw.get("dates") or []
            for d in dates:
                ts = d.get("start")
                if ts:
                    event_ts = int(ts)
                    break
        except Exception:
            pass

    if event_ts is not None:
        if event_ts > now_ts:
            raise HTTPException(status_code=400, detail="Событие ещё не прошло")
        window_deadline = event_ts + REVIEW_WINDOW_DAYS * 24 * 3600
        if now_ts > window_deadline:
            raise HTTPException(status_code=400, detail="Окно для отзыва (30 дней) истекло")

    # Check both are participants of the party
    def _is_party_participant(user_id: int) -> bool:
        if party.creator_id == user_id:
            return True
        return db.query(PartyMember).filter(
            PartyMember.party_id == payload.party_id,
            PartyMember.user_id == user_id,
            PartyMember.status == "accepted",
        ).first() is not None

    if not _is_party_participant(current_user.id):
        raise HTTPException(status_code=403, detail="Вы не являетесь участником этой пати")
    if not _is_party_participant(payload.reviewed_id):
        raise HTTPException(status_code=400, detail="Оцениваемый не является участником этой пати")

    if not (1 <= payload.rating <= 5):
        raise HTTPException(status_code=400, detail="Рейтинг должен быть от 1 до 5")

    # Duplicate check
    existing = db.query(PartyReview).filter(
        PartyReview.reviewer_id == current_user.id,
        PartyReview.reviewed_id == payload.reviewed_id,
        PartyReview.party_id == payload.party_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Вы уже оценили этого участника")

    review = PartyReview(
        reviewer_id=current_user.id,
        reviewed_id=payload.reviewed_id,
        party_id=payload.party_id,
        rating=payload.rating,
        text=payload.text,
        tags=tags or None,
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    reviewer = db.query(User).filter(User.id == current_user.id).first()
    return ReviewOut(
        id=review.id,
        reviewer_id=review.reviewer_id,
        reviewer_username=reviewer.username,
        reviewer_avatar_url=reviewer.avatar_url,
        rating=review.rating,
        text=review.text,
        tags=review.tags,
        created_at=review.created_at,
    )


@app.post("/reviews/{review_id}/report", status_code=204)
def report_review(
    review_id: int,
    payload: ReviewReport,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    review = db.query(PartyReview).filter(PartyReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Отзыв не найден")
    # Prevent the same user from reporting the same review more than once
    already_reported = db.query(ReviewReportModel).filter(
        ReviewReportModel.review_id == review_id,
        ReviewReportModel.reporter_id == current_user.id,
    ).first()
    if already_reported:
        raise HTTPException(status_code=409, detail="Вы уже жаловались на этот отзыв")
    db.add(ReviewReportModel(review_id=review_id, reporter_id=current_user.id))
    review.report_count = (review.report_count or 0) + 1
    if review.report_count >= 3:
        review.is_hidden = True
    db.commit()


@app.get("/users/{user_id}/reviews", response_model=ReviewSummary)
def get_user_reviews(user_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(PartyReview)
        .filter(
            PartyReview.reviewed_id == user_id,
            PartyReview.is_hidden == False,  # noqa: E712
        )
        .order_by(PartyReview.created_at.desc())
        .all()
    )
    total = len(rows)
    avg = round(sum(r.rating for r in rows) / total, 2) if total > 0 else None

    # Stars distribution
    dist: dict[int, int] = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for r in rows:
        dist[r.rating] = dist.get(r.rating, 0) + 1

    # Top tags (up to 5 most frequent)
    tag_counts: dict[str, int] = {}
    for r in rows:
        for tag in (r.tags or []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    top_tags = [t for t, _ in sorted(tag_counts.items(), key=lambda x: -x[1])[:5]]

    reviewer_ids = {r.reviewer_id for r in rows[:10]}
    reviewers = {u.id: u for u in db.query(User).filter(User.id.in_(reviewer_ids)).all()}

    recent = [
        ReviewOut(
            id=r.id,
            reviewer_id=r.reviewer_id,
            reviewer_username=reviewers[r.reviewer_id].username if r.reviewer_id in reviewers else "Аноним",
            reviewer_avatar_url=reviewers[r.reviewer_id].avatar_url if r.reviewer_id in reviewers else None,
            rating=r.rating,
            text=r.text,
            tags=r.tags,
            created_at=r.created_at,
        )
        for r in rows[:10]
    ]
    return ReviewSummary(
        avg_rating=avg,
        total_reviews=total,
        reviews=recent,
        stars_distribution=dist,
        top_tags=top_tags,
    )


@app.get("/users/me/reviewable", response_model=List[ReviewableUser])
def get_reviewable_users(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    now_ts = int(datetime.utcnow().timestamp())

    # Parties where current user is an accepted member OR creator
    member_party_ids = [
        pm.party_id
        for pm in db.query(PartyMember).filter(
            PartyMember.user_id == current_user.id,
            PartyMember.status == "accepted",
        ).all()
    ]
    creator_party_ids = [
        ep.id
        for ep in db.query(EventParty).filter(
            EventParty.creator_id == current_user.id,
        ).all()
    ]
    my_party_ids = list(set(member_party_ids) | set(creator_party_ids))
    if not my_party_ids:
        return []

    # Only parties whose event has already passed
    past_party_ids = []
    for party_id in my_party_ids:
        party = db.query(EventParty).filter(EventParty.id == party_id).first()
        if not party:
            continue
        # Try event_attendees cache first
        att = db.query(EventAttendee).filter(
            EventAttendee.event_id == party.event_id,
        ).first()
        if att and att.event_date_ts:
            if att.event_date_ts < now_ts:
                past_party_ids.append(party_id)
            continue
        # Fallback: check KudaGo for event date
        try:
            raw = kudago_api.get_event_by_id(int(party.event_id))
            dates = raw.get("dates") or []
            event_ts = None
            for d in dates:
                ts = d.get("start")
                if ts:
                    event_ts = int(ts)
                    break
            if event_ts and event_ts < now_ts:
                past_party_ids.append(party_id)
        except Exception:
            pass

    if not past_party_ids:
        return []

    # Already reviewed by me
    already_reviewed = {
        (r.reviewed_id, r.party_id)
        for r in db.query(PartyReview).filter(
            PartyReview.reviewer_id == current_user.id,
            PartyReview.party_id.in_(past_party_ids),
        ).all()
    }

    # Build party_id → event_id lookup
    parties_map = {
        ep.id: ep
        for ep in db.query(EventParty).filter(EventParty.id.in_(past_party_ids)).all()
    }

    # Collect all participants (accepted members + creators) excluding myself
    result: list[ReviewableUser] = []
    seen_pairs: set[tuple[int, int]] = set()

    members = db.query(PartyMember).filter(
        PartyMember.party_id.in_(past_party_ids),
        PartyMember.status == "accepted",
        PartyMember.user_id != current_user.id,
    ).all()

    # Also include creators of past parties who are not current_user
    creators = db.query(EventParty).filter(
        EventParty.id.in_(past_party_ids),
        EventParty.creator_id != current_user.id,
    ).all()

    candidate_ids = {m.user_id for m in members} | {ep.creator_id for ep in creators}
    users_map = {u.id: u for u in db.query(User).filter(User.id.in_(candidate_ids)).all()}

    for member in members:
        pair = (member.user_id, member.party_id)
        if pair in already_reviewed or pair in seen_pairs:
            continue
        u = users_map.get(member.user_id)
        party = parties_map.get(member.party_id)
        if not u or not party:
            continue
        seen_pairs.add(pair)
        result.append(ReviewableUser(
            user_id=u.id,
            username=u.username,
            avatar_url=u.avatar_url,
            party_id=member.party_id,
            event_id=party.event_id,
        ))

    for ep in creators:
        pair = (ep.creator_id, ep.id)
        if pair in already_reviewed or pair in seen_pairs:
            continue
        u = users_map.get(ep.creator_id)
        if not u:
            continue
        seen_pairs.add(pair)
        result.append(ReviewableUser(
            user_id=u.id,
            username=u.username,
            avatar_url=u.avatar_url,
            party_id=ep.id,
            event_id=ep.event_id,
        ))

    return result


@app.get("/users/{user_id}")
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return {
        "id":         user.id,
        "username":   user.username,
        "email":      user.email      if user.show_email     else None,
        "city":       user.city       if user.show_city      else None,
        "interests":  user.interests  if user.show_interests else None,
        "bio":        user.bio,
        "avatar_url": user.avatar_url,
        "is_active":  user.is_active,
    }


# ── Notifications ────────────────────────────────────────────────────────────

class NotificationOut(BaseModel):
    id: int
    type: str
    title: str
    body: str | None
    data: str | None   # raw JSON string — frontend parses if needed
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class MarkReadBody(BaseModel):
    notification_id: int


@app.get("/notifications/", response_model=list[NotificationOut])
def list_notifications(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    return get_user_notifications(db, current_user.id, limit=limit, offset=offset)


@app.get("/notifications/unread-count")
def unread_count(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    return {"count": get_unread_count(db, current_user.id)}


@app.post("/notifications/read")
def read_notification(
    body: MarkReadBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    found = mark_as_read(db, body.notification_id, current_user.id)
    if not found:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    db.commit()
    return {"ok": True}


@app.post("/notifications/read-all")
def read_all_notifications(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    count = mark_all_as_read(db, current_user.id)
    db.commit()
    return {"ok": True, "marked": count}
