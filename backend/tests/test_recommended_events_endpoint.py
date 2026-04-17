"""Integration tests for GET /users/me/recommended-events endpoint (TDD)."""
import json
import time

import pytest

from models.kudago_event import KudaGoEvent


@pytest.fixture(autouse=True)
def _clear_caches():
    """Event recommendation cache is module-global; clear between tests."""
    from routers import recommendations
    with recommendations._event_lock:
        recommendations._event_cache.clear()
    with recommendations._lock:
        recommendations._cache.clear()
    yield


def _mk_kudago(db, kid: int, *, categories, start_offset_days=3, location="msk",
               favorites_count=0):
    now = int(time.time())
    ev = KudaGoEvent(
        kudago_id=kid, location=location, title=f"Event {kid}",
        title_lower=f"event {kid}", description="",
        categories=json.dumps(categories), tags=json.dumps([]),
        is_free=True, favorites_count=favorites_count,
        start_ts=now + start_offset_days * 86400,
    )
    db.add(ev); db.commit(); return ev


def test_requires_auth(client):
    r = client.get("/users/me/recommended-events")
    assert r.status_code == 401


def test_returns_empty_when_no_events(client, user_a, token_a):
    r = client.get(
        "/users/me/recommended-events",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 200
    assert r.json() == []


def test_returns_events_sorted_by_score(client, db, user_a, token_a):
    user_a.city = "msk"
    user_a.interests = "concert"
    db.commit()
    _mk_kudago(db, 1, categories=["sport"])
    _mk_kudago(db, 2, categories=["concert"])

    r = client.get(
        "/users/me/recommended-events",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    scores = [it["match_score"] for it in data]
    assert scores == sorted(scores, reverse=True)


def test_respects_limit_and_offset(client, db, user_a, token_a):
    user_a.city = "msk"
    db.commit()
    for i in range(1, 6):
        _mk_kudago(db, i, categories=["concert"], start_offset_days=i)

    r1 = client.get(
        "/users/me/recommended-events?limit=2&offset=0",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    r2 = client.get(
        "/users/me/recommended-events?limit=2&offset=2",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert len(r1.json()) == 2
    assert len(r2.json()) == 2
    r1_ids = {it["event_id"] for it in r1.json()}
    r2_ids = {it["event_id"] for it in r2.json()}
    assert r1_ids.isdisjoint(r2_ids)


def test_response_has_required_fields(client, db, user_a, token_a):
    user_a.city = "msk"
    db.commit()
    _mk_kudago(db, 1, categories=["concert"])
    r = client.get(
        "/users/me/recommended-events",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    data = r.json()
    assert len(data) >= 1
    item = data[0]
    for key in ["event_id", "title", "match_score", "match_reasons", "start_ts"]:
        assert key in item
