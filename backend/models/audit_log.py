from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Index
from sqlalchemy.sql import func
from database import Base


class AuditLog(Base):
    """Append-only журнал действий модераторов/админов."""
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_role = Column(String(16), nullable=False)  # snapshot на момент действия
    action = Column(String(64), nullable=False)
    target_type = Column(String(32), nullable=False)
    target_id = Column(String(64), nullable=False)
    extra = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    __table_args__ = (
        Index("ix_audit_actor_created", "actor_id", "created_at"),
        Index("ix_audit_action_created", "action", "created_at"),
    )
