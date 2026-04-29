import httpx
import logging
import time
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from kudago_common import safe_str as _safe_str

BASE_URL = "https://kudago.com/public-api/v1.4"
KUDAGO_TIMEZONE = ZoneInfo("Europe/Moscow")

_logger = logging.getLogger(__name__)


def _get(path: str, params: dict) -> dict:
    """GET с лёгким retry для 429/503. Raises на 4xx (кроме 429) и 5xx после последней попытки."""
    backoff = 1.0
    last_exc: Optional[Exception] = None
    for attempt in range(3):
        try:
            with httpx.Client(timeout=10) as client:
                r = client.get(f"{BASE_URL}/{path}/", params=params)
                if r.status_code in (429, 502, 503, 504):
                    _logger.warning("KudaGo %s returned %s (attempt %d/3)", path, r.status_code, attempt + 1)
                    time.sleep(backoff)
                    backoff *= 2
                    continue
                r.raise_for_status()
                return r.json()
        except (httpx.TimeoutException, httpx.TransportError) as e:
            _logger.warning("KudaGo %s transport error (attempt %d/3): %s", path, attempt + 1, e)
            last_exc = e
            time.sleep(backoff)
            backoff *= 2
    if last_exc is not None:
        raise last_exc
    raise httpx.HTTPStatusError("KudaGo rate-limited/unavailable after retries", request=None, response=None)


def get_events(
    location: str = "kzn",
    categories: Optional[str] = None,
    is_free: Optional[bool] = None,
    page: int = 1,
    page_size: int = 20,
    actual_since: Optional[int] = None,
    actual_until: Optional[int] = None,
) -> dict:
    now_ts = int(time.time())
    params: dict = {
        "location": location,
        "page": page,
        "page_size": page_size,
        "fields": "id,title,short_title,description,body_text,categories,tags,price,is_free,age_restriction,images,dates,place,site_url,favorites_count,comments_count,publication_date",
        "expand": "images,place,dates",
        "order_by": "date",
        "actual_since": actual_since if actual_since else now_ts,
    }
    if actual_until:
        params["actual_until"] = actual_until
    if categories:
        params["categories"] = categories
    if is_free is not None:
        params["is_free"] = str(is_free).lower()
    return _get("events", params)


def search(
    query: str,
    ctype: str = "event",
    location: str = "kzn",
    is_free: Optional[bool] = None,
    page: int = 1,
    page_size: int = 20,
    actual_since: Optional[int] = None,
    actual_until: Optional[int] = None,
) -> dict:
    now_ts = int(time.time())
    params: dict = {
        "q": query,
        "ctype": ctype,
        "location": location,
        "page": page,
        "page_size": page_size,
        "fields": "id,title,short_title,description,body_text,categories,tags,price,is_free,age_restriction,images,dates,place,site_url,favorites_count,comments_count,publication_date",
        "expand": "images,place,dates",
        "actual_since": actual_since if actual_since else now_ts,
    }
    if actual_until:
        params["actual_until"] = actual_until
    if is_free is not None:
        params["is_free"] = str(is_free).lower()
    return _get("search", params)


def get_event_by_id(event_id: int) -> dict:
    params = {
        "fields": "id,title,short_title,description,body_text,categories,tags,price,is_free,age_restriction,images,dates,place,site_url,participants",
        "expand": "images,place,dates,participants",
    }
    with httpx.Client(timeout=10) as client:
        r = client.get(f"{BASE_URL}/events/{event_id}/", params=params)
        r.raise_for_status()
        return r.json()


def get_events_today(location: str = "kzn") -> dict:
    import datetime
    today = datetime.date.today()
    start = int(time.mktime(today.timetuple()))
    end = start + 86399
    return get_events(location=location, page=1, page_size=20, actual_since=start, actual_until=end)


def get_event_categories() -> list:
    with httpx.Client(timeout=10) as client:
        r = client.get(f"{BASE_URL}/event-categories/")
        r.raise_for_status()
        data = r.json()
        if isinstance(data, list):
            return data
        return data.get("results", data)


def get_locations() -> list:
    with httpx.Client(timeout=10) as client:
        r = client.get(f"{BASE_URL}/locations/")
        r.raise_for_status()
        data = r.json()
        if isinstance(data, list):
            return data
        return data.get("results", data)


def _is_permanent_date(d: dict) -> bool:
    """Возвращает True если дата постоянная (is_endless или is_startless или use_place_schedule)."""
    return bool(d.get("is_endless") or d.get("is_startless") or d.get("use_place_schedule"))


def _event_date_entry(
    d: dict,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
) -> dict:
    schedules = d.get("schedules")
    return {
        "start": start_date,
        "end": end_date,
        "start_time": start_time,
        "end_time": end_time,
        "is_continuous": d.get("is_continuous", False),
        "is_endless": d.get("is_endless", False),
        "is_startless": d.get("is_startless", False),
        "use_place_schedule": d.get("use_place_schedule", False),
        "schedules": schedules if schedules is not None else [],
    }


def _format_kudago_timestamp(ts: int) -> tuple[str, str]:
    dt = datetime.fromtimestamp(ts, tz=KUDAGO_TIMEZONE)
    return dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M")


def parse_events(raw: dict, skip_date_filter: bool = False) -> list:
    import time
    now_ts = int(time.time())
    results = raw.get("results", [])
    out = []
    for e in results:
        raw_dates = e.get("dates") or []
        start_date = None
        start_time = None
        all_dates = []
        is_permanent = False

        # Проверяем, есть ли постоянные даты (is_endless / is_startless / use_place_schedule)
        permanent_dates = [d for d in raw_dates if _is_permanent_date(d)]

        # Отфильтровать только будущие разовые даты (start >= now_ts)
        future_dates = []
        for d in raw_dates:
            if _is_permanent_date(d):
                continue
            start_ts = d.get("start")
            if start_ts is not None and start_ts >= now_ts:
                future_dates.append(d)

        if permanent_dates:
            # Постоянное событие — круглый год, расписание по месту
            is_permanent = True
            start_date = None
            start_time = None
            all_dates = [_event_date_entry(d) for d in permanent_dates]
        elif future_dates:
            for d in future_dates:
                start_ts = d.get("start")
                end_ts = d.get("end")
                sd = None
                st = None
                ed = None
                et = None
                if start_ts:
                    sd, st = _format_kudago_timestamp(start_ts)
                if end_ts:
                    ed, et = _format_kudago_timestamp(end_ts)
                all_dates.append(_event_date_entry(d, sd, ed, st, et))

            # Выбрать ближайшую будущую дату
            selected_date = None
            nearest_future_ts = float('inf')
            for d in future_dates:
                start_ts = d.get("start")
                if start_ts and start_ts < nearest_future_ts:
                    nearest_future_ts = start_ts
                    selected_date = d

            if selected_date and selected_date.get("start"):
                start_date, start_time = _format_kudago_timestamp(selected_date["start"])
        else:
            # Нет ни постоянных, ни будущих дат — либо прошло, либо даты не развёрнуты
            if not skip_date_filter:
                continue

        place = e.get("place") or {}
        images = e.get("images") or []
        imgs = [{"url": img.get("image", ""), "source_name": img.get("source", {}).get("name", "") if isinstance(img.get("source"), dict) else "", "source_link": img.get("source", {}).get("link", "") if isinstance(img.get("source"), dict) else ""} for img in images if img.get("image")]

        cats = e.get("categories") or []
        cat_list = [_safe_str(c) for c in cats if _safe_str(c)]
        raw_tags = e.get("tags") or []
        tag_list = [_safe_str(t) for t in raw_tags if _safe_str(t)]

        _raw_dates = e.get("dates") or []
        has_sched = any(bool(d.get("schedules")) for d in all_dates)
        nearest_end_ts = None
        if not is_permanent:
            future_ends = [d.get("end") for d in _raw_dates
                           if d.get("start") and d.get("start") >= now_ts and d.get("end")]
            if future_ends:
                nearest_end_ts = min(future_ends)
        place_is_stub_v = place.get("is_stub") if isinstance(place, dict) and place else None

        out.append({
            "kudago_id": e.get("id"),
            "title": e.get("title", ""),
            "short_title": e.get("short_title", ""),
            "description": e.get("description", ""),
            "categories": cat_list,
            "tags": tag_list,
            "favorites_count": e.get("favorites_count") or 0,
            "comments_count": e.get("comments_count") or 0,
            "publication_ts": e.get("publication_date"),
            "has_schedules": has_sched,
            "end_ts": nearest_end_ts,
            "place_is_stub": place_is_stub_v,
            "price": e.get("price", ""),
            "is_free": e.get("is_free", False),
            "age_restriction": e.get("age_restriction"),
            "images": imgs,
            "cover_url": imgs[0]["url"] if imgs else None,
            "start_date": start_date,
            "start_time": start_time,
            "all_dates": all_dates,
            "is_permanent": is_permanent,
            "place_title": _safe_str(place.get("title")),
            "place_address": _safe_str(place.get("address")),
            "place_phone": _safe_str(place.get("phone")),
            "place_subway": _safe_str(place.get("subway")),
            "lat": place.get("coords", {}).get("lat") if isinstance(place.get("coords"), dict) else None,
            "lon": place.get("coords", {}).get("lon") if isinstance(place.get("coords"), dict) else None,
            "site_url": e.get("site_url", ""),
        })
    return out


def parse_event_detail(e: dict) -> dict:
    import time
    now_ts = int(time.time())
    raw_dates = e.get("dates") or []
    start_date = None
    start_time = None
    all_dates = []
    is_permanent = False

    # Проверяем постоянные даты
    permanent_dates = [d for d in raw_dates if _is_permanent_date(d)]

    # Отфильтровать только будущие разовые даты (start >= now_ts)
    future_dates = []
    for d in raw_dates:
        if _is_permanent_date(d):
            continue
        start_ts = d.get("start")
        if start_ts is not None and start_ts >= now_ts:
            future_dates.append(d)

    if permanent_dates:
        is_permanent = True
        all_dates = [_event_date_entry(d) for d in permanent_dates]
    elif future_dates:
        for d in future_dates:
            start_ts = d.get("start")
            end_ts = d.get("end")
            sd = st = ed = et = None
            if start_ts:
                sd, st = _format_kudago_timestamp(start_ts)
            if end_ts:
                ed, et = _format_kudago_timestamp(end_ts)
            all_dates.append(_event_date_entry(d, sd, ed, st, et))

        # Выбрать ближайшую будущую дату
        selected_date = None
        nearest_future_ts = float('inf')
        for d in future_dates:
            start_ts = d.get("start")
            if start_ts and start_ts < nearest_future_ts:
                nearest_future_ts = start_ts
                selected_date = d

        if selected_date and selected_date.get("start"):
            start_date, start_time = _format_kudago_timestamp(selected_date["start"])
    else:
        # Нет ни постоянных, ни будущих дат
        pass

    place = e.get("place") or {}
    images = e.get("images") or []
    imgs = [{"url": img.get("image", ""), "source_name": img.get("source", {}).get("name", "") if isinstance(img.get("source"), dict) else "", "source_link": img.get("source", {}).get("link", "") if isinstance(img.get("source"), dict) else ""} for img in images if img.get("image")]

    participants_raw = e.get("participants") or []
    participants = []
    for p in participants_raw:
        agent = p.get("agent") or {}
        participants.append({
            "role": p.get("role", ""),
            "name": _safe_str(agent.get("title") or agent.get("name")),
            "image_url": agent.get("images", [{}])[0].get("image") if agent.get("images") else None,
        })

    return {
        "kudago_id": e.get("id"),
        "title": e.get("title", ""),
        "short_title": e.get("short_title", ""),
        "description": e.get("description", ""),
        "body_text": e.get("body_text", ""),
        "categories": e.get("categories") or [],
        "tags": e.get("tags") or [],
        "price": e.get("price", ""),
        "is_free": e.get("is_free", False),
        "age_restriction": e.get("age_restriction"),
        "images": imgs,
        "cover_url": imgs[0]["url"] if imgs else None,
        "start_date": start_date,
        "start_time": start_time,
        "all_dates": all_dates,
        "is_permanent": is_permanent,
        "has_schedules": any(bool(d.get("schedules")) for d in all_dates),
        "place_title": _safe_str(place.get("title")),
        "place_address": _safe_str(place.get("address")),
        "place_phone": _safe_str(place.get("phone")),
        "place_subway": _safe_str(place.get("subway")),
        "lat": place.get("coords", {}).get("lat") if isinstance(place.get("coords"), dict) else None,
        "lon": place.get("coords", {}).get("lon") if isinstance(place.get("coords"), dict) else None,
        "participants": participants,
        "site_url": e.get("site_url", ""),
    }
