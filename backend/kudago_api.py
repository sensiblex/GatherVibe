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

# Именно images даёт массив объектов:
# [{"image": "url", "source": {"name": ..., "link": ...}}, ...]
DEFAULT_FIELDS = (
    "id,title,short_title,slug,description,body_text,"
    "place,location,dates,categories,tags,"
    "price,is_free,age_restriction,images,site_url"
)

DETAIL_FIELDS = (
    "id,title,short_title,slug,description,body_text,"
    "place,location,dates,categories,tags,"
    "price,is_free,age_restriction,images,site_url,"
    "participants"
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


def _parse_images(raw_images: list) -> list[dict]:
    """
    Нормализует массив картинок из KudaGo.

    KudaGo возвращает объекты вида:
        {"image": "https://...", "source": {"name": "...", "link": "https://..."}}

    Возвращает чистый список:
        [{"url": "...", "source_name": "...", "source_link": "..."}, ...]
    """
    result = []
    for img in raw_images:
        if not img.get("image"):
            continue
        source = img.get("source") or {}
        result.append({
            "url": img["image"],
            "source_name": source.get("name", ""),
            "source_link": source.get("link", ""),
        })
    return result


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
        location     — слаг города (kzn, msk, spb, ...)
        categories   — слаги категорий через запятую, напр. "concert,exhibition"
        actual_since — показывать события, начавшиеся после этой даты
        actual_until — показывать события, закончившиеся до этой даты
        is_free      — True = только бесплатные
        tags         — фильтр по тэгам через запятую
        page         — номер страницы
        page_size    — количество событий на странице (макс. 100)
        order_by     — сортировка (напр. "-publication_date", "id", "favorites_count")
        text_format  — "text" | "html" | "plain"
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
    """
    Получить детальную информацию о конкретном событии по ID.
    Возвращает сырой ответ API, для парсинга используй parse_event_detail().
    """
    params = {
        "lang": lang,
        "fields": DETAIL_FIELDS,
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
        query    — поисковый запрос
        ctype    — тип объекта: "event" | "place" | "news" | "list"
        location — слаг города
        is_free  — только бесплатные
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
# ПАРСИНГ ДЛЯ СПИСКА СОБЫТИЙ
# ──────────────────────────────────────────────

def parse_events(response: dict) -> list[dict]:
    """
    Парсит список событий для отображения на карточках/в списке.
    В images — первая картинка для превью, полный массив не нужен.
    """
    results = []
    for event in response.get("results", []):
        dates = event.get("dates", [])
        start_date = dates[0].get("start_date") if dates else None
        start_time = dates[0].get("start_time") if dates else None

        place = event.get("place") or {}
        place_coords = place.get("coords") or {}

        images = _parse_images(event.get("images", []))
        # Для карточки достаточно первое фото
        cover_url = images[0]["url"] if images else None

        results.append({
            "kudago_id": event.get("id"),
            "title": event.get("title", ""),
            "short_title": event.get("short_title", ""),
            "description": event.get("description", ""),
            "categories": event.get("categories", []),
            "tags": event.get("tags", []),
            "price": event.get("price", ""),
            "is_free": event.get("is_free", False),
            "age_restriction": event.get("age_restriction", ""),
            "start_date": start_date,
            "start_time": start_time,
            "place_title": place.get("title", ""),
            "place_address": place.get("address", ""),
            "lat": place_coords.get("lat"),
            "lon": place_coords.get("lon"),
            "cover_url": cover_url,   # одно фото для превью
            "site_url": event.get("site_url", ""),
        })
    return results


# ──────────────────────────────────────────────
# ПАРСИНГ ДЛЯ СТРАНИЦЫ СОБЫТИЯ (С ГАЛЕРЕЕЙ)
# ──────────────────────────────────────────────

def parse_event_detail(event: dict) -> dict:
    """
    Парсит одно событие (сырой ответ get_event_by_id) для страницы события.

    Отличие от parse_events():
      - images — полный массив всех картинок [{"url", "source_name", "source_link"}, ...]
      - all_dates — все даты проведения (not just first)
      - body_text  — полное описание
      - participants — участники события (артисты, спикеры и т.д.)
    """
    place = event.get("place") or {}
    place_coords = place.get("coords") or {}

    # Сразу все картинки с кредитами
    images = _parse_images(event.get("images", []))

    # Все даты проведения (u события может быть несколько дат)
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

    # Участники: [{"title": ..., "agent": {"title", "images"}}]
    participants = [
        {
            "role": p.get("role", ""),
            "name": (p.get("agent") or {}).get("title", ""),
            "image_url": (
                _parse_images((p.get("agent") or {}).get("images", []))[0]["url"]
                if _parse_images((p.get("agent") or {}).get("images", []))
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
        "body_text": event.get("body_text", ""),   # полный текст
        "categories": event.get("categories", []),
        "tags": event.get("tags", []),
        "price": event.get("price", ""),
        "is_free": event.get("is_free", False),
        "age_restriction": event.get("age_restriction", ""),
        # Галерея — весь массив картинок
        "images": images,               # [{"url", "source_name", "source_link"}, ...]
        "cover_url": images[0]["url"] if images else None,
        # Даты
        "all_dates": all_dates,
        "start_date": all_dates[0]["start"] if all_dates else None,
        "start_time": all_dates[0]["start_time"] if all_dates else None,
        # Место
        "place_title": place.get("title", ""),
        "place_address": place.get("address", ""),
        "place_phone": place.get("phone", ""),
        "place_subway": place.get("subway", ""),
        "lat": place_coords.get("lat"),
        "lon": place_coords.get("lon"),
        # Участники
        "participants": participants,
        "site_url": event.get("site_url", ""),
    }


# ──────────────────────────────────────────────
# БЫСТРЫЙ ТЕСТ (запуск: python kudago_api.py)
# ──────────────────────────────────────────────

if __name__ == "__main__":
    print("=== Города ===")
    locations = get_locations()
    for loc in locations:
        print(f"  {loc['slug']:20} {loc['name']}")

    print("\n=== События в Казани (5 шт.) ===")
    resp = get_events(location="kzn", page_size=5)
    events = parse_events(resp)
    print(f"Всего событий: {resp.get('count')}")
    for e in events:
        print(f"  [{e['kudago_id']}] {e['title']}")
        print(f"       Обложка: {e['cover_url']}")
        print()

    if events:
        first_id = events[0]["kudago_id"]
        print(f"\n=== Деталь: событие #{first_id} ===")
        raw = get_event_by_id(first_id)
        detail = parse_event_detail(raw)
        print(f"  Название:   {detail['title']}")
        print(f"  Описание:  {detail['description'][:120]}...")
        print(f"  Картинок: {len(detail['images'])} шт.")
        for i, img in enumerate(detail["images"]):
            src = f" (источник: {img['source_name']})" if img["source_name"] else ""
            print(f"    [{i+1}] {img['url']}{src}")
        print(f"  Даты ({len(detail['all_dates'])} шт.):")
        for d in detail["all_dates"][:3]:
            print(f"    → {d['start']} {d['start_time'] or ''}")
        if detail["participants"]:
            print(f"  Участники:")
            for p in detail["participants"][:5]:
                print(f"    [{p['role']}] {p['name']}")
