"""Tests for weekday multi-select + hide_started filters."""
import json
import time
from datetime import datetime, timedelta

import kudago_cache
from models.kudago_event import KudaGoEvent


def _make(
    db, *, kid: int, location: str = "msk", title: str = "T",
    start_ts: int | None = None, end_ts: int | None = None,
    is_permanent: bool = False, all_dates: list[dict] | None = None,
) -> KudaGoEvent:
    e = KudaGoEvent(
        kudago_id=kid, location=location, title=title, title_lower=title.lower(),
        categories=json.dumps([]), tags=json.dumps([]),
        all_dates=json.dumps(all_dates or [], ensure_ascii=False),
        start_ts=start_ts, end_ts=end_ts,
        is_permanent=is_permanent,
        price="", favorites_count=0,
        cached_at=datetime.utcnow(), updated_at=datetime.utcnow(),
    )
    db.add(e); db.commit(); db.refresh(e)
    return e


def _ts_on_weekday(target_weekday: int, hour: int = 12) -> int:
    """Return a future unix ts whose local weekday() is target_weekday (0=Mon..6=Sun)."""
    now = datetime.now()
    days_ahead = (target_weekday - now.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    d = (now + timedelta(days=days_ahead)).replace(hour=hour, minute=0, second=0, microsecond=0)
    return int(d.timestamp())




def test_weekdays_single_monday(db):
    _make(db, kid=1, title="Mon", start_ts=_ts_on_weekday(0))
    _make(db, kid=2, title="Wed", start_ts=_ts_on_weekday(2))
    _make(db, kid=3, title="Sun", start_ts=_ts_on_weekday(6))

    res = kudago_cache.query_cache(db=db, location="msk", weekdays="0")
    assert [e["title"] for e in res["results"]] == ["Mon"]


def test_weekdays_multi_weekend(db):
    _make(db, kid=1, title="Mon", start_ts=_ts_on_weekday(0))
    _make(db, kid=2, title="Sat", start_ts=_ts_on_weekday(5))
    _make(db, kid=3, title="Sun", start_ts=_ts_on_weekday(6))

    res = kudago_cache.query_cache(db=db, location="msk", weekdays="5,6")
    titles = {e["title"] for e in res["results"]}
    assert titles == {"Sat", "Sun"}


def test_weekdays_empty_string_is_noop(db):
    _make(db, kid=1, title="Mon", start_ts=_ts_on_weekday(0))
    _make(db, kid=2, title="Tue", start_ts=_ts_on_weekday(1))

    res = kudago_cache.query_cache(db=db, location="msk", weekdays="")
    assert res["count"] == 2


def test_weekdays_excludes_permanent_events(db):
    """Permanent events (expos) have no specific weekday → excluded from weekday filter."""
    _make(db, kid=1, title="Mon",  start_ts=_ts_on_weekday(0))
    _make(db, kid=2, title="Expo", is_permanent=True)

    res = kudago_cache.query_cache(db=db, location="msk", weekdays="0")
    assert [e["title"] for e in res["results"]] == ["Mon"]


def test_weekdays_includes_permanent_events_when_schedules_have_weekday(db):
    _make(db, kid=1, title="Mon", start_ts=_ts_on_weekday(0))
    _make(
        db,
        kid=2,
        title="ScheduledExpo",
        is_permanent=True,
        all_dates=[
            {
                "start": None,
                "end": None,
                "start_time": None,
                "end_time": None,
                "is_continuous": False,
                "is_endless": True,
                "is_startless": False,
                "use_place_schedule": False,
                "schedules": [{"weekday": 0, "from": "10:00", "to": "18:00"}],
            }
        ],
    )
    _make(
        db,
        kid=3,
        title="SundayExpo",
        is_permanent=True,
        all_dates=[
            {
                "start": None,
                "end": None,
                "start_time": None,
                "end_time": None,
                "is_continuous": False,
                "is_endless": True,
                "is_startless": False,
                "use_place_schedule": False,
                "schedules": [{"weekday": 6, "from": "10:00", "to": "18:00"}],
            }
        ],
    )

    res = kudago_cache.query_cache(db=db, location="msk", weekdays="0")
    titles = {e["title"] for e in res["results"]}
    assert titles == {"Mon", "ScheduledExpo"}


def test_weekdays_includes_permanent_events_when_kudago_schedules_have_days_of_week(db):
    _make(db, kid=1, title="Mon", start_ts=_ts_on_weekday(0))
    _make(
        db,
        kid=2,
        title="KudagoScheduledExpo",
        is_permanent=True,
        all_dates=[
            {
                "start": None,
                "end": None,
                "start_time": None,
                "end_time": None,
                "is_continuous": False,
                "is_endless": True,
                "is_startless": False,
                "use_place_schedule": False,
                "schedules": [{"days_of_week": [0, 1, 2, 3, 4], "start_time": "12:00:00", "end_time": "21:00:00"}],
            }
        ],
    )
    _make(
        db,
        kid=3,
        title="WeekendExpo",
        is_permanent=True,
        all_dates=[
            {
                "start": None,
                "end": None,
                "start_time": None,
                "end_time": None,
                "is_continuous": False,
                "is_endless": True,
                "is_startless": False,
                "use_place_schedule": False,
                "schedules": [{"days_of_week": [5, 6], "start_time": "11:00:00", "end_time": "21:00:00"}],
            }
        ],
    )

    res = kudago_cache.query_cache(db=db, location="msk", weekdays="0")
    titles = {e["title"] for e in res["results"]}
    assert titles == {"Mon", "KudagoScheduledExpo"}


def test_weekdays_invalid_values_ignored(db):
    _make(db, kid=1, title="Mon", start_ts=_ts_on_weekday(0))
    _make(db, kid=2, title="Wed", start_ts=_ts_on_weekday(2))

    res = kudago_cache.query_cache(db=db, location="msk", weekdays="0,7,abc,-1")
    assert [e["title"] for e in res["results"]] == ["Mon"]




def test_hide_started_excludes_events_with_start_in_past(db):
    """Hide_started: event must have start_ts > now (strict)."""
    now = int(time.time())
    _make(db, kid=1, title="Past",    start_ts=now - 3600)
    _make(db, kid=2, title="Future",  start_ts=now + 3600)
    _make(db, kid=3, title="JustNow", start_ts=now)

    res = kudago_cache.query_cache(db=db, location="msk", hide_started=True)
    titles = [e["title"] for e in res["results"]]
    assert titles == ["Future"]


def test_hide_started_keeps_permanent_events(db):
    """Permanent events are always 'open' → stay visible even with hide_started."""
    now = int(time.time())
    _make(db, kid=1, title="Expo", is_permanent=True)
    _make(db, kid=2, title="Past", start_ts=now - 3600)
    _make(db, kid=3, title="Future", start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", hide_started=True)
    titles = {e["title"] for e in res["results"]}
    assert titles == {"Expo", "Future"}


def test_hide_started_off_by_default_shows_past_events(db):
    """By default query_cache applies (permanent OR start_ts >= now_ts), so
    ongoing (start <= now <= end) dated events may leak through the default filter.
    Check hide_started=False doesn't further restrict."""
    now = int(time.time())
    _make(db, kid=1, title="Edge", start_ts=now)

    res = kudago_cache.query_cache(db=db, location="msk", hide_started=False)
    assert res["count"] == 1




def test_weekdays_and_hide_started_combined(db):
    now = int(time.time())
    _make(db, kid=1, title="MonFuture", start_ts=_ts_on_weekday(0))
    _make(db, kid=2, title="PastMon",   start_ts=now - 86400)
    _make(db, kid=3, title="SunFuture", start_ts=_ts_on_weekday(6))

    res = kudago_cache.query_cache(
        db=db, location="msk",
        weekdays="0,6",
        hide_started=True,
    )
    titles = {e["title"] for e in res["results"]}
    assert titles == {"MonFuture", "SunFuture"}
