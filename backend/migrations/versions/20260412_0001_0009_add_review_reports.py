"""add review_reports table for report deduplication

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-12 00:01:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = '0009'
down_revision: Union[str, None] = '0008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    return inspector.has_table(table_name)


def upgrade() -> None:
    if _table_exists('review_reports'):
        return
    op.create_table(
        'review_reports',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('review_id', sa.Integer(), sa.ForeignKey('party_reviews.id', ondelete='CASCADE'), nullable=False),
        sa.Column('reporter_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('review_id', 'reporter_id', name='uq_review_report_per_user'),
    )


def downgrade() -> None:
    if _table_exists('review_reports'):
        op.drop_table('review_reports')
