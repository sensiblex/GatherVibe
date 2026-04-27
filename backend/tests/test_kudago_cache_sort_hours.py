"""Tests for extended sort options and hour-range filter."""
import json
import time
from datetime import datetime

import kudago_cache
from models.kudago_event import KudaGoEvent


def _make(
    db, *, kid: int, location: str = "msk", title: str = "T",
    start_ts: int | None = None, end_ts: int | None = None,
    is_permanent: bool = False,
    favorites: int = 0, comments: int = 0,
    pub_ts: int | None = None,
    start_time: str | None = None,
    lat: float | None = None, lon: float | None = None,
) -> KudaGoEvent:
    e = KudaGoEvent(
        kudago_id=kid, location=location, title=title, title_lower=title.lower(),
        categories=json.dumps([]),
        tags=json.dumps([]),
        start_ts=start_ts, end_ts=end_ts,
        is_permanent=is_permanent,
        favorites_count=favorites,
        comments_count=comments,
        publication_ts=pub_ts,
        start_time=start_time,
        lat=lat, lon=lon,
        price="",
        cached_at=datetime.utcnow(), updated_at=datetime.utcnow(),
    )
    db.add(e); db.commit(); db.refresh(e)
    return e




def test_sort_newest_orders_by_publication_desc(db):
    now = int(time.time())
    _make(db, kid=1, title="Old",    pub_ts=now - 30 * 86400, start_ts=now + 3600)
    _make(db, kid=2, title="Fresh",  pub_ts=now - 86400,      start_ts=now + 3600)
    _make(db, kid=3, title="Medium", pub_ts=now - 7 * 86400,  start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", order_by="newest")
    assert [e["title"] for e in res["results"]] == ["Fresh", "Medium", "Old"]




def test_sort_ending_soon_orders_by_end_ascending(db):
    now = int(time.time())
    _make(db, kid=1, title="EndsLater", start_ts=now + 3600, end_ts=now + 10 * 86400)
    _make(db, kid=2, title="EndsSoon",  start_ts=now + 3600, end_ts=now + 3 * 86400)
    _make(db, kid=3, title="EndsToday", start_ts=now + 3600, end_ts=now + 12 * 3600)

    res = kudago_cache.query_cache(db=db, location="msk", order_by="ending_soon")
    titles = [e["title"] for e in res["results"]]
    assert titles[:3] == ["EndsToday", "EndsSoon", "EndsLater"]




def test_sort_most_discussed(db):
    now = int(time.time())
    _make(db, kid=1, title="Quiet",  comments=0,   start_ts=now + 3600)
    _make(db, kid=2, title="Loud",   comments=40,  start_ts=now + 3600)
    _make(db, kid=3, title="Medium", comments=10,  start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", order_by="most_discussed")
    assert [e["title"] for e in res["results"]] == ["Loud", "Medium", "Quiet"]




def test_sort_alphabetical(db):
    now = int(time.time())
    _make(db, kid=1, title="Яблоко",  start_ts=now + 3600)
    _make(db, kid=2, title="Арбуз",   start_ts=now + 3600)
    _make(db, kid=3, title="Вишня",   start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", order_by="alphabetical")
    assert [e["title"] for e in res["results"]] == ["Арбуз", "Вишня", "Яблоко"]




def test_sort_nearest_orders_by_distance(db):
    now = int(time.time())
    KREMLIN = (55.7520, 37.6175)
    _make(db, kid=1, title="Far",  lat=55.80, lon=37.80, start_ts=now + 3600)
    _make(db, kid=2, title="Near", lat=55.76, lon=37.62, start_ts=now + 3600)
    _make(db, kid=3, title="Mid",  lat=55.78, lon=37.70, start_ts=now + 3600)

    res = kudago_cache.query_cache(
        db=db, location="msk",
        lat=KREMLIN[0], lon=KREMLIN[1], radius_m=50000,
        order_by="nearest",
    )
    assert [e["title"] for e in res["results"]] == ["Near", "Mid", "Far"]




def test_hour_range_18_to_23(db):
    """«Вечер 18-23» должен совпасть со start_time 18:00-22:59."""
    now = int(time.time())
    _make(db, kid=1, title="AT17",  start_time="17:30", start_ts=now + 3600)
    _make(db, kid=2, title="AT18",  start_time="18:00", start_ts=now + 3600)
    _make(db, kid=3, title="AT22",  start_time="22:00", start_ts=now + 3600)
    _make(db, kid=4, title="AT23",  start_time="23:00", start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", from_hour=18, to_hour=23)
    titles = {e["title"] for e in res["results"]}
    assert titles == {"AT18", "AT22"}


def test_hour_range_overnight_wraps(db):
    """from_hour > to_hour = overnight wrap (e.g. 22-4)."""
    now = int(time.time())
    _make(db, kid=1, title="AT21",  start_time="21:00", start_ts=now + 3600)
    _make(db, kid=2, title="AT23",  start_time="23:00", start_ts=now + 3600)
    _make(db, kid=3, title="AT02",  start_time="02:00", start_ts=now + 3600)
    _make(db, kid=4, title="AT05",  start_time="05:00", start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", from_hour=22, to_hour=4)
    titles = {e["title"] for e in res["results"]}
    assert titles == {"AT23", "AT02"}


def test_hour_range_excludes_events_without_time(db):
    now = int(time.time())
    _make(db, kid=1, title="HasTime", start_time="19:00", start_ts=now + 3600)
    _make(db, kid=2, title="NoTime",  start_time=None,    start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", from_hour=18, to_hour=22)
    assert [e["title"] for e in res["results"]] == ["HasTime"]


def test_hour_range_full_day_is_noop(db):
    now = int(time.time())
    _make(db, kid=1, title="A", start_time="03:00", start_ts=now + 3600)
    _make(db, kid=2, title="B", start_time="15:00", start_ts=now + 3600)
    _make(db, kid=3, title="C", start_time=None,    start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", from_hour=0, to_hour=24)
    assert res["count"] == 3
