"""
Конфигурация базы данных и сессии SQLAlchemy.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.exc import ArgumentError
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL не установлен. Ожидается URL PostgreSQL, "
        "например postgresql://user:pass@host:5432/db"
    )

# Для SQLite нужно отключить проверку того же потока
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

try:
    engine = create_engine(
        DATABASE_URL,
        connect_args=connect_args,
        pool_pre_ping=True,
    )
except (ArgumentError, ValueError) as exc:
    raise RuntimeError(
        f"DATABASE_URL некорректен: {exc}. "
        "Ожидается корректный URL базы данных, "
        "например postgresql://user:pass@host:5432/db"
    ) from exc

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
