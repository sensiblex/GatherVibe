"""
Tests for Party Recap (event-completion memories) feature.

Lifecycle (computed from event_date_ts):
  planned  : now < event_date_ts
  active   : event_date_ts <= now < event_date_ts + 2h
  ended    : event_date_ts + 2h <= now < event_date_ts + 2h + 48h
  archived : now >= event_date_ts + 2h + 48h

Recap is read/write-able by accepted members only.
Posting is allowed only when lifecycle is `ended` (read-only when archived).
Pinning highlights and setting cover require party creator. Max 5 pinned.
"""
import io
import time
import pytest
from fastapi.testclient import TestClient

from models.party import EventParty, PartyMember
from models.user import User




def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_party(
    db,
    creator_id: int,
    *,
    event_date_ts: int | None = None,
    title: str = "Recap Party",
    max_members: int = 4,
    event_id: str = "event_recap",
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


def _add_member(db, party_id: int, user_id: int, status: str = "accepted"):
    db.add(PartyMember(party_id=party_id, user_id=user_id, status=status))
    db.commit()


def _ts_planned() -> int:
    """Far in the future."""
    return int(time.time()) + 7 * 24 * 3600


def _ts_active() -> int:
    """Started just now."""
    return int(time.time()) - 60


def _ts_ended() -> int:
    """Ended ~5 hours ago — inside 48h recap window."""
    return int(time.time()) - 5 * 3600


def _ts_archived() -> int:
    """Ended ~5 days ago — past the 48h recap window."""
    return int(time.time()) - 5 * 24 * 3600




@pytest.fixture
def user_c(db):
    from auth import hash_password
    u = User(username="user_c", email="c@test.com",
            hashed_password=hash_password("password123"))
    db.add(u); db.commit(); db.refresh(u)
    return u


@pytest.fixture
def token_c(user_c):
    from jwt_handler import create_access_token
    from datetime import timedelta
    return create_access_token(
        data={"sub": user_c.email, "id": user_c.id, "username": user_c.username},
        expires_delta=timedelta(minutes=60),
    )




def test_lifecycle_status_planned(client: TestClient, db, user_a, token_a):
    party = _make_party(db, user_a.id, event_date_ts=_ts_planned())
    r = client.get(f"/parties/{party.id}/recap", headers=_auth(token_a))
    assert r.status_code == 200, r.text
    assert r.json()["lifecycle_status"] == "planned"


def test_lifecycle_status_active(client: TestClient, db, user_a, token_a):
    party = _make_party(db, user_a.id, event_date_ts=_ts_active())
    r = client.get(f"/parties/{party.id}/recap", headers=_auth(token_a))
    assert r.status_code == 200
    assert r.json()["lifecycle_status"] == "active"


def test_lifecycle_status_ended(client: TestClient, db, user_a, token_a):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    r = client.get(f"/parties/{party.id}/recap", headers=_auth(token_a))
    assert r.status_code == 200
    assert r.json()["lifecycle_status"] == "ended"


def test_lifecycle_status_archived(client: TestClient, db, user_a, token_a):
    party = _make_party(db, user_a.id, event_date_ts=_ts_archived())
    r = client.get(f"/parties/{party.id}/recap", headers=_auth(token_a))
    assert r.status_code == 200
    assert r.json()["lifecycle_status"] == "archived"




def test_recap_auto_created_on_first_get(client: TestClient, db, user_a, token_a):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    r = client.get(f"/parties/{party.id}/recap", headers=_auth(token_a))
    assert r.status_code == 200
    body = r.json()
    assert body["party_id"] == party.id
    assert body["items"] == []
    assert body["highlights"] == []
    assert body["cover_url"] is None




def test_non_member_cannot_view_recap(client: TestClient, db, user_a, user_b, token_b):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    r = client.get(f"/parties/{party.id}/recap", headers=_auth(token_b))
    assert r.status_code == 403


def test_pending_member_cannot_view_recap(client: TestClient, db, user_a, user_b, token_b):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    _add_member(db, party.id, user_b.id, status="pending")
    r = client.get(f"/parties/{party.id}/recap", headers=_auth(token_b))
    assert r.status_code == 403


def test_accepted_member_can_view_recap(client: TestClient, db, user_a, user_b, token_b):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    _add_member(db, party.id, user_b.id, status="accepted")
    r = client.get(f"/parties/{party.id}/recap", headers=_auth(token_b))
    assert r.status_code == 200




def test_non_member_cannot_post_item(client: TestClient, db, user_a, user_b, token_b):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    r = client.post(
        f"/parties/{party.id}/recap/items",
        json={"kind": "note", "caption": "Было круто!"},
        headers=_auth(token_b),
    )
    assert r.status_code == 403


def test_accepted_member_can_post_note(client: TestClient, db, user_a, user_b, token_b):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    _add_member(db, party.id, user_b.id, status="accepted")
    r = client.post(
        f"/parties/{party.id}/recap/items",
        json={"kind": "note", "caption": "Было круто!"},
        headers=_auth(token_b),
    )
    assert r.status_code == 200, r.text
    item = r.json()
    assert item["kind"] == "note"
    assert item["caption"] == "Было круто!"
    assert item["author_id"] == user_b.id
    assert item["is_pinned_highlight"] is False


def test_post_blocked_when_planned(client: TestClient, db, user_a, token_a):
    party = _make_party(db, user_a.id, event_date_ts=_ts_planned())
    r = client.post(
        f"/parties/{party.id}/recap/items",
        json={"kind": "note", "caption": "слишком рано"},
        headers=_auth(token_a),
    )
    assert r.status_code == 400


def test_post_blocked_when_archived(client: TestClient, db, user_a, token_a):
    party = _make_party(db, user_a.id, event_date_ts=_ts_archived())
    r = client.post(
        f"/parties/{party.id}/recap/items",
        json={"kind": "note", "caption": "опоздал"},
        headers=_auth(token_a),
    )
    assert r.status_code == 400


def test_caption_too_long_rejected(client: TestClient, db, user_a, token_a):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    r = client.post(
        f"/parties/{party.id}/recap/items",
        json={"kind": "note", "caption": "x" * 501},
        headers=_auth(token_a),
    )
    assert r.status_code == 422




def test_photo_upload_creates_item(client: TestClient, db, user_a, token_a):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    files = {"file": ("photo.jpg", io.BytesIO(b"\xff\xd8\xff\xe0fake"), "image/jpeg")}
    r = client.post(
        f"/parties/{party.id}/recap/photo",
        files=files,
        data={"caption": "selfie"},
        headers=_auth(token_a),
    )
    assert r.status_code == 200, r.text
    item = r.json()
    assert item["kind"] == "photo"
    assert item["media_url"] is not None
    assert item["media_url"].startswith("/uploads/")
    assert item["caption"] == "selfie"




def test_recap_lists_items_chronologically(client: TestClient, db, user_a, user_b, token_a, token_b):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    _add_member(db, party.id, user_b.id, status="accepted")

    client.post(f"/parties/{party.id}/recap/items",
                json={"kind": "note", "caption": "first"}, headers=_auth(token_a))
    client.post(f"/parties/{party.id}/recap/items",
                json={"kind": "note", "caption": "second"}, headers=_auth(token_b))

    r = client.get(f"/parties/{party.id}/recap", headers=_auth(token_a))
    items = r.json()["items"]
    assert len(items) == 2
    captions = [i["caption"] for i in items]
    assert "first" in captions and "second" in captions




def test_creator_can_pin_highlight(client: TestClient, db, user_a, token_a):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    create = client.post(f"/parties/{party.id}/recap/items",
                         json={"kind": "note", "caption": "★"}, headers=_auth(token_a))
    item_id = create.json()["id"]

    r = client.post(f"/parties/{party.id}/recap/items/{item_id}/pin",
                    headers=_auth(token_a))
    assert r.status_code == 200, r.text
    assert r.json()["is_pinned_highlight"] is True

    listing = client.get(f"/parties/{party.id}/recap", headers=_auth(token_a)).json()
    assert len(listing["highlights"]) == 1
    assert listing["highlights"][0]["id"] == item_id


def test_non_creator_cannot_pin(client: TestClient, db, user_a, user_b, token_a, token_b):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    _add_member(db, party.id, user_b.id, status="accepted")
    create = client.post(f"/parties/{party.id}/recap/items",
                         json={"kind": "note", "caption": "x"}, headers=_auth(token_b))
    item_id = create.json()["id"]

    r = client.post(f"/parties/{party.id}/recap/items/{item_id}/pin",
                    headers=_auth(token_b))
    assert r.status_code == 403


def test_pin_limit_is_5(client: TestClient, db, user_a, token_a):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    item_ids = []
    for i in range(6):
        r = client.post(f"/parties/{party.id}/recap/items",
                        json={"kind": "note", "caption": f"n{i}"}, headers=_auth(token_a))
        item_ids.append(r.json()["id"])

    for iid in item_ids[:5]:
        r = client.post(f"/parties/{party.id}/recap/items/{iid}/pin",
                        headers=_auth(token_a))
        assert r.status_code == 200, r.text

    r = client.post(f"/parties/{party.id}/recap/items/{item_ids[5]}/pin",
                    headers=_auth(token_a))
    assert r.status_code == 400




def test_creator_can_set_cover(client: TestClient, db, user_a, token_a):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    r = client.patch(f"/parties/{party.id}/recap/cover",
                     json={"cover_url": "/uploads/recap/cover.jpg"},
                     headers=_auth(token_a))
    assert r.status_code == 200, r.text
    assert r.json()["cover_url"] == "/uploads/recap/cover.jpg"


def test_non_creator_cannot_set_cover(client: TestClient, db, user_a, user_b, token_b):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    _add_member(db, party.id, user_b.id, status="accepted")
    r = client.patch(f"/parties/{party.id}/recap/cover",
                     json={"cover_url": "/uploads/recap/cover.jpg"},
                     headers=_auth(token_b))
    assert r.status_code == 403




def test_author_can_delete_own_item(client: TestClient, db, user_a, user_b, token_b):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    _add_member(db, party.id, user_b.id, status="accepted")
    create = client.post(f"/parties/{party.id}/recap/items",
                         json={"kind": "note", "caption": "x"}, headers=_auth(token_b))
    item_id = create.json()["id"]

    r = client.delete(f"/parties/{party.id}/recap/items/{item_id}",
                      headers=_auth(token_b))
    assert r.status_code == 200


def test_creator_can_delete_any_item(client: TestClient, db, user_a, user_b, token_a, token_b):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    _add_member(db, party.id, user_b.id, status="accepted")
    create = client.post(f"/parties/{party.id}/recap/items",
                         json={"kind": "note", "caption": "x"}, headers=_auth(token_b))
    item_id = create.json()["id"]

    r = client.delete(f"/parties/{party.id}/recap/items/{item_id}",
                      headers=_auth(token_a))
    assert r.status_code == 200


def test_other_member_cannot_delete_item(client: TestClient, db, user_a, user_b, user_c, token_a, token_b, token_c):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    _add_member(db, party.id, user_b.id, status="accepted")
    _add_member(db, party.id, user_c.id, status="accepted")
    create = client.post(f"/parties/{party.id}/recap/items",
                         json={"kind": "note", "caption": "x"}, headers=_auth(token_b))
    item_id = create.json()["id"]

    r = client.delete(f"/parties/{party.id}/recap/items/{item_id}",
                      headers=_auth(token_c))
    assert r.status_code == 403




def test_react_increments_count(client: TestClient, db, user_a, user_b, token_a, token_b):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    _add_member(db, party.id, user_b.id, status="accepted")
    create = client.post(f"/parties/{party.id}/recap/items",
                         json={"kind": "note", "caption": "x"}, headers=_auth(token_a))
    item_id = create.json()["id"]

    r = client.post(f"/parties/{party.id}/recap/items/{item_id}/react",
                    json={"emoji": "🔥"}, headers=_auth(token_b))
    assert r.status_code == 200, r.text

    listing = client.get(f"/parties/{party.id}/recap", headers=_auth(token_a)).json()
    item = next(i for i in listing["items"] if i["id"] == item_id)
    reactions = item["reactions"]
    assert reactions.get("🔥") == 1


def test_react_idempotent_per_user_emoji(client: TestClient, db, user_a, user_b, token_a, token_b):
    party = _make_party(db, user_a.id, event_date_ts=_ts_ended())
    _add_member(db, party.id, user_b.id, status="accepted")
    create = client.post(f"/parties/{party.id}/recap/items",
                         json={"kind": "note", "caption": "x"}, headers=_auth(token_a))
    item_id = create.json()["id"]

    client.post(f"/parties/{party.id}/recap/items/{item_id}/react",
                json={"emoji": "🔥"}, headers=_auth(token_b))
    client.post(f"/parties/{party.id}/recap/items/{item_id}/react",
                json={"emoji": "🔥"}, headers=_auth(token_b))

    listing = client.get(f"/parties/{party.id}/recap", headers=_auth(token_a)).json()
    item = next(i for i in listing["items"] if i["id"] == item_id)
    assert item["reactions"].get("🔥") == 1
