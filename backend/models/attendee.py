from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from datetime import datetime
from database import Base


class EventAttendee(Base):
    __tablename__ = "event_attendees"

    id = Column(Integer, primary_key=True, index=True)
    # kudago event id (string) or internal event id
    event_id = Column(String, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    comment = Column(String, nullable=True)  # short message, up to 200 chars
    is_looking = Column(Boolean, default=True)  # True = looking for company
    # server_default для БД + python default для in-memory объекта до refresh
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=datetime.utcnow,
        nullable=False,
    )

    __table_args__ = (UniqueConstraint("event_id", "user_id", name="uq_event_user"),)
