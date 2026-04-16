"""add_party_meeting_plan

Revision ID: 9e9166375c0b
Revises: 0015
Create Date: 2026-04-16 16:52:51.044108+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9e9166375c0b'
down_revision: Union[str, None] = '0015'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('party_meeting_plan_history',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('party_id', sa.Integer(), nullable=False),
    sa.Column('meet_time', sa.DateTime(timezone=True), nullable=True),
    sa.Column('meet_location', sa.Text(), nullable=True),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('changed_by', sa.Integer(), nullable=False),
    sa.Column('changed_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.ForeignKeyConstraint(['changed_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['party_id'], ['event_parties.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('party_meeting_plan_history', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_party_meeting_plan_history_id'), ['id'], unique=False)
        batch_op.create_index('ix_party_meeting_plan_history_party_changed', ['party_id', 'changed_at'], unique=False)

    op.create_table('party_meeting_plans',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('party_id', sa.Integer(), nullable=False),
    sa.Column('meet_time', sa.DateTime(timezone=True), nullable=True),
    sa.Column('meet_location', sa.Text(), nullable=True),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('updated_by', sa.Integer(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.ForeignKeyConstraint(['party_id'], ['event_parties.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['updated_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('party_id')
    )
    with op.batch_alter_table('party_meeting_plans', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_party_meeting_plans_id'), ['id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('party_meeting_plans', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_party_meeting_plans_id'))
    op.drop_table('party_meeting_plans')

    with op.batch_alter_table('party_meeting_plan_history', schema=None) as batch_op:
        batch_op.drop_index('ix_party_meeting_plan_history_party_changed')
        batch_op.drop_index(batch_op.f('ix_party_meeting_plan_history_id'))
    op.drop_table('party_meeting_plan_history')
