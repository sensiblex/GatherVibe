from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.sql import func
from database import Base


class EventParty(Base):
    """A 'company' / group that plans to attend an event together."""
    __tablename__ = "event_parties"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(String, nullable=False, index=True)
    title = Column(String(60), nullable=False)
    description = Column(Text, nullable=True)
    max_members = Column(Integer, default=4)
    creator_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    is_open = Column(Boolean, default=True)  # False = closed for new requests
    city = Column(String(100), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PartyMember(Base):
    """Membership record for EventParty."""
    __tablename__ = "party_members"

    id = Column(Integer, primary_key=True, index=True)
    party_id = Column(Integer, ForeignKey("event_parties.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # pending → creator accepts/rejects; left → member left voluntarily
    status = Column(String(10), default="pending")  # 'pending' | 'accepted' | 'rejected' | 'left'
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    message = Column(String(100), nullable=True)  # optional short message when joining

    __table_args__ = (UniqueConstraint("party_id", "user_id", name="uq_party_user"),)
