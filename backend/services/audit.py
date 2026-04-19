"""Единый интерфейс записи в AuditLog. Все action-хендлеры админ-роутера должны
писать через log_action — прямые INSERT в audit_log запрещены."""
from typing import Any, Optional
from sqlalchemy.orm import Session

from models.audit_log import AuditLog
from models.user import User


def log_action(
    db: Session,
    *,
    actor: User,
    action: str,
    target_type: str,
    target_id: str | int,
    extra: Optional[dict[str, Any]] = None,
) -> AuditLog:
    entry = AuditLog(
        actor_id=actor.id,
        actor_role=getattr(actor, "role", "user"),
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        extra=extra or None,
    )
    db.add(entry)
    db.flush()
    return entry
