from datetime import datetime

from models.attendee import EventAttendee
from models.chat_message import ChatMessage
import models.message_reaction  # noqa: F401  # ensure table is created in test metadata


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_event_chat_history_returns_avatar_url_for_message_author(
    client, db, user_a, user_b, token_a
):
    event_id = "314"
    room = f"event_{event_id}"
    avatar_path = f"/uploads/avatars/{user_b.id}.png"

    user_b.avatar_url = avatar_path
    db.add(user_b)
    db.add(EventAttendee(event_id=event_id, user_id=user_a.id, is_looking=True))
    db.add(EventAttendee(event_id=event_id, user_id=user_b.id, is_looking=True))
    db.add(
        ChatMessage(
            room=room,
            user_id=user_b.id,
            username=user_b.username,
            message="hello with avatar",
            timestamp=datetime.utcnow(),
        )
    )
    db.commit()

    resp = client.get(f"/messages/{room}", headers=_auth(token_a))
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["messages"]
    assert payload["messages"][0]["avatarUrl"] == avatar_path
