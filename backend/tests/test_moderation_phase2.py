"""TDD тесты фазы 2 системы модерации.

Покрывают:
  1. FeatureFlag: CRUD + блокировка registration/party_creation/file_upload.
  2. BannedWord: CRUD + фильтрация текста в сообщениях + regex.
  3. /users/me возвращает muted_until/banned_until/role/warnings_count.
  4. Timeseries-метрики по дням (admin-only).
  5. Broadcast: создаёт Notification всем пользователям (admin-only).
"""
from datetime import datetime, timedelta
import pytest
from fastapi.testclient import TestClient

from auth import hash_password
from jwt_handler import create_access_token
from models.user import User
import models.attendee  # noqa: F401
import models.kudago_event  # noqa: F401
import models.party_coordination  # noqa: F401
import models.push_subscription  # noqa: F401
import models.message_reaction  # noqa: F401
import models.party_recap  # noqa: F401
import models.notification  # noqa: F401
import models.feature_flag  # noqa: F401
import models.banned_word  # noqa: F401


# ── Helpers ──────────────────────────────────────────────────────────────────

def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_user(db, username: str, email: str, role: str = "user") -> User:
    u = User(
        username=username, email=email,
        hashed_password=hash_password("pw"),
        role=role, is_verified=True,
    )
    db.add(u); db.commit(); db.refresh(u)
    return u


def _make_token(user: User) -> str:
    return create_access_token(
        data={"sub": user.email, "id": user.id, "username": user.username, "role": user.role},
        expires_delta=timedelta(minutes=60),
    )


@pytest.fixture
def admin_user(db):
    return _make_user(db, "adm_p2", "adm_p2@x.x", role="admin")


@pytest.fixture
def mod_user(db):
    return _make_user(db, "mod_p2", "mod_p2@x.x", role="moderator")


@pytest.fixture
def admin_token(admin_user):
    return _make_token(admin_user)


@pytest.fixture
def mod_token(mod_user):
    return _make_token(mod_user)


# ── 1. FeatureFlag ───────────────────────────────────────────────────────────

def test_admin_can_list_flags(client, admin_token):
    resp = client.get("/admin/flags", headers=_auth(admin_token))
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    keys = {f["key"] for f in data}
    # Известные флаги должны появиться после bootstrap
    assert "registration_enabled" in keys
    assert "party_creation_enabled" in keys
    assert "file_upload_enabled" in keys


def test_admin_can_toggle_flag(client, db, admin_token):
    r = client.post(
        "/admin/flags/registration_enabled",
        json={"enabled": False},
        headers=_auth(admin_token),
    )
    assert r.status_code == 200
    assert r.json()["enabled"] is False


def test_moderator_cannot_toggle_flag(client, mod_token):
    r = client.post(
        "/admin/flags/registration_enabled",
        json={"enabled": False},
        headers=_auth(mod_token),
    )
    assert r.status_code == 403


def test_registration_blocked_when_flag_off(client, admin_token):
    # Выключаем
    client.post("/admin/flags/registration_enabled", json={"enabled": False},
                headers=_auth(admin_token))
    r = client.post("/register", json={
        "email": "newguy@x.x", "username": "newguy", "password": "12345678",
    })
    assert r.status_code == 403
    # Включаем обратно
    client.post("/admin/flags/registration_enabled", json={"enabled": True},
                headers=_auth(admin_token))
    r2 = client.post("/register", json={
        "email": "newguy2@x.x", "username": "newguy2", "password": "12345678",
    })
    assert r2.status_code in (200, 201)


def test_party_creation_blocked_when_flag_off(client, db, admin_token, user_a, token_a):
    client.post("/admin/flags/party_creation_enabled", json={"enabled": False},
                headers=_auth(admin_token))
    r = client.post(
        "/parties/event/123",
        json={"title": "x", "description": "y", "max_members": 3},
        headers=_auth(token_a),
    )
    assert r.status_code == 403


def test_file_upload_blocked_when_flag_off(client, db, admin_token, user_a, token_a):
    client.post("/admin/flags/file_upload_enabled", json={"enabled": False},
                headers=_auth(admin_token))
    # multipart upload с любым файлом — должен быть отказ до обработки
    r = client.post(
        "/upload/chat",
        files={"file": ("test.txt", b"hello", "text/plain")},
        headers=_auth(token_a),
    )
    assert r.status_code == 403


# ── 2. BannedWord ─────────────────────────────────────────────────────────────

def test_admin_can_add_banned_word(client, admin_token):
    r = client.post("/admin/banned-words",
                    json={"pattern": "мат1", "is_regex": False},
                    headers=_auth(admin_token))
    assert r.status_code == 201
    body = r.json()
    assert body["pattern"] == "мат1"
    assert body["id"] > 0


def test_admin_can_list_and_delete_banned_word(client, admin_token):
    create = client.post("/admin/banned-words",
                         json={"pattern": "фу1", "is_regex": False},
                         headers=_auth(admin_token)).json()
    lst = client.get("/admin/banned-words", headers=_auth(admin_token))
    assert lst.status_code == 200
    assert any(w["pattern"] == "фу1" for w in lst.json())

    delr = client.delete(f"/admin/banned-words/{create['id']}",
                         headers=_auth(admin_token))
    assert delr.status_code == 204
    lst2 = client.get("/admin/banned-words", headers=_auth(admin_token))
    assert not any(w["pattern"] == "фу1" for w in lst2.json())


def test_moderator_cannot_add_banned_word(client, mod_token):
    r = client.post("/admin/banned-words",
                    json={"pattern": "x", "is_regex": False},
                    headers=_auth(mod_token))
    assert r.status_code == 403


def test_filter_message_redacts_banned_word(client, db, admin_token):
    from services.moderation_filter import filter_text
    client.post("/admin/banned-words", json={"pattern": "плохоеслово", "is_regex": False},
                headers=_auth(admin_token))
    result, changed = filter_text(db, "это плохоеслово тест")
    assert changed is True
    assert "плохоеслово" not in result
    assert "***" in result


def test_filter_message_case_insensitive(client, db, admin_token):
    from services.moderation_filter import filter_text
    client.post("/admin/banned-words", json={"pattern": "hello", "is_regex": False},
                headers=_auth(admin_token))
    result, changed = filter_text(db, "HELLO world")
    assert changed is True
    assert "HELLO" not in result


def test_filter_message_regex(client, db, admin_token):
    from services.moderation_filter import filter_text
    client.post("/admin/banned-words", json={"pattern": r"spam+", "is_regex": True},
                headers=_auth(admin_token))
    result, changed = filter_text(db, "that is spammmm text")
    assert changed is True
    assert "spamm" not in result and "spammmm" not in result


def test_filter_message_no_change_when_clean(client, db, admin_token):
    from services.moderation_filter import filter_text
    result, changed = filter_text(db, "абсолютно чистый текст")
    assert changed is False
    assert result == "абсолютно чистый текст"


# ── 3. /users/me содержит поля санкций ───────────────────────────────────────

def test_users_me_returns_role(client, user_a, token_a):
    r = client.get("/users/me", headers=_auth(token_a))
    assert r.status_code == 200
    assert r.json().get("role") == "user"


def test_users_me_returns_muted_until(client, db, user_a, token_a):
    user_a.muted_until = datetime.utcnow() + timedelta(hours=2)
    db.commit()
    r = client.get("/users/me", headers=_auth(token_a))
    assert r.status_code == 200
    body = r.json()
    assert body.get("muted_until") is not None
    assert body.get("warnings_count") == 0


# ── 4. Timeseries метрики ─────────────────────────────────────────────────────

def test_timeseries_returns_7_days(client, admin_token):
    r = client.get("/admin/metrics/timeseries?days=7", headers=_auth(admin_token))
    assert r.status_code == 200
    data = r.json()
    assert "new_users" in data
    assert "new_reports" in data
    assert "mod_actions" in data
    # Каждый ряд — список длиной 7
    assert len(data["new_users"]) == 7
    for bucket in data["new_users"]:
        assert "date" in bucket
        assert "count" in bucket


def test_timeseries_moderator_denied(client, mod_token):
    r = client.get("/admin/metrics/timeseries", headers=_auth(mod_token))
    assert r.status_code == 403


# ── 5. Broadcast ──────────────────────────────────────────────────────────────

def test_broadcast_creates_notifications_for_all(client, db, admin_token, user_a, user_b):
    r = client.post(
        "/admin/broadcast",
        json={"title": "Объявление", "message": "Тест рассылки"},
        headers=_auth(admin_token),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["sent"] >= 2

    from models.notification import Notification
    rows = db.query(Notification).filter(Notification.type == "system_broadcast").all()
    uids = {row.user_id for row in rows}
    assert user_a.id in uids and user_b.id in uids


def test_broadcast_moderator_denied(client, mod_token):
    r = client.post(
        "/admin/broadcast",
        json={"title": "X", "message": "Y"},
        headers=_auth(mod_token),
    )
    assert r.status_code == 403


# ── 6. AuditLog пишется для phase 2 действий ─────────────────────────────────

def test_audit_log_on_flag_toggle(client, db, admin_user, admin_token):
    client.post("/admin/flags/registration_enabled", json={"enabled": False},
                headers=_auth(admin_token))
    from models.audit_log import AuditLog
    entries = db.query(AuditLog).filter(AuditLog.action == "toggle_flag").all()
    assert len(entries) >= 1
    e = entries[-1]
    assert e.actor_id == admin_user.id
    assert e.target_id == "registration_enabled"


def test_audit_log_on_banned_word_add(client, db, admin_user, admin_token):
    client.post("/admin/banned-words", json={"pattern": "foobar", "is_regex": False},
                headers=_auth(admin_token))
    from models.audit_log import AuditLog
    entries = db.query(AuditLog).filter(AuditLog.action == "add_banned_word").all()
    assert len(entries) >= 1
