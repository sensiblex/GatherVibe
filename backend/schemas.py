from pydantic import BaseModel, EmailStr
from typing import Optional

# Схема для создания пользователя
class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    city: Optional[str] = None
    interests: Optional[str] = None

# Схема для ответа (без пароля)
class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    city: Optional[str]
    interests: Optional[str]
    is_active: bool
    
    class Config:
        from_attributes = True  # для совместимости с SQLAlchemy