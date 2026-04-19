"""Tests for guest invite-token (shareable magic link).

Flow:
  1. Party creator gets a unique `invite_token` on every party.
  2. GET /parties/by-token/{token} returns a public preview (no auth).
  3. POST /parties/by-token/{token}/join (auth required) joins as accepted.
"""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from models.party import EventParty, PartyMember
from models.user import User


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _stub_push():
    with patch("notification_helpers.send_push_to_user"), \
         patch("push_helpers.send_push_to_user"):
        yield


@pytest.fixture
def user_c(db):
    from auth import hash_password
    u = User(username="user_c", email="c@test.com",
             hashed_password=hash_password("pw"))
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


def _create_party(client: TestClient, token: str, body: dict | None = None) -> dict:
    body = body or {"title": "Test", "max_members": 4}
    r = client.post("/parties/event/event_x", json=body, headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()


# ── Token generation ─────────────────────────────────────────────────────────


def test_party_create_returns_invite_token(client: TestClient, db, user_a, token_a):
    p = _create_party(client, token_a)
    assert "invite_token" in p
    assert isinstance(p["invite_token"], str)
    assert len(p["invite_token"]) >= 16


def test_each_party_gets_unique_token(client: TestClient, db, user_a, token_a):
    p1 = _create_party(client, token_a)
    p2 = _create_party(client, token_a, {"title": "Second", "max_members": 4})
    assert p1["invite_token"] != p2["invite_token"]


def test_existing_party_without_token_gets_one_lazily(client: TestClient, db, user_a, token_a):
    """Parties created before the migration must auto-fill a token on first GET."""
    party = EventParty(
        event_id="legacy", title="Legacy", max_members=4,
        creator_id=user_a.id, is_open=True,
    )
    db.add(party)
    db.commit()
    db.refresh(party)
    # No invite_token set initially
    assert getattr(party, "invite_token", None) in (None, "")

    r = client.get(f"/parties/by-id/{party.id}", headers=_auth(token_a))
    assert r.status_code == 200
    assert r.json()["invite_token"]


# ── Public preview ───────────────────────────────────────────────────────────


def test_get_by_token_public_preview_no_auth(client: TestClient, db, user_a, token_a):
    p = _create_party(client, token_a, {"title": "Bowling", "max_members": 5})
    token = p["invite_token"]

    r = client.get(f"/parties/by-token/{token}")  # NO Authorization header
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["title"] == "Bowling"
    assert body["max_members"] == 5
    assert body["creator_username"] == "user_a"
    assert body["member_count"] >= 1  # at least creator


def test_get_by_token_404_for_unknown(client: TestClient):
    r = client.get("/parties/by-token/does-not-exist-abcdef")
    assert r.status_code == 404


# ── Join via token ───────────────────────────────────────────────────────────


def test_join_by_token_requires_auth(client: TestClient, db, user_a, token_a):
    p = _create_party(client, token_a)
    r = client.post(f"/parties/by-token/{p['invite_token']}/join")
    assert r.status_code in (401, 403)


def test_join_by_token_success_adds_accepted_member(
    client: TestClient, db, user_a, user_b, token_a, token_b,
):
    p = _create_party(client, token_a)
    r = client.post(
        f"/parties/by-token/{p['invite_token']}/join",
        headers=_auth(token_b),
    )
    assert r.status_code == 200, r.text

    member = db.query(PartyMember).filter(
        PartyMember.party_id == p["id"],
        PartyMember.user_id == user_b.id,
    ).first()
    assert member is not None
    assert member.status == "accepted"


def test_join_by_token_idempotent_when_already_member(
    client: TestClient, db, user_a, user_b, token_a, token_b,
):
    p = _create_party(client, token_a)
    r1 = client.post(
        f"/parties/by-token/{p['invite_token']}/join", headers=_auth(token_b)
    )
    assert r1.status_code == 200
    r2 = client.post(
        f"/parties/by-token/{p['invite_token']}/join", headers=_auth(token_b)
    )
    # Already joined → 200 no-op (return current party state)
    assert r2.status_code == 200
    rows = db.query(PartyMember).filter(
        PartyMember.party_id == p["id"],
        PartyMember.user_id == user_b.id,
    ).count()
    assert rows == 1


def test_join_by_token_creator_self_no_op(
    client: TestClient, db, user_a, token_a,
):
    """Creator opening their own link shouldn't create a duplicate row."""
    p = _create_party(client, token_a)
    r = client.post(
        f"/parties/by-token/{p['invite_token']}/join", headers=_auth(token_a)
    )
    assert r.status_code == 200
    rows = db.query(PartyMember).filter(
        PartyMember.party_id == p["id"],
        PartyMember.user_id == user_a.id,
    ).count()
    assert rows == 0  # creator has no PartyMember row


def test_join_by_token_full_party_400(
    client: TestClient, db, user_a, user_b, user_c, token_a, token_b, token_c,
):
    p = _create_party(client, token_a, {"title": "Tiny", "max_members": 2})
    # user_b joins first → fills capacity (creator + 1)
    r1 = client.post(
        f"/parties/by-token/{p['invite_token']}/join", headers=_auth(token_b)
    )
    assert r1.status_code == 200
    # user_c can't join — full
    r2 = client.post(
        f"/parties/by-token/{p['invite_token']}/join", headers=_auth(token_c)
    )
    assert r2.status_code == 400


def test_join_by_token_closed_party_400(
    client: TestClient, db, user_a, user_b, token_a, token_b,
):
    p = _create_party(client, token_a)
    # Manually close the party
    party_row = db.query(EventParty).filter(EventParty.id == p["id"]).first()
    party_row.is_open = False
    db.commit()

    r = client.post(
        f"/parties/by-token/{p['invite_token']}/join", headers=_auth(token_b)
    )
    assert r.status_code == 400


def test_join_by_token_unknown_404(client: TestClient, token_a):
    r = client.post(
        "/parties/by-token/no-such-token/join", headers=_auth(token_a)
    )
    assert r.status_code == 404


def test_join_by_token_notifies_creator(
    client: TestClient, db, user_a, user_b, token_a, token_b, monkeypatch,
):
    """Creator gets a push when somebody joins via the link."""
    calls = []

    def fake_push(db, user_id, title, body, data=None):
        calls.append({"user_id": user_id, "title": title, "data": data})

    import push_helpers
    monkeypatch.setattr(push_helpers, "send_push_to_user", fake_push)

    p = _create_party(client, token_a)
    r = client.post(
        f"/parties/by-token/{p['invite_token']}/join", headers=_auth(token_b)
    )
    assert r.status_code == 200
    creator_pushes = [c for c in calls if c["user_id"] == user_a.id]
    assert len(creator_pushes) >= 1
