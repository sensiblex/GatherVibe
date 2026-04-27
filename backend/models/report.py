from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index, UniqueConstraint, Text
from sqlalchemy.sql import func
from database import Base


ALLOWED_TARGET_TYPES = {"chat_message", "party", "user", "review", "recap_item"}
ALLOWED_REASONS = {"spam", "harassment", "nsfw", "fake", "other"}
ALLOWED_STATUSES = {"open", "resolved", "rejected"}
ALLOWED_RESOLUTIONS = {"warn", "hide", "delete", "ban", "none"}


class Report(Base):
    """Универсальная жалоба на контент/пользователя."""
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    reporter_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    target_type = Column(String(32), nullable=False)
    target_id   = Column(String(64), nullable=False)   # stringified (int id или составной)
    reason      = Column(String(32), nullable=False)
    comment     = Column(Text, nullable=True)
    status      = Column(String(16), nullable=False, default="open", server_default="open")
    resolution  = Column(String(16), nullable=True)
    resolved_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolution_reason = Column(String(500), nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("reporter_id", "target_type", "target_id", name="uq_report_reporter_target"),
        Index("ix_reports_status_created", "status", "created_at"),
        Index("ix_reports_target", "target_type", "target_id"),
    )
