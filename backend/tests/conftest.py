"""
Shared fixtures for GatherVibe notification tests.

Uses an in-memory SQLite database — completely isolated from production DB.
"""
import sys
import os

# Make sure the backend package root is on sys.path so imports resolve.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker
from database import Base
from models.user import User
from models.party import EventParty, PartyMember
from models.notification import Notification
from auth import hash_password
from jwt_handler import create_access_token
from datetime import timedelta

# ── In-memory SQLite with StaticPool ─────────────────────────────────────────
# StaticPool forces ALL connections (including TestClient's internal ones)
# to reuse the SAME underlying SQLite connection, so tables created in the
# fixture are visible to requests made by the TestClient.
TEST_DB_URL = "sqlite://"  # in-memory

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


def _make_user(db, username: str, email: str) -> User:
    u = User(
        username=username,
        email=email,
        hashed_password=hash_password("password123"),
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _make_token(user: User) -> str:
    return create_access_token(
        data={"sub": user.email, "id": user.id, "username": user.username},
        expires_delta=timedelta(minutes=60),
    )


@pytest.fixture
def user_a(db):
    return _make_user(db, "user_a", "a@test.com")


@pytest.fixture
def user_b(db):
    return _make_user(db, "user_b", "b@test.com")


@pytest.fixture
def token_a(user_a):
    return _make_token(user_a)


@pytest.fixture
def token_b(user_b):
    return _make_token(user_b)


# ── FastAPI TestClient that uses our test DB ──────────────────────────────────
@pytest.fixture
def client(db):
    """
    FastAPI TestClient wired to the test DB.
    We override the get_db dependency so every request hits the same
    in-memory SQLite session (and therefore sees all test data).
    """
    from fastapi.testclient import TestClient
    import main as app_module
    from database import SessionLocal

    def override_get_db():
        try:
            yield db
        finally:
            pass  # session lifecycle managed by the 'db' fixture

    app_module.app.dependency_overrides[app_module.get_db] = override_get_db
    with TestClient(app_module.app) as c:
        yield c
    app_module.app.dependency_overrides.clear()
