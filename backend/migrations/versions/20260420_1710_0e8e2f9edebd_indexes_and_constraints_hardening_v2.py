"""indexes_and_constraints_hardening_v2

Добавляет:
- events: timezone на date_time/created_at/updated_at + composite index (is_active, date_time).
- party_members: composite index (party_id, status) — закрывает hot-path count()'ы.
- chat_messages: composite index (room, timestamp) — для истории чата.
- poll_votes.user_id: индекс.
- party_attendance.user_id: индекс + CheckConstraint на status.
- party_polls.status: NOT NULL + server_default='active' + CheckConstraint.
- poll_options.vote_count: NOT NULL + server_default=0 (backfill NULL'ов).

Revision ID: 0e8e2f9edebd
Revises: 8c5f751bf0a5
Create Date: 2026-04-20 17:10:42.000000+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0e8e2f9edebd'
down_revision: Union[str, None] = '8c5f751bf0a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    return name in sa.inspect(bind).get_table_names()


def upgrade() -> None:
    # ── events ────────────────────────────────────────────────────────────────
    if _has_table('events'):
        with op.batch_alter_table('events', schema=None) as batch_op:
            batch_op.alter_column('date_time',
                                  existing_type=sa.DateTime(),
                                  type_=sa.DateTime(timezone=True),
                                  existing_nullable=False)
            batch_op.alter_column('created_at',
                                  existing_type=sa.DateTime(),
                                  type_=sa.DateTime(timezone=True),
                                  existing_nullable=True)
            batch_op.alter_column('updated_at',
                                  existing_type=sa.DateTime(),
                                  type_=sa.DateTime(timezone=True),
                                  existing_nullable=True)
        op.execute("CREATE INDEX IF NOT EXISTS ix_events_active_date ON events (is_active, date_time)")

    # ── party_members (party_id, status) ──────────────────────────────────────
    if _has_table('party_members'):
        op.execute("CREATE INDEX IF NOT EXISTS ix_party_members_party_status ON party_members (party_id, status)")

    # ── chat_messages (room, timestamp) ───────────────────────────────────────
    if _has_table('chat_messages'):
        op.execute("CREATE INDEX IF NOT EXISTS ix_chat_messages_room_timestamp ON chat_messages (room, timestamp)")

    # ── poll_votes.user_id index ──────────────────────────────────────────────
    if _has_table('poll_votes'):
        op.execute("CREATE INDEX IF NOT EXISTS ix_poll_votes_user_id ON poll_votes (user_id)")

    # ── party_attendance ──────────────────────────────────────────────────────
    if _has_table('party_attendance'):
        op.execute("CREATE INDEX IF NOT EXISTS ix_party_attendance_user_id ON party_attendance (user_id)")
        op.execute(
            "DELETE FROM party_attendance WHERE status IS NULL OR status NOT IN ('going','late','cant')"
        )
        op.execute("""
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'ck_party_attendance_status'
                ) THEN
                    ALTER TABLE party_attendance ADD CONSTRAINT ck_party_attendance_status
                    CHECK (status IN ('going','late','cant'));
                END IF;
            END $$
        """)

    # ── party_polls.status ────────────────────────────────────────────────────
    if _has_table('party_polls'):
        op.execute("UPDATE party_polls SET status='active' WHERE status IS NULL")
        op.execute("UPDATE party_polls SET status='active' WHERE status NOT IN ('active','closed')")
        with op.batch_alter_table('party_polls', schema=None) as batch_op:
            batch_op.alter_column('status',
                                  existing_type=sa.String(length=10),
                                  nullable=False,
                                  server_default='active')
        op.execute("""
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'ck_party_poll_status'
                ) THEN
                    ALTER TABLE party_polls ADD CONSTRAINT ck_party_poll_status
                    CHECK (status IN ('active','closed'));
                END IF;
            END $$
        """)

    # ── poll_options.vote_count ───────────────────────────────────────────────
    if _has_table('poll_options'):
        op.execute("UPDATE poll_options SET vote_count=0 WHERE vote_count IS NULL")
        with op.batch_alter_table('poll_options', schema=None) as batch_op:
            batch_op.alter_column('vote_count',
                                  existing_type=sa.Integer(),
                                  nullable=False,
                                  server_default=sa.text('0'))


def downgrade() -> None:
    with op.batch_alter_table('poll_options', schema=None) as batch_op:
        batch_op.alter_column('vote_count',
                              existing_type=sa.Integer(),
                              nullable=True,
                              server_default=None)

    op.drop_constraint('ck_party_poll_status', 'party_polls', type_='check')
    with op.batch_alter_table('party_polls', schema=None) as batch_op:
        batch_op.alter_column('status',
                              existing_type=sa.String(length=10),
                              nullable=True,
                              server_default=None)

    op.drop_constraint('ck_party_attendance_status', 'party_attendance', type_='check')
    op.drop_index('ix_party_attendance_user_id', table_name='party_attendance')
    op.drop_index('ix_poll_votes_user_id', table_name='poll_votes')
    op.drop_index('ix_chat_messages_room_timestamp', table_name='chat_messages')
    op.drop_index('ix_party_members_party_status', table_name='party_members')
    op.drop_index('ix_events_active_date', table_name='events')

    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.alter_column('updated_at',
                              existing_type=sa.DateTime(timezone=True),
                              type_=sa.DateTime(),
                              existing_nullable=True)
        batch_op.alter_column('created_at',
                              existing_type=sa.DateTime(timezone=True),
                              type_=sa.DateTime(),
                              existing_nullable=True)
        batch_op.alter_column('date_time',
                              existing_type=sa.DateTime(timezone=True),
                              type_=sa.DateTime(),
                              existing_nullable=False)
