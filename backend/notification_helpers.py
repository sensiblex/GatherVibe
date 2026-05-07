import json
import logging

from sqlalchemy.orm import Session

from models.notification import Notification
from push_helpers import send_push_to_user

logger = logging.getLogger(__name__)
_INTERNAL_TYPE_PREFIX = "__internal:"


def create_notification(
    db: Session,
    user_id: int,
    type: str,
    title: str,
    body: str | None = None,
    data: dict | None = None,
) -> Notification:
    """Create and flush a notification (caller must db.commit()).

    Also dispatches a Web Push to every subscription the user has. Push
    is best-effort — upstream failures never break in-app notification
    creation.
    """
    n = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        data=json.dumps(data) if data else None,
        is_read=False,
    )
    db.add(n)
    db.flush()

    try:
        send_push_to_user(db, user_id, title, body or "", data)
    except Exception as exc:
        logger.warning("send_push_to_user failed for user_id=%s: %s", user_id, exc)

    return n


def get_user_notifications(
    db: Session,
    user_id: int,
    limit: int = 50,
    offset: int = 0,
) -> list[Notification]:
    return (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            ~Notification.type.startswith(_INTERNAL_TYPE_PREFIX),
        )
        .order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def mark_as_read(db: Session, notification_id: int, user_id: int) -> bool:
    n = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user_id)
        .first()
    )
    if not n:
        return False
    n.is_read = True
    return True


def mark_all_as_read(db: Session, user_id: int) -> int:
    """Mark all unread notifications for user as read. Returns count updated."""
    updated = (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.is_read == False,  # noqa: E712
            ~Notification.type.startswith(_INTERNAL_TYPE_PREFIX),
        )
        .all()
    )
    for n in updated:
        n.is_read = True
    return len(updated)


def get_unread_count(db: Session, user_id: int) -> int:
    return (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.is_read == False,  # noqa: E712
            ~Notification.type.startswith(_INTERNAL_TYPE_PREFIX),
        )
        .count()
    )
