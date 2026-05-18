from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # SECRET_KEY обязателен
    SECRET_KEY: str
    DATABASE_URL: str
    RESEND_API_KEY: str = ""
    FRONTEND_URL: str = "http://localhost:3000"
    # Dev-режим: все письма на один адрес
    DEV_EMAIL_OVERRIDE: Optional[str] = None

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
