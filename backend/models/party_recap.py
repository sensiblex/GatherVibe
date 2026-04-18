from sqlalchemy import (
    Column, Integer, String, Boolean, Text, DateTime,
    ForeignKey, UniqueConstraint, Index,
)
from sqlalchemy.sql import func
from database import Base


class PartyRecap(Base):
    """One recap container per party (auto-created on first access after event ends)."""
    __tablename__ = "party_recaps"

    id          = Column(Integer, primary_key=True, index=True)
    party_id    = Column(Integer, ForeignKey("event_parties.id", ondelete="CASCADE"),
                         nullable=False, unique=True, index=True)
    cover_url   = Column(String(500), nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())


class PartyRecapItem(Base):
    """A single contribution to the recap (photo / note / etc.)."""
    __tablename__ = "party_recap_items"

    id                   = Column(Integer, primary_key=True, index=True)
    recap_id             = Column(Integer, ForeignKey("party_recaps.id", ondelete="CASCADE"),
                                  nullable=False, index=True)
    party_id             = Column(Integer, ForeignKey("event_parties.id", ondelete="CASCADE"),
                                  nullable=False, index=True)
    author_id            = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                                  nullable=False, index=True)
    kind                 = Column(String(16), nullable=False)  # 'photo' | 'note'
    media_url            = Column(String(500), nullable=True)
    caption              = Column(String(500), nullable=True)
    is_pinned_highlight  = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at           = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_recap_items_party_created", "party_id", "created_at"),
    )


class PartyRecapReaction(Base):
    """Emoji reaction on a recap item — uniqueness per (item, user, emoji)."""
    __tablename__ = "party_recap_reactions"

    id        = Column(Integer, primary_key=True, index=True)
    item_id   = Column(Integer, ForeignKey("party_recap_items.id", ondelete="CASCADE"),
                       nullable=False, index=True)
    user_id   = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                       nullable=False)
    emoji     = Column(String(16), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("item_id", "user_id", "emoji", name="uq_recap_reaction_item_user_emoji"),
    )
