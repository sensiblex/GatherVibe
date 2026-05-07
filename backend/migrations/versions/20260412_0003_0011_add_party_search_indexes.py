"""add_party_search_indexes

Revision ID: 0011
Revises: 0010
Create Date: 2026-04-12

Adds:
  - city column to event_parties
  - Index on event_parties.title (GIN via pg_trgm for ILIKE on PostgreSQL;
    plain index on SQLite dev)
  - Index on event_parties.city
  - Index on event_parties.created_at
"""

from typing import Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine import Connection

# revision identifiers, used by Alembic.
revision: str = '0011'
down_revision: Union[str, None] = '0010'
branch_labels = None
depends_on = None


def _is_postgresql(conn: Connection) -> bool:
    return conn.dialect.name == "postgresql"


def upgrade() -> None:
    # Add city column
    op.add_column("event_parties", sa.Column("city", sa.String(100), nullable=True))

    bind = op.get_bind()

    if _is_postgresql(bind):
        # Enable pg_trgm for ILIKE acceleration (idempotent)
        bind.execute(sa.text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        bind.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS ix_event_parties_title_trgm "
            "ON event_parties USING gin (title gin_trgm_ops)"
        ))
        bind.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS ix_event_parties_description_trgm "
            "ON event_parties USING gin (description gin_trgm_ops)"
        ))
    else:
        # SQLite: plain index (no pg_trgm)
        op.create_index("ix_event_parties_title", "event_parties", ["title"])

    op.create_index("ix_event_parties_city", "event_parties", ["city"])
    op.create_index("ix_event_parties_created_at", "event_parties", ["created_at"])


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_index("ix_event_parties_created_at", table_name="event_parties")
    op.drop_index("ix_event_parties_city", table_name="event_parties")

    if _is_postgresql(bind):
        bind.execute(sa.text("DROP INDEX IF EXISTS ix_event_parties_title_trgm"))
        bind.execute(sa.text("DROP INDEX IF EXISTS ix_event_parties_description_trgm"))
    else:
        op.drop_index("ix_event_parties_title", table_name="event_parties")

    op.drop_column("event_parties", "city")
