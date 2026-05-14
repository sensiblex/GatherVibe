from sqlalchemy import Column, Index, Integer, String, ForeignKey, UniqueConstraint
from database import Base


class MessageReaction(Base):
    """ Реакции на сообщения в чате """
    __tablename__ = "message_reactions"

    id         = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False, index=True)
    room       = Column(String, nullable=False, index=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    emoji      = Column(String(10), nullable=False)

    __table_args__ = (
        UniqueConstraint("message_id", "user_id", "emoji", name="uq_reaction_message_user_emoji"),
        Index("ix_message_reactions_message_user", "message_id", "user_id"),
    )
