"""
KudaGo events cache — периодически подгружает события из KudaGo в БД.
Эндпоинты читают данные из кэша вместо прямых запросов к API.
"""
import json
import logging
import time
from datetime import datetime
from typing import Optional

import math
import re

from sqlalchemy import func, or_


def _json_list(val):
    if not val:
        return []
    if isinstance(val, list):
        return val
    try:
        parsed = json.loads(val)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def _escape_like(pattern: str) -> str:
    """Escape LIKE wildcards so raw user input matches literally."""
    return pattern.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _matches_time_of_day(start_time: Optional[str], tod: str) -> bool:
    """start_time format 'HH:MM'. Buckets: morning [0..12), day [12..17),
    evening [17..22), night [22..24) ∪ [0..6). Events without time are excluded."""
    if not start_time or ":" not in start_time:
        return False
    try:
        h = int(start_time.split(":")[0])
    except ValueError:
        return False
    if tod == "morning":
        return 6 <= h < 12
    if tod == "day":
        return 12 <= h < 17
    if tod == "evening":
        return 17 <= h < 22
    if tod == "night":
        return h >= 22 or h < 6
    return True


def _schedule_weekdays(all_dates: object) -> set[int]:
    weekdays: set[int] = set()
    for date_entry in _json_list(all_dates):
        if not isinstance(date_entry, dict):
            continue
        schedules = date_entry.get("schedules") or []
        if not isinstance(schedules, list):
            continue
        for schedule in schedules:
            if not isinstance(schedule, dict):
                continue
            raw_days = schedule.get("days_of_week")
            if isinstance(raw_days, list):
                for raw_weekday in raw_days:
                    try:
                        weekday = int(raw_weekday)
                    except (TypeError, ValueError):
                        continue
                    if 0 <= weekday <= 6:
                        weekdays.add(weekday)
                continue

            raw_weekday = schedule.get("weekday")
            try:
                weekday = int(raw_weekday)
            except (TypeError, ValueError):
                continue
            if 0 <= weekday <= 6:
                weekdays.add(weekday)
    return weekdays


def _matches_weekday(start_ts: Optional[int], is_permanent: bool, allowed: set, all_dates: object = None) -> bool:
    """Uses Python weekday() for dated events and schedules for permanent events."""
    if is_permanent:
        schedule_days = _schedule_weekdays(all_dates)
        return bool(schedule_days and schedule_days & allowed)
    if not start_ts:
        return False
    try:
        return datetime.fromtimestamp(start_ts).weekday() in allowed
    except (OverflowError, OSError, ValueError):
        return False


def _matches_hour_range(start_time: Optional[str], from_hour: int, to_hour: int) -> bool:
    """start_time in [from_hour, to_hour). Wraps if from > to (overnight).
    Events without start_time don't match."""
    if not start_time or ":" not in start_time:
        return False
    try:
        h = int(start_time.split(":")[0])
    except ValueError:
        return False
    if from_hour <= to_hour:
        return from_hour <= h < to_hour
    return h >= from_hour or h < to_hour

import kudago_api
from database import SessionLocal
from models.kudago_event import KudaGoEvent
from models.party import EventParty, PartyMember
from models.attendee import EventAttendee

logger = logging.getLogger(__name__)

# Локации, для которых собираем кэш
DEFAULT_LOCATIONS = ["kzn", "msk", "spb"]
# Сколько страниц грузить на одну локацию за один синк
PAGES_PER_SYNC = 5
PAGE_SIZE = 40


def _parse_age(val) -> Optional[int]:
    """Конвертирует '16+', 16, '0' → int или None."""
    if val is None:
        return None
    if isinstance(val, int):
        return val
    try:
        return int(str(val).replace("+", "").strip())
    except (ValueError, TypeError):
        return None


def _parse_price_bounds(price: object, is_free: bool = False) -> Optional[tuple[float, float]]:
    """Return numeric price bounds parsed from KudaGo's free-form price string."""
    if is_free:
        return (0.0, 0.0)
    if price is None:
        return None

    text = str(price).strip().lower()
    if not text:
        return None
    if text in {"0", "0.0"} or "бесплат" in text or "free" in text:
        return (0.0, 0.0)

    numbers: list[float] = []
    for match in re.findall(r"\d[\d\s.,]*", text):
        normalized = match.replace(" ", "").replace("\u00a0", "")
        if "," in normalized and "." not in normalized:
            normalized = normalized.replace(",", ".")
        normalized = normalized.replace(",", "")
        try:
            numbers.append(float(normalized))
        except ValueError:
            continue

    if not numbers:
        return None
    return (min(numbers), max(numbers))


def _matches_price_range(row: "KudaGoEvent", min_price: Optional[float], max_price: Optional[float]) -> bool:
    if min_price is None and max_price is None:
        return True
    if min_price is not None and max_price is not None and min_price > max_price:
        min_price, max_price = max_price, min_price

    bounds = _parse_price_bounds(row.price, row.is_free)
    if bounds is None:
        return False

    row_min, row_max = bounds
    if min_price is not None and row_max < min_price:
        return False
    if max_price is not None and row_min > max_price:
        return False
    return True


def _parse_start_ts(raw_event: dict) -> Optional[int]:
    """Извлекаем unix timestamp ближайшей будущей даты из сырого события KudaGo."""
    now_ts = int(time.time())
    raw_dates = raw_event.get("dates") or []
    future_ts = [
        d["start"]
        for d in raw_dates
        if not kudago_api._is_permanent_date(d)
        and d.get("start") is not None
        and d["start"] >= now_ts
    ]
    if future_ts:
        return min(future_ts)
    return None


def _row_from_parsed(parsed: dict, location: str) -> dict:
    """Конвертируем результат parse_events в dict для upsert."""
    all_dates = parsed.get("all_dates") or []
    has_schedules = bool(parsed.get("has_schedules", False)) or any(
        bool(d.get("schedules")) for d in all_dates if isinstance(d, dict)
    )
    return {
        "kudago_id": parsed["kudago_id"],
        "location": location,
        "title": parsed["title"],
        "title_lower": parsed["title"].lower(),
        "short_title": parsed.get("short_title", ""),
        "description": parsed.get("description", ""),
        "categories": json.dumps(parsed.get("categories") or [], ensure_ascii=False),
        "tags": json.dumps(parsed.get("tags") or [], ensure_ascii=False),
        "price": str(parsed.get("price", "")),
        "is_free": bool(parsed.get("is_free", False)),
        "age_restriction": _parse_age(parsed.get("age_restriction")),
        "favorites_count": int(parsed.get("favorites_count") or 0),
        "comments_count": int(parsed.get("comments_count") or 0),
        "publication_ts": parsed.get("publication_ts"),
        "cover_url": parsed.get("cover_url"),
        "images": json.dumps(parsed.get("images") or [], ensure_ascii=False),
        "site_url": parsed.get("site_url", ""),
        "start_date": parsed.get("start_date"),
        "start_time": parsed.get("start_time"),
        "all_dates": json.dumps(all_dates, ensure_ascii=False),
        "is_permanent": bool(parsed.get("is_permanent", False)),
        "end_ts": parsed.get("end_ts"),
        "has_schedules": has_schedules,
        "place_is_stub": parsed.get("place_is_stub"),
        "place_title": parsed.get("place_title", ""),
        "place_address": parsed.get("place_address", ""),
        "place_phone": parsed.get("place_phone", ""),
        "place_subway": parsed.get("place_subway", ""),
        "lat": parsed.get("lat"),
        "lon": parsed.get("lon"),
        "updated_at": datetime.utcnow(),
    }


def sync_location(location: str, pages: int = PAGES_PER_SYNC) -> int:
    """Синхронизирует события одной локации. Возвращает кол-во upserted строк."""
    now_ts = int(time.time())
    upserted = 0

    logger.info(f"[KudaGo] sync_location start: location={location} pages={pages}")
    db = SessionLocal()
    try:
        for page in range(1, pages + 1):
            logger.debug(f"[KudaGo] fetching page {page}/{pages} for {location}...")
            try:
                raw = kudago_api.get_events(
                    location=location,
                    page=page,
                    page_size=PAGE_SIZE,
                    actual_since=now_ts,
                )
            except Exception as exc:
                logger.warning(f"[KudaGo] fetch error location={location} page={page}: {exc}")
                break

            results = raw.get("results") or []
            if not results:
                break

            parsed_list = kudago_api.parse_events(raw)

            # Вычисляем start_ts из сырых данных (parse_events их не возвращает)
            raw_by_id = {e.get("id"): e for e in results}

            for parsed in parsed_list:
                kid = parsed["kudago_id"]
                data = _row_from_parsed(parsed, location)

                raw_e = raw_by_id.get(kid)
                data["start_ts"] = _parse_start_ts(raw_e) if raw_e else None

                existing = db.query(KudaGoEvent).filter(KudaGoEvent.kudago_id == kid).first()
                if existing:
                    for k, v in data.items():
                        setattr(existing, k, v)
                else:
                    data["cached_at"] = datetime.utcnow()
                    db.add(KudaGoEvent(**data))

                upserted += 1

            db.commit()

            # Если KudaGo вернул меньше страницы — больше данных нет
            if not raw.get("next"):
                break

        logger.info("Synced %d events for location=%s", upserted, location)
    except Exception as exc:
        db.rollback()
        logger.error("sync_location error (location=%s): %s", location, exc)
    finally:
        db.close()

    return upserted


def sync_all(locations: list[str] = DEFAULT_LOCATIONS) -> dict:
    """Синхронизирует все локации. Возвращает статистику."""
    stats = {}
    for loc in locations:
        stats[loc] = sync_location(loc)
    return stats


def location_has_cache(db, location: str) -> bool:
    """Проверяет есть ли хоть одно событие для данной локации в кэше."""
    return db.query(KudaGoEvent.id).filter(KudaGoEvent.location == location).first() is not None


def location_has_cache_direct(location: str) -> bool:
    """То же, но открывает свою сессию — для вызова вне request context."""
    db = SessionLocal()
    try:
        return location_has_cache(db, location)
    finally:
        db.close()


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in kilometres."""
    R = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def query_cache(
    db,
    location: str = "msk",
    categories: Optional[str] = None,
    is_free: Optional[bool] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    actual_since: Optional[int] = None,
    actual_until: Optional[int] = None,
    max_age: Optional[int] = None,
    tags: Optional[str] = None,
    place_search: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    radius_m: Optional[int] = None,
    order_by: Optional[str] = None,
    has_party: Optional[bool] = None,
    min_attendees: Optional[int] = None,
    has_free_spots: Optional[bool] = None,
    time_of_day: Optional[str] = None,
    only_permanent: Optional[bool] = None,
    exclude_permanent: Optional[bool] = None,
    has_cover: Optional[bool] = None,
    starting_within_hours: Optional[int] = None,
    is_short: Optional[bool] = None,
    is_long: Optional[bool] = None,
    has_schedules: Optional[bool] = None,
    only_verified_place: Optional[bool] = None,
    from_hour: Optional[int] = None,
    to_hour: Optional[int] = None,
    weekdays: Optional[str] = None,
    hide_started: Optional[bool] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
) -> dict:
    """
    Читает события из кэша БД.
    Возвращает dict совместимый с форматом /kudago/events.
    """
    now_ts = int(time.time())
    q = db.query(KudaGoEvent).filter(KudaGoEvent.location == location)

    # Нижняя граница дат — max(actual_since, сейчас). Постоянные показываем всегда.
    lower_ts = max(actual_since, now_ts) if actual_since else now_ts
    q = q.filter(
        (KudaGoEvent.is_permanent == True) |  # noqa: E712
        (KudaGoEvent.start_ts >= lower_ts)
    )

    if actual_until is not None:
        q = q.filter(
            (KudaGoEvent.is_permanent == True) |  # noqa: E712
            (KudaGoEvent.start_ts <= actual_until)
        )

    if is_free is not None:
        q = q.filter(KudaGoEvent.is_free == is_free)

    if only_permanent is True:
        q = q.filter(KudaGoEvent.is_permanent == True)  # noqa: E712
    elif exclude_permanent is True:
        q = q.filter(KudaGoEvent.is_permanent == False)  # noqa: E712

    if has_cover is True:
        q = q.filter(KudaGoEvent.cover_url.isnot(None), KudaGoEvent.cover_url != "")
    elif has_cover is False:
        q = q.filter((KudaGoEvent.cover_url.is_(None)) | (KudaGoEvent.cover_url == ""))

    if starting_within_hours is not None and starting_within_hours > 0:
        horizon = now_ts + starting_within_hours * 3600
        q = q.filter(
            KudaGoEvent.is_permanent == False,  # noqa: E712
            KudaGoEvent.start_ts.isnot(None),
            KudaGoEvent.start_ts >= now_ts,
            KudaGoEvent.start_ts <= horizon,
        )

    if is_short is True:
        q = q.filter(
            KudaGoEvent.is_permanent == False,  # noqa: E712
            KudaGoEvent.end_ts.isnot(None),
            KudaGoEvent.start_ts.isnot(None),
            (KudaGoEvent.end_ts - KudaGoEvent.start_ts) < 2 * 3600,
        )
    if is_long is True:
        q = q.filter(
            (KudaGoEvent.is_permanent == True) |  # noqa: E712
            (
                (KudaGoEvent.end_ts.isnot(None)) &
                (KudaGoEvent.start_ts.isnot(None)) &
                ((KudaGoEvent.end_ts - KudaGoEvent.start_ts) > 24 * 3600)
            )
        )

    if has_schedules is True:
        q = q.filter(KudaGoEvent.has_schedules == True)  # noqa: E712

    if hide_started is True:
        q = q.filter(
            (KudaGoEvent.is_permanent == True) |  # noqa: E712
            (KudaGoEvent.start_ts > now_ts)
        )

    if only_verified_place is True:
        q = q.filter(KudaGoEvent.place_is_stub == False)  # noqa: E712

    social_event_ids: Optional[set[str]] = None

    def _intersect(ids: set[str]) -> None:
        nonlocal social_event_ids
        social_event_ids = ids if social_event_ids is None else (social_event_ids & ids)

    if has_party is True:
        rows = db.query(EventParty.event_id).distinct().all()
        _intersect({r[0] for r in rows if r[0]})

    if has_free_spots is True:
        accepted_cnt = (
            db.query(PartyMember.party_id, func.count(PartyMember.id).label("c"))
            .filter(PartyMember.status == "accepted")
            .group_by(PartyMember.party_id)
            .subquery()
        )
        parties = (
            db.query(EventParty.event_id, EventParty.max_members, accepted_cnt.c.c)
            .outerjoin(accepted_cnt, accepted_cnt.c.party_id == EventParty.id)
            .filter(EventParty.is_open == True)  # noqa: E712
            .all()
        )
        free_ids = {ev_id for ev_id, mx, cnt in parties if (cnt or 0) < (mx or 0)}
        _intersect(free_ids)

    if min_attendees is not None and min_attendees > 0:
        rows = (
            db.query(EventAttendee.event_id, func.count(EventAttendee.id).label("c"))
            .group_by(EventAttendee.event_id)
            .having(func.count(EventAttendee.id) >= min_attendees)
            .all()
        )
        _intersect({r[0] for r in rows if r[0]})

    if social_event_ids is not None:
        if not social_event_ids:
            return {
                "count": 0, "next": None, "previous": None,
                "page": page, "page_size": page_size,
                "results": [], "from_cache": True,
            }
        int_ids = []
        for sid in social_event_ids:
            try:
                int_ids.append(int(sid))
            except (TypeError, ValueError):
                continue
        q = q.filter(KudaGoEvent.kudago_id.in_(int_ids)) if int_ids else q.filter(False)

    if categories:
        # categories — строка вида "concert,exhibition" → OR: событие подходит,
        # если хотя бы одна из указанных категорий есть в его массиве.
        cat_list = [c.strip() for c in categories.split(",") if c.strip()]
        if cat_list:
            cat_clauses = [KudaGoEvent.categories.ilike(f'%"{cat}"%') for cat in cat_list]
            q = q.filter(or_(*cat_clauses))

    search_trimmed = search.strip() if search else ""
    if search_trimmed:
        # title_lower хранит title.lower() из Python — работает с кириллицей в любой локали БД.
        pat = f"%{_escape_like(search_trimmed.lower())}%"
        q = q.filter(KudaGoEvent.title_lower.like(pat, escape="\\"))

    if max_age is not None:
        # События с неизвестным возрастом не отсекаем — показываем всегда.
        q = q.filter(
            (KudaGoEvent.age_restriction == None) |  # noqa: E711
            (KudaGoEvent.age_restriction <= max_age)
        )

    if tags:
        tag_list = [t.strip() for t in tags.split(",") if t.strip()]
        if tag_list:
            tag_clauses = [KudaGoEvent.tags.ilike(f'%"{t}"%') for t in tag_list]
            q = q.filter(or_(*tag_clauses))

    place_search_trimmed = place_search.strip() if place_search else ""
    place_search_lower = place_search_trimmed.lower() if place_search_trimmed else None

    geo_active = lat is not None and lon is not None and radius_m is not None and radius_m > 0
    if geo_active:
        km = radius_m / 1000.0
        dlat = km / 111.0
        dlon = km / (111.0 * max(math.cos(math.radians(lat)), 0.01))
        q = q.filter(
            KudaGoEvent.lat.isnot(None),
            KudaGoEvent.lon.isnot(None),
            KudaGoEvent.lat.between(lat - dlat, lat + dlat),
            KudaGoEvent.lon.between(lon - dlon, lon + dlon),
        )

    if order_by == "popularity":
        q = q.order_by(KudaGoEvent.favorites_count.desc(), KudaGoEvent.start_ts.asc())
    elif order_by == "newest":
        q = q.order_by(KudaGoEvent.publication_ts.desc().nullslast(), KudaGoEvent.start_ts.asc())
    elif order_by == "ending_soon":
        q = q.order_by(KudaGoEvent.end_ts.asc().nullslast(), KudaGoEvent.start_ts.asc())
    elif order_by == "most_discussed":
        q = q.order_by(KudaGoEvent.comments_count.desc(), KudaGoEvent.start_ts.asc())
    elif order_by == "alphabetical":
        q = q.order_by(KudaGoEvent.title_lower.asc())
    else:
        q = q.order_by(KudaGoEvent.is_permanent.asc(), KudaGoEvent.start_ts.asc())

    tod = (time_of_day or "").strip().lower() or None
    hour_range_active = (
        from_hour is not None and to_hour is not None
        and not (from_hour == 0 and to_hour == 24)
    )
    sort_by_nearest = order_by == "nearest" and geo_active

    weekday_set: set[int] = set()
    if weekdays:
        for raw in str(weekdays).split(","):
            raw = raw.strip()
            try:
                v = int(raw)
                if 0 <= v <= 6:
                    weekday_set.add(v)
            except ValueError:
                continue
    weekday_active = bool(weekday_set)
    price_range_active = min_price is not None or max_price is not None

    if geo_active or place_search_lower or tod or hour_range_active or sort_by_nearest or weekday_active or price_range_active:
        all_rows = q.all()
        if price_range_active:
            all_rows = [r for r in all_rows if _matches_price_range(r, min_price, max_price)]
        if geo_active:
            all_rows = [
                r for r in all_rows
                if r.lat is not None and r.lon is not None
                and _haversine_km(lat, lon, r.lat, r.lon) * 1000 <= radius_m
            ]
        if place_search_lower:
            all_rows = [
                r for r in all_rows
                if place_search_lower in (r.place_title or "").lower()
                or place_search_lower in (r.place_subway or "").lower()
            ]
        if tod:
            all_rows = [r for r in all_rows if _matches_time_of_day(r.start_time, tod)]
        if hour_range_active:
            all_rows = [r for r in all_rows if _matches_hour_range(r.start_time, from_hour, to_hour)]
        if weekday_active:
            all_rows = [r for r in all_rows if _matches_weekday(r.start_ts, r.is_permanent, weekday_set, r.all_dates)]
        if sort_by_nearest:
            all_rows.sort(key=lambda r: _haversine_km(lat, lon, r.lat, r.lon))
        total = len(all_rows)
        rows = all_rows[(page - 1) * page_size:(page - 1) * page_size + page_size]
    else:
        total = q.count()
        rows = (
            q.offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

    events = [_row_to_response(row) for row in rows]
    return {
        "count": total,
        "next": None,
        "previous": None,
        "page": page,
        "page_size": page_size,
        "results": events,
        "from_cache": True,
    }


def _row_to_response(row: KudaGoEvent) -> dict:
    return {
        "kudago_id": row.kudago_id,
        "title": row.title,
        "short_title": row.short_title or "",
        "description": row.description or "",
        "categories": _json_list(row.categories),
        "tags": _json_list(row.tags),
        "price": row.price or "",
        "is_free": row.is_free,
        "age_restriction": row.age_restriction,
        "favorites_count": row.favorites_count or 0,
        "comments_count": row.comments_count or 0,
        "publication_ts": row.publication_ts,
        "images": _json_list(row.images),
        "cover_url": row.cover_url,
        "start_date": row.start_date,
        "start_time": row.start_time,
        "all_dates": _json_list(row.all_dates),
        "is_permanent": row.is_permanent,
        "has_schedules": row.has_schedules,
        "place_title": row.place_title or "",
        "place_address": row.place_address or "",
        "place_phone": row.place_phone or "",
        "place_subway": row.place_subway or "",
        "lat": row.lat,
        "lon": row.lon,
        "site_url": row.site_url or "",
    }
