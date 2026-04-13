"""add title_lower to kudago_events_cache

Revision ID: 0eb8994d7474
Revises: d874ff93fbdf
Create Date: 2026-04-13 14:20:32.336565+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0eb8994d7474'
down_revision: Union[str, None] = 'd874ff93fbdf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('kudago_events_cache', schema=None) as batch_op:
        batch_op.add_column(sa.Column('title_lower', sa.String(length=500), nullable=True))
        batch_op.create_index(batch_op.f('ix_kudago_events_cache_title_lower'), ['title_lower'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('kudago_events_cache', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_kudago_events_cache_title_lower'))
        batch_op.drop_column('title_lower')
