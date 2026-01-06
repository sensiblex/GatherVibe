from sqlalchemy import Column, Integer, String, DateTime, Float, Text, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

class Event(Base):
    __tablename__ = "events"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    date_time = Column(DateTime, nullable=False)
    location = Column(String(300))
    address = Column(String(500))
    city = Column(String(100))
    category = Column(String(50))  # концерт, выставка, фестиваль, мастер-класс
    price = Column(Float, default=0.0)
    max_participants = Column(Integer, nullable=True)
    current_participants = Column(Integer, default=0)
    image_url = Column(String(500), nullable=True)
    external_link = Column(String(500), nullable=True)  # ссылка на билеты
    is_active = Column(Boolean, default=True)
    
    # Связи
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)