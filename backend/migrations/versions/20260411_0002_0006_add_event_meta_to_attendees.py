"""add event metadata cache to event_attendees

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-11 00:02:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = '0006'
down_revision: Union[str, None] = '0005'
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
    if not _table_exists('event_attendees'):
        return
    new_cols = [
        ('event_title',     sa.String(),  None),
        ('event_date_ts',   sa.Integer(), None),
        ('event_city',      sa.String(),  None),
        ('event_image_url', sa.String(),  None),
        ('event_category',  sa.String(),  None),
        ('event_location',  sa.String(),  None),
    ]
    with op.batch_alter_table('event_attendees', schema=None) as batch_op:
        for col_name, col_type, default in new_cols:
            if not _column_exists('event_attendees', col_name):
                batch_op.add_column(sa.Column(col_name, col_type, nullable=True))


def downgrade() -> None:
    if not _table_exists('event_attendees'):
        return
    cols = ['event_title', 'event_date_ts', 'event_city',
            'event_image_url', 'event_category', 'event_location']
    with op.batch_alter_table('event_attendees', schema=None) as batch_op:
        for col_name in reversed(cols):
            if _column_exists('event_attendees', col_name):
                batch_op.drop_column(col_name)
