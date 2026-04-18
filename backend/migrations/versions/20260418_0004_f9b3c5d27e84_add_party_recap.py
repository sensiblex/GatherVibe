"""add party_recap, party_recap_items, party_recap_reactions

Revision ID: f9b3c5d27e84
Revises: e8a2f1b94c63
Create Date: 2026-04-18 00:04:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f9b3c5d27e84'
down_revision: Union[str, None] = 'e8a2f1b94c63'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    return name in sa.inspect(bind).get_table_names()


def upgrade() -> None:
    if not _has_table("party_recaps"):
        op.create_table(
            "party_recaps",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("party_id", sa.Integer(),
                      sa.ForeignKey("event_parties.id", ondelete="CASCADE"),
                      nullable=False, unique=True, index=True),
            sa.Column("cover_url", sa.String(length=500), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True),
                      server_default=sa.func.now()),
        )

    if not _has_table("party_recap_items"):
        op.create_table(
            "party_recap_items",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("recap_id", sa.Integer(),
                      sa.ForeignKey("party_recaps.id", ondelete="CASCADE"),
                      nullable=False, index=True),
            sa.Column("party_id", sa.Integer(),
                      sa.ForeignKey("event_parties.id", ondelete="CASCADE"),
                      nullable=False, index=True),
            sa.Column("author_id", sa.Integer(),
                      sa.ForeignKey("users.id", ondelete="CASCADE"),
                      nullable=False, index=True),
            sa.Column("kind", sa.String(length=16), nullable=False),
            sa.Column("media_url", sa.String(length=500), nullable=True),
            sa.Column("caption", sa.String(length=500), nullable=True),
            sa.Column("is_pinned_highlight", sa.Boolean(), nullable=False,
                      server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(timezone=True),
                      server_default=sa.func.now()),
        )
        op.create_index("ix_recap_items_party_created", "party_recap_items",
                        ["party_id", "created_at"])

    if not _has_table("party_recap_reactions"):
        op.create_table(
            "party_recap_reactions",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("item_id", sa.Integer(),
                      sa.ForeignKey("party_recap_items.id", ondelete="CASCADE"),
                      nullable=False, index=True),
            sa.Column("user_id", sa.Integer(),
                      sa.ForeignKey("users.id", ondelete="CASCADE"),
                      nullable=False),
            sa.Column("emoji", sa.String(length=16), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True),
                      server_default=sa.func.now()),
            sa.UniqueConstraint("item_id", "user_id", "emoji",
                                name="uq_recap_reaction_item_user_emoji"),
        )


def downgrade() -> None:
    if _has_table("party_recap_reactions"):
        op.drop_table("party_recap_reactions")
    if _has_table("party_recap_items"):
        op.drop_index("ix_recap_items_party_created", table_name="party_recap_items")
        op.drop_table("party_recap_items")
    if _has_table("party_recaps"):
        op.drop_table("party_recaps")
