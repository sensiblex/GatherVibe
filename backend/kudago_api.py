"""
KudaGo API Integration Module
Docs: https://docs.kudago.com/api/
"""

import httpx
from typing import Optional
from datetime import datetime

BASE_URL = "https://kudago.com/public-api/v1.4"

# Доступные города:
# spb, msk, nsk, ekb, nnv, kzn, smr, krd, sochi, ufa, krasnoyarsk
DEFAULT_LOCATION = "kzn"

DEFAULT_FIELDS = (
    "id,title,short_title,slug,description,body_text,"
    "place,location,dates,categories,tags,"
    "price,is_free,age_restriction,images,site_url"
)


# ──────────────────────────────────────────────
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ──────────────────────────────────────────────

def _get(endpoint: str, params: dict) -> dict | list:
    """Базовый GET-запрос к KudaGo API."""
    params = {k: v for k, v in params.items() if v is not None}
    with httpx.Client(timeout=10.0) as client:
        response = client.get(f"{BASE_URL}/{endpoint}/", params=params)
        response.raise_for_status()
        return response.json()


def _to_timestamp(dt: datetime) -> int:
    return int(dt.timestamp())


# ──────────────────────────────────────────────
# ГОРОДА
# ──────────────────────────────────────────────

def get_locations(lang: str = "ru") -> list:
    """Получить список всех доступных городов."""
    return _get("locations", {"lang": lang, "fields": "slug,name,timezone"})


# ──────────────────────────────────────────────
# КАТЕГОРИИ
# ──────────────────────────────────────────────

def get_event_categories(lang: str = "ru") -> list:
    """Получить список всех категорий событий."""
    return _get("event-categories", {"lang": lang})


# ──────────────────────────────────────────────
# СОБЫТИЯ
# ──────────────────────────────────────────────

def get_events(
    location: str = DEFAULT_LOCATION,
    categories: Optional[str] = None,
    actual_since: Optional[datetime] = None,
    actual_until: Optional[datetime] = None,
    is_free: Optional[bool] = None,
    tags: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    order_by: str = "-publication_date",
    text_format: str = "text",
    lang: str = "ru",
) -> dict:
    """
    Получить список событий с фильтрацией.

    Params:
        location    — слаг города (kzn, msk, spb, ...)
        categories  — слаги категорий через запятую, напр. "concert,exhibition"
        actual_since — показывать события, начавшиеся после этой даты
        actual_until — показывать события, закончившиеся до этой даты
        is_free     — True = только бесплатные
        tags        — фильтр по тэгам через запятую
        page        — номер страницы
        page_size   — количество событий на странице (макс. 100)
        order_by    — сортировка (напр. "-publication_date", "id", "favorites_count")
        text_format — "text" | "html" | "plain"
    """
    params = {
        "location": location,
        "categories": categories,
        "actual_since": _to_timestamp(actual_since) if actual_since else None,
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
    """Получить детальную информацию о конкретном событии по ID."""
    params = {
        "lang": lang,
        "fields": DEFAULT_FIELDS,
        "expand": "place,location,dates,participants",
        "text_format": "text",
    }
    params = {k: v for k, v in params.items() if v is not None}
    with httpx.Client(timeout=10.0) as client:
        response = client.get(f"{BASE_URL}/events/{event_id}/", params=params)
        response.raise_for_status()
        return response.json()


def get_events_today(location: str = DEFAULT_LOCATION) -> dict:
    """Получить события на сегодня."""
    return _get("events-of-the-day", {"location": location, "expand": "events"})


# ──────────────────────────────────────────────
# МЕСТА
# ──────────────────────────────────────────────

def get_places(
    location: str = DEFAULT_LOCATION,
    categories: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    lang: str = "ru",
) -> dict:
    """Получить список мест (площадок) в городе."""
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
    """Получить детальную информацию о месте по ID."""
    params = {"lang": lang, "expand": "location"}
    with httpx.Client(timeout=10.0) as client:
        response = client.get(f"{BASE_URL}/places/{place_id}/", params=params)
        response.raise_for_status()
        return response.json()


# ──────────────────────────────────────────────
# ПОИСК
# ──────────────────────────────────────────────

def search(
    query: str,
    ctype: str = "event",
    location: str = DEFAULT_LOCATION,
    is_free: Optional[bool] = None,
    page: int = 1,
    page_size: int = 20,
    lang: str = "ru",
) -> dict:
    """
    Полнотекстовый поиск по базе KudaGo.

    Params:
        query   — поисковый запрос
        ctype   — тип объекта: "event" | "place" | "news" | "list"
        location — слаг города
        is_free — только бесплатные
    """
    params = {
        "q": query,
        "ctype": ctype,
        "location": location,
        "is_free": is_free,
        "page": page,
        "page_size": page_size,
        "lang": lang,
        "expand": "place,dates",
    }
    return _get("search", params)


# ──────────────────────────────────────────────
# ВСПОМОГАТЕЛЬНЫЙ ПАРСИНГ ОТВЕТА
# ──────────────────────────────────────────────

def parse_events(response: dict) -> list[dict]:
    """
    Извлечь из ответа API список событий с нужными полями для GatherVibe.
    Возвращает список словарей, готовых для сохранения или отображения.
    """
    results = []
    for event in response.get("results", []):
        # Первая дата события
        dates = event.get("dates", [])
        start_date = dates[0].get("start_date") if dates else None
        start_time = dates[0].get("start_time") if dates else None

        # Место проведения
        place = event.get("place") or {}
        place_title = place.get("title", "")
        place_address = place.get("address", "")
        place_coords = place.get("coords", {})

        # Первое изображение
        images = event.get("images", [])
        image_url = images[0].get("image") if images else None

        results.append({
            "kudago_id": event.get("id"),
            "title": event.get("title", ""),
            "short_title": event.get("short_title", ""),
            "description": event.get("description", ""),
            "body_text": event.get("body_text", ""),
            "categories": event.get("categories", []),
            "tags": event.get("tags", []),
            "price": event.get("price", ""),
            "is_free": event.get("is_free", False),
            "age_restriction": event.get("age_restriction", ""),
            "start_date": start_date,
            "start_time": start_time,
            "place_title": place_title,
            "place_address": place_address,
            "lat": place_coords.get("lat"),
            "lon": place_coords.get("lon"),
            "image_url": image_url,
            "site_url": event.get("site_url", ""),
        })
    return results


# ──────────────────────────────────────────────
# БЫСТРЫЙ ТЕСТ (запуск напрямую: python kudago_api.py)
# ──────────────────────────────────────────────

if __name__ == "__main__":
    import json

    print("=== Города ===")
    locations = get_locations()
    for loc in locations:
        print(f"  {loc['slug']:20} {loc['name']}")

    print("\n=== Категории событий ===")
    cats = get_event_categories()
    for c in cats[:10]:
        print(f"  {c['slug']:30} {c['name']}")

    print("\n=== События в Казани (страница 1) ===")
    resp = get_events(location="kzn", page_size=5)
    events = parse_events(resp)
    print(f"Всего событий: {resp.get('count')}")
    for e in events:
        print(f"  [{e['kudago_id']}] {e['title']}")
        print(f"       Дата: {e['start_date']} {e['start_time']}")
        print(f"       Место: {e['place_title']} — {e['place_address']}")
        print(f"       Цена: {'Бесплатно' if e['is_free'] else e['price']}")
        print()

    print("=== Поиск: концерт в Казани ===")
    search_resp = search("концерт", location="kzn", page_size=3)
    for item in search_resp.get("results", []):
        print(f"  {item.get('title')}")
