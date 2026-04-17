"""add recommendation_impressions table (feedback loop)

Revision ID: d7f091c62b15
Revises: c2e4b8a50f32
Create Date: 2026-04-18 00:02:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd7f091c62b15'
down_revision: Union[str, None] = 'c2e4b8a50f32'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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


def downgrade() -> None:
    op.drop_index('ix_rec_impressions_target', table_name='recommendation_impressions')
    op.drop_index('ix_rec_impressions_user_type_created', table_name='recommendation_impressions')
    op.drop_table('recommendation_impressions')
