from fastapi import FastAPI, Depends, HTTPException
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

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# Создаем таблицы в БД (если их нет)
models.user.Base.metadata.create_all(bind=engine)

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
    allow_methods=["*"],  # Разрешаем ВСЕ методы
    allow_headers=["*"],  # Разрешаем ВСЕ заголовки
)

# Функция для получения сессии БД
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Добавь этот endpoint ПЕРЕД существующими
@app.post("/login", response_model=Token)
def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    """
    Вход пользователя.
    Возвращает JWT токен для аутентификации.
    """
    # Аутентифицируем пользователя
    user = authenticate_user(user_credentials.email, user_credentials.password, db)
    
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Неверный email или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Пользователь заблокирован")
    
    # Создаем токен
    token_data = create_user_token(user)
    return token_data

# Добавь endpoint для получения текущего пользователя
@app.get("/users/me", response_model=UserResponse)
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Получить текущего пользователя по токену"""
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


@app.get("/")
def read_root():
    return {"message": "GatherVibe API работает!"}

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "gathervibe-backend"}

# Новый endpoint: получить всех пользователей
@app.get("/users")
def get_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return {"users": users, "count": len(users)}

# Новый endpoint: создать тестового пользователя
@app.post("/test-user")
def create_test_user(db: Session = Depends(get_db)):
    # Проверяем, есть ли уже тестовый пользователь
    existing = db.query(User).filter(User.email == "test@example.com").first()
    if existing:
        return {"message": "Тестовый пользователь уже существует", "user_id": existing.id}
    
    # Создаем тестового пользователя
    test_user = User(
        email="test@example.com",
        username="ТестовыйПользователь",
        hashed_password="заглушка",  # позже хешировать будем
        city="Москва",
        interests="музыка,кино,искусство"
    )
    
    db.add(test_user)
    db.commit()
    db.refresh(test_user)
    
    return {"message": "Тестовый пользователь создан", "user_id": test_user.id}

# Регистрация пользователя
@app.post("/register", response_model=UserResponse)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    # Проверяем, нет ли уже такого email
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
    
    # Хешируем пароль
    hashed_password = hash_password(user.password)
    
    # Создаем пользователя
    new_user = User(
        email=user.email,
        username=user.username,
        hashed_password=hashed_password,
        city=user.city,
        interests=user.interests
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user

# Получить пользователя по ID
@app.get("/users/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user