"""
Асинхронный клиент для API KudaGo.
Переписанная версия с использованием httpx и async/await.
Поддержка конкурентной обработки запросов, кэширования и мониторинга.
"""
import httpx
import time
import asyncio
import logging
from typing import Optional, List, Dict, Any

from kudago_api_models import (
    EventsRequest, SearchRequest, EventByIdRequest, EventsTodayRequest,
    Event, EventDetail, EventsResponse, SearchResponse, EventDetailResponse,
    CategoriesResponse, LocationsResponse
)
from kudago_api_cache import cached, get_cache_instance, clear_cache
from kudago_api_monitor import metrics_collector, monitor_async_request

logger = logging.getLogger("kudago_api_async")

BASE_URL = "https://kudago.com/public-api/v1.4"
DEFAULT_TIMEOUT = 10.0


# ==================== Асинхронный HTTP-клиент ====================

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


# Глобальный экземпляр клиента
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


# ==================== API методы ====================

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
    Получить список событий.
    
    Args:
        location: Город (kzn, msk, spb и т.д.)
        categories: Категории через запятую
        is_free: Только бесплатные
        page: Номер страницы
        page_size: Размер страницы
        actual_since: Начало периода (timestamp)
        actual_until: Конец периода (timestamp)
    
    Returns:
        Словарь с событиями
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
    
    Args:
        query: Поисковый запрос
        ctype: Тип контента (event, place)
        location: Город
        is_free: Только бесплатные
        page: Номер страницы
        page_size: Размер страницы
        actual_since: Начало периода
        actual_until: Конец периода
    
    Returns:
        Результаты поиска
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
    
    Args:
        event_id: ID события
    
    Returns:
        Детали события
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
    Получить события на сегодня.
    
    Args:
        location: Город
    
    Returns:
        События на сегодня
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
    Получить список категорий событий.
    
    Returns:
        Список категорий
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
    Получить список доступных локаций.
    
    Returns:
        Список локаций
    """
    client = get_client()
    data = await client._request("GET", "locations")
    
    if isinstance(data, list):
        return data
    return data.get("results", data)


# ==================== Функции парсинга ====================

def _safe_str(val: Any) -> str:
    """Безопасное преобразование значения в строку."""
    if not val and val != 0:
        return ""
    if isinstance(val, str):
        return val
    if isinstance(val, dict):
        return str(val.get("name") or val.get("slug") or val.get("title") or val.get("id") or "")
    return str(val)


async def parse_events(raw: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Парсить сырые данные событий в структурированный формат.
    
    Args:
        raw: Сырые данные от API
    
    Returns:
        Список событий
    """
    import datetime
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
                    dt = datetime.datetime.fromtimestamp(start_ts)
                    sd = dt.strftime("%Y-%m-%d")
                    st = dt.strftime("%H:%M")
                if end_ts:
                    dt2 = datetime.datetime.fromtimestamp(end_ts)
                    ed = dt2.strftime("%Y-%m-%d")
                    et = dt2.strftime("%H:%M")
                
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
                dt = datetime.datetime.fromtimestamp(selected_date["start"])
                start_date = dt.strftime("%Y-%m-%d")
                start_time = dt.strftime("%H:%M")
        else:
            # Нет будущих дат — событие уже прошло, не добавляем даты
            # start_date и start_time остаются None, all_dates пуст
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
    Парсить детальную информацию о событии.
    
    Args:
        e: Сырые данные события
    
    Returns:
        Детали события
    """
    import datetime
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
                dt = datetime.datetime.fromtimestamp(start_ts)
                sd = dt.strftime("%Y-%m-%d")
                st = dt.strftime("%H:%M")
            if end_ts:
                dt2 = datetime.datetime.fromtimestamp(end_ts)
                ed = dt2.strftime("%Y-%m-%d")
                et = dt2.strftime("%H:%M")
            
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
            dt = datetime.datetime.fromtimestamp(selected_date["start"])
            start_date = dt.strftime("%Y-%m-%d")
            start_time = dt.strftime("%H:%M")
    else:
        # Нет будущих дат — событие уже прошло, не добавляем даты
        # start_date и start_time остаются None, all_dates пуст
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


# ==================== Конкурентные запросы ====================

async def get_multiple_events(
    event_ids: List[int],
    max_concurrent: int = 10
) -> List[Dict[str, Any]]:
    """
    Получить несколько событий конкурентно.
    
    Args:
        event_ids: Список ID событий
        max_concurrent: Максимальное количество параллельных запросов
    
    Returns:
        Список событий
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
    Поиск событий с получением деталей конкурентно.
    
    Args:
        query: Поисковый запрос
        location: Город
        max_events: Максимальное количество событий для получения деталей
    
    Returns:
        Список событий с деталями
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


# ==================== Валидация с Pydantic ====================

async def get_events_validated(request: EventsRequest) -> EventsResponse:
    """
    Получить события с валидацией через Pydantic.
    
    Args:
        request: Валидированный запрос
    
    Returns:
        Валидированный ответ
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
    Получить детали события с валидацией через Pydantic.
    
    Args:
        event_id: ID события
    
    Returns:
        Валидированный ответ
    """
    raw = await get_event_by_id(event_id)
    event = await parse_event_detail(raw)
    
    return EventDetailResponse(
        event=EventDetail(**event)
    )


async def search_validated(request: SearchRequest) -> SearchResponse:
    """
    Поиск с валидацией через Pydantic.
    
    Args:
        request: Валидированный запрос
    
    Returns:
        Валидированный ответ
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