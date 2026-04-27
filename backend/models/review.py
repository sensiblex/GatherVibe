from sqlalchemy import Boolean, Column, Integer, JSON, DateTime, ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy.sql import func
from database import Base


class PartyReview(Base):
    """Rating left by one party member for another after the event."""
    __tablename__ = "party_reviews"

    id = Column(Integer, primary_key=True, index=True)
    reviewer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reviewed_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    party_id = Column(Integer, ForeignKey("event_parties.id", ondelete="CASCADE", use_alter=True, name="fk_party_reviews_party_id"), nullable=False)
    rating = Column(Integer, nullable=False)
    text = Column(Text, nullable=True)
    tags = Column(JSON, nullable=True)
    is_hidden = Column(Boolean, server_default='false', nullable=False, default=False)
    is_deleted = Column(Boolean, server_default='false', nullable=False, default=False)
    report_count = Column(Integer, server_default='0', nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    __table_args__ = (
        UniqueConstraint("reviewer_id", "reviewed_id", "party_id", name="uq_review_per_party"),
        Index("ix_party_reviews_reviewed_id", "reviewed_id"),
        Index("ix_party_reviews_party_id", "party_id"),
    )


class ReviewReport(Base):
    """Tracks which users have reported which reviews to prevent spam."""
    __tablename__ = "review_reports"

    id = Column(Integer, primary_key=True, index=True)
    review_id = Column(Integer, ForeignKey("party_reviews.id", ondelete="CASCADE"), nullable=False)
    reporter_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("review_id", "reporter_id", name="uq_review_report_per_user"),
    )
