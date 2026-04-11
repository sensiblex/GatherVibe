"""add tags and moderation fields to party_reviews

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = '0008'
down_revision: Union[str, None] = '0007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _col_exists(table: str, col: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    return col in {c['name'] for c in inspector.get_columns(table)}


def upgrade() -> None:
    if not _col_exists('party_reviews', 'tags'):
        op.add_column('party_reviews', sa.Column('tags', sa.JSON(), nullable=True))
    if not _col_exists('party_reviews', 'is_hidden'):
        op.add_column('party_reviews', sa.Column('is_hidden', sa.Boolean(), server_default='false', nullable=False))
    if not _col_exists('party_reviews', 'report_count'):
        op.add_column('party_reviews', sa.Column('report_count', sa.Integer(), server_default='0', nullable=False))


def downgrade() -> None:
    for col in ('report_count', 'is_hidden', 'tags'):
        if _col_exists('party_reviews', col):
            op.drop_column('party_reviews', col)
