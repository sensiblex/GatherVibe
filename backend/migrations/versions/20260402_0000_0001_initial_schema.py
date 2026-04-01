"""initial schema

Revision ID: 0001
Revises: 
Create Date: 2026-04-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Создаём таблицу users с колонкой bio
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('city', sa.String(), nullable=True),
        sa.Column('interests', sa.String(), nullable=True),
        sa.Column('bio', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)

    # Создаём таблицу events
    op.create_table(
        'events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('date_time', sa.DateTime(), nullable=True),
        sa.Column('location', sa.String(), nullable=True),
        sa.Column('city', sa.String(), nullable=True),
        sa.Column('category', sa.String(), nullable=True),
        sa.Column('max_participants', sa.Integer(), nullable=True),
        sa.Column('current_participants', sa.Integer(), nullable=True),
        sa.Column('image_url', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_events_id'), 'events', ['id'], unique=False)

    # Создаём таблицу event_attendees
    op.create_table(
        'event_attendees',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('is_looking', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_event_attendees_id'), 'event_attendees', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_event_attendees_id'), table_name='event_attendees')
    op.drop_table('event_attendees')
    op.drop_index(op.f('ix_events_id'), table_name='events')
    op.drop_table('events')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_table('users')
