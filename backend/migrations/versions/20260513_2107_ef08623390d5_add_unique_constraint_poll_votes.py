"""add_unique_constraint_poll_votes

Добавляет уникальное ограничение на (poll_id, user_id) в таблице poll_votes
для предотвращения дублирования голосов (race condition fix).

Revision ID: ef08623390d5
Revises: 9515d39a80be
Create Date: 2026-05-13 21:07:16.339076+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ef08623390d5'
down_revision: Union[str, None] = '9515d39a80be'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    return name in sa.inspect(bind).get_table_names()


def upgrade() -> None:
    if _has_table('poll_votes'):
        op.create_unique_constraint(
            'uq_poll_user',
            'poll_votes',
            ['poll_id', 'user_id']
        )


def downgrade() -> None:
    op.drop_constraint('uq_poll_user', 'poll_votes', type_='unique')
