"""TDD: RED-тест для composite index (message_id, user_id) в MessageReaction."""
from sqlalchemy import text
from models.message_reaction import MessageReaction


class TestMessageReactionIndex:
    """RED: composite index (message_id, user_id) должен существовать."""

    def test_composite_index_message_user_exists(self, db):
        """Проверяем, что индекс ix_message_reactions_message_user определён в модели."""
        index_names = {idx.name for idx in MessageReaction.__table__.indexes}
        assert "ix_message_reactions_message_user" in index_names, (
            f"Expected index 'ix_message_reactions_message_user', found: {index_names}"
        )

    def test_message_reaction_query_uses_index(self, db):
        """Проверяем через EXPLAIN, что запрос по message_id использует индекс."""
        # Создаём тестовые данные
        for i in range(100):
            reaction = MessageReaction(
                message_id=1,
                room="test",
                user_id=i,
                emoji="👍",
            )
            db.add(reaction)
        db.commit()

        result = db.execute(text(
            "EXPLAIN QUERY PLAN SELECT * FROM message_reactions WHERE message_id = 1"
        ))
        plan = str(result.fetchall())
        assert "INDEX" in plan.upper() or "USING INDEX" in plan.upper(), (
            f"Expected index usage in query plan, got: {plan}"
        )
