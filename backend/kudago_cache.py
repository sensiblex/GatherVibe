"""
KudaGo events cache — периодически подгружает события из KudaGo в БД.
Эндпоинты читают данные из кэша вместо прямых запросов к API.
"""
import json
import logging
import time
from datetime import datetime
from typing import Optional

from sqlalchemy import func, or_

import kudago_api
from database import SessionLocal
from models.kudago_event import KudaGoEvent

logger = logging.getLogger(__name__)

# Локации, для которых собираем кэш
DEFAULT_LOCATIONS = ["kzn", "msk", "spb"]
# Сколько страниц грузить на одну локацию за один синк
PAGES_PER_SYNC = 5
PAGE_SIZE = 100


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
    return {
        "kudago_id": parsed["kudago_id"],
        "location": location,
        "title": parsed["title"],
        "title_lower": parsed["title"].lower(),
        "short_title": parsed.get("short_title", ""),
        "description": parsed.get("description", ""),
        "categories": json.dumps(parsed.get("categories") or [], ensure_ascii=False),
        "price": str(parsed.get("price", "")),
        "is_free": bool(parsed.get("is_free", False)),
        "age_restriction": _parse_age(parsed.get("age_restriction")),
        "cover_url": parsed.get("cover_url"),
        "images": json.dumps(parsed.get("images") or [], ensure_ascii=False),
        "site_url": parsed.get("site_url", ""),
        "start_date": parsed.get("start_date"),
        "start_time": parsed.get("start_time"),
        "all_dates": json.dumps(parsed.get("all_dates") or [], ensure_ascii=False),
        "is_permanent": bool(parsed.get("is_permanent", False)),
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

    print(f"[KudaGo] sync_location start: location={location} pages={pages}", flush=True)
    db = SessionLocal()
    try:
        for page in range(1, pages + 1):
            print(f"[KudaGo] fetching page {page}/{pages} for {location}...", flush=True)
            try:
                raw = kudago_api.get_events(
                    location=location,
                    page=page,
                    page_size=PAGE_SIZE,
                    actual_since=now_ts,
                )
            except Exception as exc:
                print(f"[KudaGo] fetch error location={location} page={page}: {exc}", flush=True)
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


def query_cache(
    db,
    location: str = "msk",
    categories: Optional[str] = None,
    is_free: Optional[bool] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """
    Читает события из кэша БД.
    Возвращает dict совместимый с форматом /kudago/events.
    """
    now_ts = int(time.time())
    q = db.query(KudaGoEvent).filter(KudaGoEvent.location == location)

    # Показываем только будущие события или постоянные
    q = q.filter(
        (KudaGoEvent.is_permanent == True) |  # noqa: E712
        (KudaGoEvent.start_ts >= now_ts)
    )

    if is_free is not None:
        q = q.filter(KudaGoEvent.is_free == is_free)

    if categories:
        # categories — строка вида "concert,exhibition"
        cat_list = [c.strip() for c in categories.split(",") if c.strip()]
        for cat in cat_list:
            q = q.filter(KudaGoEvent.categories.ilike(f'%"{cat}"%'))

    if search:
        # title_lower хранит title.lower() из Python — работает с кириллицей в любой локали БД
        q = q.filter(KudaGoEvent.title_lower.like(f"%{search.lower()}%"))

    total = q.count()
    rows = (
        q.order_by(KudaGoEvent.is_permanent.asc(), KudaGoEvent.start_ts.asc())
        .offset((page - 1) * page_size)
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
    def _json(val):
        if not val:
            return []
        try:
            return json.loads(val)
        except Exception:
            return []

    return {
        "kudago_id": row.kudago_id,
        "title": row.title,
        "short_title": row.short_title or "",
        "description": row.description or "",
        "categories": _json(row.categories),
        "price": row.price or "",
        "is_free": row.is_free,
        "age_restriction": row.age_restriction,
        "images": _json(row.images),
        "cover_url": row.cover_url,
        "start_date": row.start_date,
        "start_time": row.start_time,
        "all_dates": _json(row.all_dates),
        "is_permanent": row.is_permanent,
        "place_title": row.place_title or "",
        "place_address": row.place_address or "",
        "place_phone": row.place_phone or "",
        "place_subway": row.place_subway or "",
        "lat": row.lat,
        "lon": row.lon,
        "site_url": row.site_url or "",
    }
