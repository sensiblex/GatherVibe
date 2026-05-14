"""Appeals: забаненные пользователи могут подать апелляцию.
ВАЖНО: get_current_user_from_token обычно блокирует забаненных (403).
Здесь передаём allow_banned=True, чтобы принять jwt забаненного.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from deps import get_db, oauth2_scheme, get_current_user_from_token
from models.user import User
from models.appeal import Appeal

router = APIRouter(tags=["appeals"])


class AppealCreate(BaseModel):
    message: str = Field(..., min_length=5, max_length=1000)


@router.post("/appeals", status_code=201)
def create_appeal(
    payload: AppealCreate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Создаёт апелляцию от забаненного пользователя."""
    # Принимаем даже забаненного юзера
    me = get_current_user_from_token(token, db, allow_banned=True)

    if not me.is_banned and (me.banned_until is None or me.banned_until < datetime.utcnow()):
        raise HTTPException(status_code=400, detail="Апелляция доступна только забаненным")

    # Один открытый апелляшн в каждый момент
    existing = db.query(Appeal).filter(
        Appeal.user_id == me.id,
        Appeal.status == "open",
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="У вас уже есть открытая апелляция")

    a = Appeal(user_id=me.id, message=payload.message.strip(), status="open")
    db.add(a); db.commit(); db.refresh(a)
    return {
        "id": a.id,
        "user_id": a.user_id,
        "message": a.message,
        "status": a.status,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }
