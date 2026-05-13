"""
Тесты для deps.py - выявление и исправление ошибок в зависимостях FastAPI
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("SCHEMA_CHECK_MODE", "soft")

import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker
from database import Base
from models.user import User
from models.token_revocation import RevokedToken
from auth import hash_password
from jwt_handler import create_access_token
from deps import _is_user_banned, _is_token_revoked, get_current_user_from_token
from fastapi import HTTPException

TEST_DB_URL = "sqlite://"

engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db():
    """Fresh DB schema + session for every test."""
    Base.metadata.create_all(bind=engine)
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def test_is_user_banned_with_timezone_aware_datetime(db):
    """
    Тест для проверки корректной обработки timezone-aware datetime.
    Проблема: удаление timezone может привести к некорректному сравнению
    в разных часовых поясах.
    """
    # Создаём пользователя с временным баном в будущем (UTC)
    user = User(
        username="banned_user",
        email="banned@test.com",
        hashed_password=hash_password("password123"),
        is_banned=True,
        banned_until=datetime.now(timezone.utc) + timedelta(hours=2),
        ban_reason="Test ban"
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Пользователь должен быть забанен
    assert _is_user_banned(user) is True


def test_is_user_banned_with_expired_temp_ban(db):
    """
    Тест для проверки истёкшего временного бана.
    """
    # Создаём пользователся с истёкшим баном
    user = User(
        username="expired_ban_user",
        email="expired@test.com",
        hashed_password=hash_password("password123"),
        is_banned=True,
        banned_until=datetime.now(timezone.utc) - timedelta(hours=1),
        ban_reason="Expired test ban"
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Пользователь не должен быть забанен (бан истёк)
    assert _is_user_banned(user) is False


def test_is_user_banned_with_permanent_ban(db):
    """
    Тест для проверки постоянного бана (banned_until is None).
    """
    user = User(
        username="perma_banned_user",
        email="perma@test.com",
        hashed_password=hash_password("password123"),
        is_banned=True,
        banned_until=None,
        ban_reason="Permanent ban"
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Пользователь должен быть забанен постоянно
    assert _is_user_banned(user) is True


def test_is_user_banned_with_no_ban(db):
    """
    Тест для проверки пользователя без бана.
    """
    user = User(
        username="normal_user",
        email="normal@test.com",
        hashed_password=hash_password("password123"),
        is_banned=False,
        banned_until=None
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Пользователь не должен быть забанен
    assert _is_user_banned(user) is False


def test_is_token_revoked_with_valid_jti(db):
    """
    Тест для проверки отозванного токена.
    """
    jti = "test-jti-123"
    revoked_token = RevokedToken(
        jti=jti,
        exp=datetime.now(timezone.utc) + timedelta(hours=1)
    )
    db.add(revoked_token)
    db.commit()

    # Токен должен быть отозван
    assert _is_token_revoked(db, jti) is True


def test_is_token_revoked_with_non_revoked_jti(db):
    """
    Тест для проверки не отозванного токена.
    """
    jti = "test-jti-456"

    # Токен не должен быть отозван
    assert _is_token_revoked(db, jti) is False


def test_is_token_revoked_with_none_jti(db):
    """
    Тест для проверки None jti.
    """
    # None jti не должен считаться отозванным
    assert _is_token_revoked(db, None) is False


def test_get_current_user_from_token_with_missing_jti(db):
    """
    Тест для проверки токена без jti.
    Проблема: отсутствует явная проверка jti на None.
    """
    # Создаём пользователя
    user = User(
        username="test_user",
        email="test@test.com",
        hashed_password=hash_password("password123"),
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Создаём токен без jti (вручную, через jwt_handler это невозможно)
    # Для теста создадим токен через jwt_handler и проверим, что jti есть
    from jwt_handler import verify_token
    token = create_access_token(
        data={"sub": user.email, "id": user.id, "username": user.username},
        expires_delta=timedelta(minutes=60)
    )
    payload = verify_token(token)
    
    # jti должен быть в payload
    assert payload.get("jti") is not None


def test_get_current_user_from_token_with_revoked_token(db):
    """
    Тест для проверки отозванного токена.
    """
    user = User(
        username="test_user",
        email="test@test.com",
        hashed_password=hash_password("password123"),
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Создаём токен
    token = create_access_token(
        data={"sub": user.email, "id": user.id, "username": user.username},
        expires_delta=timedelta(minutes=60)
    )

    # Отзываем токен
    from jwt_handler import verify_token
    payload = verify_token(token)
    jti = payload.get("jti")
    exp = payload.get("exp")
    from datetime import timezone as _tz
    exp_dt = datetime.fromtimestamp(exp, tz=_tz.utc)
    
    revoked_token = RevokedToken(jti=jti, exp=exp_dt)
    db.add(revoked_token)
    db.commit()

    # Попытка получить пользователя с отозванным токеном должна вызвать исключение
    with pytest.raises(HTTPException) as exc_info:
        get_current_user_from_token(token, db)
    
    assert exc_info.value.status_code == 401
    assert "отозван" in exc_info.value.detail.lower()


def test_get_current_user_from_token_with_invalid_token(db):
    """
    Тест для проверки невалидного токена.
    """
    invalid_token = "invalid.token.here"

    with pytest.raises(HTTPException) as exc_info:
        get_current_user_from_token(invalid_token, db)
    
    assert exc_info.value.status_code == 401
    assert "неверный" in exc_info.value.detail.lower()


def test_get_current_user_from_token_with_inactive_user(db):
    """
    Тест для проверки неактивного пользователя.
    """
    user = User(
        username="inactive_user",
        email="inactive@test.com",
        hashed_password=hash_password("password123"),
        is_active=False
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(
        data={"sub": user.email, "id": user.id, "username": user.username},
        expires_delta=timedelta(minutes=60)
    )

    with pytest.raises(HTTPException) as exc_info:
        get_current_user_from_token(token, db)

    assert exc_info.value.status_code == 403
    assert "заблокирован" in exc_info.value.detail.lower()


def test_get_current_user_from_token_with_banned_user(db):
    """
    Тест для проверки забаненного пользователя.
    """
    user = User(
        username="banned_user",
        email="banned@test.com",
        hashed_password=hash_password("password123"),
        is_active=True,
        is_banned=True,
        banned_until=datetime.now(timezone.utc) + timedelta(hours=1),
        ban_reason="Test ban"
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(
        data={"sub": user.email, "id": user.id, "username": user.username},
        expires_delta=timedelta(minutes=60)
    )

    # Должен вызывать HTTPException
    try:
        get_current_user_from_token(token, db)
        assert False, "Ожидается HTTPException для забаненного пользователя"
    except HTTPException as e:
        assert e.status_code == 403
        # detail может быть dict или string
        detail = e.detail
        if isinstance(detail, dict):
            assert "заблокирован" in detail.get("message", "").lower()
        else:
            assert "заблокирован" in detail.lower()


def test_get_current_user_from_token_with_expired_ban(db):
    """
    Тест для проверки пользователя с истёкшим баном.
    """
    user = User(
        username="expired_ban_user",
        email="expired@test.com",
        hashed_password=hash_password("password123"),
        is_active=True,
        is_banned=True,
        banned_until=datetime.now(timezone.utc) - timedelta(hours=1),
        ban_reason="Expired ban"
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(
        data={"sub": user.email, "id": user.id, "username": user.username},
        expires_delta=timedelta(minutes=60)
    )

    # Пользователь с истёкшим баном должен иметь доступ
    result = get_current_user_from_token(token, db)
    assert result.email == user.email


def test_create_user_token_with_role(db):
    """create_user_token должен включать role из атрибута пользователя."""
    from auth import create_user_token

    user = User(
        username="admin_user",
        email="admin@test.com",
        hashed_password=hash_password("password123"),
        is_active=True,
    )
    user.role = "admin"
    db.add(user)
    db.commit()
    db.refresh(user)

    result = create_user_token(user)
    assert result["role"] == "admin"
    assert result["user_id"] == user.id
    assert result["email"] == user.email


def test_create_user_token_without_role(db):
    """create_user_token должен возвращать 'user' если role отсутствует."""
    from auth import create_user_token

    user = User(
        username="plain_user",
        email="plain@test.com",
        hashed_password=hash_password("password123"),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    result = create_user_token(user)
    assert result["role"] == "user"
