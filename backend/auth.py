# backend/auth.py
from passlib.context import CryptContext
from jwt_handler import create_access_token, verify_token
from datetime import timedelta

# Используем SHA256 для простоты
pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

def hash_password(password: str) -> str:
    """Хеширует пароль"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверяет пароль"""
    return pwd_context.verify(plain_password, hashed_password)

def authenticate_user(email: str, password: str, db):
    """Аутентифицирует пользователя"""
    from models.user import User
    from sqlalchemy.orm import Session
    
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user

def create_user_token(user):
    """Создает токен для пользователя"""
    access_token_expires = timedelta(minutes=60 * 24 * 7)  # 7 дней
    access_token = create_access_token(
        data={"sub": user.email, "id": user.id, "username": user.username},
        expires_delta=access_token_expires
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user.id,
        "username": user.username,
        "email": user.email
    }