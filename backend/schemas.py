from pydantic import BaseModel, EmailStr, Field
from typing import Dict, List, Optional
from datetime import datetime


class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=8, max_length=128)
    city: Optional[str] = Field(default=None, max_length=100)
    interests: Optional[str] = Field(default=None, max_length=500)


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


ALLOWED_REVIEW_TAGS: List[str] = [
    "Пунктуальный",
    "Общительный",
    "Весёлый",
    "Надёжный",
    "Культурный",
    "Интересный собеседник",
    "Помогает другим",
    "Позитивный",
]


class ReviewCreate(BaseModel):
    reviewed_id: int
    party_id: int
    rating: int  # 1-5
    text: Optional[str] = None
    tags: Optional[List[str]] = None  # max 3 from ALLOWED_REVIEW_TAGS


class ReviewOut(BaseModel):
    id: int
    reviewer_id: int
    reviewer_username: str
    reviewer_avatar_url: Optional[str] = None
    rating: int
    text: Optional[str] = None
    tags: Optional[List[str]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ReviewSummary(BaseModel):
    avg_rating: Optional[float]
    total_reviews: int
    reviews: List[ReviewOut]
    stars_distribution: Dict[int, int]  # {1: count, 2: count, ...}
    top_tags: List[str]                  # up to 5 most frequent tags


class ReviewableUser(BaseModel):
    user_id: int
    username: str
    avatar_url: Optional[str] = None
    party_id: int
    event_id: str


class ReviewReport(BaseModel):
    reason: Optional[str] = None


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
