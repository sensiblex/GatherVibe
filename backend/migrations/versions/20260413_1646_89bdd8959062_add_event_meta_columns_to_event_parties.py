"""add event meta columns to event_parties

Revision ID: 89bdd8959062
Revises: 0eb8994d7474
Create Date: 2026-04-13 16:46:15.883597+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '89bdd8959062'
down_revision: Union[str, None] = '0eb8994d7474'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('event_parties', schema=None) as batch_op:
        batch_op.add_column(sa.Column('event_title', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('event_date_ts', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('event_image_url', sa.String(length=500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('event_parties', schema=None) as batch_op:
        batch_op.drop_column('event_image_url')
        batch_op.drop_column('event_date_ts')
        batch_op.drop_column('event_title')
