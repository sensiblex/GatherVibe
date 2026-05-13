from sqlalchemy import Column, ForeignKey, Index, Integer, String, Boolean, Text, DateTime
from database import Base
from datetime import datetime

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id          = Column(Integer, primary_key=True, index=True)
    room        = Column(String, nullable=False, index=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    username    = Column(String, nullable=False)
    message     = Column(Text, nullable=False)
    timestamp   = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_system   = Column(Boolean, default=False, nullable=False, server_default="0")
    event_type  = Column(String(50), nullable=True)
    file_url    = Column(Text, nullable=True)
    file_type   = Column(String(50), nullable=True)
    file_name   = Column(String(255), nullable=True)
    is_deleted     = Column(Boolean, default=False, nullable=False, server_default="false")
    deleted_by_id  = Column(Integer, ForeignKey("users.id"), nullable=True)
    deleted_at     = Column(DateTime(timezone=True), nullable=True)
    delete_reason  = Column(String(200), nullable=True)

    __table_args__ = (
        # История чата: `WHERE room = X ORDER BY timestamp DESC LIMIT N` — без
        # составного индекса это index scan по room + filesort.
        Index("ix_chat_messages_room_timestamp", "room", "timestamp"),
    )