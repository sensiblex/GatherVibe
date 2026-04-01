import httpx
import time
from typing import Optional

BASE_URL = "https://kudago.com/public-api/v1.4"


def _get(path: str, params: dict) -> dict:
    with httpx.Client(timeout=10) as client:
        r = client.get(f"{BASE_URL}/{path}/", params=params)
        r.raise_for_status()
        return r.json()


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
        "fields": "id,title,short_title,description,body_text,categories,tags,price,is_free,age_restriction,images,dates,place,site_url",
        "expand": "images,place,dates",
        "order_by": "date",
        # Always filter to show only upcoming / ongoing events
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
        "fields": "id,title,short_title,description,body_text,categories,tags,price,is_free,age_restriction,images,dates,place,site_url",
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


def _safe_str(val) -> str:
    if not val and val != 0:
        return ""
    if isinstance(val, str):
        return val
    if isinstance(val, dict):
        return str(val.get("name") or val.get("slug") or val.get("title") or val.get("id") or "")
    return str(val)


def parse_events(raw: dict) -> list:
    results = raw.get("results", [])
    out = []
    for e in results:
        dates = e.get("dates") or []
        start_date = None
        start_time = None
        all_dates = []
        if dates:
            for d in dates:
                start_ts = d.get("start")
                end_ts = d.get("end")
                sd = None
                st = None
                ed = None
                et = None
                if start_ts:
                    import datetime
                    dt = datetime.datetime.fromtimestamp(start_ts)
                    sd = dt.strftime("%Y-%m-%d")
                    st = dt.strftime("%H:%M")
                if end_ts:
                    import datetime
                    dt2 = datetime.datetime.fromtimestamp(end_ts)
                    ed = dt2.strftime("%Y-%m-%d")
                    et = dt2.strftime("%H:%M")
                all_dates.append({
                    "start": sd, "end": ed,
                    "start_time": st, "end_time": et,
                    "is_continuous": d.get("is_continuous", False),
                    "is_endless": d.get("is_endless", False),
                })
            first = dates[0]
            if first.get("start"):
                import datetime
                dt = datetime.datetime.fromtimestamp(first["start"])
                start_date = dt.strftime("%Y-%m-%d")
                start_time = dt.strftime("%H:%M")

        place = e.get("place") or {}
        images = e.get("images") or []
        imgs = [{"url": img.get("image", ""), "source_name": img.get("source", {}).get("name", "") if isinstance(img.get("source"), dict) else "", "source_link": img.get("source", {}).get("link", "") if isinstance(img.get("source"), dict) else ""} for img in images if img.get("image")]

        cats = e.get("categories") or []
        cat_list = [_safe_str(c) for c in cats if _safe_str(c)]

        out.append({
            "kudago_id": e.get("id"),
            "title": e.get("title", ""),
            "short_title": e.get("short_title", ""),
            "description": e.get("description", ""),
            "categories": cat_list,
            "price": e.get("price", ""),
            "is_free": e.get("is_free", False),
            "age_restriction": e.get("age_restriction"),
            "images": imgs,
            "cover_url": imgs[0]["url"] if imgs else None,
            "start_date": start_date,
            "start_time": start_time,
            "all_dates": all_dates,
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
    dates = e.get("dates") or []
    start_date = None
    start_time = None
    all_dates = []
    if dates:
        for d in dates:
            start_ts = d.get("start")
            end_ts = d.get("end")
            sd = st = ed = et = None
            if start_ts:
                import datetime
                dt = datetime.datetime.fromtimestamp(start_ts)
                sd = dt.strftime("%Y-%m-%d")
                st = dt.strftime("%H:%M")
            if end_ts:
                import datetime
                dt2 = datetime.datetime.fromtimestamp(end_ts)
                ed = dt2.strftime("%Y-%m-%d")
                et = dt2.strftime("%H:%M")
            all_dates.append({"start": sd, "end": ed, "start_time": st, "end_time": et,
                               "is_continuous": d.get("is_continuous", False),
                               "is_endless": d.get("is_endless", False)})
        first = dates[0]
        if first.get("start"):
            import datetime
            dt = datetime.datetime.fromtimestamp(first["start"])
            start_date = dt.strftime("%Y-%m-%d")
            start_time = dt.strftime("%H:%M")

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
        "place_title": _safe_str(place.get("title")),
        "place_address": _safe_str(place.get("address")),
        "place_phone": _safe_str(place.get("phone")),
        "place_subway": _safe_str(place.get("subway")),
        "lat": place.get("coords", {}).get("lat") if isinstance(place.get("coords"), dict) else None,
        "lon": place.get("coords", {}).get("lon") if isinstance(place.get("coords"), dict) else None,
        "participants": participants,
        "site_url": e.get("site_url", ""),
    }
