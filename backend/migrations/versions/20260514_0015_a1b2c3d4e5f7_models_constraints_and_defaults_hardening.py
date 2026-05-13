"""models_constraints_and_defaults_hardening

Добавляет:
- party_reviews: CheckConstraint rating BETWEEN 1 AND 5
- message_reactions: composite index (message_id, user_id)
- users: унификация server_default через sa.text() для email_notifications, is_banned
- event_parties: server_default для is_open, унификация is_hidden через sa.text()
- party_reviews: унификация server_default через sa.text() для is_hidden, is_deleted, report_count

Revision ID: a1b2c3d4e5f7
Revises: ef08623390d5
Create Date: 2026-05-14 00:15:00.000000+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, None] = 'ef08623390d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    return name in sa.inspect(bind).get_table_names()


def upgrade() -> None:
    # ── party_reviews: CheckConstraint rating BETWEEN 1 AND 5 ────────────────
    if _has_table('party_reviews'):
        op.execute("""
            DELETE FROM party_reviews WHERE rating < 1 OR rating > 5
        """)
        op.execute("""
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'ck_rating_range'
                ) THEN
                    ALTER TABLE party_reviews ADD CONSTRAINT ck_rating_range
                    CHECK (rating BETWEEN 1 AND 5);
                END IF;
            END $$
        """)

    # ── message_reactions: composite index (message_id, user_id) ─────────────
    if _has_table('message_reactions'):
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_message_reactions_message_user "
            "ON message_reactions (message_id, user_id)"
        )

    # ── users: унификация server_default ─────────────────────────────────────
    if _has_table('users'):
        with op.batch_alter_table('users', schema=None) as batch_op:
            batch_op.alter_column(
                'email_notifications',
                existing_type=sa.BOOLEAN(),
                nullable=False,
                server_default=sa.text('true'),
            )
            batch_op.alter_column(
                'is_banned',
                existing_type=sa.BOOLEAN(),
                nullable=False,
                server_default=sa.text('false'),
            )

    # ── event_parties: server_default для is_open + унификация is_hidden ────
    if _has_table('event_parties'):
        with op.batch_alter_table('event_parties', schema=None) as batch_op:
            batch_op.alter_column(
                'is_open',
                existing_type=sa.BOOLEAN(),
                nullable=False,
                server_default=sa.text('true'),
            )
            batch_op.alter_column(
                'is_hidden',
                existing_type=sa.BOOLEAN(),
                nullable=False,
                server_default=sa.text('false'),
            )

    # ── party_reviews: унификация server_default ─────────────────────────────
    if _has_table('party_reviews'):
        with op.batch_alter_table('party_reviews', schema=None) as batch_op:
            batch_op.alter_column(
                'is_hidden',
                existing_type=sa.BOOLEAN(),
                nullable=False,
                server_default=sa.text('false'),
            )
            batch_op.alter_column(
                'is_deleted',
                existing_type=sa.BOOLEAN(),
                nullable=False,
                server_default=sa.text('false'),
            )
            batch_op.alter_column(
                'report_count',
                existing_type=sa.Integer(),
                nullable=False,
                server_default=sa.text('0'),
            )


def downgrade() -> None:
    # ── party_reviews: revert server_default ──────────────────────────────────
    if _has_table('party_reviews'):
        with op.batch_alter_table('party_reviews', schema=None) as batch_op:
            batch_op.alter_column(
                'report_count',
                existing_type=sa.Integer(),
                nullable=False,
                server_default='0',
            )
            batch_op.alter_column(
                'is_deleted',
                existing_type=sa.BOOLEAN(),
                nullable=False,
                server_default='false',
            )
            batch_op.alter_column(
                'is_hidden',
                existing_type=sa.BOOLEAN(),
                nullable=False,
                server_default='false',
            )
        op.drop_constraint('ck_rating_range', 'party_reviews', type_='check')

    # ── event_parties: revert ─────────────────────────────────────────────────
    if _has_table('event_parties'):
        with op.batch_alter_table('event_parties', schema=None) as batch_op:
            batch_op.alter_column(
                'is_hidden',
                existing_type=sa.BOOLEAN(),
                nullable=False,
                server_default='false',
            )
            batch_op.alter_column(
                'is_open',
                existing_type=sa.BOOLEAN(),
                nullable=True,
                server_default=None,
            )

    # ── users: revert ──────────────────────────────────────────────────────────
    if _has_table('users'):
        with op.batch_alter_table('users', schema=None) as batch_op:
            batch_op.alter_column(
                'is_banned',
                existing_type=sa.BOOLEAN(),
                nullable=False,
                server_default='false',
            )
            batch_op.alter_column(
                'email_notifications',
                existing_type=sa.BOOLEAN(),
                nullable=False,
                server_default='true',
            )

    # ── message_reactions: drop index ────────────────────────────────────────
    if _has_table('message_reactions'):
        op.execute("DROP INDEX IF EXISTS ix_message_reactions_message_user")
