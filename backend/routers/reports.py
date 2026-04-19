"""Публичный роутер: создание жалоб на любой тип контента."""
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from deps import get_db, current_user
from models.user import User
from models.report import (
    Report,
    ALLOWED_TARGET_TYPES,
    ALLOWED_REASONS,
)
from models.chat_message import ChatMessage
from models.party import EventParty
from models.review import PartyReview

REPORT_RATE_LIMIT_WINDOW = timedelta(hours=1)
REPORT_RATE_LIMIT_MAX = 5

router = APIRouter(tags=["reports"])


class ReportCreate(BaseModel):
    target_type: str
    target_id: str
    reason: str
    comment: Optional[str] = Field(default=None, max_length=500)


class ReportOut(BaseModel):
    id: int
    reporter_id: int
    target_type: str
    target_id: str
    reason: str
    comment: Optional[str]
    status: str
    created_at: str

    class Config:
        from_attributes = True


def _target_exists(db: Session, target_type: str, target_id: str) -> bool:
    try:
        tid = int(target_id)
    except (TypeError, ValueError):
        return False
    if target_type == "chat_message":
        return db.query(ChatMessage).filter(ChatMessage.id == tid).first() is not None
    if target_type == "party":
        return db.query(EventParty).filter(EventParty.id == tid).first() is not None
    if target_type == "user":
        return db.query(User).filter(User.id == tid).first() is not None
    if target_type == "review":
        return db.query(PartyReview).filter(PartyReview.id == tid).first() is not None
    if target_type == "recap_item":
        try:
            from models.party_recap import PartyRecapItem
            return db.query(PartyRecapItem).filter(PartyRecapItem.id == tid).first() is not None
        except Exception:
            return False
    return False


@router.post("/reports", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def create_report(
    payload: ReportCreate,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    if payload.target_type not in ALLOWED_TARGET_TYPES:
        raise HTTPException(status_code=400, detail=f"Недопустимый target_type: {payload.target_type}")
    if payload.reason not in ALLOWED_REASONS:
        raise HTTPException(status_code=400, detail=f"Недопустимая причина: {payload.reason}")
    if payload.target_type == "user" and str(me.id) == str(payload.target_id):
        raise HTTPException(status_code=400, detail="Нельзя жаловаться на себя")
    if not _target_exists(db, payload.target_type, payload.target_id):
        raise HTTPException(status_code=404, detail="Target не найден")

    # Rate limit: 5 reports / час для обычных юзеров
    if me.role not in ("moderator", "admin"):
        window_start = datetime.utcnow() - REPORT_RATE_LIMIT_WINDOW
        recent = db.query(Report).filter(
            Report.reporter_id == me.id,
            Report.created_at >= window_start,
        ).count()
        if recent >= REPORT_RATE_LIMIT_MAX:
            raise HTTPException(
                status_code=429,
                detail=f"Слишком много жалоб. Максимум {REPORT_RATE_LIMIT_MAX} в час.",
            )

    # duplicate check
    existing = db.query(Report).filter(
        Report.reporter_id == me.id,
        Report.target_type == payload.target_type,
        Report.target_id == str(payload.target_id),
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Вы уже жаловались на этот объект")

    report = Report(
        reporter_id=me.id,
        target_type=payload.target_type,
        target_id=str(payload.target_id),
        reason=payload.reason,
        comment=payload.comment,
        status="open",
    )
    db.add(report)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Вы уже жаловались на этот объект")
    db.refresh(report)
    return ReportOut(
        id=report.id,
        reporter_id=report.reporter_id,
        target_type=report.target_type,
        target_id=report.target_id,
        reason=report.reason,
        comment=report.comment,
        status=report.status,
        created_at=report.created_at.isoformat() if report.created_at else "",
    )
