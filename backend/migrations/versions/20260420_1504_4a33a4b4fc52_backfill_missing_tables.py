"""backfill_missing_tables

Многие таблицы (chat_messages, message_reactions, party_polls, poll_options,
poll_votes, party_pinned_blocks, party_attendance, party_recap_*, reports,
audit_log, feature_flags, banned_words, appeals, revoked_tokens,
entity_embeddings, recommendation_impressions, party_meeting_plans,
party_meeting_plan_history, review_reports, push_subscriptions, notifications
и др.) исторически создавались через `Base.metadata.create_all()` в main.py,
минуя миграционную цепочку. На чистой БД `alembic upgrade head` не поднимает
их. Эта миграция делает idempotent backfill:
SQLAlchemy сам проверяет существование каждой таблицы и создаёт только
недостающие — на существующей БД это no-op.

Revision ID: 4a33a4b4fc52
Revises: c73422c72c51
Create Date: 2026-04-20 15:04:51.797787+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '4a33a4b4fc52'
down_revision: Union[str, None] = 'c73422c72c51'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Импортируем все модели для наполнения Base.metadata (env.py их уже грузит,
    # но импорт в функции гарантирует, что metadata актуальна на момент вызова).
    import models.user  # noqa: F401
    import models.event  # noqa: F401
    import models.attendee  # noqa: F401
    import models.party  # noqa: F401
    import models.chat_message  # noqa: F401
    import models.review  # noqa: F401
    import models.notification  # noqa: F401
    import models.kudago_event  # noqa: F401
    import models.party_coordination  # noqa: F401
    import models.push_subscription  # noqa: F401
    import models.message_reaction  # noqa: F401
    import models.party_recap  # noqa: F401
    import models.report  # noqa: F401
    import models.audit_log  # noqa: F401
    import models.feature_flag  # noqa: F401
    import models.banned_word  # noqa: F401
    import models.appeal  # noqa: F401
    import models.token_revocation  # noqa: F401
    from database import Base

    # checkfirst=True — SQLAlchemy пропустит таблицы, которые уже существуют.
    Base.metadata.create_all(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    # Никакого автоматического drop: на живой БД это разрушит данные.
    # Если нужно — делать явные drop_table в отдельной миграции.
    pass
