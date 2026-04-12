"""
Shared FastAPI dependencies for GatherVibe.

Centralises get_db, auth helpers, and oauth2 schemes so routers
can import from one place without circular imports.
"""
from typing import Optional

from fastapi import HTTPException, Request
from fastapi.security import OAuth2
from fastapi.openapi.models import OAuthFlows as OAuthFlowsModel
from sqlalchemy.orm import Session

from database import SessionLocal
from models.user import User


class OAuth2BearerOrCookie(OAuth2):
    """Accepts a JWT from Authorization: Bearer header OR an HttpOnly 'token' cookie."""

    def __init__(self, tokenUrl: str, auto_error: bool = True):
        flows = OAuthFlowsModel(password={"tokenUrl": tokenUrl, "scopes": {}})
        super().__init__(flows=flows, auto_error=auto_error)
        self._auto_error = auto_error

    async def __call__(self, request: Request) -> Optional[str]:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            return auth_header[7:]
        cookie_token = request.cookies.get("token")
        if cookie_token:
            return cookie_token
        if self._auto_error:
            raise HTTPException(status_code=401, detail="Требуется авторизация")
        return None


oauth2_scheme = OAuth2BearerOrCookie(tokenUrl="login")
oauth2_scheme_optional = OAuth2BearerOrCookie(tokenUrl="login", auto_error=False)


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
