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
    if not _table_exists('event_parties'):
        op.create_table(
            'event_parties',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('event_id', sa.String(), nullable=False, index=True),
            sa.Column('title', sa.String(60), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('max_members', sa.Integer(), server_default='4'),
            sa.Column('creator_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('is_open', sa.Boolean(), server_default='true'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _table_exists('party_members'):
        op.create_table(
            'party_members',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('party_id', sa.Integer(), sa.ForeignKey('event_parties.id', ondelete='CASCADE'), nullable=False),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('status', sa.String(10), server_default='pending'),
            sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('message', sa.String(100), nullable=True),
            sa.UniqueConstraint('party_id', 'user_id', name='uq_party_user'),
        )

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
