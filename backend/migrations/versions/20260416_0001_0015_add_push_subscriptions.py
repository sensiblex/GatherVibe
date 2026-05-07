"""add push_subscriptions table and email_notifications to users

Revision ID: 0015
Revises: 0014
Create Date: 2026-04-16 00:01:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0015'
down_revision: Union[str, None] = '0014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'push_subscriptions',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('endpoint', sa.Text(), nullable=False),
        sa.Column('p256dh', sa.Text(), nullable=False),
        sa.Column('auth', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('user_id', 'endpoint', name='uq_push_subscriptions_user_endpoint'),
    )

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('email_notifications', sa.Boolean(), nullable=False, server_default='true')
        )


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('email_notifications')

    op.drop_table('push_subscriptions')
