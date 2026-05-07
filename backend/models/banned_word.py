from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from database import Base


class BannedWord(Base):
    """Запрещённое слово/паттерн для фильтрации в чате."""
    __tablename__ = "banned_words"

    id = Column(Integer, primary_key=True, index=True)
    pattern = Column(String(200), nullable=False)
    is_regex = Column(Boolean, nullable=False, default=False, server_default="false")
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("pattern", name="uq_banned_word_pattern"),
    )
