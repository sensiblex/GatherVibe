"""
Tests for party attendance status updates.
"""
from fastapi.testclient import TestClient

from models.chat_message import ChatMessage
from models.party import EventParty
from models.party_coordination import PartyAttendance  # noqa: F401


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_party(db, creator_id: int) -> EventParty:
    party = EventParty(
        event_id="event_attendance_1",
        title="Attendance Party",
        description="desc",
        max_members=4,
        creator_id=creator_id,
        is_open=True,
    )
    db.add(party)
    db.commit()
    db.refresh(party)
    return party


def test_attendance_change_is_rate_limited_for_60_seconds(
    client: TestClient,
    db,
    user_a,
    token_a,
):
    """Second status change within 60 seconds is rejected with 429."""
    party = _make_party(db, user_a.id)

    r1 = client.patch(
        f"/parties/{party.id}/attendance/me",
        json={"status": "going"},
        headers=_auth_headers(token_a),
    )
    assert r1.status_code == 200, r1.text

    r2 = client.patch(
        f"/parties/{party.id}/attendance/me",
        json={"status": "late"},
        headers=_auth_headers(token_a),
    )
    assert r2.status_code == 429
    assert "подождите" in r2.text.lower()

    attendance = (
        db.query(PartyAttendance)
        .filter(
            PartyAttendance.party_id == party.id,
            PartyAttendance.user_id == user_a.id,
        )
        .first()
    )
    assert attendance is not None
    assert attendance.status == "going"

    messages = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.room == f"party_{party.id}",
            ChatMessage.event_type == "attendance_changed",
        )
        .order_by(ChatMessage.id.asc())
        .all()
    )

    assert len(messages) == 1
    assert "идёт" in messages[0].message
