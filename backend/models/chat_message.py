from sqlalchemy import Column, ForeignKey, Integer, String, Boolean, Text, DateTime
from database import Base
from datetime import datetime

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id          = Column(Integer, primary_key=True, index=True)
    room        = Column(String, nullable=False, index=True)   # e.g. "event_42" or "party_7"
    user_id     = Column(String, nullable=False)
    username    = Column(String, nullable=False)
    message     = Column(Text, nullable=False)
    timestamp   = Column(DateTime, default=datetime.utcnow, nullable=False)
    # System message fields (default False/None for backward compatibility)
    is_system   = Column(Boolean, default=False, nullable=False, server_default="0")
    event_type  = Column(String(50), nullable=True)   # e.g. 'poll_created', 'pinned_updated'
    # File attachment fields
    file_url    = Column(Text, nullable=True)
    file_type   = Column(String(50), nullable=True)   # e.g. 'image', 'pdf', 'file'
    file_name   = Column(String(255), nullable=True)
    # Moderation (soft delete)
    is_deleted     = Column(Boolean, default=False, nullable=False, server_default="false")
    deleted_by_id  = Column(Integer, ForeignKey("users.id"), nullable=True)
    deleted_at     = Column(DateTime(timezone=True), nullable=True)
    delete_reason  = Column(String(200), nullable=True)