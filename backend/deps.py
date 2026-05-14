from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2
from fastapi.openapi.models import OAuthFlows as OAuthFlowsModel
from sqlalchemy import exists
from sqlalchemy.orm import Session

from database import SessionLocal
from models.user import User
from models.token_revocation import RevokedToken


class OAuth2BearerOrCookie(OAuth2):
    """
    Схема авторизации, которая принимает токен из заголовка Authorization или cookie.
    """

    def __init__(self, tokenUrl: str, auto_error: bool = True):
        '''иниализирует схему авторизации с проверкой Bearer-токена или cookie'''
        flows = OAuthFlowsModel(password={"tokenUrl": tokenUrl, "scopes": {}})
        super().__init__(flows=flows, auto_error=auto_error)
        self._auto_error = auto_error

    async def __call__(self, request: Request) -> Optional[str]:
        '''извлекает токен из заголовка Authorization или cookie'''
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
    '''возвращает сессию базы данных'''
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _is_user_banned(user: User) -> bool:
    '''возвращает True если пользователь активно забанен'''
    if not user.is_banned:
        return False
    banned_until = user.banned_until
    if banned_until is None:
        return True
    # temp ban: используем timezone-aware comparison
    now = datetime.now(timezone.utc)
    if banned_until.tzinfo is None:
        banned_until = banned_until.replace(tzinfo=timezone.utc)
    return banned_until > now


def _is_token_revoked(db: Session, jti: Optional[str]) -> bool:
    '''проверяет, отозван ли токен по jti'''
    if not jti:
        return False
    return db.query(exists().where(RevokedToken.jti == jti)).scalar()


def get_current_user_from_token(token: str, db: Session, *, allow_banned: bool = False) -> User:
    '''получает текущего пользователя из JWT-токена'''
    from jwt_handler import verify_token
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Неверный токен")
    jti = payload.get("jti")
    if not jti:
        raise ValueError("Неверный токен: отсутствует jti")
    if _is_token_revoked(db, jti):
        raise HTTPException(status_code=401, detail="Токен отозван")
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Неверный токен")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if not user.is_active:
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



def current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    '''FastAPI dependency: получает залогиненного пользователя'''
    return get_current_user_from_token(token, db)


def require_moderator(user: User = Depends(current_user)) -> User:
    '''проверяет роль модератора'''
    if user.role not in ("moderator", "admin"):
        raise HTTPException(status_code=403, detail="Требуется роль модератора")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    '''проверяет роль администратора'''
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Требуется роль администратора")
    return user


def get_user_from_socket_token(token: str, db: Session) -> User:
    '''аутентифицирует пользователя по токену для Socket.IO'''
    from jwt_handler import verify_token
    payload = verify_token(token)
    if payload is None:
        raise ValueError("Неверный токен")
    jti = payload.get("jti")
    if not jti:
        raise ValueError("Неверный токен: отсутствует jti")
    if _is_token_revoked(db, jti):
        raise ValueError("Токен отозван")
    email = payload.get("sub")
    if not email:
        raise ValueError("Неверный токен")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise ValueError("Пользователь не найден")
    if not user.is_active:
        raise ValueError("Аккаунт заблокирован")
    if _is_user_banned(user):
        raise ValueError("Аккаунт заблокирован")
    return user
