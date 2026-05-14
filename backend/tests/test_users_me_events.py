import time
from unittest.mock import AsyncMock

from models.party import EventParty, PartyMember


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_users_me_events_prefers_party_event_date_ts_over_kudago(client, db, user_a, user_b, token_b, monkeypatch):
    past_ts = int(time.time()) - 3600
    party = EventParty(
        event_id="987654",
        title="Permanent meetup",
        max_members=4,
        creator_id=user_a.id,
        is_open=True,
        event_title="Permanent event",
        event_date_ts=past_ts,
    )
    db.add(party)
    db.commit()
    db.refresh(party)

    db.add(PartyMember(party_id=party.id, user_id=user_b.id, status="accepted"))
    db.commit()

    async_mock = AsyncMock(side_effect=AssertionError("KudaGo should not be called when party date exists"))
    monkeypatch.setattr("routers.users.kudago_api_async.get_event_by_id", async_mock)

    resp = client.get("/users/me/events", headers=_auth(token_b))
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert any(item["event_id"] == "987654" and item["date_ts"] == past_ts for item in body["past"])
    async_mock.assert_not_called()


def test_users_me_events_falls_back_to_kudago_when_party_date_missing(client, db, user_a, user_b, token_b, monkeypatch):
    party = EventParty(
        event_id="123456",
        title="Legacy party",
        max_members=4,
        creator_id=user_a.id,
        is_open=True,
        event_title="Legacy event",
        event_date_ts=None,
    )
    db.add(party)
    db.commit()
    db.refresh(party)

    db.add(PartyMember(party_id=party.id, user_id=user_b.id, status="accepted"))
    db.commit()

    future_ts = int(time.time()) + 7 * 24 * 3600
    async_mock = AsyncMock(return_value={
        "title": "Kuda fallback",
        "dates": [{"start": future_ts}],
        "images": [{"image": "https://example.com/event.jpg"}],
        "categories": ["education"],
        "place": {"address": "Lenina 1"},
    })
    monkeypatch.setattr("routers.users.kudago_api_async.get_event_by_id", async_mock)

    resp = client.get("/users/me/events", headers=_auth(token_b))
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert any(item["event_id"] == "123456" and item["date_ts"] == future_ts for item in body["upcoming"])
    async_mock.assert_called_once_with(123456)
