"""add_moderation_fields_to_users

Revision ID: c7faba8d7687
Revises: 9f8a7b6c5d4e
Create Date: 2026-05-11 17:12:40.798045+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7faba8d7687'
down_revision: Union[str, None] = '9f8a7b6c5d4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('role', sa.String(16), nullable=False, server_default='user'))
    op.add_column('users', sa.Column('is_banned', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('ban_reason', sa.String(500), nullable=True))
    op.add_column('users', sa.Column('warnings_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()))


def downgrade() -> None:
    op.drop_column('users', 'created_at')
    op.drop_column('users', 'warnings_count')
    op.drop_column('users', 'ban_reason')
    op.drop_column('users', 'is_banned')
    op.drop_column('users', 'role')
