from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # SECRET_KEY обязателен (jwt_handler.py тоже проверяет через os.getenv).
    # Убрали дефолт "changeme" — иначе silent fallback давал бы ложное чувство
    # безопасности, если какой-то модуль читает settings.SECRET_KEY вместо env.
    SECRET_KEY: str
    DATABASE_URL: str
    RESEND_API_KEY: str = ""
    FRONTEND_URL: str = "http://localhost:3000"
    # Dev-режим: все письма летят на этот адрес вместо реального получателя
    DEV_EMAIL_OVERRIDE: Optional[str] = None

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
