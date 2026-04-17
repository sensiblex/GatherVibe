import uuid
import time
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

from deps import get_db, get_current_user_from_token, oauth2_scheme
from schemas import UserCreate, UserResponse, UserUpdate, UserLogin, Token
from auth import hash_password, verify_password, authenticate_user, create_user_token
from models.user import User
from services.email import send_verification_email

router = APIRouter(tags=["auth"])

# In-memory rate limit: email -> last_sent_timestamp
_resend_rate: dict[str, float] = {}
_RESEND_COOLDOWN = 60  # seconds


class PrivacyUpdate(BaseModel):
    show_email:     Optional[bool] = None
    show_city:      Optional[bool] = None
    show_interests: Optional[bool] = None


class ResendVerificationRequest(BaseModel):
    email: str


@router.post("/register", response_model=UserResponse)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
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
    send_verification_email(new_user.email, new_user.username, token)
    return new_user


@router.post("/login", response_model=Token)
def login(
    user_credentials: UserLogin,
    response: Response,
    db: Session = Depends(get_db),
):
    user = authenticate_user(user_credentials.email, user_credentials.password, db)
    if not user:
        raise HTTPException(status_code=401, detail="Неверный email или пароль",
                            headers={"WWW-Authenticate": "Bearer"})
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Пользователь заблокирован")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="email_not_verified")
    token_data = create_user_token(user)
    response.set_cookie(
        key="token",
        value=token_data["access_token"],
        httponly=True,
        samesite="lax",
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
def resend_verification(body: ResendVerificationRequest, db: Session = Depends(get_db)):
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
    send_verification_email(email, user.username, new_token)
    return {"message": "Если email зарегистрирован, письмо будет отправлено"}


@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(key="token", path="/")
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
