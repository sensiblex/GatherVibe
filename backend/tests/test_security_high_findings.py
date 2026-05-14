"""Failing security regression tests for confirmed high-severity issues.

These tests intentionally encode the expected secure behavior and should fail
on the current implementation until production code is fixed.
"""

from datetime import datetime
import time

from models.attendee import EventAttendee
from models.chat_message import ChatMessage
import models.message_reaction  # noqa: F401  # ensure table is created in test metadata


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_event_chat_history_requires_event_attendance(client, db, user_b, token_a):
    """A non-attendee must not be able to read another event chat history."""
    event_id = "42"
    room = f"event_{event_id}"

    # User B is an attendee and wrote a message in this event chat.
    db.add(EventAttendee(event_id=event_id, user_id=user_b.id, is_looking=True))
    db.add(
        ChatMessage(
            room=room,
            user_id=str(user_b.id),
            username=user_b.username,
            message="private event chat message",
            timestamp=datetime.utcnow(),
        )
    )
    db.commit()

    # User A is not an attendee but currently can still read the room.
    resp = client.get(f"/messages/{room}", headers=_auth(token_a))
    assert resp.status_code == 403


def test_upload_chat_rejects_mime_spoofed_image_payload(client, token_a):
    """Server should reject non-image bytes even if client lies with image/* MIME."""
    fake_svg_payload = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"

    resp = client.post(
        "/upload/chat",
        files={"file": ("avatar.jpg", fake_svg_payload, "image/png")},
        headers=_auth(token_a),
    )
    assert resp.status_code == 400


def test_party_message_file_url_rejects_untrusted_https_domain():
    import main

    assert main.is_allowed_party_file_url("/uploads/chat/safe.png")
    assert main.is_allowed_party_file_url("https://localhost/uploads/chat/safe.png")
    assert not main.is_allowed_party_file_url("https://evil.com/uploads/malicious.js")


def test_global_request_size_limit_rejects_too_large_body(client):
    import main

    original_limit = getattr(main.app.state, "max_request_size_bytes", None)
    main.app.state.max_request_size_bytes = 16
    try:
        resp = client.post("/health", content=b"x" * 17)
    finally:
        if original_limit is None:
            delattr(main.app.state, "max_request_size_bytes")
        else:
            main.app.state.max_request_size_bytes = original_limit

    assert resp.status_code == 413


def test_access_token_lifetime_is_not_longer_than_two_hours(user_a):
    from auth import create_user_token
    from jwt_handler import verify_token

    token_payload = create_user_token(user_a)
    claims = verify_token(token_payload["access_token"])
    assert claims is not None

    lifetime_seconds = int(claims["exp"] - time.time())
    assert lifetime_seconds <= 2 * 60 * 60 + 10
