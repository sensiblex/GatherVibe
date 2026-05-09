from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Dict, List, Literal, Optional
from datetime import datetime
import math
import re

from utils.sanitize import sanitize_input

_SQL_META_RE = re.compile(r"(?:'|\"|;|--|/\*|\*/)")
_SQL_KEYWORD_RE = re.compile(
    r"\b(?:union|select|drop|insert|update|delete|exec|execute)\b",
    flags=re.IGNORECASE,
)
_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_-]+$")
_CITY_RE = re.compile(r"^[a-zA-Zа-яА-ЯёЁ\s-]+$")


def _reject_sql_tokens(value: str) -> None:
    if _SQL_META_RE.search(value) or _SQL_KEYWORD_RE.search(value):
        raise ValueError("Input contains forbidden SQL tokens")


def _sanitize_optional(cls, v):
    """Санитизация опциональных полей"""
    if v is None:
        return None
    return sanitize_input(str(v))


def _sanitize_optional_strict(cls, v):
    """Строгая санитизация + SQL-токены запрещены для auth-полей."""
    if v is None:
        return None
    raw = str(v)
    _reject_sql_tokens(raw)
    return sanitize_input(raw)


def _sanitize_list(cls, v):
    """Санитизация списка"""
    if v is None:
        return None
    sanitized: List[str] = []
    for x in v:
        if x is None:
            continue
        cleaned = sanitize_input(str(x))
        if cleaned is not None:
            sanitized.append(cleaned)
    return sanitized


class UserCreate(BaseModel):
    """Модель создания пользователя"""
    email: EmailStr
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=8, max_length=128)
    city: Optional[str] = Field(default=None, max_length=100)
    interests: Optional[str] = Field(default=None, max_length=500)

    _sanitize = field_validator("username", "city", "interests", mode="before")(_sanitize_optional_strict)

    @field_validator("username")
    @classmethod
    def _validate_username(cls, v: str) -> str:
        if not _USERNAME_RE.fullmatch(v):
            raise ValueError("Username can only contain letters, numbers, hyphens, and underscores")
        return v

    @field_validator("city")
    @classmethod
    def _validate_city(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        if not _CITY_RE.fullmatch(v):
            raise ValueError("City can only contain letters, spaces, and hyphens")
        return v


class UserLogin(BaseModel):
    """Модель логина пользователя"""
    email: EmailStr
    password: str


class Token(BaseModel):
    """Модель токена"""
    access_token: str
    token_type: str
    user_id: int
    username: str
    email: str


class UserResponse(BaseModel):
    """Модель ответа пользователя"""
    id: int
    email: str
    username: str
    city: Optional[str]
    interests: Optional[str]
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: bool
    role: Optional[str] = "user"
    is_banned: Optional[bool] = False
    banned_until: Optional[datetime] = None
    muted_until: Optional[datetime] = None
    warnings_count: Optional[int] = 0
    trust_score: Optional[float] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    """Модель обновления пользователя"""
    username: Optional[str] = Field(default=None, min_length=1, max_length=50)
    city: Optional[str] = Field(default=None, max_length=100)
    bio: Optional[str] = Field(default=None, max_length=200)
    interests: Optional[str] = Field(default=None, max_length=500)
    old_password: Optional[str] = None
    new_password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    avatar_url: Optional[str] = None

    _sanitize = field_validator(
        "username", "city", "bio", "interests",
        mode="before",
    )(_sanitize_optional_strict)

    @field_validator("username")
    @classmethod
    def _validate_username(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        if not _USERNAME_RE.fullmatch(v):
            raise ValueError("Username can only contain letters, numbers, hyphens, and underscores")
        return v

    @field_validator("city")
    @classmethod
    def _validate_city(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        if not _CITY_RE.fullmatch(v):
            raise ValueError("City can only contain letters, spaces, and hyphens")
        return v


POSITIVE_REVIEW_TAGS: List[str] = [
    """Теги положительных отзывов"""
    "Пунктуальный",
    "Общительный",
    "Весёлый",
    "Надёжный",
    "Культурный",
    "Интересный собеседник",
    "Помогает другим",
    "Позитивный",
]

NEGATIVE_REVIEW_TAGS: List[str] = [
    """Теги отрицательных отзывов"""
    "Опоздал",
    "Не пришёл",
    "Грубый",
    "Недружелюбный",
    "Ненадёжный",
    "Скучный",
]

ALLOWED_REVIEW_TAGS: List[str] = POSITIVE_REVIEW_TAGS + NEGATIVE_REVIEW_TAGS


class ReviewCreate(BaseModel):
    """Модель создания отзыва"""
    reviewed_id: int
    party_id: int
    rating: int = Field(..., ge=1, le=5)
    text: Optional[str] = Field(None, max_length=2000)
    tags: Optional[List[str]] = None

    _sanitize_text = field_validator("text", mode="before")(_sanitize_optional)


class ReviewOut(BaseModel):
    """Модель ответа отзыва"""
    id: int
    reviewer_id: int
    reviewer_username: str
    reviewer_avatar_url: Optional[str] = None
    rating: int
    text: Optional[str] = None
    tags: Optional[List[str]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ReviewUpdate(BaseModel):
    """Модель обновления отзыва"""
    rating: Optional[int] = Field(None, ge=1, le=5)
    text: Optional[str] = Field(None, max_length=2000)
    tags: Optional[List[str]] = None

    _sanitize_text = field_validator("text", mode="before")(_sanitize_optional)


class ReviewSummary(BaseModel):
    """Модель суммы отзывов"""
    avg_rating: Optional[float]
    total_reviews: int
    reviews: List[ReviewOut]
    stars_distribution: Dict[int, int]
    top_tags: List[str]
    top_positive_tags: List[str] = []
    top_negative_tags: List[str] = []
    page: int = 1
    per_page: int = 10
    total_pages: int = 1


class ReviewableUser(BaseModel):
    """Модель пользователя, на которого оставили отзыв"""
    user_id: int
    username: str
    avatar_url: Optional[str] = None
    party_id: int
    event_id: str


class ReviewReport(BaseModel):
    """Модель отчета об отзыве"""
    reason: Optional[str] = None

    _sanitize = field_validator("reason", mode="before")(_sanitize_optional)


class EventBase(BaseModel):
    """Модель основы события"""
    title: str
    description: Optional[str] = None
    date_time: datetime
    location: str
    address: Optional[str] = None
    city: str
    category: str
    price: float = 0.0
    max_participants: Optional[int] = None
    image_url: Optional[str] = None
    external_link: Optional[str] = None


class EventCreate(EventBase):
    """Модель создания события"""
    pass


class EventUpdate(BaseModel):
    """Модель обновления события"""
    title: Optional[str] = None
    description: Optional[str] = None
    date_time: Optional[datetime] = None
    location: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    max_participants: Optional[int] = None
    image_url: Optional[str] = None
    external_link: Optional[str] = None
    is_active: Optional[bool] = None


class EventResponse(EventBase):
    """Модель ответа события"""
    id: int
    created_by: int
    current_participants: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True




class PartySearchParams(BaseModel):
    """Модель параметров поиска событий"""
    q: Optional[str] = None
    city: Optional[str] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    min_members: Optional[int] = Field(default=None, ge=1)
    max_members: Optional[int] = Field(default=None, ge=1)
    sort_by: Literal["date", "popular", "new"] = "new"
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=100)


class PartySearchItem(BaseModel):
    """Модель элемента поиска событий"""
    id: int
    event_id: str
    title: str
    description: Optional[str]
    max_members: int
    creator_id: int
    creator_username: str
    is_open: bool
    city: Optional[str]
    member_count: int
    event_title: Optional[str] = None
    event_date_ts: Optional[int] = None
    event_image_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PartySearchResponse(BaseModel):
    """Модель ответа поиска событий"""
    items: List[PartySearchItem]
    total: int
    page: int
    per_page: int
    pages: int

    @classmethod
    def build(
        cls,
        items: List[PartySearchItem],
        total: int,
        page: int,
        per_page: int,
    ) -> "PartySearchResponse":
        pages = math.ceil(total / per_page) if total > 0 else 0
        return cls(items=items, total=total, page=page, per_page=per_page, pages=pages)




class MeetingPlanUpdate(BaseModel):
    """Модель обновления плана встречи"""
    meet_time: Optional[datetime] = None
    meet_location: Optional[str] = Field(None, max_length=300)
    note: Optional[str] = Field(None, max_length=300)
    meet_lat: Optional[float] = Field(None, ge=-90.0, le=90.0)
    meet_lon: Optional[float] = Field(None, ge=-180.0, le=180.0)
    meet_landmark: Optional[str] = Field(None, max_length=200)

    _sanitize = field_validator("meet_location", "note", "meet_landmark", mode="before")(_sanitize_optional)


class MeetingPlanResponse(BaseModel):
    """Модель ответа плана встречи"""
    meet_time: Optional[datetime] = None
    meet_location: Optional[str] = None
    note: Optional[str] = None
    meet_lat: Optional[float] = None
    meet_lon: Optional[float] = None
    meet_landmark: Optional[str] = None
    updated_by_username: Optional[str] = None
    updated_at: Optional[datetime] = None


class MeetingPlanHistoryItem(BaseModel):
    """Модель элемента истории плана встречи"""
    meet_time: Optional[datetime] = None
    meet_location: Optional[str] = None
    note: Optional[str] = None
    meet_lat: Optional[float] = None
    meet_lon: Optional[float] = None
    meet_landmark: Optional[str] = None
    changed_by_username: str
    changed_at: datetime
