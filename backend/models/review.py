from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.sql import func
from database import Base


class PartyReview(Base):
    """Rating left by one party member for another after the event."""
    __tablename__ = "party_reviews"

    id = Column(Integer, primary_key=True, index=True)
    reviewer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reviewed_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    party_id = Column(Integer, ForeignKey("event_parties.id", ondelete="CASCADE"), nullable=False)
    rating = Column(Integer, nullable=False)  # 1-5
    text = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("reviewer_id", "reviewed_id", "party_id", name="uq_review_per_party"),
    )
