"""Tests for kudago_cache.query_cache() — date range + multi-category filters."""
import json
import time
import pytest
from datetime import datetime

import kudago_cache
from models.kudago_event import KudaGoEvent


def _make_event(
    db,
    *,
    kid: int,
    location: str = "kzn",
    title: str = "Test",
    categories: list[str] | None = None,
    is_free: bool = False,
    start_ts: int | None = None,
    is_permanent: bool = False,
) -> KudaGoEvent:
    e = KudaGoEvent(
        kudago_id=kid,
        location=location,
        title=title,
        title_lower=title.lower(),
        categories=json.dumps(categories or []),
        is_free=is_free,
        start_ts=start_ts,
        is_permanent=is_permanent,
        price="",
        cached_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e




def test_query_cache_actual_since_filters_out_earlier_events(db):
    now = int(time.time())
    _make_event(db, kid=1, title="Early", start_ts=now + 3600)
    _make_event(db, kid=2, title="Late",  start_ts=now + 7 * 86400)

    res = kudago_cache.query_cache(
        db=db, location="kzn",
        actual_since=now + 2 * 86400,
    )
    titles = [e["title"] for e in res["results"]]
    assert titles == ["Late"]


def test_query_cache_actual_until_filters_out_later_events(db):
    now = int(time.time())
    _make_event(db, kid=1, title="Soon",  start_ts=now + 3600)
    _make_event(db, kid=2, title="Later", start_ts=now + 10 * 86400)

    res = kudago_cache.query_cache(
        db=db, location="kzn",
        actual_until=now + 2 * 86400,
    )
    titles = [e["title"] for e in res["results"]]
    assert titles == ["Soon"]


def test_query_cache_date_range_includes_permanent_events(db):
    """Permanent events (выставки) should appear regardless of date range."""
    now = int(time.time())
    _make_event(db, kid=1, title="Permanent Expo", is_permanent=True, start_ts=None)
    _make_event(db, kid=2, title="Dated",          start_ts=now + 3600)

    res = kudago_cache.query_cache(
        db=db, location="kzn",
        actual_since=now + 2 * 86400,
    )
    titles = {e["title"] for e in res["results"]}
    assert "Permanent Expo" in titles
    assert "Dated" not in titles




def test_query_cache_multi_category_uses_or_not_and(db):
    """Selecting 'concert' + 'theater' must return events in EITHER category."""
    now = int(time.time())
    _make_event(db, kid=1, title="ConcertOnly",  categories=["concert"],           start_ts=now + 3600)
    _make_event(db, kid=2, title="TheaterOnly",  categories=["theater"],           start_ts=now + 3600)
    _make_event(db, kid=3, title="Exhibition",   categories=["exhibition"],        start_ts=now + 3600)

    res = kudago_cache.query_cache(
        db=db, location="kzn", categories="concert,theater",
    )
    titles = {e["title"] for e in res["results"]}
    assert titles == {"ConcertOnly", "TheaterOnly"}


def test_query_cache_single_category_still_works(db):
    now = int(time.time())
    _make_event(db, kid=1, title="A", categories=["concert"],  start_ts=now + 3600)
    _make_event(db, kid=2, title="B", categories=["theater"],  start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="kzn", categories="concert")
    titles = [e["title"] for e in res["results"]]
    assert titles == ["A"]




def test_query_cache_is_free_filter(db):
    now = int(time.time())
    _make_event(db, kid=1, title="Free",  is_free=True,  start_ts=now + 3600)
    _make_event(db, kid=2, title="Paid",  is_free=False, start_ts=now + 3600)

    res_free = kudago_cache.query_cache(db=db, location="kzn", is_free=True)
    assert [e["title"] for e in res_free["results"]] == ["Free"]

    res_paid = kudago_cache.query_cache(db=db, location="kzn", is_free=False)
    assert [e["title"] for e in res_paid["results"]] == ["Paid"]


def test_query_cache_location_isolation(db):
    now = int(time.time())
    _make_event(db, kid=1, location="kzn", title="InKazan", start_ts=now + 3600)
    _make_event(db, kid=2, location="msk", title="InMoscow", start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk")
    assert [e["title"] for e in res["results"]] == ["InMoscow"]


def test_query_cache_combined_filters(db):
    """Real scenario: free concerts+theater in next 3 days in Moscow."""
    now = int(time.time())
    _make_event(db, kid=1, location="msk", title="FreeConcertSoon",
                categories=["concert"], is_free=True, start_ts=now + 86400)
    _make_event(db, kid=2, location="msk", title="PaidConcertSoon",
                categories=["concert"], is_free=False, start_ts=now + 86400)
    _make_event(db, kid=3, location="msk", title="FreeConcertFar",
                categories=["concert"], is_free=True, start_ts=now + 30 * 86400)
    _make_event(db, kid=4, location="kzn", title="FreeConcertKazan",
                categories=["concert"], is_free=True, start_ts=now + 86400)

    res = kudago_cache.query_cache(
        db=db, location="msk", categories="concert,theater",
        is_free=True,
        actual_since=now,
        actual_until=now + 3 * 86400,
    )
    assert [e["title"] for e in res["results"]] == ["FreeConcertSoon"]
