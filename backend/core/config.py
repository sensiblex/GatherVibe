from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    SECRET_KEY: str = "changeme"
    DATABASE_URL: str = "sqlite:///./gathervibe.db"
    RESEND_API_KEY: str = ""
    FRONTEND_URL: str = "http://localhost:3000"
    # Dev-режим: все письма летят на этот адрес вместо реального получателя
    DEV_EMAIL_OVERRIDE: Optional[str] = None

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
