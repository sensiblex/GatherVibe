"""add email verification fields to users

Revision ID: 0013
Revises: 0012
Create Date: 2026-04-15 00:01:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0013'
down_revision: Union[str, None] = '0012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_verified', sa.Boolean(), server_default='false', nullable=False))
        batch_op.add_column(sa.Column('verification_token', sa.String(64), nullable=True))
        batch_op.create_index('ix_users_verification_token', ['verification_token'])


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index('ix_users_verification_token')
        batch_op.drop_column('verification_token')
        batch_op.drop_column('is_verified')
