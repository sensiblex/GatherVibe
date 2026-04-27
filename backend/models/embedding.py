from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint, func
from database import Base


class EntityEmbedding(Base):
    __tablename__ = "entity_embeddings"
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", name="uq_entity_embeddings_type_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String(20), nullable=False, index=True)
    entity_id = Column(String(64), nullable=False)
    embedding_json = Column(Text, nullable=False)
    model_version = Column(String(50), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
