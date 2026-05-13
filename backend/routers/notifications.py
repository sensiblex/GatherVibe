import os

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
from models.push_subscription import PushSubscription

router = APIRouter(tags=["notifications"])

VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")




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


class PushSubscribeBody(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class PushUnsubscribeBody(BaseModel):
    endpoint: str


class NotificationSettingsBody(BaseModel):
    email_notifications: bool




@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Возвращает список уведомлений пользователя."""
    current_user = get_current_user_from_token(token, db)
    return get_user_notifications(db, current_user.id, limit=limit, offset=offset)


@router.get("/notifications/unread-count")
def unread_count(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Возвращает количество непрочитанных уведомлений."""
    current_user = get_current_user_from_token(token, db)
    return {"count": get_unread_count(db, current_user.id)}


@router.post("/notifications/read")
def read_notification(
    body: MarkReadBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Отмечает уведомление как прочитанное."""
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
    """Отмечает все уведомления как прочитанные."""
    current_user = get_current_user_from_token(token, db)
    count = mark_all_as_read(db, current_user.id)
    db.commit()
    return {"ok": True, "marked": count}




@router.get("/notifications/vapid-public-key")
def get_vapid_public_key():
    """Возвращает публичный VAPID ключ для создания push-подписок."""
    return {"public_key": VAPID_PUBLIC_KEY}


@router.post("/notifications/push/subscribe", status_code=201)
def subscribe_push(
    body: PushSubscribeBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Сохраняет или обновляет Web Push подписку пользователя."""
    current_user = get_current_user_from_token(token, db)

    existing = (
        db.query(PushSubscription)
        .filter(
            PushSubscription.user_id == current_user.id,
            PushSubscription.endpoint == body.endpoint,
        )
        .first()
    )

    if existing:
        existing.p256dh = body.p256dh
        existing.auth = body.auth
    else:
        db.add(
            PushSubscription(
                user_id=current_user.id,
                endpoint=body.endpoint,
                p256dh=body.p256dh,
                auth=body.auth,
            )
        )

    db.commit()
    return {"ok": True}


@router.delete("/notifications/push/subscribe", status_code=200)
def unsubscribe_push(
    body: PushUnsubscribeBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Удаляет Web Push подписку пользователя."""
    current_user = get_current_user_from_token(token, db)

    deleted = (
        db.query(PushSubscription)
        .filter(
            PushSubscription.user_id == current_user.id,
            PushSubscription.endpoint == body.endpoint,
        )
        .delete(synchronize_session=False)
    )
    db.commit()

    if not deleted:
        raise HTTPException(status_code=404, detail="Подписка не найдена")
    return {"ok": True}




@router.post("/notifications/push/test", status_code=200)
def test_push(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Отправляет тестовое push-уведомление пользователю."""
    import push_helpers
    current_user = get_current_user_from_token(token, db)
    push_helpers.send_push_to_user(
        db, current_user.id,
        "🔔 Тестовое уведомление",
        "Push-уведомления работают! GatherVibe подключён.",
        {"type": "test"},
    )
    db.commit()
    return {"ok": True}




@router.patch("/notifications/settings")
def update_notification_settings(
    body: NotificationSettingsBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Обновляет настройки email-уведомлений пользователя."""
    current_user = get_current_user_from_token(token, db)
    current_user.email_notifications = body.email_notifications
    db.commit()
    return {"ok": True, "email_notifications": current_user.email_notifications}
