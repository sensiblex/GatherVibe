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
from models.attendee import EventAttendee
from models.party import EventParty, PartyMember
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
async def join_event_chat(sid, event_id: str):
    await sio.enter_room(sid, f'event_{event_id}')
    await sio.emit('user_joined', {'sid': sid}, room=f'event_{event_id}')


@sio.on('send_message')
async def send_message(sid, data: dict):
    event_id = data['eventId']
    msg = {
        'message': data['message'],
        'userId': data.get('userId', sid),
        'username': data.get('username', 'Аноним'),
        'timestamp': datetime.now().isoformat()
    }
    await sio.emit('receive_message', msg, room=f'event_{event_id}')


@sio.on('leave_event_chat')
async def leave_event_chat(sid, event_id: str):
    await sio.leave_room(sid, f'event_{event_id}')


# -- Party chat --

@sio.on('join_party_chat')
async def join_party_chat(sid, data: dict):
    party_id = data['partyId']
    user_id = data.get('userId')
    await sio.enter_room(sid, f'party_{party_id}')
    await sio.emit(
        'party_user_joined',
        {'sid': sid, 'userId': user_id},
        room=f'party_{party_id}'
    )


@sio.on('send_party_message')
async def send_party_message(sid, data: dict):
    party_id = data['partyId']
    msg = {
        'message': data['message'],
        'userId': data.get('userId', sid),
        'username': data.get('username', 'Аноним'),
        'timestamp': datetime.now().isoformat(),
        'partyId': party_id,
    }
    await sio.emit('receive_party_message', msg, room=f'party_{party_id}')


@sio.on('leave_party_chat')
async def leave_party_chat(sid, data: dict):
    party_id = data['partyId']
    await sio.leave_room(sid, f'party_{party_id}')


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
def create_event(event: EventCreate, db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    from jwt_handler import verify_token
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Неверный токен")
    db_event = Event(**event.dict(), created_by=payload.get("id"), current_participants=0)
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
        row = EventAttendee(event_id=event_id, user_id=user.id,
                            comment=body.comment, is_looking=body.is_looking)
        db.add(row)
        db.commit()
        db.refresh(row)
    return AttendeeOut(id=row.id, user_id=user.id, username=user.username,
                       city=user.city, interests=user.interests,
                       comment=row.comment, is_looking=row.is_looking, created_at=row.created_at)


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
            is_looking=a.is_looking, created_at=a.created_at,
            common_count=common,
        ))

    result.sort(key=lambda x: x.common_count, reverse=True)
    return result


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
        AttendeeOut(id=a.id, user_id=u.id, username=u.username, city=u.city,
                    interests=u.interests, comment=a.comment,
                    is_looking=a.is_looking, created_at=a.created_at)
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
        PartyMember.user_id != party.creator_id
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


@app.get("/parties/{event_id}", response_model=List[PartyOut])
def get_parties(event_id: str, db: Session = Depends(get_db)):
    parties = db.query(EventParty).filter(EventParty.event_id == event_id).order_by(
        EventParty.created_at.desc()
    ).all()
    return [_build_party_out(p, db) for p in parties]


@app.get("/parties/detail/{party_id}", response_model=PartyOut)
def get_party_detail(party_id: int, db: Session = Depends(get_db)):
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
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
def join_party(
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
    if accepted_count + 1 >= party.max_members:
        raise HTTPException(status_code=400, detail="Компания заполнена")
    existing = db.query(PartyMember).filter(
        PartyMember.party_id == party_id, PartyMember.user_id == user.id
    ).first()
    if existing:
        if existing.status == 'rejected':
            db.delete(existing)
            db.commit()
        else:
            raise HTTPException(status_code=400, detail="Вы уже в этой компании или подали заявку")
    m = PartyMember(party_id=party_id, user_id=user.id, status="pending")
    db.add(m)
    db.commit()
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
    db.delete(member)
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
    if accepted_count + 1 >= party.max_members:
        raise HTTPException(status_code=400, detail="Компания уже заполнена")
    m = db.query(PartyMember).filter(
        PartyMember.party_id == party_id, PartyMember.user_id == user_id
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    m.status = "accepted"
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
    db.delete(m)
    db.commit()
    return _build_party_out(party, db)


@app.post("/parties/{party_id}/members/{user_id}/kick")
def kick_member(
    party_id: int,
    user_id: int,
    body: PartyKickBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может исключать участников")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя исключить себя")
    m = db.query(PartyMember).filter(
        PartyMember.party_id == party_id, PartyMember.user_id == user_id
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Участник не найден")
    db.delete(m)
    db.commit()
    return {"ok": True, "kicked_user_id": user_id, "reason": body.reason}


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
def get_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return {"users": users, "count": len(users)}


@app.post("/test-user")
def create_test_user(db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == "test@example.com").first()
    if existing:
        return {"message": "Тестовый пользователь уже есть", "user_id": existing.id}
    test_user = User(
        email="test@example.com", username="ТестовыйПользователь",
        hashed_password=hash_password("123456"), city="Москва", interests="музыка,кино,искусство"
    )
    db.add(test_user)
    db.commit()
    db.refresh(test_user)
    return {"message": "Тестовый пользователь создан", "user_id": test_user.id}


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


@app.delete("/test-user")
def delete_test_user(db: Session = Depends(get_db)):
    db.query(User).filter(User.email == "test@example.com").delete()
    db.commit()
    return {"ok": True}
