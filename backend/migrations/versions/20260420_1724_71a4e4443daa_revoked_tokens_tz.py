"""revoked_tokens_tz

Переводит revoked_tokens.exp и revoked_tokens.revoked_at в timestamptz
чтобы соответствовать остальным tz-aware колонкам и корректно сравниваться
с `datetime.now(timezone.utc)` в cleanup-job'е.

Revision ID: 71a4e4443daa
Revises: 0e8e2f9edebd
Create Date: 2026-04-20 17:24:55.218977+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '71a4e4443daa'
down_revision: Union[str, None] = '0e8e2f9edebd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('revoked_tokens', schema=None) as batch_op:
        batch_op.alter_column(
            'exp',
            existing_type=sa.DateTime(),
            type_=sa.DateTime(timezone=True),
            existing_nullable=False,
        )
        batch_op.alter_column(
            'revoked_at',
            existing_type=sa.DateTime(),
            type_=sa.DateTime(timezone=True),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table('revoked_tokens', schema=None) as batch_op:
        batch_op.alter_column(
            'revoked_at',
            existing_type=sa.DateTime(timezone=True),
            type_=sa.DateTime(),
            existing_nullable=False,
        )
        batch_op.alter_column(
            'exp',
            existing_type=sa.DateTime(timezone=True),
            type_=sa.DateTime(),
            existing_nullable=False,
        )
