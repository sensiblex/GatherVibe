from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, String, func
from database import Base


class RecommendationImpression(Base):
    __tablename__ = "recommendation_impressions"

    # BigInteger on Postgres, Integer on SQLite (so AUTOINCREMENT works in tests)
    id = Column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True, index=True, autoincrement=True,
    )
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    rec_type = Column(String(20), nullable=False)   # 'event' | 'person' | 'party'
    target_id = Column(String(64), nullable=False)
    action = Column(String(20), nullable=False)     # 'shown'|'clicked'|'dismissed'|'liked'|'disliked'|'converted'
    score = Column(Integer, nullable=True)
    surface = Column(String(30), nullable=True)     # 'home_feed'|'discover'|'event_detail_peers'
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
