from __future__ import annotations

import pytest
from pydantic import ValidationError

from schemas import UserCreate
from utils.sanitize import sanitize_input


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_sanitize_input_removes_script_content_and_sql_tokens():
    payload = "<script>alert('xss')</script> hello '; DROP TABLE users; -- javascript:foo"
    cleaned = sanitize_input(payload)

    assert cleaned is not None
    low = cleaned.lower()
    assert "script" not in low
    assert "alert" not in low
    assert "drop" not in low
    assert "'" not in cleaned
    assert "--" not in cleaned
    assert "javascript:" not in low


def test_user_create_rejects_sql_injection_like_username():
    with pytest.raises(ValidationError):
        UserCreate(
            email="safe@example.com",
            username="' OR 1=1--",
            password="password123",
        )


def test_user_create_accepts_valid_username_and_city():
    model = UserCreate(
        email="safe@example.com",
        username="valid_user-1",
        password="password123",
        city="Kazan",
    )
    assert model.username == "valid_user-1"
    assert model.city == "Kazan"


def test_register_rejects_sql_injection_payload(client):
    response = client.post(
        "/register",
        json={
            "email": "sqlreject@example.com",
            "username": "' OR 1=1--",
            "password": "password123",
        },
    )
    assert response.status_code == 422


def test_update_profile_removes_script_body(client, token_a):
    response = client.patch(
        "/users/me",
        headers=_auth(token_a),
        json={"bio": "<script>alert(1)</script>Hello"},
    )
    assert response.status_code == 200
    assert response.json()["bio"] == "Hello"


def test_health_has_csp_header(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert "content-security-policy" in response.headers
    assert "default-src 'self'" in response.headers["content-security-policy"]
