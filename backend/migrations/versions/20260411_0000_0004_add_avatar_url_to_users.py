"""add avatar_url to users

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = '0004'
down_revision: Union[str, None] = '0003'
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
    if _table_exists('users') and not _column_exists('users', 'avatar_url'):
        with op.batch_alter_table('users', schema=None) as batch_op:
            batch_op.add_column(sa.Column('avatar_url', sa.String(), nullable=True))


def downgrade() -> None:
    if _column_exists('users', 'avatar_url'):
        with op.batch_alter_table('users', schema=None) as batch_op:
            batch_op.drop_column('avatar_url')
