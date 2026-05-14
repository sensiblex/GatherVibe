from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.sql import func
from database import Base


class RevokedToken(Base):
    """ Токен, отозванный для выхода из системы """
    __tablename__ = "revoked_tokens"

    id         = Column(Integer, primary_key=True, index=True)
    jti        = Column(String(36), unique=True, nullable=False, index=True)
    revoked_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    exp        = Column(DateTime(timezone=True), nullable=False)
