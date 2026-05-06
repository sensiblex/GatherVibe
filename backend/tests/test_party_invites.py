"""
Tests for creator→user invite flow (bidirectional party feature).

Uses the shared in-memory SQLite DB from conftest.py.
"""
import time
import pytest
from fastapi.testclient import TestClient

from models.attendee import EventAttendee
from models.party import EventParty, PartyMember
from models.user import User




def _make_party(
    db,
    creator_id: int,
    title: str = "Test Party",
    max_members: int = 4,
    event_id: str = "event_1",
    event_date_ts: int | None = None,
) -> EventParty:
    party = EventParty(
        event_id=event_id,
        title=title,
        description="desc",
        max_members=max_members,
        creator_id=creator_id,
        is_open=True,
        event_date_ts=event_date_ts,
    )
    db.add(party)
    db.commit()
    db.refresh(party)
    return party


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _mark_attending(db, event_id: str, user_id: int) -> None:
    db.add(EventAttendee(event_id=event_id, user_id=user_id))
    db.commit()


@pytest.fixture
def user_c(db):
    from auth import hash_password
    u = User(
        username="user_c",
        email="c@test.com",
        hashed_password=hash_password("password123"),
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture
def token_c(user_c):
    from jwt_handler import create_access_token
    from datetime import timedelta
    return create_access_token(
        data={"sub": user_c.email, "id": user_c.id, "username": user_c.username},
        expires_delta=timedelta(minutes=60),
    )




def test_invite_success(client: TestClient, db, user_a, user_b, token_a):
    party = _make_party(db, user_a.id)
    _mark_attending(db, party.event_id, user_b.id)

    resp = client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_b.id, "message": "Присоединяйся!"},
        headers=_auth_headers(token_a),
    )
    assert resp.status_code == 200, resp.text

    member = db.query(PartyMember).filter(
        PartyMember.party_id == party.id,
        PartyMember.user_id == user_b.id,
    ).first()
    assert member is not None
    assert member.status == "invited"
    assert member.invited_by_user_id == user_a.id
    assert member.invite_message == "Присоединяйся!"


def test_invite_non_creator_forbidden(client: TestClient, db, user_a, user_b, token_b):
    party = _make_party(db, user_a.id)

    resp = client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_a.id},
        headers=_auth_headers(token_b),
    )
    assert resp.status_code == 403


def test_invite_self_forbidden(client: TestClient, db, user_a, token_a):
    party = _make_party(db, user_a.id)

    resp = client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_a.id},
        headers=_auth_headers(token_a),
    )
    assert resp.status_code == 400


def test_invite_already_member_forbidden(client: TestClient, db, user_a, user_b, token_a):
    party = _make_party(db, user_a.id)
    db.add(PartyMember(party_id=party.id, user_id=user_b.id, status="accepted"))
    db.commit()

    resp = client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_b.id},
        headers=_auth_headers(token_a),
    )
    assert resp.status_code == 400


def test_invite_already_invited_forbidden(client: TestClient, db, user_a, user_b, token_a):
    party = _make_party(db, user_a.id)
    _mark_attending(db, party.event_id, user_b.id)

    r1 = client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_b.id},
        headers=_auth_headers(token_a),
    )
    assert r1.status_code == 200

    r2 = client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_b.id},
        headers=_auth_headers(token_a),
    )
    assert r2.status_code == 400


def test_invite_party_full_forbidden(client: TestClient, db, user_a, user_b, user_c, token_a):
    party = _make_party(db, user_a.id, max_members=2)
    db.add(PartyMember(party_id=party.id, user_id=user_b.id, status="accepted"))
    db.commit()
    _mark_attending(db, party.event_id, user_c.id)

    resp = client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_c.id},
        headers=_auth_headers(token_a),
    )
    assert resp.status_code == 400


def test_invite_closed_party_forbidden(client: TestClient, db, user_a, user_b, token_a):
    party = _make_party(db, user_a.id)
    party.is_open = False
    db.commit()

    resp = client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_b.id},
        headers=_auth_headers(token_a),
    )
    assert resp.status_code == 400




def test_accept_invite_success(client: TestClient, db, user_a, user_b, token_a, token_b):
    party = _make_party(db, user_a.id)
    _mark_attending(db, party.event_id, user_b.id)
    client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_b.id},
        headers=_auth_headers(token_a),
    )
    invite = db.query(PartyMember).filter(
        PartyMember.party_id == party.id, PartyMember.user_id == user_b.id,
    ).first()

    resp = client.post(
        f"/parties/{party.id}/invites/{invite.id}/accept",
        headers=_auth_headers(token_b),
    )
    assert resp.status_code == 200, resp.text

    db.refresh(invite)
    assert invite.status == "accepted"


def test_accept_wrong_user_forbidden(client: TestClient, db, user_a, user_b, user_c, token_a, token_c):
    party = _make_party(db, user_a.id)
    _mark_attending(db, party.event_id, user_b.id)
    client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_b.id},
        headers=_auth_headers(token_a),
    )
    invite = db.query(PartyMember).filter(
        PartyMember.party_id == party.id, PartyMember.user_id == user_b.id,
    ).first()

    resp = client.post(
        f"/parties/{party.id}/invites/{invite.id}/accept",
        headers=_auth_headers(token_c),
    )
    assert resp.status_code == 403


def test_accept_closes_party_at_capacity(client: TestClient, db, user_a, user_b, token_a, token_b):
    party = _make_party(db, user_a.id, max_members=2)
    _mark_attending(db, party.event_id, user_b.id)
    client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_b.id},
        headers=_auth_headers(token_a),
    )
    invite = db.query(PartyMember).filter(
        PartyMember.party_id == party.id, PartyMember.user_id == user_b.id,
    ).first()

    resp = client.post(
        f"/parties/{party.id}/invites/{invite.id}/accept",
        headers=_auth_headers(token_b),
    )
    assert resp.status_code == 200

    db.refresh(party)
    assert party.is_open is False




def test_decline_invite_success(client: TestClient, db, user_a, user_b, token_a, token_b):
    party = _make_party(db, user_a.id)
    _mark_attending(db, party.event_id, user_b.id)
    client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_b.id},
        headers=_auth_headers(token_a),
    )
    invite = db.query(PartyMember).filter(
        PartyMember.party_id == party.id, PartyMember.user_id == user_b.id,
    ).first()

    resp = client.post(
        f"/parties/{party.id}/invites/{invite.id}/decline",
        headers=_auth_headers(token_b),
    )
    assert resp.status_code == 200

    db.refresh(invite)
    assert invite.status == "declined"




def test_cancel_invite_success(client: TestClient, db, user_a, user_b, token_a):
    party = _make_party(db, user_a.id)
    _mark_attending(db, party.event_id, user_b.id)
    client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_b.id},
        headers=_auth_headers(token_a),
    )
    invite = db.query(PartyMember).filter(
        PartyMember.party_id == party.id, PartyMember.user_id == user_b.id,
    ).first()

    resp = client.delete(
        f"/parties/{party.id}/invites/{invite.id}",
        headers=_auth_headers(token_a),
    )
    assert resp.status_code == 200

    gone = db.query(PartyMember).filter(PartyMember.id == invite.id).first()
    assert gone is None


def test_cancel_non_creator_forbidden(client: TestClient, db, user_a, user_b, user_c, token_a, token_c):
    party = _make_party(db, user_a.id)
    _mark_attending(db, party.event_id, user_b.id)
    client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_b.id},
        headers=_auth_headers(token_a),
    )
    invite = db.query(PartyMember).filter(
        PartyMember.party_id == party.id, PartyMember.user_id == user_b.id,
    ).first()

    resp = client.delete(
        f"/parties/{party.id}/invites/{invite.id}",
        headers=_auth_headers(token_c),
    )
    assert resp.status_code == 403




def test_list_my_invites(client: TestClient, db, user_a, user_b, token_a, token_b):
    party1 = _make_party(db, user_a.id, title="Party One", event_id="e1")
    party2 = _make_party(db, user_a.id, title="Party Two", event_id="e2")
    _mark_attending(db, party1.event_id, user_b.id)
    _mark_attending(db, party2.event_id, user_b.id)
    client.post(
        f"/parties/{party1.id}/invite",
        json={"user_id": user_b.id, "message": "Join p1"},
        headers=_auth_headers(token_a),
    )
    client.post(
        f"/parties/{party2.id}/invite",
        json={"user_id": user_b.id, "message": "Join p2"},
        headers=_auth_headers(token_a),
    )

    resp = client.get("/users/me/party-invites", headers=_auth_headers(token_b))
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 2
    titles = {i["party_title"] for i in items}
    assert titles == {"Party One", "Party Two"}
    assert all(i["creator_username"] == "user_a" for i in items)


def test_list_my_invites_excludes_non_invited(client: TestClient, db, user_a, user_b, token_a, token_b):
    party = _make_party(db, user_a.id)
    _mark_attending(db, party.event_id, user_b.id)
    client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_b.id},
        headers=_auth_headers(token_a),
    )
    invite = db.query(PartyMember).filter(
        PartyMember.party_id == party.id, PartyMember.user_id == user_b.id,
    ).first()
    client.post(
        f"/parties/{party.id}/invites/{invite.id}/decline",
        headers=_auth_headers(token_b),
    )

    resp = client.get("/users/me/party-invites", headers=_auth_headers(token_b))
    assert resp.status_code == 200
    assert resp.json() == []


def test_invite_requires_attendee_for_same_event(client: TestClient, db, user_a, user_b, token_a):
    party = _make_party(db, user_a.id, event_id="event_42")

    resp = client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_b.id},
        headers=_auth_headers(token_a),
    )
    assert resp.status_code == 400
    assert "не отметился" in resp.text.lower()


def test_invite_attendee_of_same_event_success(client: TestClient, db, user_a, user_b, token_a):
    party = _make_party(db, user_a.id, event_id="event_42")
    _mark_attending(db, "event_42", user_b.id)

    resp = client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_b.id},
        headers=_auth_headers(token_a),
    )
    assert resp.status_code == 200, resp.text




def test_expire_invites_before_event(db, user_a, user_b):
    """Helper function expires invited rows where event_date_ts - now < 24h."""
    from routers.parties import expire_pending_invites

    soon_ts = int(time.time()) + 12 * 3600
    party_soon = _make_party(db, user_a.id, title="Soon", event_date_ts=soon_ts, event_id="es")
    later_ts = int(time.time()) + 48 * 3600
    party_later = _make_party(db, user_a.id, title="Later", event_date_ts=later_ts, event_id="el")

    m_soon = PartyMember(
        party_id=party_soon.id, user_id=user_b.id,
        status="invited", invited_by_user_id=user_a.id,
    )
    m_later = PartyMember(
        party_id=party_later.id, user_id=user_b.id,
        status="invited", invited_by_user_id=user_a.id,
    )
    db.add_all([m_soon, m_later])
    db.commit()

    expired_ids = expire_pending_invites(db)
    db.commit()

    db.refresh(m_soon)
    db.refresh(m_later)
    assert m_soon.status == "declined"
    assert m_later.status == "invited"
    assert m_soon.id in expired_ids




def test_accept_sends_push_to_creator(
    client: TestClient, db, user_a, user_b, token_a, token_b, monkeypatch
):
    calls = []

    def fake_push(db, user_id, title, body, data=None):
        calls.append({"user_id": user_id, "title": title, "body": body, "data": data})

    import push_helpers
    monkeypatch.setattr(push_helpers, "send_push_to_user", fake_push)

    party = _make_party(db, user_a.id)
    _mark_attending(db, party.event_id, user_b.id)
    client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_b.id},
        headers=_auth_headers(token_a),
    )
    invite = db.query(PartyMember).filter(
        PartyMember.party_id == party.id, PartyMember.user_id == user_b.id,
    ).first()

    resp = client.post(
        f"/parties/{party.id}/invites/{invite.id}/accept",
        headers=_auth_headers(token_b),
    )
    assert resp.status_code == 200
    push_to_creator = [c for c in calls if c["user_id"] == user_a.id]
    assert len(push_to_creator) == 1, f"expected 1 push to creator, got {calls}"
    assert push_to_creator[0]["data"]["type"] == "party_invite_response"
    assert push_to_creator[0]["data"]["status"] == "accepted"
    assert push_to_creator[0]["data"]["party_id"] == party.id
    assert "принял" in push_to_creator[0]["body"].lower() or user_b.username in push_to_creator[0]["body"]


def test_decline_sends_push_to_creator(
    client: TestClient, db, user_a, user_b, token_a, token_b, monkeypatch
):
    calls = []

    def fake_push(db, user_id, title, body, data=None):
        calls.append({"user_id": user_id, "title": title, "body": body, "data": data})

    import push_helpers
    monkeypatch.setattr(push_helpers, "send_push_to_user", fake_push)

    party = _make_party(db, user_a.id)
    _mark_attending(db, party.event_id, user_b.id)
    client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_b.id},
        headers=_auth_headers(token_a),
    )
    invite = db.query(PartyMember).filter(
        PartyMember.party_id == party.id, PartyMember.user_id == user_b.id,
    ).first()

    resp = client.post(
        f"/parties/{party.id}/invites/{invite.id}/decline",
        headers=_auth_headers(token_b),
    )
    assert resp.status_code == 200
    push_to_creator = [c for c in calls if c["user_id"] == user_a.id]
    assert len(push_to_creator) == 1
    assert push_to_creator[0]["data"]["type"] == "party_invite_response"
    assert push_to_creator[0]["data"]["status"] == "declined"




def test_party_deleted_notifies_invited_members(
    client: TestClient, db, user_a, user_b, user_c, token_a,
):
    from models.notification import Notification
    party = _make_party(db, user_a.id, title="Going to delete")
    _mark_attending(db, party.event_id, user_b.id)

    client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_b.id, "message": "Will be deleted"},
        headers=_auth_headers(token_a),
    )
    db.add(PartyMember(party_id=party.id, user_id=user_c.id, status="pending"))
    db.commit()

    resp = client.delete(
        f"/parties/{party.id}",
        headers=_auth_headers(token_a),
    )
    assert resp.status_code == 200

    notifs_b = db.query(Notification).filter(
        Notification.user_id == user_b.id,
        Notification.type == "party_deleted_for_user",
    ).all()
    notifs_c = db.query(Notification).filter(
        Notification.user_id == user_c.id,
        Notification.type == "party_deleted_for_user",
    ).all()
    assert len(notifs_b) == 1, f"bob expected 1 notif, got {[n.type for n in notifs_b]}"
    assert len(notifs_c) == 1
    assert "Going to delete" in notifs_b[0].body

    assert db.query(EventParty).filter(EventParty.id == party.id).first() is None
    assert db.query(PartyMember).filter(PartyMember.party_id == party.id).count() == 0


def test_party_deleted_does_not_notify_creator(
    client: TestClient, db, user_a, user_b, token_a,
):
    from models.notification import Notification
    party = _make_party(db, user_a.id, title="Solo delete")

    resp = client.delete(
        f"/parties/{party.id}",
        headers=_auth_headers(token_a),
    )
    assert resp.status_code == 200
    creator_notifs = db.query(Notification).filter(
        Notification.user_id == user_a.id,
        Notification.type == "party_deleted_for_user",
    ).all()
    assert len(creator_notifs) == 0




def test_cancel_then_accept_returns_404(
    client: TestClient, db, user_a, user_b, token_a, token_b,
):
    party = _make_party(db, user_a.id)
    _mark_attending(db, party.event_id, user_b.id)
    client.post(
        f"/parties/{party.id}/invite",
        json={"user_id": user_b.id},
        headers=_auth_headers(token_a),
    )
    invite = db.query(PartyMember).filter(
        PartyMember.party_id == party.id, PartyMember.user_id == user_b.id,
    ).first()
    invite_id = invite.id

    cancel = client.delete(
        f"/parties/{party.id}/invites/{invite_id}",
        headers=_auth_headers(token_a),
    )
    assert cancel.status_code == 200

    acc = client.post(
        f"/parties/{party.id}/invites/{invite_id}/accept",
        headers=_auth_headers(token_b),
    )
    assert acc.status_code == 404
