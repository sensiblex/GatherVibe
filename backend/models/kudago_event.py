from sqlalchemy import Column, Integer, String, Boolean, Text, Float, DateTime
from database import Base
from datetime import datetime


class KudaGoEvent(Base):
    __tablename__ = "kudago_events_cache"

    id = Column(Integer, primary_key=True, index=True)
    kudago_id = Column(Integer, unique=True, index=True, nullable=False)
    location = Column(String(20), nullable=False, index=True)

    title = Column(String(500), nullable=False)
    title_lower = Column(String(500), nullable=True, index=True)  # Python lower() для поиска
    short_title = Column(String(500))
    description = Column(Text)
    categories = Column(Text)       # JSON array as string
    price = Column(String(200))
    is_free = Column(Boolean, default=False)
    age_restriction = Column(Integer, nullable=True)

    cover_url = Column(String(1000))
    images = Column(Text)           # JSON array as string
    site_url = Column(String(1000))

    start_date = Column(String(20))
    start_time = Column(String(10))
    all_dates = Column(Text)        # JSON array as string
    is_permanent = Column(Boolean, default=False)
    # Earliest future timestamp (unix) for sorting/filtering
    start_ts = Column(Integer, nullable=True, index=True)

    place_title = Column(String(500))
    place_address = Column(String(500))
    place_phone = Column(String(100))
    place_subway = Column(String(200))
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)

    cached_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
