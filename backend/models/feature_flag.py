from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base


class FeatureFlag(Base):
    """Глобальный переключатель платформы. Читается в hot-path эндпоинтах."""
    __tablename__ = "feature_flags"

    key = Column(String(64), primary_key=True)
    enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    description = Column(String(255), nullable=True)
    updated_by_id = Column("updated_by_id", ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
