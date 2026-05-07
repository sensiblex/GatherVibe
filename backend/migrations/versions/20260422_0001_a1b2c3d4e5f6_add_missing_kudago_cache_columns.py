"""add missing kudago cache columns

Adds columns present in the KudaGoEvent model but absent from the DB:
tags, favorites_count, comments_count, publication_ts, end_ts,
has_schedules, place_is_stub.

Revision ID: a1b2c3d4e5f6
Revises: 71a4e4443daa
Create Date: 2026-04-22 00:01:00.000000+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '71a4e4443daa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('kudago_events_cache', schema=None) as batch_op:
        batch_op.add_column(sa.Column('tags', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('favorites_count', sa.Integer(), nullable=True, server_default='0'))
        batch_op.add_column(sa.Column('comments_count', sa.Integer(), nullable=True, server_default='0'))
        batch_op.add_column(sa.Column('publication_ts', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('end_ts', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('has_schedules', sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column('place_is_stub', sa.Boolean(), nullable=True))
        batch_op.create_index('ix_kudago_events_cache_favorites_count', ['favorites_count'], unique=False)
        batch_op.create_index('ix_kudago_events_cache_comments_count', ['comments_count'], unique=False)
        batch_op.create_index('ix_kudago_events_cache_publication_ts', ['publication_ts'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('kudago_events_cache', schema=None) as batch_op:
        batch_op.drop_index('ix_kudago_events_cache_publication_ts')
        batch_op.drop_index('ix_kudago_events_cache_comments_count')
        batch_op.drop_index('ix_kudago_events_cache_favorites_count')
        batch_op.drop_column('place_is_stub')
        batch_op.drop_column('has_schedules')
        batch_op.drop_column('end_ts')
        batch_op.drop_column('publication_ts')
        batch_op.drop_column('comments_count')
        batch_op.drop_column('favorites_count')
        batch_op.drop_column('tags')
