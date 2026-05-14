import uuid
import time
from collections import deque
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

from deps import get_db, get_current_user_from_token, oauth2_scheme
from schemas import UserCreate, UserResponse, UserUpdate, UserLogin, Token
from auth import hash_password, verify_password, authenticate_user, create_user_token
from models.user import User
from models.token_revocation import RevokedToken
from services.email import send_verification_email
from utils.sanitize import sanitize_input

router = APIRouter(tags=["auth"])

try:
    from cachetools import TTLCache as _TTLCache
    _resend_rate = _TTLCache(maxsize=10_000, ttl=90)  # type: ignore[assignment]
    _auth_attempts = _TTLCache(maxsize=10_000, ttl=120)  # type: ignore[assignment]
except ImportError:  # pragma: no cover — cachetools в requirements_docker.txt
    _resend_rate: dict[str, float] = {}
    _auth_attempts: dict[str, deque] = {}

_RESEND_COOLDOWN = 60

# In-memory rate limit для /login и /register
# Окно 60 сек, лимит 5 попыток. Процесс-локально; для multi-worker нужен Redis.
_AUTH_WINDOW = 60
_AUTH_LIMIT = 5


def _rate_limit_auth(request: Request) -> None:
    """Проброс 429 если IP превысил _AUTH_LIMIT попыток за _AUTH_WINDOW секунд."""
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    q = _auth_attempts.setdefault(ip, deque())
    while q and q[0] < now - _AUTH_WINDOW:
        q.popleft()
    if len(q) >= _AUTH_LIMIT:
        raise HTTPException(status_code=429, detail="Слишком много попыток. Попробуйте через минуту.")
    q.append(now)


class PrivacyUpdate(BaseModel):
    show_email:     Optional[bool] = None
    show_city:      Optional[bool] = None
    show_interests: Optional[bool] = None


class ResendVerificationRequest(BaseModel):
    email: str


@router.post("/register", response_model=UserResponse)
def register_user(
    user: UserCreate,
    background: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
):
    """Регистрирует нового пользователя."""
    _rate_limit_auth(request)
    from services.feature_flags import is_flag_enabled
    if not is_flag_enabled(db, "registration_enabled"):
        raise HTTPException(status_code=403, detail="Регистрация временно закрыта")
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
    token = str(uuid.uuid4())
    sanitized_username = sanitize_input(user.username)
    sanitized_city = sanitize_input(user.city)
    sanitized_interests = sanitize_input(user.interests)
    new_user = User(
        email=user.email, username=sanitized_username or user.username,
        hashed_password=hash_password(user.password),
        city=sanitized_city, interests=sanitized_interests,
        is_verified=False,
        verification_token=token,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    try:
        background.add_task(send_verification_email, new_user.email, new_user.username, token)
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Failed to schedule verification email")
    return new_user


@router.post("/login", response_model=Token)
def login(
    user_credentials: UserLogin,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
):
    """Авторизует пользователя и возвращает токен."""
    _rate_limit_auth(request)
    user = authenticate_user(user_credentials.email, user_credentials.password, db)
    if not user:
        raise HTTPException(status_code=401, detail="Неверный email или пароль",
                            headers={"WWW-Authenticate": "Bearer"})
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Пользователь заблокирован")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="email_not_verified")
    token_data = create_user_token(user)
    import os as _os
    _secure = _os.getenv("COOKIE_SECURE", "false").lower() in ("1", "true", "yes")
    _samesite = "none" if _secure else "lax"
    response.set_cookie(
        key="token",
        value=token_data["access_token"],
        httponly=True,
        samesite=_samesite,
        secure=_secure,
        max_age=604800,
        path="/",
    )
    return token_data


@router.get("/auth/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    """Подтверждает email пользователя по токену."""
    user = db.query(User).filter(User.verification_token == token).first()
    if not user:
        raise HTTPException(status_code=400, detail="Неверный или устаревший токен")
    user.is_verified = True
    user.verification_token = None
    db.commit()
    return {"message": "Email успешно подтверждён"}


@router.post("/auth/resend-verification")
def resend_verification(
    body: ResendVerificationRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Отправляет повторное письмо подтверждения email."""
    email = body.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # Не раскрываем факт отсутствия пользователя
        return {"message": "Если email зарегистрирован, письмо будет отправлено"}
    if user.is_verified:
        raise HTTPException(status_code=400, detail="Email уже подтверждён")
    now = time.time()
    last_sent = _resend_rate.get(email, 0)
    if now - last_sent < _RESEND_COOLDOWN:
        wait = int(_RESEND_COOLDOWN - (now - last_sent))
        raise HTTPException(status_code=429, detail=f"Повторная отправка возможна через {wait} сек.")
    new_token = str(uuid.uuid4())
    user.verification_token = new_token
    db.commit()
    _resend_rate[email] = now
    background.add_task(send_verification_email, email, user.username, new_token)
    return {"message": "Если email зарегистрирован, письмо будет отправлено"}


@router.post("/logout", status_code=204)
def logout(
    response: Response,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Выход из системы и отзыв токена."""
    from jwt_handler import verify_token
    from datetime import datetime
    payload = verify_token(token)
    if payload:
        jti = payload.get("jti")
        exp = payload.get("exp")
        if jti and exp:
            from datetime import timezone as _tz
            exp_dt = datetime.fromtimestamp(exp, tz=_tz.utc)
            if not db.query(RevokedToken).filter(RevokedToken.jti == jti).first():
                db.add(RevokedToken(jti=jti, exp=exp_dt))
                db.commit()
    import os as _os
    _secure = _os.getenv("COOKIE_SECURE", "false").lower() in ("1", "true", "yes")
    _samesite = "none" if _secure else "lax"

    response.delete_cookie(key="token", path="/", httponly=True, samesite=_samesite, secure=_secure)
    return None


@router.get("/users/me", response_model=UserResponse)
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Возвращает информацию о текущем пользователе."""
    return get_current_user_from_token(token, db)


@router.patch("/users/me", response_model=UserResponse)
def update_profile(
    data: UserUpdate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Обновляет профиль пользователя."""
    user = get_current_user_from_token(token, db)

    if data.new_password is not None:
        if not data.old_password:
            raise HTTPException(status_code=400, detail="Укажите текущий пароль")
        if not verify_password(data.old_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Неверный текущий пароль")
        if data.new_password == data.old_password:
            raise HTTPException(status_code=400, detail="Новый пароль должен отличаться от текущего")
        if len(data.new_password) < 8:
            raise HTTPException(status_code=400, detail="Новый пароль должен быть не менее 8 символов")
        user.hashed_password = hash_password(data.new_password)

    if data.username is not None:
        data.username = (sanitize_input(data.username) or "").strip()
        if not data.username:
            raise HTTPException(status_code=400, detail="Username не может быть пустым")
        user.username = data.username
    if data.city is not None:
        user.city = (sanitize_input(data.city) or "").strip() or None
    if data.bio is not None:
        user.bio = (sanitize_input(data.bio) or "").strip()[:200] or None
    if data.interests is not None:
        user.interests = (sanitize_input(data.interests) or "").strip() or None

    if data.avatar_url is not None:
        user.avatar_url = data.avatar_url or None

    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/me/privacy")
def update_privacy(
    data: PrivacyUpdate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Обновляет настройки приватности пользователя."""
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
