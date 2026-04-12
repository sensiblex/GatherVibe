"""add notifications table

Revision ID: 0010
Revises: 0009
Create Date: 2026-04-12 00:02:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = '0010'
down_revision: Union[str, None] = '0009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    return inspector.has_table(table_name)


def upgrade() -> None:
    if _table_exists('notifications'):
        return
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('data', sa.Text(), nullable=True),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('notifications')
