"""add bio to users

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-02 00:01:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    if not _column_exists('users', 'bio'):
        with op.batch_alter_table('users', schema=None) as batch_op:
            batch_op.add_column(sa.Column('bio', sa.Text(), nullable=True))


def downgrade() -> None:
    if _column_exists('users', 'bio'):
        with op.batch_alter_table('users', schema=None) as batch_op:
            batch_op.drop_column('bio')
