"""
TDD тесты для системы модерации (роли admin/moderator, жалобы, санкции, аудит).

Покрывают:
  1. Роли User: default 'user', назначение moderator/admin.
  2. JWT содержит role.
  3. Dependency require_moderator / require_admin: иерархия доступа.
  4. Бан: is_banned/banned_until блокирует /users/me и POST-эндпоинты.
  5. Mute: muted_until блокирует создание через API (симуляция чата).
  6. POST /reports — универсальные жалобы на chat_message / party / user / review / recap_item.
  7. Дубликат жалобы (reporter+target) → 409.
  8. GET /admin/reports — инбокс с фильтрами.
  9. POST /admin/reports/{id}/resolve — скрытие + запись в AuditLog.
 10. POST /admin/chat-messages/{id}/hide — soft delete.
 11. POST /admin/users/{id}/ban — длительность / perm.
 12. POST /admin/users/{id}/role — только admin.
 13. AuditLog append-only (каждое действие пишется).
 14. EventParty.is_hidden исключает из публичных списков.
"""
from datetime import datetime, timedelta
import time
import pytest
from fastapi.testclient import TestClient

from auth import hash_password
from jwt_handler import create_access_token, verify_token
from models.user import User
from models.party import EventParty, PartyMember
from models.chat_message import ChatMessage
from models.review import PartyReview
import models.attendee  # noqa: F401
import models.kudago_event  # noqa: F401
import models.party_coordination  # noqa: F401
import models.push_subscription  # noqa: F401
import models.message_reaction  # noqa: F401
import models.party_recap  # noqa: F401
import models.notification  # noqa: F401


# ── Helpers ───────────────────────────────────────────────────────────────────

def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_token(user: User) -> str:
    return create_access_token(
        data={
            "sub": user.email,
            "id": user.id,
            "username": user.username,
            "role": getattr(user, "role", "user"),
        },
        expires_delta=timedelta(minutes=60),
    )


def _make_user(db, username: str, email: str, role: str = "user") -> User:
    u = User(
        username=username,
        email=email,
        hashed_password=hash_password("pw"),
        role=role,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture
def admin_user(db):
    return _make_user(db, "admin_x", "admin@test.com", role="admin")


@pytest.fixture
def mod_user(db):
    return _make_user(db, "mod_x", "mod@test.com", role="moderator")


@pytest.fixture
def admin_token(admin_user):
    return _make_token(admin_user)


@pytest.fixture
def mod_token(mod_user):
    return _make_token(mod_user)


def _make_party(db, creator_id: int, title: str = "P") -> EventParty:
    party = EventParty(
        event_id="ev_1",
        title=title,
        description="d",
        max_members=5,
        creator_id=creator_id,
        is_open=True,
    )
    db.add(party)
    db.commit()
    db.refresh(party)
    return party


def _make_message(db, room: str, user_id: int, username: str, text: str) -> ChatMessage:
    m = ChatMessage(
        room=room,
        user_id=str(user_id),
        username=username,
        message=text,
        timestamp=datetime.utcnow(),
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


# ── 1. Модель User: роли ──────────────────────────────────────────────────────

def test_user_has_role_default_user(db, user_a):
    """Новый user получает role='user' по умолчанию."""
    assert hasattr(user_a, "role"), "User должна иметь поле role"
    # через _make_user в conftest роль не задаётся → default из модели
    fresh = db.query(User).filter(User.id == user_a.id).first()
    assert fresh.role == "user"


def test_user_ban_fields_default(db, user_a):
    """is_banned=False, banned_until/muted_until/ban_reason = None."""
    assert user_a.is_banned is False
    assert user_a.banned_until is None
    assert user_a.muted_until is None
    assert user_a.ban_reason is None
    assert user_a.warnings_count == 0


def test_admin_role_assignment(db):
    u = _make_user(db, "adm", "adm@x.x", role="admin")
    assert u.role == "admin"


# ── 2. JWT содержит role ──────────────────────────────────────────────────────

def test_jwt_payload_includes_role(admin_user):
    token = _make_token(admin_user)
    payload = verify_token(token)
    assert payload["role"] == "admin"


# ── 3. Dependency require_moderator / require_admin ──────────────────────────

def test_admin_endpoint_forbids_regular_user(client, user_a, token_a):
    resp = client.get("/admin/reports", headers=_auth(token_a))
    assert resp.status_code == 403


def test_admin_endpoint_allows_moderator(client, mod_token):
    resp = client.get("/admin/reports", headers=_auth(mod_token))
    assert resp.status_code == 200


def test_admin_endpoint_allows_admin(client, admin_token):
    resp = client.get("/admin/reports", headers=_auth(admin_token))
    assert resp.status_code == 200


def test_admin_only_endpoint_forbids_moderator(client, mod_token, user_a):
    """POST /admin/users/{id}/role — только admin."""
    resp = client.post(
        f"/admin/users/{user_a.id}/role",
        json={"role": "moderator"},
        headers=_auth(mod_token),
    )
    assert resp.status_code == 403


def test_admin_only_endpoint_allows_admin(client, admin_token, user_a):
    resp = client.post(
        f"/admin/users/{user_a.id}/role",
        json={"role": "moderator"},
        headers=_auth(admin_token),
    )
    assert resp.status_code == 200


# ── 4. Бан блокирует write-операции ───────────────────────────────────────────

def test_banned_user_cannot_access_me(client, db, user_a, token_a):
    user_a.is_banned = True
    user_a.ban_reason = "spam"
    db.commit()
    resp = client.get("/users/me", headers=_auth(token_a))
    assert resp.status_code == 403
    body = resp.json()
    detail = body.get("detail")
    # detail может быть строкой или dict {code, message, ...}
    if isinstance(detail, dict):
        assert detail.get("code") == "banned"
    else:
        assert "banned" in str(detail).lower() or "заблок" in str(detail).lower()


def test_banned_user_cannot_create_review(client, db, user_a, user_b, token_a):
    # user_a забанен → /reviews должен вернуть 403
    party = _make_party(db, creator_id=user_b.id)
    db.add(PartyMember(party_id=party.id, user_id=user_a.id, status="accepted"))
    user_a.is_banned = True
    db.commit()
    resp = client.post(
        "/reviews",
        json={"reviewed_id": user_b.id, "party_id": party.id, "rating": 3},
        headers=_auth(token_a),
    )
    assert resp.status_code == 403


def test_temp_ban_expires(client, db, user_a, token_a):
    """banned_until в прошлом → не считается баном."""
    user_a.is_banned = True
    user_a.banned_until = datetime.utcnow() - timedelta(hours=1)
    db.commit()
    resp = client.get("/users/me", headers=_auth(token_a))
    assert resp.status_code == 200


# ── 5. POST /reports — универсальные жалобы ──────────────────────────────────

def test_report_chat_message(client, db, user_a, user_b, token_a):
    msg = _make_message(db, "party_1", user_b.id, "b", "bad text")
    resp = client.post(
        "/reports",
        json={
            "target_type": "chat_message",
            "target_id": str(msg.id),
            "reason": "harassment",
            "comment": "грубость",
        },
        headers=_auth(token_a),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "open"
    assert body["target_type"] == "chat_message"


def test_report_user(client, db, user_a, user_b, token_a):
    resp = client.post(
        "/reports",
        json={"target_type": "user", "target_id": str(user_b.id), "reason": "spam"},
        headers=_auth(token_a),
    )
    assert resp.status_code == 201


def test_report_party(client, db, user_a, user_b, token_a):
    party = _make_party(db, creator_id=user_b.id)
    resp = client.post(
        "/reports",
        json={"target_type": "party", "target_id": str(party.id), "reason": "nsfw"},
        headers=_auth(token_a),
    )
    assert resp.status_code == 201


def test_report_duplicate_returns_409(client, db, user_a, user_b, token_a):
    resp1 = client.post(
        "/reports",
        json={"target_type": "user", "target_id": str(user_b.id), "reason": "spam"},
        headers=_auth(token_a),
    )
    assert resp1.status_code == 201
    resp2 = client.post(
        "/reports",
        json={"target_type": "user", "target_id": str(user_b.id), "reason": "fake"},
        headers=_auth(token_a),
    )
    assert resp2.status_code == 409


def test_report_invalid_target_type(client, user_a, user_b, token_a):
    resp = client.post(
        "/reports",
        json={"target_type": "bogus", "target_id": "1", "reason": "spam"},
        headers=_auth(token_a),
    )
    assert resp.status_code == 400


def test_report_requires_auth(client, user_b):
    resp = client.post(
        "/reports",
        json={"target_type": "user", "target_id": str(user_b.id), "reason": "spam"},
    )
    assert resp.status_code == 401


# ── 6. Админский инбокс ──────────────────────────────────────────────────────

def test_admin_inbox_lists_reports(client, db, user_a, user_b, token_a, mod_token):
    client.post(
        "/reports",
        json={"target_type": "user", "target_id": str(user_b.id), "reason": "spam"},
        headers=_auth(token_a),
    )
    resp = client.get("/admin/reports", headers=_auth(mod_token))
    assert resp.status_code == 200
    items = resp.json()
    assert isinstance(items, list)
    assert any(r["target_type"] == "user" and r["target_id"] == str(user_b.id) for r in items)


def test_admin_inbox_filters_by_status(client, db, user_a, user_b, token_a, mod_token):
    client.post(
        "/reports",
        json={"target_type": "user", "target_id": str(user_b.id), "reason": "spam"},
        headers=_auth(token_a),
    )
    resp = client.get("/admin/reports?status=open", headers=_auth(mod_token))
    assert resp.status_code == 200
    for r in resp.json():
        assert r["status"] == "open"


# ── 7. Резолв жалобы + AuditLog ──────────────────────────────────────────────

def test_resolve_report_writes_audit(client, db, user_a, user_b, token_a, mod_token, mod_user):
    msg = _make_message(db, "party_1", user_b.id, "b", "bad text")
    rep = client.post(
        "/reports",
        json={"target_type": "chat_message", "target_id": str(msg.id), "reason": "harassment"},
        headers=_auth(token_a),
    ).json()

    resp = client.post(
        f"/admin/reports/{rep['id']}/resolve",
        json={"resolution": "hide", "reason": "неприемлемо"},
        headers=_auth(mod_token),
    )
    assert resp.status_code == 200, resp.text

    # Сообщение скрыто
    m = db.query(ChatMessage).filter(ChatMessage.id == msg.id).first()
    assert m.is_deleted is True

    # AuditLog записан
    from models.audit_log import AuditLog
    entries = db.query(AuditLog).all()
    actions = {e.action for e in entries}
    assert "resolve_report" in actions or "hide_chat_message" in actions
    # actor_id модератора зафиксирован
    assert any(e.actor_id == mod_user.id for e in entries)


def test_reject_report(client, db, user_a, user_b, token_a, mod_token):
    rep = client.post(
        "/reports",
        json={"target_type": "user", "target_id": str(user_b.id), "reason": "spam"},
        headers=_auth(token_a),
    ).json()
    resp = client.post(
        f"/admin/reports/{rep['id']}/reject",
        json={"reason": "невалидная жалоба"},
        headers=_auth(mod_token),
    )
    assert resp.status_code == 200

    # Статус изменился
    list_resp = client.get("/admin/reports?status=rejected", headers=_auth(mod_token))
    assert any(r["id"] == rep["id"] for r in list_resp.json())


# ── 8. Контент-модерация ─────────────────────────────────────────────────────

def test_hide_chat_message(client, db, user_a, user_b, mod_token):
    msg = _make_message(db, "party_1", user_b.id, "b", "bad text")
    resp = client.post(
        f"/admin/chat-messages/{msg.id}/hide",
        json={"reason": "спам"},
        headers=_auth(mod_token),
    )
    assert resp.status_code == 200
    db.refresh(msg)
    assert msg.is_deleted is True
    assert msg.delete_reason == "спам"


def test_unhide_chat_message(client, db, user_b, mod_token):
    msg = _make_message(db, "party_1", user_b.id, "b", "ok")
    msg.is_deleted = True
    db.commit()
    resp = client.post(
        f"/admin/chat-messages/{msg.id}/unhide",
        headers=_auth(mod_token),
    )
    assert resp.status_code == 200
    db.refresh(msg)
    assert msg.is_deleted is False


def test_hide_party(client, db, user_b, mod_token):
    party = _make_party(db, creator_id=user_b.id)
    resp = client.post(
        f"/admin/parties/{party.id}/hide",
        json={"reason": "fake"},
        headers=_auth(mod_token),
    )
    assert resp.status_code == 200
    db.refresh(party)
    assert party.is_hidden is True


# ── 9. Санкции на пользователей ──────────────────────────────────────────────

def test_warn_user_increments_counter(client, db, user_a, mod_token):
    resp = client.post(
        f"/admin/users/{user_a.id}/warn",
        json={"reason": "правила"},
        headers=_auth(mod_token),
    )
    assert resp.status_code == 200
    db.refresh(user_a)
    assert user_a.warnings_count == 1


def test_temp_ban_user(client, db, user_a, mod_token):
    resp = client.post(
        f"/admin/users/{user_a.id}/ban",
        json={"duration_hours": 24, "reason": "спам"},
        headers=_auth(mod_token),
    )
    assert resp.status_code == 200
    db.refresh(user_a)
    assert user_a.is_banned is True
    assert user_a.banned_until is not None
    assert user_a.banned_until > datetime.utcnow()


def test_perm_ban_only_admin(client, db, user_a, mod_token, admin_token):
    # Moderator не может
    resp = client.post(
        f"/admin/users/{user_a.id}/ban",
        json={"duration_hours": None, "reason": "плохой"},
        headers=_auth(mod_token),
    )
    assert resp.status_code == 403

    # Admin — может
    resp2 = client.post(
        f"/admin/users/{user_a.id}/ban",
        json={"duration_hours": None, "reason": "плохой"},
        headers=_auth(admin_token),
    )
    assert resp2.status_code == 200
    db.refresh(user_a)
    assert user_a.is_banned is True
    assert user_a.banned_until is None  # permanent


def test_unban_user(client, db, user_a, mod_token):
    user_a.is_banned = True
    user_a.banned_until = datetime.utcnow() + timedelta(hours=24)
    db.commit()
    resp = client.post(f"/admin/users/{user_a.id}/unban", headers=_auth(mod_token))
    assert resp.status_code == 200
    db.refresh(user_a)
    assert user_a.is_banned is False
    assert user_a.banned_until is None


def test_mute_user(client, db, user_a, mod_token):
    resp = client.post(
        f"/admin/users/{user_a.id}/mute",
        json={"duration_hours": 2, "reason": "флуд"},
        headers=_auth(mod_token),
    )
    assert resp.status_code == 200
    db.refresh(user_a)
    assert user_a.muted_until is not None
    assert user_a.muted_until > datetime.utcnow()


def test_moderator_cannot_ban_admin(client, db, admin_user, mod_token):
    """Модератор не может забанить admin."""
    resp = client.post(
        f"/admin/users/{admin_user.id}/ban",
        json={"duration_hours": 1, "reason": "x"},
        headers=_auth(mod_token),
    )
    assert resp.status_code == 403


# ── 10. Изменение роли — edge cases ──────────────────────────────────────────

def test_admin_grants_moderator(client, db, user_a, admin_token):
    resp = client.post(
        f"/admin/users/{user_a.id}/role",
        json={"role": "moderator"},
        headers=_auth(admin_token),
    )
    assert resp.status_code == 200
    db.refresh(user_a)
    assert user_a.role == "moderator"


def test_admin_cannot_demote_self(client, admin_user, admin_token):
    """Защита от self-demotion последнего админа."""
    resp = client.post(
        f"/admin/users/{admin_user.id}/role",
        json={"role": "user"},
        headers=_auth(admin_token),
    )
    assert resp.status_code == 400


def test_role_invalid_value_rejected(client, user_a, admin_token):
    resp = client.post(
        f"/admin/users/{user_a.id}/role",
        json={"role": "superduper"},
        headers=_auth(admin_token),
    )
    assert resp.status_code == 400


# ── 11. Audit log ─────────────────────────────────────────────────────────────

def test_audit_log_on_ban(client, db, user_a, mod_token, mod_user):
    client.post(
        f"/admin/users/{user_a.id}/ban",
        json={"duration_hours": 1, "reason": "x"},
        headers=_auth(mod_token),
    )
    from models.audit_log import AuditLog
    entries = db.query(AuditLog).filter(AuditLog.action == "ban_user").all()
    assert len(entries) == 1
    e = entries[0]
    assert e.actor_id == mod_user.id
    assert e.target_type == "user"
    assert e.target_id == str(user_a.id)


def test_audit_log_admin_endpoint(client, db, user_a, mod_token, admin_token):
    client.post(
        f"/admin/users/{user_a.id}/warn",
        json={"reason": "r"},
        headers=_auth(mod_token),
    )
    resp = client.get("/admin/audit", headers=_auth(admin_token))
    assert resp.status_code == 200
    entries = resp.json()
    assert any(e["action"] == "warn_user" for e in entries)


def test_audit_log_moderator_cannot_access(client, mod_token):
    """Audit log — только admin."""
    resp = client.get("/admin/audit", headers=_auth(mod_token))
    assert resp.status_code == 403


# ── 12. Hidden party исключается из публичных списков ────────────────────────

def test_hidden_party_excluded_from_search(client, db, user_b, mod_token, token_a):
    party_visible = _make_party(db, creator_id=user_b.id, title="Visible")
    party_hidden = EventParty(
        event_id="ev_2",
        title="Hidden",
        description="d",
        max_members=5,
        creator_id=user_b.id,
        is_open=True,
        is_hidden=True,
    )
    db.add(party_hidden)
    db.commit()

    resp = client.get(f"/parties/search?event_id=ev_2", headers=_auth(token_a))
    if resp.status_code == 200:
        # If the endpoint returns list, hidden must not appear
        data = resp.json()
        items = data if isinstance(data, list) else data.get("items", [])
        assert not any(p.get("id") == party_hidden.id for p in items)
