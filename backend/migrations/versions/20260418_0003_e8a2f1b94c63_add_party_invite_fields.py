"""add invited_by_user_id and invite_message to party_members

Revision ID: e8a2f1b94c63
Revises: d7f091c62b15
Create Date: 2026-04-18 00:03:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e8a2f1b94c63'
down_revision: Union[str, None] = 'd7f091c62b15'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {c['name'] for c in inspector.get_columns(table)}


def _existing_fks(table: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {fk['name'] for fk in inspector.get_foreign_keys(table) if fk.get('name')}


def upgrade() -> None:
    cols = _existing_columns('party_members')
    if 'invited_by_user_id' not in cols:
        op.add_column(
            'party_members',
            sa.Column('invited_by_user_id', sa.Integer(), nullable=True),
        )
    fk_name = 'fk_party_members_invited_by_user_id'
    if fk_name not in _existing_fks('party_members'):
        op.create_foreign_key(
            fk_name,
            'party_members', 'users',
            ['invited_by_user_id'], ['id'],
            ondelete='SET NULL',
        )
    if 'invite_message' not in cols:
        op.add_column(
            'party_members',
            sa.Column('invite_message', sa.String(length=200), nullable=True),
        )


def downgrade() -> None:
    cols = _existing_columns('party_members')
    if 'invite_message' in cols:
        op.drop_column('party_members', 'invite_message')
    fk_name = 'fk_party_members_invited_by_user_id'
    if fk_name in _existing_fks('party_members'):
        op.drop_constraint(fk_name, 'party_members', type_='foreignkey')
    if 'invited_by_user_id' in cols:
        op.drop_column('party_members', 'invited_by_user_id')
