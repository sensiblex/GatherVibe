from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Dict, List, Literal, Optional
from datetime import date, datetime
import math

from utils.sanitize import sanitize_text


def _sanitize_optional(cls, v):
    return sanitize_text(v)


def _sanitize_list(cls, v):
    if v is None:
        return None
    return [sanitize_text(x) for x in v if x is not None]


class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=8, max_length=128)
    city: Optional[str] = Field(default=None, max_length=100)
    interests: Optional[str] = Field(default=None, max_length=500)

    _sanitize = field_validator("username", "city", "interests", mode="before")(_sanitize_optional)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    username: str
    email: str


class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    city: Optional[str]
    interests: Optional[str]
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: bool
    birth_date: Optional[date] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    geo_precision: Optional[str] = None
    show_age: Optional[bool] = True
    is_discoverable_on_events: Optional[bool] = False
    preferred_categories: Optional[str] = None
    preferred_days: Optional[str] = None
    preferred_time: Optional[str] = None
    budget_max: Optional[int] = None
    # Moderation
    role: Optional[str] = "user"
    is_banned: Optional[bool] = False
    banned_until: Optional[datetime] = None
    muted_until: Optional[datetime] = None
    warnings_count: Optional[int] = 0

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    username: Optional[str] = None
    city: Optional[str] = None
    bio: Optional[str] = None
    interests: Optional[str] = None
    old_password: Optional[str] = None
    new_password: Optional[str] = None
    avatar_url: Optional[str] = None

    # Matching profile
    birth_date: Optional[date] = None
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    geo_precision: Optional[Literal["city", "district", "exact"]] = None
    show_age: Optional[bool] = None
    is_discoverable_on_events: Optional[bool] = None
    preferred_categories: Optional[str] = Field(default=None, max_length=500)
    preferred_days: Optional[Literal["weekends", "weekdays", "any"]] = None
    preferred_time: Optional[Literal["morning", "evening", "any"]] = None
    budget_max: Optional[int] = Field(default=None, ge=0, le=1_000_000)

    _sanitize = field_validator(
        "username", "city", "bio", "interests", "preferred_categories",
        mode="before",
    )(_sanitize_optional)


POSITIVE_REVIEW_TAGS: List[str] = [
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
    "Опоздал",
    "Не пришёл",
    "Грубый",
    "Недружелюбный",
    "Ненадёжный",
    "Скучный",
]

ALLOWED_REVIEW_TAGS: List[str] = POSITIVE_REVIEW_TAGS + NEGATIVE_REVIEW_TAGS


class ReviewCreate(BaseModel):
    reviewed_id: int
    party_id: int
    rating: int = Field(..., ge=1, le=5)
    text: Optional[str] = Field(None, max_length=2000)
    tags: Optional[List[str]] = None  # max 3 from ALLOWED_REVIEW_TAGS

    _sanitize_text = field_validator("text", mode="before")(_sanitize_optional)


class ReviewOut(BaseModel):
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
    rating: Optional[int] = Field(None, ge=1, le=5)
    text: Optional[str] = Field(None, max_length=2000)
    tags: Optional[List[str]] = None

    _sanitize_text = field_validator("text", mode="before")(_sanitize_optional)


class ReviewSummary(BaseModel):
    avg_rating: Optional[float]
    total_reviews: int
    reviews: List[ReviewOut]
    stars_distribution: Dict[int, int]  # {1: count, 2: count, ...}
    top_tags: List[str]                  # up to 5 most frequent tags (mixed polarity)
    top_positive_tags: List[str] = []    # up to 5 most frequent positive tags
    top_negative_tags: List[str] = []    # up to 5 most frequent negative tags
    page: int = 1
    per_page: int = 10
    total_pages: int = 1


class ReviewableUser(BaseModel):
    user_id: int
    username: str
    avatar_url: Optional[str] = None
    party_id: int
    event_id: str


class ReviewReport(BaseModel):
    reason: Optional[str] = None

    _sanitize = field_validator("reason", mode="before")(_sanitize_optional)


class EventBase(BaseModel):
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
    pass


class EventUpdate(BaseModel):
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
    id: int
    created_by: int
    current_participants: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── Party Search ────────────────────────────────────────────────────────────


class PartySearchParams(BaseModel):
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


# ─── Meeting Plan ─────────────────────────────────────────────────────────────


class MeetingPlanUpdate(BaseModel):
    meet_time: Optional[datetime] = None
    meet_location: Optional[str] = Field(None, max_length=300)
    note: Optional[str] = Field(None, max_length=300)
    meet_lat: Optional[float] = Field(None, ge=-90.0, le=90.0)
    meet_lon: Optional[float] = Field(None, ge=-180.0, le=180.0)
    meet_landmark: Optional[str] = Field(None, max_length=200)

    _sanitize = field_validator("meet_location", "note", "meet_landmark", mode="before")(_sanitize_optional)


class MeetingPlanResponse(BaseModel):
    meet_time: Optional[datetime] = None
    meet_location: Optional[str] = None
    note: Optional[str] = None
    meet_lat: Optional[float] = None
    meet_lon: Optional[float] = None
    meet_landmark: Optional[str] = None
    updated_by_username: Optional[str] = None
    updated_at: Optional[datetime] = None


class MeetingPlanHistoryItem(BaseModel):
    meet_time: Optional[datetime] = None
    meet_location: Optional[str] = None
    note: Optional[str] = None
    meet_lat: Optional[float] = None
    meet_lon: Optional[float] = None
    meet_landmark: Optional[str] = None
    changed_by_username: str
    changed_at: datetime
