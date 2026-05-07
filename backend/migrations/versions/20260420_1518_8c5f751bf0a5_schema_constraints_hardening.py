"""schema_constraints_hardening

Добавляет:
- `users.is_active` — NOT NULL + server_default TRUE (бэкфилл существующих NULL).
- `party_members.status` — CHECK на допустимые значения.

CheckConstraint и onupdate на `updated_at` (party_pinned_blocks, party_attendance)
пропущены: onupdate — это ORM-семантика, не DDL; он действует через SQLAlchemy
при UPDATE. В БД отдельная DDL-операция не требуется.

Revision ID: 8c5f751bf0a5
Revises: 4a33a4b4fc52
Create Date: 2026-04-20 15:18:23.983298+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '8c5f751bf0a5'
down_revision: Union[str, None] = '4a33a4b4fc52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


VALID_MEMBER_STATUSES = ('pending', 'accepted', 'rejected', 'left', 'invited', 'declined')


def upgrade() -> None:
    # 1) users.is_active: засеять NULL'ы true, затем NOT NULL + server_default
    op.execute("UPDATE users SET is_active = TRUE WHERE is_active IS NULL")
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column(
            'is_active',
            existing_type=sa.BOOLEAN(),
            nullable=False,
            server_default=sa.text('true'),
        )

    # 2) party_members.status: нормализуем регистр, затем CheckConstraint
    op.execute("UPDATE party_members SET status = LOWER(status) WHERE status IS NOT NULL")
    op.execute(
        "DELETE FROM party_members WHERE status IS NULL OR status NOT IN "
        "('pending','accepted','rejected','left','invited','declined')"
    )
    op.create_check_constraint(
        'ck_party_member_status',
        'party_members',
        "status IN ('pending','accepted','rejected','left','invited','declined')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_party_member_status', 'party_members', type_='check')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column(
            'is_active',
            existing_type=sa.BOOLEAN(),
            nullable=True,
            server_default=None,
        )
