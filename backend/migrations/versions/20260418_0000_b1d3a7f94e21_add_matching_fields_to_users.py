"""add matching fields to users (birth_date, geo, preferences)

Revision ID: b1d3a7f94e21
Revises: a3f2c1d9e5b7
Create Date: 2026-04-18 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b1d3a7f94e21'
down_revision: Union[str, None] = 'a3f2c1d9e5b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('birth_date', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('latitude', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('longitude', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('geo_precision', sa.String(length=10), nullable=True))
        batch_op.add_column(sa.Column('show_age', sa.Boolean(), nullable=False, server_default='true'))
        batch_op.add_column(sa.Column('is_discoverable_on_events', sa.Boolean(), nullable=False, server_default='false'))
        batch_op.add_column(sa.Column('preferred_categories', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('preferred_days', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('preferred_time', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('budget_max', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('embedding_updated_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('embedding_updated_at')
        batch_op.drop_column('budget_max')
        batch_op.drop_column('preferred_time')
        batch_op.drop_column('preferred_days')
        batch_op.drop_column('preferred_categories')
        batch_op.drop_column('is_discoverable_on_events')
        batch_op.drop_column('show_age')
        batch_op.drop_column('geo_precision')
        batch_op.drop_column('longitude')
        batch_op.drop_column('latitude')
        batch_op.drop_column('birth_date')
