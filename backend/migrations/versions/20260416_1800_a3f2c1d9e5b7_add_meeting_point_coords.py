"""add meeting point coords (lat/lon/landmark) to party meeting plan

Revision ID: a3f2c1d9e5b7
Revises: 9e9166375c0b
Create Date: 2026-04-16 18:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'a3f2c1d9e5b7'
down_revision = '9e9166375c0b'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("party_meeting_plans") as batch_op:
        batch_op.add_column(sa.Column("meet_lat", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("meet_lon", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("meet_landmark", sa.Text(), nullable=True))

    with op.batch_alter_table("party_meeting_plan_history") as batch_op:
        batch_op.add_column(sa.Column("meet_lat", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("meet_lon", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("meet_landmark", sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table("party_meeting_plans") as batch_op:
        batch_op.drop_column("meet_landmark")
        batch_op.drop_column("meet_lon")
        batch_op.drop_column("meet_lat")

    with op.batch_alter_table("party_meeting_plan_history") as batch_op:
        batch_op.drop_column("meet_landmark")
        batch_op.drop_column("meet_lon")
        batch_op.drop_column("meet_lat")
