from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    city: Optional[str] = None
    interests: Optional[str] = None


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
    is_active: bool

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    username: Optional[str] = None
    city: Optional[str] = None
    bio: Optional[str] = None
    interests: Optional[str] = None


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
