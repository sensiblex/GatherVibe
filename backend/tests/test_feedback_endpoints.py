"""TDD integration tests for feedback + people recommendations endpoints."""
import json
import time

import pytest

from models.attendee import EventAttendee
from models.kudago_event import KudaGoEvent
from models.recommendation_impression import RecommendationImpression
from models.user import User


@pytest.fixture(autouse=True)
def _clear_caches():
    from routers import recommendations
    with recommendations._event_lock:
        recommendations._event_cache.clear()
    with recommendations._lock:
        recommendations._cache.clear()
    yield


def _kudago(db, kid, **kw):
    now = int(time.time())
    ev = KudaGoEvent(
        kudago_id=kid, location=kw.get("location", "msk"),
        title=kw.get("title", f"Event {kid}"),
        title_lower=kw.get("title", f"Event {kid}").lower(),
        description="", categories=json.dumps(kw.get("categories", [])),
        tags=json.dumps([]), is_free=True,
        favorites_count=kw.get("favorites_count", 0),
        start_ts=now + kw.get("start_offset_days", 3) * 86400,
    )
    db.add(ev); db.commit(); return ev




def test_feedback_requires_auth(client):
    r = client.post("/recommendations/feedback",
                    json={"rec_type": "event", "target_id": "1", "action": "disliked"})
    assert r.status_code == 401


def test_feedback_records_impression(client, db, user_a, token_a):
    r = client.post(
        "/recommendations/feedback",
        json={"rec_type": "event", "target_id": "99", "action": "disliked"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 200
    rows = db.query(RecommendationImpression).all()
    assert len(rows) == 1
    assert rows[0].rec_type == "event"
    assert rows[0].target_id == "99"
    assert rows[0].action == "disliked"
    assert rows[0].user_id == user_a.id


def test_feedback_rejects_invalid_action(client, token_a):
    r = client.post(
        "/recommendations/feedback",
        json={"rec_type": "event", "target_id": "1", "action": "bogus"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 422 or r.status_code == 400


def test_dismissal_removes_from_recommendations(client, db, user_a, token_a):
    user_a.city = "msk"; db.commit()
    _kudago(db, 1, categories=["concert"])
    _kudago(db, 2, categories=["concert"])

    client.post(
        "/recommendations/feedback",
        json={"rec_type": "event", "target_id": "1", "action": "dismissed"},
        headers={"Authorization": f"Bearer {token_a}"},
    )

    r = client.get(
        "/users/me/recommended-events",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    ids = [it["event_id"] for it in r.json()]
    assert "1" not in ids
    assert "2" in ids




def test_impressions_batch_records_all(client, db, user_a, token_a):
    r = client.post(
        "/recommendations/impressions",
        json={
            "items": [
                {"rec_type": "event", "target_id": "10", "action": "shown", "score": 73},
                {"rec_type": "event", "target_id": "11", "action": "shown", "score": 65},
                {"rec_type": "event", "target_id": "10", "action": "clicked"},
            ]
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 200
    rows = db.query(RecommendationImpression).all()
    assert len(rows) == 3


def test_impressions_empty_batch_is_noop(client, db, token_a):
    r = client.post(
        "/recommendations/impressions",
        json={"items": []},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 200
    assert db.query(RecommendationImpression).count() == 0




def test_similar_people_requires_auth(client):
    r = client.get("/users/me/similar-people")
    assert r.status_code == 401


def test_similar_people_returns_sorted(client, db, user_a, user_b, token_a):
    user_a.interests = "concert,cinema"; user_a.city = "msk"
    user_b.interests = "concert,cinema"; user_b.city = "msk"
    db.commit()
    r = client.get(
        "/users/me/similar-people",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert any(it["user_id"] == user_b.id for it in data)
    assert not any(it["user_id"] == user_a.id for it in data)




def test_event_peers_requires_auth(client):
    r = client.get("/events/e1/peers")
    assert r.status_code == 401


def test_event_peers_returns_opt_in_attendees(client, db, user_a, user_b, token_a):
    user_a.interests = "concert"
    user_a.is_discoverable_on_events = True
    user_b.interests = "concert"
    user_b.is_discoverable_on_events = True
    db.add_all([
        EventAttendee(event_id="e1", user_id=user_a.id),
        EventAttendee(event_id="e1", user_id=user_b.id),
    ])
    db.commit()

    r = client.get(
        "/events/e1/peers",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 200
    data = r.json()
    ids = [it["user_id"] for it in data]
    assert user_b.id in ids
    assert user_a.id not in ids
