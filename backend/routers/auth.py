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

router = APIRouter(tags=["auth"])

# In-memory rate limit: email -> last_sent_timestamp
# TTLCache с maxsize=10000 чтобы избежать unbounded роста словаря при публичном
# трафике. TTL здесь больше cooldown'а (+30s) — просто чтобы не чистить вручную.
try:
    from cachetools import TTLCache as _TTLCache
    _resend_rate = _TTLCache(maxsize=10_000, ttl=90)  # type: ignore[assignment]
    _auth_attempts = _TTLCache(maxsize=10_000, ttl=120)  # type: ignore[assignment]
except ImportError:  # pragma: no cover — cachetools в requirements_docker.txt
    _resend_rate: dict[str, float] = {}
    _auth_attempts: dict[str, deque] = {}

_RESEND_COOLDOWN = 60  # seconds

# In-memory rate limit для /login и /register
# Окно 60 сек, лимит 5 попыток. Процесс-локально; для multi-worker нужен Redis.
_AUTH_WINDOW = 60  # seconds
_AUTH_LIMIT = 5


def _rate_limit_auth(request: Request) -> None:
    """Проброс 429 если IP превысил _AUTH_LIMIT попыток за _AUTH_WINDOW секунд."""
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    q = _auth_attempts.setdefault(ip, deque())
    # drop old
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
    _rate_limit_auth(request)
    from services.feature_flags import is_flag_enabled
    if not is_flag_enabled(db, "registration_enabled"):
        raise HTTPException(status_code=403, detail="Регистрация временно закрыта")
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
    token = str(uuid.uuid4())
    new_user = User(
        email=user.email, username=user.username,
        hashed_password=hash_password(user.password),
        city=user.city, interests=user.interests,
        is_verified=False,
        verification_token=token,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    # Email — best effort. При проблеме с провайдером юзер сможет вручную
    # запросить повторную отправку через /auth/resend-verification.
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
    # COOKIE_SECURE=true в production (HTTPS). В docker-compose дев HTTP — false.
    _secure = _os.getenv("COOKIE_SECURE", "false").lower() in ("1", "true", "yes")
    response.set_cookie(
        key="token",
        value=token_data["access_token"],
        httponly=True,
        samesite="lax",
        secure=_secure,
        max_age=604800,  # 7 days
        path="/",
    )
    return token_data


@router.get("/auth/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
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
    # delete_cookie должен матчить атрибуты set_cookie, иначе при Secure=True
    # браузер не удалит cookie.
    response.delete_cookie(key="token", path="/", httponly=True, samesite="lax", secure=_secure)
    return None


@router.get("/users/me", response_model=UserResponse)
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    return get_current_user_from_token(token, db)


@router.patch("/users/me", response_model=UserResponse)
def update_profile(
    data: UserUpdate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
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

    if data.avatar_url is not None:
        if data.avatar_url and not data.avatar_url.startswith("https://"):
            raise HTTPException(status_code=400, detail="avatar_url должен начинаться с https://")
        user.avatar_url = data.avatar_url or None

    # Matching profile fields
    matching_text_changed = data.interests is not None or data.bio is not None or data.city is not None
    if data.birth_date is not None:
        user.birth_date = data.birth_date
    if data.latitude is not None:
        user.latitude = data.latitude
    if data.longitude is not None:
        user.longitude = data.longitude
    if data.geo_precision is not None:
        user.geo_precision = data.geo_precision
    if data.show_age is not None:
        user.show_age = data.show_age
    if data.is_discoverable_on_events is not None:
        user.is_discoverable_on_events = data.is_discoverable_on_events
    if data.preferred_categories is not None:
        user.preferred_categories = data.preferred_categories
        matching_text_changed = True
    if data.preferred_days is not None:
        user.preferred_days = data.preferred_days
    if data.preferred_time is not None:
        user.preferred_time = data.preferred_time
    if data.budget_max is not None:
        user.budget_max = data.budget_max

    if matching_text_changed:
        try:
            from services import embeddings
            from routers.recommendations import (
                invalidate_user_cache, invalidate_user_event_cache,
            )
            embeddings.refresh_user_embedding(db, user)
            invalidate_user_cache(user.id)
            invalidate_user_event_cache(user.id)
        except Exception:
            pass  # best-effort

    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/me/privacy")
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
