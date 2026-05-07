"""drop recommendation tables

Revision ID: 9f8a7b6c5d4e
Revises: a1b2c3d4e5f6
Create Date: 2026-04-28 00:01:00.000000+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9f8a7b6c5d4e'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(name: str) -> bool:
    return name in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table: str, column: str) -> bool:
    return column in {c['name'] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if _has_table('users') and _has_column('users', 'embedding_updated_at'):
        with op.batch_alter_table('users', schema=None) as batch_op:
            batch_op.drop_column('embedding_updated_at')
    if _has_table('recommendation_impressions'):
        op.drop_table('recommendation_impressions')
    if _has_table('entity_embeddings'):
        op.drop_table('entity_embeddings')


def downgrade() -> None:
    if _has_table('users') and not _has_column('users', 'embedding_updated_at'):
        with op.batch_alter_table('users', schema=None) as batch_op:
            batch_op.add_column(sa.Column('embedding_updated_at', sa.DateTime(timezone=True), nullable=True))

    if not _has_table('entity_embeddings'):
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
        op.create_index('ix_entity_embeddings_entity_type', 'entity_embeddings', ['entity_type'])

    if not _has_table('recommendation_impressions'):
        op.create_table(
            'recommendation_impressions',
            sa.Column('id', sa.BigInteger(), primary_key=True, index=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('rec_type', sa.String(length=20), nullable=False),
            sa.Column('target_id', sa.String(length=64), nullable=False),
            sa.Column('action', sa.String(length=20), nullable=False),
            sa.Column('score', sa.Integer(), nullable=True),
            sa.Column('surface', sa.String(length=30), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index(
            'ix_rec_impressions_user_type_created',
            'recommendation_impressions',
            ['user_id', 'rec_type', 'created_at'],
        )
        op.create_index(
            'ix_rec_impressions_target',
            'recommendation_impressions',
            ['rec_type', 'target_id'],
        )
