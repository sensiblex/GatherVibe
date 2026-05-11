"""
Tests for GET /parties/search endpoint.

Uses the shared in-memory SQLite DB from conftest.py.
"""
import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient

from models.party import EventParty, PartyMember




def _make_party(
    db,
    creator_id: int,
    title: str = "Test Party",
    description: str = "A fun group",
    max_members: int = 4,
    city: str | None = None,
    created_at: datetime | None = None,
    event_id: str = "event_1",
    event_date_ts: int | None = None,
) -> EventParty:
    party = EventParty(
        event_id=event_id,
        title=title,
        description=description,
        max_members=max_members,
        creator_id=creator_id,
        is_open=True,
        city=city,
        event_date_ts=event_date_ts,
    )
    if created_at is not None:
        party.created_at = created_at
    db.add(party)
    db.commit()
    db.refresh(party)
    return party


def _accept_member(db, party_id: int, user_id: int) -> PartyMember:
    m = PartyMember(party_id=party_id, user_id=user_id, status="accepted")
    db.add(m)
    db.commit()
    return m


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}




def test_search_by_title(client: TestClient, db, user_a, user_b, token_a):
    _make_party(db, user_a.id, title="Hiking in the mountains")
    _make_party(db, user_b.id, title="City sightseeing tour")

    resp = client.get("/parties/search?q=hiking", headers=_auth_headers(token_a))
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["title"] == "Hiking in the mountains"


def test_search_by_description(client: TestClient, db, user_a, token_a):
    _make_party(db, user_a.id, title="Weekend trip", description="yoga and meditation retreat")
    _make_party(db, user_a.id, title="Another trip", description="just hanging out")

    resp = client.get("/parties/search?q=yoga", headers=_auth_headers(token_a))
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert "yoga" in data["items"][0]["description"]


def test_filter_by_city(client: TestClient, db, user_a, user_b, token_a):
    _make_party(db, user_a.id, title="Moscow meetup", city="Moscow")
    _make_party(db, user_b.id, title="SPb walk", city="Saint Petersburg")

    resp = client.get("/parties/search?city=Moscow", headers=_auth_headers(token_a))
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["city"] == "Moscow"


def test_filter_by_multiple_cities(client: TestClient, db, user_a, user_b, token_a):
    _make_party(db, user_a.id, title="Moscow meetup", city="Москва")
    _make_party(db, user_b.id, title="Kazan walk", city="Казань")
    _make_party(db, user_b.id, title="SPb walk", city="Санкт-Петербург")

    resp = client.get(
        "/parties/search?city=Москва&city=Казань",
        headers=_auth_headers(token_a),
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert {item["title"] for item in data["items"]} == {"Moscow meetup", "Kazan walk"}


def test_filter_by_date_range(client: TestClient, db, user_a, token_a):
    now = datetime.utcnow()
    _make_party(
        db,
        user_a.id,
        title="Past party",
        created_at=now - timedelta(days=1),
        event_date_ts=int((now - timedelta(days=10)).timestamp()),
        event_id="event_past_old",
    )
    _make_party(
        db,
        user_a.id,
        title="Recent party",
        created_at=now + timedelta(days=5),
        event_date_ts=int((now - timedelta(days=1)).timestamp()),
        event_id="event_recent",
    )
    _make_party(
        db,
        user_a.id,
        title="Future party",
        created_at=now - timedelta(days=10),
        event_date_ts=int((now + timedelta(days=5)).timestamp()),
        event_id="event_future_new",
    )

    date_from = (now - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%S")
    date_to = (now + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S")
    resp = client.get(
        f"/parties/search?date_from={date_from}&date_to={date_to}",
        headers=_auth_headers(token_a),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["title"] == "Recent party"


def test_pagination(client: TestClient, db, user_a, token_a):
    for i in range(5):
        _make_party(db, user_a.id, title=f"Party {i}")

    resp = client.get("/parties/search?page=1&per_page=2", headers=_auth_headers(token_a))
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 5
    assert data["pages"] == 3
    assert len(data["items"]) == 2
    assert data["page"] == 1

    resp2 = client.get("/parties/search?page=3&per_page=2", headers=_auth_headers(token_a))
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert len(data2["items"]) == 1


def test_sort_by_popular(client: TestClient, db, user_a, user_b, token_a):
    lonely = _make_party(db, user_a.id, title="Lonely party")
    popular = _make_party(db, user_a.id, title="Popular party")
    _accept_member(db, popular.id, user_b.id)

    resp = client.get("/parties/search?sort_by=popular", headers=_auth_headers(token_a))
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 2
    assert items[0]["title"] == "Popular party"
    assert items[0]["member_count"] == 1
    assert items[1]["title"] == "Lonely party"
    assert items[1]["member_count"] == 0


def test_sort_by_new(client: TestClient, db, user_a, token_a):
    now = datetime.utcnow()
    _make_party(db, user_a.id, title="Old", created_at=now - timedelta(days=5))
    _make_party(db, user_a.id, title="New", created_at=now - timedelta(days=1))

    resp = client.get("/parties/search?sort_by=new", headers=_auth_headers(token_a))
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert items[0]["title"] == "New"


def test_empty_result(client: TestClient, db, user_a, token_a):
    _make_party(db, user_a.id, title="Real party")

    resp = client.get("/parties/search?q=nonexistent_xyz", headers=_auth_headers(token_a))
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []
    assert data["pages"] == 0


def test_empty_q_returns_all(client: TestClient, db, user_a, token_a):
    _make_party(db, user_a.id, title="Alpha")
    _make_party(db, user_a.id, title="Beta")

    resp = client.get("/parties/search?q=", headers=_auth_headers(token_a))
    assert resp.status_code == 200
    assert resp.json()["total"] == 2


def test_requires_auth(client: TestClient, db, user_a):
    _make_party(db, user_a.id, title="Party")

    resp = client.get("/parties/search")
    assert resp.status_code in (401, 403, 422)


def test_per_page_max_100(client: TestClient, db, user_a, token_a):
    resp = client.get("/parties/search?per_page=200", headers=_auth_headers(token_a))
    assert resp.status_code == 422


def test_page_zero_rejected(client: TestClient, db, user_a, token_a):
    resp = client.get("/parties/search?page=0", headers=_auth_headers(token_a))
    assert resp.status_code == 422


def test_filter_by_date_range_uses_event_date_not_created_at(client: TestClient, db, user_a, token_a):
    now = datetime.utcnow()
    future_event_ts = int((now + timedelta(days=7)).timestamp())
    past_event_ts = int((now - timedelta(days=7)).timestamp())

    _make_party(
        db,
        user_a.id,
        title="Future event party",
        created_at=now,
        event_date_ts=future_event_ts,
        event_id="event_future",
    )
    _make_party(
        db,
        user_a.id,
        title="Past event party",
        created_at=now,
        event_date_ts=past_event_ts,
        event_id="event_past",
    )

    date_from = datetime.utcfromtimestamp(future_event_ts - 3600).strftime("%Y-%m-%dT%H:%M:%S")
    date_to = datetime.utcfromtimestamp(future_event_ts + 3600).strftime("%Y-%m-%dT%H:%M:%S")
    resp = client.get(
        f"/parties/search?date_from={date_from}&date_to={date_to}",
        headers=_auth_headers(token_a),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["title"] == "Future event party"


def test_filter_by_min_members_uses_actual_accepted_members(client: TestClient, db, user_a, user_b, token_a):
    _make_party(
        db,
        user_a.id,
        title="Big capacity empty party",
        max_members=10,
        event_id="event_empty",
    )
    has_member_party = _make_party(
        db,
        user_a.id,
        title="Small capacity with member",
        max_members=2,
        event_id="event_member",
    )
    _accept_member(db, has_member_party.id, user_b.id)

    resp = client.get("/parties/search?min_members=1", headers=_auth_headers(token_a))
    assert resp.status_code == 200
    data = resp.json()
    titles = [item["title"] for item in data["items"]]
    assert "Small capacity with member" in titles
    assert "Big capacity empty party" not in titles
