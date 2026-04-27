"""Tests for timing & schedule filters: starting_soon, short/long duration,
regular (has_schedules), verified place."""
import json
import time
from datetime import datetime

import kudago_cache
from models.kudago_event import KudaGoEvent


def _make(
    db, *, kid: int, location: str = "msk", title: str = "T",
    start_ts: int | None = None, end_ts: int | None = None,
    is_permanent: bool = False, has_schedules: bool = False,
    place_is_stub: bool | None = None,
) -> KudaGoEvent:
    e = KudaGoEvent(
        kudago_id=kid, location=location, title=title, title_lower=title.lower(),
        categories=json.dumps([]),
        tags=json.dumps([]),
        start_ts=start_ts, end_ts=end_ts,
        is_permanent=is_permanent,
        has_schedules=has_schedules,
        place_is_stub=place_is_stub,
        price="", favorites_count=0,
        cached_at=datetime.utcnow(), updated_at=datetime.utcnow(),
    )
    db.add(e); db.commit(); db.refresh(e)
    return e




def test_starting_soon_within_2h(db):
    now = int(time.time())
    _make(db, kid=1, title="In30min", start_ts=now + 30 * 60)
    _make(db, kid=2, title="In3h",    start_ts=now + 3 * 3600)
    _make(db, kid=3, title="Tomorrow",start_ts=now + 86400)

    res = kudago_cache.query_cache(db=db, location="msk", starting_within_hours=2)
    assert [e["title"] for e in res["results"]] == ["In30min"]


def test_starting_soon_within_4h(db):
    now = int(time.time())
    _make(db, kid=1, title="In1h",  start_ts=now + 3600)
    _make(db, kid=2, title="In3h",  start_ts=now + 3 * 3600)
    _make(db, kid=3, title="In5h",  start_ts=now + 5 * 3600)

    res = kudago_cache.query_cache(db=db, location="msk", starting_within_hours=4)
    titles = {e["title"] for e in res["results"]}
    assert titles == {"In1h", "In3h"}


def test_starting_soon_excludes_permanent(db):
    """Permanent events don't have a specific start — they shouldn't match 'starting soon'."""
    now = int(time.time())
    _make(db, kid=1, title="Live",  start_ts=now + 1800)
    _make(db, kid=2, title="Expo",  is_permanent=True)

    res = kudago_cache.query_cache(db=db, location="msk", starting_within_hours=2)
    assert [e["title"] for e in res["results"]] == ["Live"]




def test_is_short_filter_selects_under_2_hours(db):
    now = int(time.time())
    _make(db, kid=1, title="Short90m",  start_ts=now + 3600, end_ts=now + 3600 + 90 * 60)
    _make(db, kid=2, title="Medium4h",  start_ts=now + 3600, end_ts=now + 3600 + 4 * 3600)

    res = kudago_cache.query_cache(db=db, location="msk", is_short=True)
    assert [e["title"] for e in res["results"]] == ["Short90m"]


def test_is_long_filter_selects_over_24_hours(db):
    now = int(time.time())
    _make(db, kid=1, title="OneDay",    start_ts=now + 3600, end_ts=now + 3600 + 8 * 3600)
    _make(db, kid=2, title="Festival3d",start_ts=now + 3600, end_ts=now + 3600 + 3 * 86400)
    _make(db, kid=3, title="Expo",      is_permanent=True)

    res = kudago_cache.query_cache(db=db, location="msk", is_long=True)
    titles = {e["title"] for e in res["results"]}
    assert titles == {"Festival3d", "Expo"}


def test_is_short_excludes_permanent(db):
    now = int(time.time())
    _make(db, kid=1, title="Quick", start_ts=now + 3600, end_ts=now + 3600 + 60 * 60)
    _make(db, kid=2, title="Expo",  is_permanent=True)

    res = kudago_cache.query_cache(db=db, location="msk", is_short=True)
    assert [e["title"] for e in res["results"]] == ["Quick"]


def test_duration_filters_ignore_events_without_end(db):
    """No end_ts → cannot compute duration → excluded from both is_short and is_long."""
    now = int(time.time())
    _make(db, kid=1, title="NoEnd", start_ts=now + 3600, end_ts=None)

    assert kudago_cache.query_cache(db=db, location="msk", is_short=True)["count"] == 0
    assert kudago_cache.query_cache(db=db, location="msk", is_long=True)["count"] == 0


# ── has_schedules (регулярные) ───────────────────────────────────────────────


def test_has_schedules_true_only_recurring(db):
    now = int(time.time())
    _make(db, kid=1, title="EverySat",  has_schedules=True, start_ts=now + 3600)
    _make(db, kid=2, title="OneOff",    has_schedules=False, start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", has_schedules=True)
    assert [e["title"] for e in res["results"]] == ["EverySat"]




def test_only_verified_place_excludes_stub_venues(db):
    now = int(time.time())
    _make(db, kid=1, title="Verified", place_is_stub=False, start_ts=now + 3600)
    _make(db, kid=2, title="Stub",     place_is_stub=True,  start_ts=now + 3600)
    _make(db, kid=3, title="Unknown",  place_is_stub=None,  start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", only_verified_place=True)
    assert [e["title"] for e in res["results"]] == ["Verified"]




def test_combo_starting_soon_and_short(db):
    """Real scenario: «короткое событие начнётся в ближайшие 2 часа»."""
    now = int(time.time())
    _make(db, kid=1, title="QuickSoon", start_ts=now + 1800, end_ts=now + 1800 + 3600)
    _make(db, kid=2, title="QuickLater",start_ts=now + 5*3600, end_ts=now + 5*3600 + 3600)
    _make(db, kid=3, title="LongSoon",  start_ts=now + 1800, end_ts=now + 1800 + 10*3600)

    res = kudago_cache.query_cache(
        db=db, location="msk",
        starting_within_hours=2, is_short=True,
    )
    assert [e["title"] for e in res["results"]] == ["QuickSoon"]


def test_combo_verified_and_schedules(db):
    now = int(time.time())
    _make(db, kid=1, title="RegularAtVerified",  place_is_stub=False, has_schedules=True,  start_ts=now + 3600)
    _make(db, kid=2, title="RegularAtStub",      place_is_stub=True,  has_schedules=True,  start_ts=now + 3600)
    _make(db, kid=3, title="OneOffAtVerified",   place_is_stub=False, has_schedules=False, start_ts=now + 3600)

    res = kudago_cache.query_cache(
        db=db, location="msk",
        only_verified_place=True, has_schedules=True,
    )
    assert [e["title"] for e in res["results"]] == ["RegularAtVerified"]
