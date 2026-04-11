"""add privacy fields to user

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-11 00:01:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = '0005'
down_revision: Union[str, None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    return inspector.has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    bind = op.get_bind()
    inspector = inspect(bind)
    try:
        columns = [col['name'] for col in inspector.get_columns(table_name)]
    except Exception:
        return False
    return column_name in columns


def upgrade() -> None:
    if not _table_exists('users'):
        return
    with op.batch_alter_table('users', schema=None) as batch_op:
        if not _column_exists('users', 'show_email'):
            batch_op.add_column(
                sa.Column('show_email', sa.Boolean(), nullable=True, server_default='0')
            )
        if not _column_exists('users', 'show_city'):
            batch_op.add_column(
                sa.Column('show_city', sa.Boolean(), nullable=True, server_default='1')
            )
        if not _column_exists('users', 'show_interests'):
            batch_op.add_column(
                sa.Column('show_interests', sa.Boolean(), nullable=True, server_default='1')
            )


def downgrade() -> None:
    if not _table_exists('users'):
        return
    with op.batch_alter_table('users', schema=None) as batch_op:
        if _column_exists('users', 'show_interests'):
            batch_op.drop_column('show_interests')
        if _column_exists('users', 'show_city'):
            batch_op.drop_column('show_city')
        if _column_exists('users', 'show_email'):
            batch_op.drop_column('show_email')
