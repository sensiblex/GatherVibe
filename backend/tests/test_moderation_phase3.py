"""TDD тесты фазы 3 системы модерации.

Покрывают:
  1. GDPR export: /users/me/export — все данные юзера в JSON.
  2. Admin delete user: hard delete + анонимизация контента.
  3. Rate limit /reports: 5 за час, затем 429.
  4. Appeals: забаненный создаёт апелляцию; admin approve/reject.
  5. Bulk actions: warn/mute нескольких юзеров.
"""
from datetime import datetime, timedelta
import time
import pytest
from fastapi.testclient import TestClient

from auth import hash_password
from jwt_handler import create_access_token
from models.user import User
from models.chat_message import ChatMessage
from models.review import PartyReview
from models.party import EventParty, PartyMember
import models.attendee  # noqa
import models.kudago_event  # noqa
import models.party_coordination  # noqa
import models.push_subscription  # noqa
import models.message_reaction  # noqa
import models.party_recap  # noqa
import models.notification  # noqa
import models.feature_flag  # noqa
import models.banned_word  # noqa
import models.report  # noqa
import models.audit_log  # noqa
import models.appeal  # noqa


def _auth(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def _make_user(db, username: str, email: str, role: str = "user") -> User:
    u = User(username=username, email=email,
             hashed_password=hash_password("pw"),
             role=role, is_verified=True)
    db.add(u); db.commit(); db.refresh(u)
    return u


def _make_token(user: User) -> str:
    return create_access_token(
        data={"sub": user.email, "id": user.id, "username": user.username, "role": user.role},
        expires_delta=timedelta(minutes=60),
    )


@pytest.fixture
def admin_user(db):
    return _make_user(db, "adm_p3", "adm_p3@x.x", role="admin")


@pytest.fixture
def mod_user(db):
    return _make_user(db, "mod_p3", "mod_p3@x.x", role="moderator")


@pytest.fixture
def admin_token(admin_user):
    return _make_token(admin_user)


@pytest.fixture
def mod_token(mod_user):
    return _make_token(mod_user)



def test_export_includes_profile_and_reviews(client, db, user_a, user_b, token_a):
    party = EventParty(event_id="ev_ex1", title="P", description="d",
                       max_members=3, creator_id=user_b.id, is_open=True)
    db.add(party); db.commit(); db.refresh(party)
    db.add(PartyReview(reviewer_id=user_a.id, reviewed_id=user_b.id,
                       party_id=party.id, rating=4, text="good"))
    db.add(ChatMessage(room=f"party_{party.id}", user_id=str(user_a.id),
                       username=user_a.username, message="hi",
                       timestamp=datetime.utcnow()))
    db.commit()

    r = client.get("/users/me/export", headers=_auth(token_a))
    assert r.status_code == 200
    data = r.json()
    assert data["profile"]["id"] == user_a.id
    assert data["profile"]["email"] == user_a.email
    assert isinstance(data["reviews_written"], list)
    assert any(rv["rating"] == 4 for rv in data["reviews_written"])
    assert isinstance(data["chat_messages"], list)
    assert any("hi" in m["message"] for m in data["chat_messages"])


def test_export_requires_auth(client):
    r = client.get("/users/me/export")
    assert r.status_code == 401



def test_admin_can_delete_user(client, db, admin_token):
    victim = _make_user(db, "victim", "victim@x.x")
    vid = victim.id
    r = client.delete(f"/admin/users/{vid}", headers=_auth(admin_token))
    assert r.status_code == 200
    assert db.query(User).filter(User.id == vid).first() is None


def test_moderator_cannot_delete_user(client, db, mod_token):
    victim = _make_user(db, "v2", "v2@x.x")
    r = client.delete(f"/admin/users/{victim.id}", headers=_auth(mod_token))
    assert r.status_code == 403


def test_delete_user_anonymizes_chat_messages(client, db, admin_token):
    victim = _make_user(db, "v3", "v3@x.x")
    m = ChatMessage(room="party_1", user_id=str(victim.id), username=victim.username,
                    message="spam content", timestamp=datetime.utcnow())
    db.add(m); db.commit(); db.refresh(m)

    r = client.delete(f"/admin/users/{victim.id}", headers=_auth(admin_token))
    assert r.status_code == 200

    db.expire_all()
    m2 = db.query(ChatMessage).filter(ChatMessage.id == m.id).first()
    assert m2 is not None
    # username заменён на "deleted_user" или аналог, user_id на 0/"0"
    assert m2.username != victim.username
    assert "deleted" in (m2.username or "").lower() or m2.username == "[удалён]"


def test_delete_self_admin_forbidden_if_last(client, db, admin_user, admin_token):
    r = client.delete(f"/admin/users/{admin_user.id}", headers=_auth(admin_token))
    assert r.status_code == 400



def test_reports_rate_limit_after_5(client, db, user_a, token_a):
    targets = [_make_user(db, f"rt{i}", f"rt{i}@x.x") for i in range(6)]
    ok_count = 0
    rate_limited = False
    for i, t in enumerate(targets):
        r = client.post("/reports",
                        json={"target_type": "user", "target_id": str(t.id), "reason": "spam"},
                        headers=_auth(token_a))
        if r.status_code == 201:
            ok_count += 1
        elif r.status_code == 429:
            rate_limited = True
            break
    assert ok_count == 5
    assert rate_limited


def test_moderator_not_rate_limited(client, db, mod_user, mod_token):
    for i in range(8):
        t = _make_user(db, f"mt{i}", f"mt{i}@x.x")
        r = client.post("/reports",
                        json={"target_type": "user", "target_id": str(t.id), "reason": "spam"},
                        headers=_auth(mod_token))
        assert r.status_code == 201, f"Moderator should bypass rate limit (iter {i})"



def test_banned_user_can_submit_appeal(client, db, user_a, token_a):
    user_a.is_banned = True
    user_a.banned_until = datetime.utcnow() + timedelta(days=3)
    user_a.ban_reason = "spam"
    db.commit()

    # Вручную делаем запрос — get_current_user_from_token блокирует забаненного (по дизайну),
    # но эндпоинт апелляций должен принимать забаненного.
    r = client.post("/appeals",
                    json={"message": "это ошибка, я не спамил"},
                    headers=_auth(token_a))
    assert r.status_code == 201
    body = r.json()
    assert body["user_id"] == user_a.id
    assert body["status"] == "open"


def test_non_banned_cannot_appeal(client, user_a, token_a):
    r = client.post("/appeals",
                    json={"message": "я не забанен"},
                    headers=_auth(token_a))
    assert r.status_code == 400


def test_admin_sees_appeals_inbox(client, db, user_a, token_a, admin_token):
    user_a.is_banned = True
    user_a.banned_until = datetime.utcnow() + timedelta(days=1)
    db.commit()
    client.post("/appeals", json={"message": "please"}, headers=_auth(token_a))

    r = client.get("/admin/appeals", headers=_auth(admin_token))
    assert r.status_code == 200
    items = r.json()
    assert any(a["user_id"] == user_a.id for a in items)


def test_admin_approve_appeal_unbans(client, db, user_a, token_a, admin_token):
    user_a.is_banned = True
    user_a.banned_until = datetime.utcnow() + timedelta(days=1)
    db.commit()
    created = client.post("/appeals", json={"message": "please"}, headers=_auth(token_a)).json()

    r = client.post(f"/admin/appeals/{created['id']}/approve",
                    json={"reason": "valid"},
                    headers=_auth(admin_token))
    assert r.status_code == 200
    db.expire_all()
    u = db.query(User).filter(User.id == user_a.id).first()
    assert u.is_banned is False
    assert u.banned_until is None


def test_admin_reject_appeal_keeps_ban(client, db, user_a, token_a, admin_token):
    user_a.is_banned = True
    user_a.banned_until = datetime.utcnow() + timedelta(days=1)
    db.commit()
    created = client.post("/appeals", json={"message": "let me in"}, headers=_auth(token_a)).json()

    r = client.post(f"/admin/appeals/{created['id']}/reject",
                    json={"reason": "обоснованный бан"},
                    headers=_auth(admin_token))
    assert r.status_code == 200
    db.expire_all()
    u = db.query(User).filter(User.id == user_a.id).first()
    assert u.is_banned is True


def test_one_active_appeal_per_user(client, db, user_a, token_a):
    user_a.is_banned = True
    user_a.banned_until = datetime.utcnow() + timedelta(days=1)
    db.commit()
    r1 = client.post("/appeals", json={"message": "первая"}, headers=_auth(token_a))
    assert r1.status_code == 201
    r2 = client.post("/appeals", json={"message": "вторая"}, headers=_auth(token_a))
    assert r2.status_code == 409



def test_admin_bulk_warn(client, db, admin_token):
    victims = [_make_user(db, f"bw{i}", f"bw{i}@x.x") for i in range(3)]
    ids = [v.id for v in victims]
    r = client.post("/admin/users/bulk",
                    json={"user_ids": ids, "action": "warn", "reason": "bulk test"},
                    headers=_auth(admin_token))
    assert r.status_code == 200
    body = r.json()
    assert body["succeeded"] == 3
    assert body["skipped"] == 0

    db.expire_all()
    for vid in ids:
        u = db.query(User).filter(User.id == vid).first()
        assert u.warnings_count >= 1


def test_bulk_mute_works_for_moderator(client, db, mod_token):
    victims = [_make_user(db, f"bm{i}", f"bm{i}@x.x") for i in range(2)]
    r = client.post("/admin/users/bulk",
                    json={"user_ids": [v.id for v in victims],
                          "action": "mute", "duration_hours": 2, "reason": "bulk"},
                    headers=_auth(mod_token))
    assert r.status_code == 200
    assert r.json()["succeeded"] == 2


def test_bulk_skips_admin_and_moderator(client, db, admin_token, mod_user):
    # mod_user создан как moderator; обычный user тоже в списке
    normal = _make_user(db, "norm", "norm@x.x")
    r = client.post("/admin/users/bulk",
                    json={"user_ids": [mod_user.id, normal.id],
                          "action": "warn", "reason": "test"},
                    headers=_auth(admin_token))
    assert r.status_code == 200
    body = r.json()
    # mod_user должен быть пропущен (admin_token пытается warn moderator'а)
    # admin может warn-ить moderator? — по фазе 1 moderator может быть санкционирован только admin.
    # Решение: admin МОЖЕТ warn moderator. Но admin'а — нет.
    # Здесь mod_user — это обычный moderator, admin его может warn.
    # Значит 2 succeeded, 0 skipped.
    assert body["succeeded"] == 2


def test_bulk_moderator_cannot_ban(client, db, mod_token):
    victims = [_make_user(db, f"bb{i}", f"bb{i}@x.x") for i in range(2)]
    r = client.post("/admin/users/bulk",
                    json={"user_ids": [v.id for v in victims],
                          "action": "ban", "duration_hours": None, "reason": "x"},
                    headers=_auth(mod_token))
    assert r.status_code == 403


def test_bulk_invalid_action(client, admin_token):
    r = client.post("/admin/users/bulk",
                    json={"user_ids": [1], "action": "nuke", "reason": "x"},
                    headers=_auth(admin_token))
    # 400 (руководящая проверка) или 422 (pydantic pattern-validation) — оба приемлемы
    assert r.status_code in (400, 422)


def test_bulk_audit_log_per_user(client, db, admin_user, admin_token):
    victims = [_make_user(db, f"bl{i}", f"bl{i}@x.x") for i in range(3)]
    ids = [v.id for v in victims]
    client.post("/admin/users/bulk",
                json={"user_ids": ids, "action": "warn", "reason": "bulk audit"},
                headers=_auth(admin_token))
    from models.audit_log import AuditLog
    entries = db.query(AuditLog).filter(
        AuditLog.action == "warn_user",
        AuditLog.actor_id == admin_user.id,
    ).all()
    assert len(entries) >= 3
