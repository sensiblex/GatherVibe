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


def upgrade() -> None:
    # ── events ────────────────────────────────────────────────────────────────
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
    op.create_index('ix_events_active_date', 'events', ['is_active', 'date_time'], unique=False)

    # ── party_members (party_id, status) ──────────────────────────────────────
    op.create_index(
        'ix_party_members_party_status', 'party_members', ['party_id', 'status'], unique=False
    )

    # ── chat_messages (room, timestamp) ───────────────────────────────────────
    op.create_index(
        'ix_chat_messages_room_timestamp', 'chat_messages', ['room', 'timestamp'], unique=False
    )

    # ── poll_votes.user_id index ──────────────────────────────────────────────
    op.create_index('ix_poll_votes_user_id', 'poll_votes', ['user_id'], unique=False)

    # ── party_attendance ──────────────────────────────────────────────────────
    op.create_index('ix_party_attendance_user_id', 'party_attendance', ['user_id'], unique=False)
    op.execute(
        "DELETE FROM party_attendance WHERE status IS NULL OR status NOT IN ('going','late','cant')"
    )
    op.create_check_constraint(
        'ck_party_attendance_status', 'party_attendance',
        "status IN ('going','late','cant')"
    )

    # ── party_polls.status ────────────────────────────────────────────────────
    op.execute("UPDATE party_polls SET status='active' WHERE status IS NULL")
    op.execute("UPDATE party_polls SET status='active' WHERE status NOT IN ('active','closed')")
    with op.batch_alter_table('party_polls', schema=None) as batch_op:
        batch_op.alter_column('status',
                              existing_type=sa.String(length=10),
                              nullable=False,
                              server_default='active')
    op.create_check_constraint(
        'ck_party_poll_status', 'party_polls', "status IN ('active','closed')"
    )

    # ── poll_options.vote_count ───────────────────────────────────────────────
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
