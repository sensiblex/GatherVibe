"""add_hidden_fields_to_event_parties

Revision ID: 9515d39a80be
Revises: c7faba8d7687
Create Date: 2026-05-11 17:13:43.403628+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9515d39a80be'
down_revision: Union[str, None] = 'c7faba8d7687'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('event_parties', sa.Column('invite_token', sa.String(64), unique=True, nullable=True))
    op.add_column('event_parties', sa.Column('is_hidden', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('event_parties', sa.Column('hidden_reason', sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column('event_parties', 'hidden_reason')
    op.drop_column('event_parties', 'is_hidden')
    op.drop_column('event_parties', 'invite_token')
