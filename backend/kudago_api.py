"""KudaGo API — обёртка для работы с публичным API событий."""

import httpx
from typing import Optional
from datetime import datetime, timezone

BASE_URL = "https://kudago.com/public-api/v1.4"
DEFAULT_LOCATION = "kzn"

DEFAULT_FIELDS = (
    "id,title,short_title,slug,description,body_text,"
    "place,location,dates,categories,tags,"
    "price,is_free,age_restriction,images,site_url"
)
DETAIL_FIELDS = DEFAULT_FIELDS + ",participants"


# --- helpers ---

def _get(endpoint: str, params: dict) -> dict | list:
    params = {k: v for k, v in params.items() if v is not None}
    with httpx.Client(timeout=10.0) as client:
        r = client.get(f"{BASE_URL}/{endpoint}/", params=params)
        r.raise_for_status()
        return r.json()


def _to_timestamp(dt: datetime) -> int:
    return int(dt.timestamp())


def _parse_images(raw: list) -> list[dict]:
    result = []
    for img in raw:
        if not img.get("image"):
            continue
        src = img.get("source") or {}
        result.append({
            "url": img["image"],
            "source_name": src.get("name", ""),
            "source_link": src.get("link", ""),
        })
    return result


def _parse_categories(raw: list) -> list[str]:
    """Return Russian display names, never English slugs."""
    result = []
    for cat in raw:
        if isinstance(cat, dict):
            label = cat.get("name") or cat.get("slug", "")
            if label:
                result.append(label)
        elif isinstance(cat, str):
            result.append(cat)
    return result


def _now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


# --- API ---

def get_locations(lang: str = "ru") -> list:
    return _get("locations", {"lang": lang, "fields": "slug,name,timezone"})


def get_event_categories(lang: str = "ru") -> list:
    return _get("event-categories", {"lang": lang})


def get_events(
    location: str = DEFAULT_LOCATION,
    categories: Optional[str] = None,
    actual_since: Optional[datetime] = None,
    actual_until: Optional[datetime] = None,
    is_free: Optional[bool] = None,
    tags: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    order_by: str = "date",
    text_format: str = "text",
    lang: str = "ru",
) -> dict:
    # Always filter out past events — actual_since defaults to now
    since_ts = _to_timestamp(actual_since) if actual_since else _now_ts()
    params = {
        "location": location,
        "categories": categories,
        "actual_since": since_ts,
        "actual_until": _to_timestamp(actual_until) if actual_until else None,
        "is_free": is_free,
        "tags": tags,
        "page": page,
        "page_size": page_size,
        "order_by": order_by,
        "text_format": text_format,
        "lang": lang,
        "fields": DEFAULT_FIELDS,
        "expand": "place,location,dates",
    }
    return _get("events", params)


def get_event_by_id(event_id: int, lang: str = "ru") -> dict:
    params = {
        "lang": lang,
        "fields": DETAIL_FIELDS,
        "expand": "place,location,dates,participants",
        "text_format": "text",
    }
    params = {k: v for k, v in params.items() if v is not None}
    with httpx.Client(timeout=10.0) as client:
        r = client.get(f"{BASE_URL}/events/{event_id}/", params=params)
        r.raise_for_status()
        return r.json()


def get_events_today(location: str = DEFAULT_LOCATION) -> dict:
    return _get("events-of-the-day", {"location": location, "expand": "events"})


def get_places(
    location: str = DEFAULT_LOCATION,
    categories: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    lang: str = "ru",
) -> dict:
    params = {
        "location": location,
        "categories": categories,
        "page": page,
        "page_size": page_size,
        "lang": lang,
        "fields": "id,title,short_title,slug,description,address,phone,coords,subway,site_url,images,categories",
    }
    return _get("places", params)


def get_place_by_id(place_id: int, lang: str = "ru") -> dict:
    with httpx.Client(timeout=10.0) as client:
        r = client.get(f"{BASE_URL}/places/{place_id}/", params={"lang": lang, "expand": "location"})
        r.raise_for_status()
        return r.json()


def search(
    query: str,
    ctype: str = "event",
    location: str = DEFAULT_LOCATION,
    is_free: Optional[bool] = None,
    page: int = 1,
    page_size: int = 20,
    lang: str = "ru",
) -> dict:
    params = {
        "q": query,
        "ctype": ctype,
        "location": location,
        "is_free": is_free,
        "page": page,
        "page_size": page_size,
        "lang": lang,
        "expand": "place,dates",
        # Filter out past events in search too
        "actual_since": _now_ts(),
    }
    return _get("search", params)


# --- парсинг ---

def parse_events(response: dict) -> list[dict]:
    results = []
    now_ts = _now_ts()
    for event in response.get("results", []):
        dates = event.get("dates", [])

        # Skip events where all dates are in the past
        if dates:
            max_end = max(
                (d.get("end") or d.get("start") or 0) for d in dates
            )
            if max_end and max_end < now_ts:
                continue

        place = event.get("place") or {}
        coords = place.get("coords") or {}
        images = _parse_images(event.get("images", []))

        # Find nearest future date
        future_dates = [d for d in dates if (d.get("end") or d.get("start") or 0) >= now_ts]
        first_date = future_dates[0] if future_dates else (dates[0] if dates else {})

        results.append({
            "kudago_id": event.get("id"),
            "title": event.get("title", ""),
            "short_title": event.get("short_title", ""),
            "description": event.get("description", ""),
            "categories": _parse_categories(event.get("categories", [])),
            "tags": event.get("tags", []),
            "price": event.get("price", ""),
            "is_free": event.get("is_free", False),
            "age_restriction": str(event.get("age_restriction", "") or ""),
            "start_date": first_date.get("start_date"),
            "start_time": first_date.get("start_time"),
            "place_title": place.get("title", ""),
            "place_address": place.get("address", ""),
            "lat": coords.get("lat"),
            "lon": coords.get("lon"),
            "cover_url": images[0]["url"] if images else None,
            "site_url": event.get("site_url", ""),
        })
    return results


def parse_event_detail(event: dict) -> dict:
    place = event.get("place") or {}
    coords = place.get("coords") or {}
    images = _parse_images(event.get("images", []))

    all_dates = [
        {
            "start": d.get("start_date"),
            "end": d.get("end_date"),
            "start_time": d.get("start_time"),
            "end_time": d.get("end_time"),
            "is_continuous": d.get("is_continuous", False),
            "is_endless": d.get("is_endless", False),
        }
        for d in event.get("dates", [])
    ]

    participants = [
        {
            "role": p.get("role", ""),
            "name": (p.get("agent") or {}).get("title", ""),
            "image_url": (
                _parse_images((p.get("agent") or {}).get("images", ""))[0]["url"]
                if _parse_images((p.get("agent") or {}).get("images", ""))
                else None
            ),
        }
        for p in event.get("participants", [])
    ]

    return {
        "kudago_id": event.get("id"),
        "title": event.get("title", ""),
        "short_title": event.get("short_title", ""),
        "description": event.get("description", ""),
        "body_text": event.get("body_text", ""),
        "categories": _parse_categories(event.get("categories", [])),
        "tags": event.get("tags", []),
        "price": event.get("price", ""),
        "is_free": event.get("is_free", False),
        "age_restriction": str(event.get("age_restriction", "") or ""),
        "images": images,
        "cover_url": images[0]["url"] if images else None,
        "all_dates": all_dates,
        "start_date": all_dates[0]["start"] if all_dates else None,
        "start_time": all_dates[0]["start_time"] if all_dates else None,
        "place_title": place.get("title", ""),
        "place_address": place.get("address", ""),
        "place_phone": place.get("phone", ""),
        "place_subway": place.get("subway", ""),
        "lat": coords.get("lat"),
        "lon": coords.get("lon"),
        "participants": participants,
        "site_url": event.get("site_url", ""),
    }


if __name__ == "__main__":
    print("=== Города ===")
    for loc in get_locations():
        print(f"  {loc['slug']:20} {loc['name']}")

    print("\n=== События в Казани ===")
    resp = get_events(location="kzn", page_size=5)
    events = parse_events(resp)
    print(f"Всего: {resp.get('count')}")
    for e in events:
        print(f"  [{e['kudago_id']}] {e['title']} | {e['categories']}")

    if events:
        fid = events[0]["kudago_id"]
        detail = parse_event_detail(get_event_by_id(fid))
        print(f"\n=== Деталь #{fid} ===")
        print(f"  {detail['title']}")
        print(f"  {len(detail['images'])} фото, {len(detail['all_dates'])} дат")
