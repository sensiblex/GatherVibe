"""
Shared FastAPI dependencies for GatherVibe.

Centralises get_db, auth helpers, and oauth2 schemes so routers
can import from one place without circular imports.
"""
from datetime import datetime
from typing import Optional

from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2
from fastapi.openapi.models import OAuthFlows as OAuthFlowsModel
from sqlalchemy.orm import Session

from database import SessionLocal
from models.user import User
from models.token_revocation import RevokedToken


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


def _is_user_banned(user: User) -> bool:
    """Возвращает True если пользователь активно забанен (с учётом истечения temp-бана)."""
    if not getattr(user, "is_banned", False):
        return False
    banned_until = getattr(user, "banned_until", None)
    if banned_until is None:
        return True  # permanent ban
    # temp ban: сравниваем naive-даты, SQLite хранит naive datetime
    now = datetime.utcnow()
    banned_until_naive = banned_until.replace(tzinfo=None) if getattr(banned_until, "tzinfo", None) else banned_until
    return banned_until_naive > now


def _is_token_revoked(db: Session, jti: Optional[str]) -> bool:
    """True если jti не пустой и такая запись есть в RevokedToken."""
    if not jti:
        return False
    return db.query(RevokedToken).filter(RevokedToken.jti == jti).first() is not None


def get_current_user_from_token(token: str, db: Session, *, allow_banned: bool = False) -> User:
    from jwt_handler import verify_token
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Неверный токен")
    jti = payload.get("jti")
    if _is_token_revoked(db, jti):
        raise HTTPException(status_code=401, detail="Токен отозван")
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Неверный токен")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if not getattr(user, "is_active", True):
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")
    if not allow_banned and _is_user_banned(user):
        until = user.banned_until.isoformat() if user.banned_until else None
        raise HTTPException(
            status_code=403,
            detail={
                "code": "banned",
                "message": "Аккаунт заблокирован",
                "banned_until": until,
                "reason": user.ban_reason,
            },
        )
    return user


# ── FastAPI dependency wrappers ──────────────────────────────────────────────

def current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency: залогиненный, не забаненный user."""
    return get_current_user_from_token(token, db)


def require_moderator(user: User = Depends(current_user)) -> User:
    if user.role not in ("moderator", "admin"):
        raise HTTPException(status_code=403, detail="Требуется роль модератора")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Требуется роль администратора")
    return user


def get_user_from_socket_token(token: str, db: Session) -> User:
    """Authentication helper for Socket.IO handlers.
    Отказывает revoked jti, забаненным юзерам и неактивным — симметрично HTTP-варианту.
    """
    from jwt_handler import verify_token
    payload = verify_token(token)
    if payload is None:
        raise ValueError("Неверный токен")
    jti = payload.get("jti")
    if _is_token_revoked(db, jti):
        raise ValueError("Токен отозван")
    email = payload.get("sub")
    if not email:
        raise ValueError("Неверный токен")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise ValueError("Пользователь не найден")
    if not getattr(user, "is_active", True):
        raise ValueError("Аккаунт заблокирован")
    if _is_user_banned(user):
        raise ValueError("Аккаунт заблокирован")
    return user
