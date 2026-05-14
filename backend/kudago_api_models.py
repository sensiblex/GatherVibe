from datetime import datetime, timezone
from typing import Optional, List, Any
from pydantic import BaseModel, Field, field_validator


class EventsRequest(BaseModel):
    """Модель запроса для получения списка событий."""
    location: str = Field(default="kzn", description="Город (kzn, msk, spb)")
    categories: Optional[str] = Field(default=None, description="Категории через запятую")
    is_free: Optional[bool] = Field(default=None, description="Только бесплатные")
    page: int = Field(default=1, ge=1, description="Номер страницы")
    page_size: int = Field(default=20, ge=1, le=100, description="Размер страницы")
    actual_since: Optional[int] = Field(default=None, description="Начало периода (timestamp)")
    actual_until: Optional[int] = Field(default=None, description="Конец периода (timestamp)")

    @field_validator("location")
    @classmethod
    def validate_location(cls, v: str) -> str:
        allowed = {"kzn", "msk", "spb", "ekb", "nsk", "rostov", "krasnodar", "ufa", "perm", "voronezh"}
        if v.lower() not in allowed:
            raise ValueError(f"location должен быть одним из: {allowed}")
        return v.lower()


class SearchRequest(BaseModel):
    """Модель запроса для поиска."""
    query: str = Field(..., min_length=1, max_length=200, description="Поисковый запрос")
    ctype: str = Field(default="event", description="Тип контента (event, place)")
    location: str = Field(default="kzn", description="Город")
    is_free: Optional[bool] = Field(default=None, description="Только бесплатные")
    page: int = Field(default=1, ge=1, description="Номер страницы")
    page_size: int = Field(default=20, ge=1, le=100, description="Размер страницы")
    actual_since: Optional[int] = Field(default=None, description="Начало периода")
    actual_until: Optional[int] = Field(default=None, description="Конец периода")

    @field_validator("ctype")
    @classmethod
    def validate_ctype(cls, v: str) -> str:
        allowed = {"event", "place"}
        if v not in allowed:
            raise ValueError(f"ctype должен быть одним из: {allowed}")
        return v


class EventByIdRequest(BaseModel):
    """Модель запроса для получения события по ID."""
    event_id: int = Field(..., gt=0, description="ID события")


class EventsTodayRequest(BaseModel):
    """Модель запроса для получения событий на сегодня."""
    location: str = Field(default="kzn", description="Город")


class EventImage(BaseModel):
    """Модель изображения события."""
    url: str = Field(..., description="URL изображения")
    source_name: str = Field(default="", description="Название источника")
    source_link: str = Field(default="", description="Ссылка на источник")


class EventDate(BaseModel):
    """Модель даты события."""
    start: Optional[str] = Field(default=None, description="Дата начала (YYYY-MM-DD)")
    end: Optional[str] = Field(default=None, description="Дата окончания (YYYY-MM-DD)")
    start_time: Optional[str] = Field(default=None, description="Время начала (HH:MM)")
    end_time: Optional[str] = Field(default=None, description="Время окончания (HH:MM)")
    is_continuous: bool = Field(default=False, description="Непрерывное событие")
    is_endless: bool = Field(default=False, description="Бесконечное событие")


class EventPlace(BaseModel):
    """Модель места проведения события."""
    title: str = Field(default="", description="Название места")
    address: str = Field(default="", description="Адрес")
    phone: str = Field(default="", description="Телефон")
    subway: str = Field(default="", description="Метро")
    lat: Optional[float] = Field(default=None, description="Широта")
    lon: Optional[float] = Field(default=None, description="Долгота")


class EventParticipant(BaseModel):
    """Модель участника события."""
    role: str = Field(default="", description="Роль участника")
    name: str = Field(default="", description="Имя участника")
    image_url: Optional[str] = Field(default=None, description="URL изображения")


class Event(BaseModel):
    """Модель события (краткая версия для списка)."""
    kudago_id: int = Field(..., description="ID события в KudaGo")
    title: str = Field(..., description="Название события")
    short_title: str = Field(default="", description="Короткое название")
    description: str = Field(default="", description="Описание")
    categories: List[str] = Field(default_factory=list, description="Категории")
    price: str = Field(default="", description="Цена")
    is_free: bool = Field(default=False, description="Бесплатное событие")
    age_restriction: Optional[str] = Field(default=None, description="Возрастное ограничение")
    images: List[EventImage] = Field(default_factory=list, description="Изображения")
    cover_url: Optional[str] = Field(default=None, description="URL обложки")
    start_date: Optional[str] = Field(default=None, description="Дата начала")
    start_time: Optional[str] = Field(default=None, description="Время начала")
    all_dates: List[EventDate] = Field(default_factory=list, description="Все даты")
    place_title: str = Field(default="", description="Название места")
    place_address: str = Field(default="", description="Адрес места")
    place_phone: str = Field(default="", description="Телефон места")
    place_subway: str = Field(default="", description="Метро")
    lat: Optional[float] = Field(default=None, description="Широта")
    lon: Optional[float] = Field(default=None, description="Долгота")
    site_url: str = Field(default="", description="Ссылка на событие")


class EventDetail(Event):
    """Модель детальной информации о событии."""
    body_text: str = Field(default="", description="Полный текст")
    tags: List[str] = Field(default_factory=list, description="Теги")
    participants: List[EventParticipant] = Field(default_factory=list, description="Участники")


class EventsResponse(BaseModel):
    """Модель ответа со списком событий."""
    count: int = Field(..., description="Общее количество")
    next_page: Optional[int] = Field(default=None, description="Следующая страница")
    previous_page: Optional[int] = Field(default=None, description="Предыдущая страница")
    events: List[Event] = Field(..., description="Список событий")


class SearchResponse(BaseModel):
    """Модель ответа поиска."""
    count: int = Field(..., description="Общее количество")
    next_page: Optional[int] = Field(default=None, description="Следующая страница")
    previous_page: Optional[int] = Field(default=None, description="Предыдущая страница")
    results: List[Event] = Field(..., description="Результаты поиска")


class EventDetailResponse(BaseModel):
    """Модель ответа с детальной информацией о событии."""
    event: EventDetail = Field(..., description="Детали события")


class CategoriesResponse(BaseModel):
    """Модель ответа со списком категорий."""
    categories: List[Any] = Field(..., description="Список категорий")


class LocationsResponse(BaseModel):
    """Модель ответа со списком локаций."""
    locations: List[Any] = Field(..., description="Список локаций")


class APIHealthStatus(BaseModel):
    """Модель статуса здоровья API."""
    status: str = Field(..., description="Статус (healthy, degraded, unhealthy)")
    latency_ms: float = Field(..., description="Задержка в миллисекундах")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Время проверки")
    service: str = Field(default="kudago_api", description="Название сервиса")


class APIMetrics(BaseModel):
    """Модель метрик API."""
    total_requests: int = Field(default=0, description="Всего запросов")
    successful_requests: int = Field(default=0, description="Успешные запросы")
    failed_requests: int = Field(default=0, description="Неудачные запросы")
    cache_hits: int = Field(default=0, description="Попадания в кэш")
    cache_misses: int = Field(default=0, description="Промахи кэша")
    avg_latency_ms: float = Field(default=0.0, description="Средняя задержка")
    min_latency_ms: float = Field(default=0.0, description="Минимальная задержка")
    max_latency_ms: float = Field(default=0.0, description="Максимальная задержка")