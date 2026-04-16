from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint
from database import Base


class MessageReaction(Base):
    __tablename__ = "message_reactions"

    id         = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("chat_messages.id"), nullable=False, index=True)
    room       = Column(String, nullable=False, index=True)
    user_id    = Column(String, nullable=False)
    emoji      = Column(String(10), nullable=False)

    __table_args__ = (
        # One user can apply each emoji to a given message only once
        UniqueConstraint("message_id", "user_id", "emoji", name="uq_reaction_message_user_emoji"),
    )
