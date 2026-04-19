from sqlalchemy import Column, Float, Index, Integer, BigInteger, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
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
    event_title = Column(String(200), nullable=True)
    event_date_ts = Column(BigInteger, nullable=True)
    event_image_url = Column(String(500), nullable=True)
    invite_token = Column(String(64), unique=True, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # Moderation
    is_hidden = Column(Boolean, default=False, nullable=False, server_default="false")
    hidden_reason = Column(String(200), nullable=True)


class PartyMember(Base):
    """Membership record for EventParty."""
    __tablename__ = "party_members"

    id = Column(Integer, primary_key=True, index=True)
    party_id = Column(Integer, ForeignKey("event_parties.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # pending → user→creator request; invited → creator→user invite; accepted/rejected/left/declined terminal-ish
    status = Column(String(10), default="pending")  # 'pending' | 'accepted' | 'rejected' | 'left' | 'invited' | 'declined'
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    message = Column(String(100), nullable=True)  # optional short message when joining
    invited_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    invite_message = Column(String(200), nullable=True)

    __table_args__ = (UniqueConstraint("party_id", "user_id", name="uq_party_user"),)


class PartyMeetingPlan(Base):
    __tablename__ = "party_meeting_plans"

    id            = Column(Integer, primary_key=True, index=True)
    party_id      = Column(Integer, ForeignKey("event_parties.id", ondelete="CASCADE"), nullable=False, unique=True)
    meet_time     = Column(DateTime(timezone=True), nullable=True)
    meet_location = Column(Text, nullable=True)
    note          = Column(Text, nullable=True)
    meet_lat      = Column(Float, nullable=True)
    meet_lon      = Column(Float, nullable=True)
    meet_landmark = Column(Text, nullable=True)
    updated_by    = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_at    = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PartyMeetingPlanHistory(Base):
    __tablename__ = "party_meeting_plan_history"

    id            = Column(Integer, primary_key=True, index=True)
    party_id      = Column(Integer, ForeignKey("event_parties.id", ondelete="CASCADE"), nullable=False)
    meet_time     = Column(DateTime(timezone=True), nullable=True)
    meet_location = Column(Text, nullable=True)
    note          = Column(Text, nullable=True)
    meet_lat      = Column(Float, nullable=True)
    meet_lon      = Column(Float, nullable=True)
    meet_landmark = Column(Text, nullable=True)
    changed_by    = Column(Integer, ForeignKey("users.id"), nullable=False)
    changed_at    = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_party_meeting_plan_history_party_changed", "party_id", "changed_at"),
    )
