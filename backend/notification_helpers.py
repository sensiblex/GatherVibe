import json
from sqlalchemy.orm import Session
from models.notification import Notification


def create_notification(
    db: Session,
    user_id: int,
    type: str,
    title: str,
    body: str | None = None,
    data: dict | None = None,
) -> Notification:
    """Create and flush a notification (caller must db.commit())."""
    n = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        data=json.dumps(data) if data else None,
        is_read=False,
    )
    db.add(n)
    db.flush()  # populate n.id before commit
    return n


def get_user_notifications(
    db: Session,
    user_id: int,
    limit: int = 50,
    offset: int = 0,
) -> list[Notification]:
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id)
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
        .filter(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
        .all()
    )
    for n in updated:
        n.is_read = True
    return len(updated)


def get_unread_count(db: Session, user_id: int) -> int:
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
        .count()
    )
