from sqlalchemy import Boolean, CheckConstraint, Column, Integer, JSON, DateTime, ForeignKey, Index, Text, UniqueConstraint, text as sa_text
from sqlalchemy.sql import func
from database import Base


class PartyReview(Base):
    """Оценка одного участника компании другому после мероприятия."""
    __tablename__ = "party_reviews"

    id = Column(Integer, primary_key=True, index=True)
    reviewer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reviewed_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    party_id = Column(Integer, ForeignKey("event_parties.id", ondelete="CASCADE", use_alter=True, name="fk_party_reviews_party_id"), nullable=False)
    rating = Column(Integer, nullable=False)
    text = Column(Text, nullable=True)
    tags = Column(JSON, nullable=True)
    is_hidden = Column(Boolean, nullable=False, default=False, server_default=sa_text('false'))
    is_deleted = Column(Boolean, nullable=False, default=False, server_default=sa_text('false'))
    report_count = Column(Integer, nullable=False, default=0, server_default=sa_text('0'))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    __table_args__ = (
        UniqueConstraint("reviewer_id", "reviewed_id", "party_id", name="uq_review_per_party"),
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_rating_range"),
        Index("ix_party_reviews_reviewed_id", "reviewed_id"),
        Index("ix_party_reviews_party_id", "party_id"),
    )


class ReviewReport(Base):
    """Отслеживает, какие пользователи пожаловались на какие отзывы для предотвращения спама."""
    __tablename__ = "review_reports"

    id = Column(Integer, primary_key=True, index=True)
    review_id = Column(Integer, ForeignKey("party_reviews.id", ondelete="CASCADE"), nullable=False)
    reporter_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("review_id", "reporter_id", name="uq_review_report_per_user"),
    )
