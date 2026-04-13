from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime

from pydantic import BaseModel
from deps import get_db, get_current_user_from_token, oauth2_scheme
from notification_helpers import (
    get_user_notifications,
    mark_as_read,
    mark_all_as_read,
    get_unread_count,
)

router = APIRouter(tags=["notifications"])


class NotificationOut(BaseModel):
    id: int
    type: str
    title: str
    body: str | None
    data: str | None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class MarkReadBody(BaseModel):
    notification_id: int


@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    return get_user_notifications(db, current_user.id, limit=limit, offset=offset)


@router.get("/notifications/unread-count")
def unread_count(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    return {"count": get_unread_count(db, current_user.id)}


@router.post("/notifications/read")
def read_notification(
    body: MarkReadBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    found = mark_as_read(db, body.notification_id, current_user.id)
    if not found:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    db.commit()
    return {"ok": True}


@router.post("/notifications/read-all")
def read_all_notifications(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    count = mark_all_as_read(db, current_user.id)
    db.commit()
    return {"ok": True, "marked": count}
