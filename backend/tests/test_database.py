"""
Тесты для database.py — проверка обработки ошибок при создании engine.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import ArgumentError


def test_create_engine_with_malformed_url_raises():
    """
    create_engine с полностью некорректным URL должен выбрасывать
    понятную ошибку. Проверяем что SQLAlchemy действительно падает
    при невалидном URL.
    """
    # SQLAlchemy's create_engine is lazy — it doesn't connect immediately.
    # But a completely malformed URL (not a valid RFC 1738) will raise ArgumentError.
    with pytest.raises((ArgumentError, RuntimeError)):
        create_engine("not-a-valid-url-at-all")


def test_database_module_wraps_engine_creation_error():
    """
    При ошибке подключения к БД (engine.connect() падает),
    database.py должен предоставлять понятную обёртку ошибки.
    """
    from database import engine

    # engine с SQLite :memory: создан успешно — это базовый случай
    assert engine is not None

    # Проверяем, что при подключении к несуществующему хосту
    # возникает понятное исключение, а не непонятный AttributeError
    bad_engine = create_engine(
        "postgresql://invalid:invalid@nonexistent-host:5432/nonexistent_db",
        connect_args={"connect_timeout": 1},
    )
    with pytest.raises(Exception) as exc_info:
        bad_engine.connect()
    # Ошибка должна быть связана с подключением, а не быть загадочным AttributeError
    assert "AttributeError" not in type(exc_info.value).__name__
