import socketio
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import engine, SessionLocal
from models.user import User
from schemas import UserCreate, UserResponse
from schemas import UserLogin, Token
from auth import hash_password
from auth import authenticate_user, create_user_token
import models.user
import models.event
from typing import Optional, List
from datetime import datetime
from models.event import Event
from schemas import EventCreate, EventResponse
import kudago_api


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

models.user.Base.metadata.create_all(bind=engine)
models.event.Base.metadata.create_all(bind=engine)


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


@sio.on('join_event_chat')
async def join_event_chat(sid, event_id: str):
    await sio.enter_room(sid, f'event_{event_id}')
    await sio.emit('user_joined', {'sid': sid}, room=f'event_{event_id}')
    print(f"User {sid} joined event_{event_id}")


@sio.on('send_message')
async def send_message(sid, data: dict):
    event_id = data['eventId']
    msg = {
        'message': data['message'],
        'userId': data.get('userId', sid),
        'timestamp': datetime.now().isoformat()
    }
    await sio.emit('receive_message', msg, room=f'event_{event_id}')


@sio.on('leave_event_chat')
async def leave_event_chat(sid, event_id: str):
    await sio.leave_room(sid, f'event_{event_id}')


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


# ⚠️ socket_app — главное ASGI-приложение для uvicorn
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)


@app.post("/login", response_model=Token)
def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    user = authenticate_user(user_credentials.email, user_credentials.password, db)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Неверный email или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Пользователь заблокирован")
    return create_user_token(user)


@app.get("/users/me", response_model=UserResponse)
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    from jwt_handler import verify_token
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Неверный токен")
    email = payload.get("sub")
    if email is None:
        raise HTTPException(status_code=401, detail="Неверный токен")
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user


# ===== EVENTS =====

@app.get("/events", response_model=List[EventResponse])
def get_events(
    skip: int = 0,
    limit: int = 20,
    city: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Event).filter(Event.is_active == True)
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
):
    try:
        if search:
            raw = kudago_api.search(query=search, ctype="event", location=location, is_free=is_free, page=page, page_size=page_size)
        else:
            raw = kudago_api.get_events(location=location, categories=categories, is_free=is_free, page=page, page_size=page_size)
        events = kudago_api.parse_events(raw)
        return {"count": raw.get("count", len(events)), "next": raw.get("next"), "previous": raw.get("previous"), "page": page, "page_size": page_size, "results": events}
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
        email="test@example.com",
        username="ТестовыйПользователь",
        hashed_password=hash_password("123456"),
        city="Москва",
        interests="музыка,кино,искусство"
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
        email=user.email,
        username=user.username,
        hashed_password=hash_password(user.password),
        city=user.city,
        interests=user.interests,
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
