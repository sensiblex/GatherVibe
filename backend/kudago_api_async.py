import httpx
import time
import asyncio
import logging
from typing import Optional, List, Dict, Any
from zoneinfo import ZoneInfo

from kudago_api_models import (
    EventsRequest, SearchRequest,
    Event, EventDetail, EventsResponse, SearchResponse, EventDetailResponse,
)
from kudago_api_cache import cached
from kudago_api_monitor import monitor_async_request
from kudago_common import safe_str as _safe_str

logger = logging.getLogger("kudago_api_async")

BASE_URL = "https://kudago.com/public-api/v1.4"
DEFAULT_TIMEOUT = 10.0
KUDAGO_TIMEZONE = ZoneInfo("Europe/Moscow")


def _format_kudago_timestamp(ts: int) -> tuple[str, str]:
    """
    Преобразовать timestamp в дату и время
    """
    import datetime

    dt = datetime.datetime.fromtimestamp(ts, tz=KUDAGO_TIMEZONE)
    return dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M")

class KudaGoAsyncClient:
    """Асинхронный клиент для API KudaGo."""
    
    def __init__(self, base_url: str = BASE_URL, timeout: float = DEFAULT_TIMEOUT):
        self.base_url = base_url
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Получить или создать асинхронный HTTP-клиент."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self.timeout,
                limits=httpx.Limits(max_connections=100, max_keepalive_connections=20)
            )
        return self._client
    
    async def close(self):
        """Закрыть HTTP-клиент."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
    
    async def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Выполнить асинхронный HTTP-запрос."""
        client = await self._get_client()
        url = f"{self.base_url}/{path}/"
        
        logger.info(f"Async Request: {method} {url} | Params: {params}")
        
        response = await client.request(method, url, params=params, json=json)
        response.raise_for_status()
        
        return response.json()


_client: Optional[KudaGoAsyncClient] = None


def get_client() -> KudaGoAsyncClient:
    """Получить глобальный экземпляр клиента."""
    global _client
    if _client is None:
        _client = KudaGoAsyncClient()
    return _client


async def close_client():
    """Закрыть глобальный клиент."""
    global _client
    if _client:
        await _client.close()
        _client = None



@monitor_async_request
@cached(ttl=300, key_prefix="events")
async def get_events(
    location: str = "kzn",
    categories: Optional[str] = None,
    is_free: Optional[bool] = None,
    page: int = 1,
    page_size: int = 20,
    actual_since: Optional[int] = None,
    actual_until: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Получить список событий
    """
    now_ts = int(time.time())
    params: Dict[str, Any] = {
        "location": location,
        "page": page,
        "page_size": page_size,
        "fields": "id,title,short_title,description,body_text,categories,tags,price,is_free,age_restriction,images,dates,place,site_url",
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
    
    client = get_client()
    return await client._request("GET", "events", params=params)


@monitor_async_request
@cached(ttl=300, key_prefix="search")
async def search(
    query: str,
    ctype: str = "event",
    location: str = "kzn",
    is_free: Optional[bool] = None,
    page: int = 1,
    page_size: int = 20,
    actual_since: Optional[int] = None,
    actual_until: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Поиск событий и мест.
    """
    now_ts = int(time.time())
    params: Dict[str, Any] = {
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
    
    client = get_client()
    return await client._request("GET", "search", params=params)


@monitor_async_request
@cached(ttl=600, key_prefix="event")
async def get_event_by_id(event_id: int) -> Dict[str, Any]:
    """
    Получить событие по ID.
    """
    params = {
        "fields": "id,title,short_title,description,body_text,categories,tags,price,is_free,age_restriction,images,dates,place,site_url,participants",
        "expand": "images,place,dates,participants",
    }
    
    client = get_client()
    return await client._request("GET", f"events/{event_id}", params=params)


@monitor_async_request
@cached(ttl=3600, key_prefix="events_today")
async def get_events_today(location: str = "kzn") -> Dict[str, Any]:
    """
    Получить события на сегодня
    """
    import datetime
    today = datetime.date.today()
    start = int(time.mktime(today.timetuple()))
    end = start + 86399
    
    return await get_events(
        location=location,
        page=1,
        page_size=20,
        actual_since=start,
        actual_until=end
    )


@monitor_async_request
@cached(ttl=3600, key_prefix="categories")
async def get_event_categories() -> List[Dict[str, Any]]:
    """
    Получить список категорий событий
    """
    client = get_client()
    data = await client._request("GET", "event-categories")
    
    if isinstance(data, list):
        return data
    return data.get("results", data)


@monitor_async_request
@cached(ttl=86400, key_prefix="locations")
async def get_locations() -> List[Dict[str, Any]]:
    """
    Получить список доступных локаций
    """
    client = get_client()
    data = await client._request("GET", "locations")
    
    if isinstance(data, list):
        return data
    return data.get("results", data)


async def parse_events(raw: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Парсить сырые данные событий в структурированный формат
    """
    import time
    now_ts = int(time.time())
    results = raw.get("results", [])
    out = []
    
    for e in results:
        raw_dates = e.get("dates") or []
        start_date = None
        start_time = None
        all_dates = []
        
        # Отфильтровать только будущие даты (start >= now_ts)
        future_dates = []
        for d in raw_dates:
            start_ts = d.get("start")
            if start_ts is not None and start_ts >= now_ts:
                future_dates.append(d)
        
        # all_dates должны содержать только будущие даты
        if future_dates:
            for d in future_dates:
                start_ts = d.get("start")
                end_ts = d.get("end")
                sd = st = ed = et = None
                
                if start_ts:
                    sd, st = _format_kudago_timestamp(start_ts)
                if end_ts:
                    ed, et = _format_kudago_timestamp(end_ts)
                
                all_dates.append({
                    "start": sd, "end": ed,
                    "start_time": st, "end_time": et,
                    "is_continuous": d.get("is_continuous", False),
                    "is_endless": d.get("is_endless", False),
                })
            
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
            continue 
        
        place = e.get("place") or {}
        images = e.get("images") or []
        imgs = [
            {
                "url": img.get("image", ""),
                "source_name": img.get("source", {}).get("name", "") if isinstance(img.get("source"), dict) else "",
                "source_link": img.get("source", {}).get("link", "") if isinstance(img.get("source"), dict) else ""
            }
            for img in images if img.get("image")
        ]
        
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


async def parse_event_detail(e: Dict[str, Any]) -> Dict[str, Any]:
    """
    Парсить детальную информацию о событии
    """
    import time
    now_ts = int(time.time())
    raw_dates = e.get("dates") or []
    start_date = None
    start_time = None
    all_dates = []
    
    # Отфильтровать только будущие даты (start >= now_ts)
    future_dates = []
    for d in raw_dates:
        start_ts = d.get("start")
        if start_ts is not None and start_ts >= now_ts:
            future_dates.append(d)
    
    if future_dates:
        for d in future_dates:
            start_ts = d.get("start")
            end_ts = d.get("end")
            sd = st = ed = et = None
            
            if start_ts:
                sd, st = _format_kudago_timestamp(start_ts)
            if end_ts:
                ed, et = _format_kudago_timestamp(end_ts)
            
            all_dates.append({
                "start": sd, "end": ed,
                "start_time": st, "end_time": et,
                "is_continuous": d.get("is_continuous", False),
                "is_endless": d.get("is_endless", False)
            })
        
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
        # Нет будущих дат — событие уже прошло, не добавляем даты
        pass
    
    place = e.get("place") or {}
    images = e.get("images") or []
    imgs = [
        {
            "url": img.get("image", ""),
            "source_name": img.get("source", {}).get("name", "") if isinstance(img.get("source"), dict) else "",
            "source_link": img.get("source", {}).get("link", "") if isinstance(img.get("source"), dict) else ""
        }
        for img in images if img.get("image")
    ]
    
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

async def get_multiple_events(
    event_ids: List[int],
    max_concurrent: int = 10
) -> List[Dict[str, Any]]:
    """
    Получить несколько событий
    """
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def fetch_event(event_id: int) -> Dict[str, Any]:
        async with semaphore:
            return await get_event_by_id(event_id)
    
    tasks = [fetch_event(eid) for eid in event_ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Фильтруем ошибки
    return [r for r in results if not isinstance(r, Exception)]


async def search_and_get_details(
    query: str,
    location: str = "kzn",
    max_events: int = 5
) -> List[Dict[str, Any]]:
    """
    Поиск событий с получением деталей
    """
    # Поиск событий
    search_results = await search(query=query, location=location, page_size=max_events)
    events = search_results.get("results", [])
    
    if not events:
        return []
    
    # Получаем ID событий
    event_ids = [e.get("id") for e in events if e.get("id")]
    
    # Конкурентно получаем детали
    details = await get_multiple_events(event_ids)
    
    return details

async def get_events_validated(request: EventsRequest) -> EventsResponse:
    """
    Получить события с валидацией
    """
    raw = await get_events(
        location=request.location,
        categories=request.categories,
        is_free=request.is_free,
        page=request.page,
        page_size=request.page_size,
        actual_since=request.actual_since,
        actual_until=request.actual_until,
    )
    
    events = await parse_events(raw)
    
    return EventsResponse(
        count=raw.get("count", len(events)),
        next_page=raw.get("next"),
        previous_page=raw.get("previous"),
        events=[Event(**e) for e in events]
    )


async def get_event_detail_validated(event_id: int) -> EventDetailResponse:
    """
    Получить детали события с валидацией
    """
    raw = await get_event_by_id(event_id)
    event = await parse_event_detail(raw)
    
    return EventDetailResponse(
        event=EventDetail(**event)
    )


async def search_validated(request: SearchRequest) -> SearchResponse:
    """
    Поиск с валидацией
    """
    raw = await search(
        query=request.query,
        ctype=request.ctype,
        location=request.location,
        is_free=request.is_free,
        page=request.page,
        page_size=request.page_size,
        actual_since=request.actual_since,
        actual_until=request.actual_until,
    )
    
    events = await parse_events(raw)
    
    return SearchResponse(
        count=raw.get("count", len(events)),
        next_page=raw.get("next"),
        previous_page=raw.get("previous"),
        results=[Event(**e) for e in events]
    )
