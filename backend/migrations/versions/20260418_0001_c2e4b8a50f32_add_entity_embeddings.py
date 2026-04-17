"""add entity_embeddings table (JSON-stored for SQLite compat, pgvector-ready)

Revision ID: c2e4b8a50f32
Revises: b1d3a7f94e21
Create Date: 2026-04-18 00:01:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c2e4b8a50f32'
down_revision: Union[str, None] = 'b1d3a7f94e21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'entity_embeddings',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('entity_type', sa.String(length=20), nullable=False),
        sa.Column('entity_id', sa.String(length=64), nullable=False),
        sa.Column('embedding_json', sa.Text(), nullable=False),
        sa.Column('model_version', sa.String(length=50), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('entity_type', 'entity_id', name='uq_entity_embeddings_type_id'),
    )
    op.create_index(
        'ix_entity_embeddings_type',
        'entity_embeddings',
        ['entity_type'],
    )


def downgrade() -> None:
    op.drop_index('ix_entity_embeddings_type', table_name='entity_embeddings')
    op.drop_table('entity_embeddings')
