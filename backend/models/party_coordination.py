from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from database import Base


class PartyPoll(Base):
    """A poll within a party group."""
    __tablename__ = "party_polls"

    id = Column(Integer, primary_key=True, index=True)
    party_id = Column(Integer, ForeignKey("event_parties.id", ondelete="CASCADE"), nullable=False, index=True)
    question = Column(String(200), nullable=False)
    status = Column(String(10), default="active")  # 'active' | 'closed'
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_by_username = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    closed_at = Column(DateTime(timezone=True), nullable=True)


class PollOption(Base):
    """An answer option for a PartyPoll."""
    __tablename__ = "poll_options"

    id = Column(Integer, primary_key=True, index=True)
    poll_id = Column(Integer, ForeignKey("party_polls.id", ondelete="CASCADE"), nullable=False, index=True)
    text = Column(String(100), nullable=False)
    vote_count = Column(Integer, default=0)  # denormalized counter, updated atomically


class PollVote(Base):
    """A single vote cast by a user on a poll option (single-choice)."""
    __tablename__ = "poll_votes"

    id = Column(Integer, primary_key=True, index=True)
    poll_id = Column(Integer, ForeignKey("party_polls.id", ondelete="CASCADE"), nullable=False, index=True)
    option_id = Column(Integer, ForeignKey("poll_options.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    voted_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("poll_id", "user_id", name="uq_poll_user"),)


class PartyPinnedBlock(Base):
    """A single pinned coordination block per party (one-per-party via unique constraint)."""
    __tablename__ = "party_pinned_blocks"

    id = Column(Integer, primary_key=True, index=True)
    party_id = Column(Integer, ForeignKey("event_parties.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    content = Column(Text, nullable=False)
    updated_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    updated_by_username = Column(String, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class PartyAttendance(Base):
    """Attendance status for a party participant (including creator)."""
    __tablename__ = "party_attendance"

    id = Column(Integer, primary_key=True, index=True)
    party_id = Column(Integer, ForeignKey("event_parties.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(10), nullable=False)  # 'going' | 'late' | 'cant'
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("party_id", "user_id", name="uq_attendance_party_user"),)
