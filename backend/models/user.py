from sqlalchemy import Column, DateTime, Float, Integer, String, Boolean, Text, text as sa_text
from sqlalchemy.sql import func
from database import Base

class User(Base):
    """ Пользователь """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    city = Column(String, nullable=True)
    interests = Column(String, nullable=True)
    bio = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, server_default=sa_text('true'))
    avatar_url = Column(String, nullable=True)
    show_email     = Column(Boolean, default=False)
    show_city      = Column(Boolean, default=True)
    show_interests = Column(Boolean, default=True)
    trust_score    = Column(Float, nullable=True, default=None)
    is_verified        = Column(Boolean, default=False, nullable=False)
    verification_token = Column(String(64), nullable=True, index=True)
    email_notifications = Column(Boolean, default=True, nullable=False, server_default=sa_text('true'))

    role = Column(String(16), default="user", nullable=False, server_default="user")
    is_banned = Column(Boolean, default=False, nullable=False, server_default=sa_text('false'))
    banned_until = Column(DateTime(timezone=True), nullable=True)
    ban_reason = Column(String(500), nullable=True)
    muted_until = Column(DateTime(timezone=True), nullable=True)
    warnings_count = Column(Integer, default=0, nullable=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
