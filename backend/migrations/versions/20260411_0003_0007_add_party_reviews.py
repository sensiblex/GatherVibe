"""add party_reviews table

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-11 00:03:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = '0007'
down_revision: Union[str, None] = '0006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    return inspector.has_table(table_name)


def upgrade() -> None:
    if _table_exists('party_reviews'):
        return
    op.create_table(
        'party_reviews',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('reviewer_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('reviewed_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('party_id', sa.Integer(), sa.ForeignKey('event_parties.id', ondelete='CASCADE'), nullable=False),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('text', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('reviewer_id', 'reviewed_id', 'party_id', name='uq_review_per_party'),
    )


def downgrade() -> None:
    if _table_exists('party_reviews'):
        op.drop_table('party_reviews')
