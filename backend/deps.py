"""
Shared FastAPI dependencies for GatherVibe.

Centralises get_db, auth helpers, and oauth2 schemes so routers
can import from one place without circular imports.
"""
from sqlalchemy.orm import Session
from database import SessionLocal
from fastapi import HTTPException
from fastapi.security import OAuth2PasswordBearer
from models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)


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
    """Authentication helper for Socket.IO handlers."""
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
