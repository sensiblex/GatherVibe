"""change event_date_ts to BigInteger in event_parties and event_attendees

Revision ID: 0014
Revises: 0013
Create Date: 2026-04-16 00:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0014'
down_revision: Union[str, None] = '0013'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('event_parties', schema=None) as batch_op:
        batch_op.alter_column('event_date_ts',
                              existing_type=sa.Integer(),
                              type_=sa.BigInteger(),
                              existing_nullable=True)

    with op.batch_alter_table('event_attendees', schema=None) as batch_op:
        batch_op.alter_column('event_date_ts',
                              existing_type=sa.Integer(),
                              type_=sa.BigInteger(),
                              existing_nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('event_attendees', schema=None) as batch_op:
        batch_op.alter_column('event_date_ts',
                              existing_type=sa.BigInteger(),
                              type_=sa.Integer(),
                              existing_nullable=True)

    with op.batch_alter_table('event_parties', schema=None) as batch_op:
        batch_op.alter_column('event_date_ts',
                              existing_type=sa.BigInteger(),
                              type_=sa.Integer(),
                              existing_nullable=True)
