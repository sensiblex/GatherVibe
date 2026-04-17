"""Tests for Priority-2 and Priority-3 filters in kudago_cache.query_cache().

Covers: age_restriction, geolocation+radius (haversine), tags (OR),
place/subway text search, sorting.
"""
import json
import time
from datetime import datetime

import kudago_cache
from models.kudago_event import KudaGoEvent


def _make(
    db,
    *,
    kid: int,
    location: str = "msk",
    title: str = "T",
    categories: list[str] | None = None,
    tags: list[str] | None = None,
    age: int | None = None,
    is_free: bool = False,
    favorites: int = 0,
    start_ts: int | None = None,
    is_permanent: bool = False,
    lat: float | None = None,
    lon: float | None = None,
    place_title: str = "",
    place_subway: str = "",
) -> KudaGoEvent:
    e = KudaGoEvent(
        kudago_id=kid,
        location=location,
        title=title,
        title_lower=title.lower(),
        categories=json.dumps(categories or [], ensure_ascii=False),
        tags=json.dumps(tags or [], ensure_ascii=False),
        age_restriction=age,
        is_free=is_free,
        favorites_count=favorites,
        start_ts=start_ts,
        is_permanent=is_permanent,
        lat=lat,
        lon=lon,
        place_title=place_title,
        place_subway=place_subway,
        price="",
        cached_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


# ── Age restriction ──────────────────────────────────────────────────────────


def test_max_age_filters_out_stricter_events(db):
    now = int(time.time())
    _make(db, kid=1, title="Kids",  age=0,    start_ts=now + 3600)
    _make(db, kid=2, title="Teen",  age=12,   start_ts=now + 3600)
    _make(db, kid=3, title="Adult", age=18,   start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", max_age=12)
    titles = {e["title"] for e in res["results"]}
    assert titles == {"Kids", "Teen"}


def test_max_age_includes_events_with_null_age(db):
    """Events with unknown age_restriction are shown (don't punish missing data)."""
    now = int(time.time())
    _make(db, kid=1, title="Unknown", age=None, start_ts=now + 3600)
    _make(db, kid=2, title="Adult",   age=18,   start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", max_age=6)
    assert [e["title"] for e in res["results"]] == ["Unknown"]


# ── Geolocation + radius (Haversine) ─────────────────────────────────────────


# Moscow centre
MSK_LAT, MSK_LON = 55.7536, 37.6199
# ~2.5 km north of centre
NEAR_LAT, NEAR_LON = 55.776, 37.619
# ~30 km south-west (Vnukovo area)
FAR_LAT, FAR_LON = 55.59, 37.28


def test_geo_radius_includes_near_excludes_far(db):
    now = int(time.time())
    _make(db, kid=1, title="Near",  lat=NEAR_LAT, lon=NEAR_LON, start_ts=now + 3600)
    _make(db, kid=2, title="Far",   lat=FAR_LAT,  lon=FAR_LON,  start_ts=now + 3600)

    res = kudago_cache.query_cache(
        db=db, location="msk",
        lat=MSK_LAT, lon=MSK_LON, radius_m=5000,
    )
    assert [e["title"] for e in res["results"]] == ["Near"]


def test_geo_radius_excludes_events_without_coords(db):
    """No coords → can't check distance → excluded from geo search."""
    now = int(time.time())
    _make(db, kid=1, title="HasCoords", lat=NEAR_LAT, lon=NEAR_LON, start_ts=now + 3600)
    _make(db, kid=2, title="NoCoords",  lat=None,     lon=None,     start_ts=now + 3600)

    res = kudago_cache.query_cache(
        db=db, location="msk",
        lat=MSK_LAT, lon=MSK_LON, radius_m=10000,
    )
    assert [e["title"] for e in res["results"]] == ["HasCoords"]


def test_geo_not_applied_when_params_missing(db):
    now = int(time.time())
    _make(db, kid=1, title="HasCoords", lat=NEAR_LAT, lon=NEAR_LON, start_ts=now + 3600)
    _make(db, kid=2, title="NoCoords",  lat=None,     lon=None,     start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk")
    titles = {e["title"] for e in res["results"]}
    assert titles == {"HasCoords", "NoCoords"}


# ── Tags (OR semantics) ──────────────────────────────────────────────────────


def test_tags_or_filter(db):
    now = int(time.time())
    _make(db, kid=1, title="FreeOutdoor", tags=["free", "open air"], start_ts=now + 3600)
    _make(db, kid=2, title="OnlyFree",    tags=["free"],             start_ts=now + 3600)
    _make(db, kid=3, title="OnlyKids",    tags=["детям"],            start_ts=now + 3600)
    _make(db, kid=4, title="Neither",     tags=["шоу"],              start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", tags="free,детям")
    titles = {e["title"] for e in res["results"]}
    assert titles == {"FreeOutdoor", "OnlyFree", "OnlyKids"}


def test_single_tag_filter(db):
    now = int(time.time())
    _make(db, kid=1, title="Has",    tags=["open air"], start_ts=now + 3600)
    _make(db, kid=2, title="Hasnt",  tags=["шоу"],      start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", tags="open air")
    assert [e["title"] for e in res["results"]] == ["Has"]


# ── Place / subway text search ───────────────────────────────────────────────


def test_place_search_matches_title_or_subway(db):
    now = int(time.time())
    _make(db, kid=1, title="A", place_title="Московский Дом музыки", place_subway="Павелецкая",          start_ts=now + 3600)
    _make(db, kid=2, title="B", place_title="Парк Горького",         place_subway="Октябрьская",         start_ts=now + 3600)
    _make(db, kid=3, title="C", place_title="Другой зал",            place_subway="Тверская, Пушкинская", start_ts=now + 3600)

    # Match by subway
    r1 = kudago_cache.query_cache(db=db, location="msk", place_search="тверская")
    assert [e["title"] for e in r1["results"]] == ["C"]

    # Match by place_title
    r2 = kudago_cache.query_cache(db=db, location="msk", place_search="парк")
    assert [e["title"] for e in r2["results"]] == ["B"]


# ── Sorting ───────────────────────────────────────────────────────────────────


def test_sort_by_popularity(db):
    now = int(time.time())
    _make(db, kid=1, title="Low",     favorites=5,   start_ts=now + 3 * 3600)
    _make(db, kid=2, title="High",    favorites=500, start_ts=now + 2 * 3600)
    _make(db, kid=3, title="Medium",  favorites=50,  start_ts=now + 1 * 3600)

    res = kudago_cache.query_cache(db=db, location="msk", order_by="popularity")
    assert [e["title"] for e in res["results"]] == ["High", "Medium", "Low"]


def test_sort_by_date_default(db):
    now = int(time.time())
    _make(db, kid=1, title="Later", favorites=100, start_ts=now + 10 * 3600)
    _make(db, kid=2, title="Soon",  favorites=1,   start_ts=now + 1 * 3600)

    res = kudago_cache.query_cache(db=db, location="msk")  # default
    assert [e["title"] for e in res["results"]] == ["Soon", "Later"]


# ── Combined realistic scenario ──────────────────────────────────────────────


# ── Edge cases & hardening ────────────────────────────────────────────────────


def test_search_like_wildcard_percent_does_not_match_everything(db):
    """Regression: SQL LIKE treats `%` as wildcard. User input must be escaped
    so that search='%' finds only titles that literally contain '%', not all rows."""
    now = int(time.time())
    _make(db, kid=1, title="Plain event", start_ts=now + 3600)
    _make(db, kid=2, title="Скидка 50% на концерт", start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", search="%")
    titles = [e["title"] for e in res["results"]]
    assert titles == ["Скидка 50% на концерт"]


def test_search_like_wildcard_underscore_does_not_match_everything(db):
    """Regression: LIKE `_` matches any single char — must be escaped."""
    now = int(time.time())
    _make(db, kid=1, title="regular", start_ts=now + 3600)
    _make(db, kid=2, title="foo_bar event", start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", search="_")
    titles = [e["title"] for e in res["results"]]
    assert titles == ["foo_bar event"]


def test_place_search_whitespace_only_is_ignored(db):
    """User typing only spaces shouldn't collapse result set to 0."""
    now = int(time.time())
    _make(db, kid=1, title="A", place_title="Большой театр", start_ts=now + 3600)
    _make(db, kid=2, title="B", place_title="Парк Горького", start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", place_search="   ")
    # Whitespace-only search must behave like "no search" — all events visible.
    assert res["count"] == 2


def test_search_whitespace_only_is_ignored(db):
    now = int(time.time())
    _make(db, kid=1, title="A", start_ts=now + 3600)
    _make(db, kid=2, title="B", start_ts=now + 3600)

    res = kudago_cache.query_cache(db=db, location="msk", search="   ")
    assert res["count"] == 2


def test_combined_p2_filters(db):
    """Free, family-friendly events (<=12) near Moscow centre, sorted by popularity."""
    now = int(time.time())
    _make(db, kid=1, title="MatchAll",
          tags=["детям"], age=6, is_free=True, favorites=200,
          lat=NEAR_LAT, lon=NEAR_LON, start_ts=now + 3600)
    _make(db, kid=2, title="TooOld",
          tags=["детям"], age=18, is_free=True, favorites=100,
          lat=NEAR_LAT, lon=NEAR_LON, start_ts=now + 3600)
    _make(db, kid=3, title="Paid",
          tags=["детям"], age=6, is_free=False, favorites=150,
          lat=NEAR_LAT, lon=NEAR_LON, start_ts=now + 3600)
    _make(db, kid=4, title="Far",
          tags=["детям"], age=6, is_free=True, favorites=50,
          lat=FAR_LAT, lon=FAR_LON, start_ts=now + 3600)
    _make(db, kid=5, title="AlsoMatchLowerPop",
          tags=["детям"], age=0, is_free=True, favorites=30,
          lat=NEAR_LAT, lon=NEAR_LON, start_ts=now + 3600)

    res = kudago_cache.query_cache(
        db=db, location="msk",
        tags="детям",
        max_age=12,
        is_free=True,
        lat=MSK_LAT, lon=MSK_LON, radius_m=5000,
        order_by="popularity",
    )
    assert [e["title"] for e in res["results"]] == ["MatchAll", "AlsoMatchLowerPop"]
