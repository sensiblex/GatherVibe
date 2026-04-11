from sqlalchemy import Column, Integer, String, Boolean, Text
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    city = Column(String, nullable=True)
    interests = Column(String, nullable=True)
    bio = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    avatar_url = Column(String, nullable=True)
    show_email     = Column(Boolean, default=False)
    show_city      = Column(Boolean, default=True)
    show_interests = Column(Boolean, default=True)
