from sqlalchemy import Column, Integer, BigInteger, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from datetime import datetime
from database import Base


class EventAttendee(Base):
    __tablename__ = "event_attendees"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(String, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    comment = Column(String, nullable=True)
    is_looking = Column(Boolean, default=True)
    # server_default для БД + python default для объекта в памяти до refresh
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=datetime.utcnow,
        nullable=False,
    )

    # Кэшируем метаданные события KudaGo при регистрации
    event_title     = Column(String, nullable=True)
    event_date_ts   = Column(BigInteger, nullable=True)   # Unix-таймстамп начала события
    event_city      = Column(String, nullable=True)
    event_image_url = Column(String, nullable=True)
    event_category  = Column(String, nullable=True)
    event_location  = Column(String, nullable=True)

    __table_args__ = (UniqueConstraint("event_id", "user_id", name="uq_event_user"),)
