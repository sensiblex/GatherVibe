"""review soft delete and trust score

Revision ID: 0012
Revises: 89bdd8959062
Create Date: 2026-04-15 00:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0012'
down_revision: Union[str, None] = '89bdd8959062'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add is_deleted and updated_at to party_reviews
    with op.batch_alter_table('party_reviews', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_deleted', sa.Boolean(), server_default='false', nullable=False))
        batch_op.add_column(sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index('ix_party_reviews_reviewed_id', ['reviewed_id'])
        batch_op.create_index('ix_party_reviews_party_id', ['party_id'])

    # Add trust_score to users
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('trust_score', sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('trust_score')

    with op.batch_alter_table('party_reviews', schema=None) as batch_op:
        batch_op.drop_index('ix_party_reviews_party_id')
        batch_op.drop_index('ix_party_reviews_reviewed_id')
        batch_op.drop_column('updated_at')
        batch_op.drop_column('is_deleted')
