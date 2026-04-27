"""Tests for GatherVibe-specific social filters and quality filters in query_cache().

Social filters use EventParty / EventAttendee tables and tie KudaGo cache rows
to user activity on the platform. Quality filters derive from cached fields.
"""
import json
import time
from datetime import datetime

import kudago_cache
from models.kudago_event import KudaGoEvent
from models.party import EventParty, PartyMember
from models.attendee import EventAttendee


def _make(
    db, *, kid: int, location: str = "msk", title: str = "T",
    categories: list[str] | None = None, is_free: bool = False,
    start_ts: int | None = None, is_permanent: bool = False,
    start_time: str | None = None, cover_url: str | None = None,
) -> KudaGoEvent:
    e = KudaGoEvent(
        kudago_id=kid, location=location, title=title, title_lower=title.lower(),
        categories=json.dumps(categories or []),
        tags=json.dumps([]),
        is_free=is_free, start_ts=start_ts, is_permanent=is_permanent,
        start_time=start_time, cover_url=cover_url,
        price="", favorites_count=0,
        cached_at=datetime.utcnow(), updated_at=datetime.utcnow(),
    )
    db.add(e)
    db.commit(); db.refresh(e)
    return e


def _party(db, *, event_id: str, creator_id: int = 1, max_members: int = 4, is_open: bool = True):
    p = EventParty(event_id=event_id, title="party", creator_id=creator_id,
                   max_members=max_members, is_open=is_open)
    db.add(p); db.commit(); db.refresh(p)
    return p


def _accepted(db, *, party_id: int, user_id: int):
    m = PartyMember(party_id=party_id, user_id=user_id, status="accepted")
    db.add(m); db.commit()
    return m


def _attend(db, *, event_id: str, user_id: int):
    a = EventAttendee(event_id=event_id, user_id=user_id)
    db.add(a); db.commit()
    return a




def test_has_party_true_returns_only_events_with_party(db, user_a, user_b):
    now = int(time.time())
    _make(db, kid=1, title="WithParty",   start_ts=now + 3600)
    _make(db, kid=2, title="NoParty",     start_ts=now + 3600)
    _party(db, event_id="1", creator_id=user_a.id)

    res = kudago_cache.query_cache(db=db, location="msk", has_party=True)
    assert [e["title"] for e in res["results"]] == ["WithParty"]


def test_has_party_false_omitted_returns_all(db, user_a):
    now = int(time.time())
    _make(db, kid=1, title="WithParty",   start_ts=now + 3600)
    _make(db, kid=2, title="NoParty",     start_ts=now + 3600)
    _party(db, event_id="1", creator_id=user_a.id)

    res = kudago_cache.query_cache(db=db, location="msk")
    assert res["count"] == 2




def test_min_attendees_filters_by_count(db, user_a, user_b):
    now = int(time.time())
    _make(db, kid=1, title="Popular", start_ts=now + 3600)
    _make(db, kid=2, title="Empty",   start_ts=now + 3600)
    _attend(db, event_id="1", user_id=user_a.id)
    _attend(db, event_id="1", user_id=user_b.id)

    res_2 = kudago_cache.query_cache(db=db, location="msk", min_attendees=2)
    assert [e["title"] for e in res_2["results"]] == ["Popular"]

    res_5 = kudago_cache.query_cache(db=db, location="msk", min_attendees=5)
    assert res_5["count"] == 0


def test_min_attendees_zero_is_noop(db, user_a):
    now = int(time.time())
    _make(db, kid=1, title="A", start_ts=now + 3600)
    _make(db, kid=2, title="B", start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", min_attendees=0)
    assert res["count"] == 2




def test_has_free_spots_true_returns_only_parties_with_vacancy(db, user_a, user_b):
    """A party has free spots if accepted_members_count < max_members."""
    now = int(time.time())
    _make(db, kid=1, title="OpenParty", start_ts=now + 3600)
    _make(db, kid=2, title="FullParty", start_ts=now + 3600)
    _make(db, kid=3, title="NoParty",   start_ts=now + 3600)

    p_open = _party(db, event_id="1", creator_id=user_a.id, max_members=3)
    _accepted(db, party_id=p_open.id, user_id=user_b.id)

    p_full = _party(db, event_id="2", creator_id=user_a.id, max_members=1)
    _accepted(db, party_id=p_full.id, user_id=user_b.id)

    res = kudago_cache.query_cache(db=db, location="msk", has_free_spots=True)
    assert [e["title"] for e in res["results"]] == ["OpenParty"]


def test_has_free_spots_ignores_closed_parties(db, user_a, user_b):
    now = int(time.time())
    _make(db, kid=1, title="ClosedParty", start_ts=now + 3600)
    _party(db, event_id="1", creator_id=user_a.id, max_members=5, is_open=False)
    res = kudago_cache.query_cache(db=db, location="msk", has_free_spots=True)
    assert res["count"] == 0




def test_time_of_day_evening_matches_events_after_17(db):
    now = int(time.time())
    _make(db, kid=1, title="Morning", start_time="09:00", start_ts=now + 3600)
    _make(db, kid=2, title="Day",     start_time="14:00", start_ts=now + 3600)
    _make(db, kid=3, title="Evening", start_time="19:30", start_ts=now + 3600)
    _make(db, kid=4, title="Night",   start_time="23:00", start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", time_of_day="evening")
    assert [e["title"] for e in res["results"]] == ["Evening"]


def test_time_of_day_morning_matches_before_12(db):
    now = int(time.time())
    _make(db, kid=1, title="Early",   start_time="06:30", start_ts=now + 3600)
    _make(db, kid=2, title="MidDay",  start_time="11:59", start_ts=now + 3600)
    _make(db, kid=3, title="Noon",    start_time="12:00", start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", time_of_day="morning")
    assert {e["title"] for e in res["results"]} == {"Early", "MidDay"}


def test_time_of_day_night_covers_22_to_06(db):
    now = int(time.time())
    _make(db, kid=1, title="LateEvening", start_time="21:59", start_ts=now + 3600)
    _make(db, kid=2, title="Night22",     start_time="22:00", start_ts=now + 3600)
    _make(db, kid=3, title="AfterMidnight", start_time="02:00", start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", time_of_day="night")
    assert {e["title"] for e in res["results"]} == {"Night22", "AfterMidnight"}




def test_only_permanent_toggle(db):
    now = int(time.time())
    _make(db, kid=1, title="Expo",    is_permanent=True)
    _make(db, kid=2, title="Concert", is_permanent=False, start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", only_permanent=True)
    assert [e["title"] for e in res["results"]] == ["Expo"]


def test_exclude_permanent_toggle(db):
    now = int(time.time())
    _make(db, kid=1, title="Expo",    is_permanent=True)
    _make(db, kid=2, title="Concert", is_permanent=False, start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", exclude_permanent=True)
    assert [e["title"] for e in res["results"]] == ["Concert"]




def test_has_party_empty_table_returns_zero(db):
    """Regression: empty event_parties table → has_party=True must return 0, not all rows."""
    now = int(time.time())
    _make(db, kid=1, title="A", start_ts=now + 3600)
    _make(db, kid=2, title="B", start_ts=now + 3600)
    res = kudago_cache.query_cache(db=db, location="msk", has_party=True)
    assert res["count"] == 0


def test_min_attendees_empty_attendees_returns_zero(db):
    """Regression: empty event_attendees table → min_attendees=5 must return 0."""
    now = int(time.time())
    _make(db, kid=1, title="A", start_ts=now + 3600)
    res = kudago_cache.query_cache(db=db, location="msk", min_attendees=5)
    assert res["count"] == 0


def test_has_free_spots_empty_parties_returns_zero(db):
    """Regression: empty event_parties → has_free_spots=True must return 0."""
    now = int(time.time())
    _make(db, kid=1, title="A", start_ts=now + 3600)
    res = kudago_cache.query_cache(db=db, location="msk", has_free_spots=True)
    assert res["count"] == 0


def test_has_cover_only_events_with_image(db):
    now = int(time.time())
    _make(db, kid=1, title="Pictured", cover_url="https://cdn/x.jpg", start_ts=now + 3600)
    _make(db, kid=2, title="NoImg",    cover_url=None,                start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", has_cover=True)
    assert [e["title"] for e in res["results"]] == ["Pictured"]
