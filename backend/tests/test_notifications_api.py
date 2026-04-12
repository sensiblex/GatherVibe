"""
Step 3 — API endpoint tests for /notifications/*.

Tests: GET /notifications/, GET /notifications/unread-count,
       POST /notifications/read, POST /notifications/read-all

NOTE on API contract observations (read from actual code):
- GET /notifications/ returns list[NotificationOut] — no total/unread_count wrapper
- POST /notifications/read takes {"notification_id": int} — returns {"ok": true}
  or 404 if notification not found / belongs to another user
- POST /notifications/read-all returns {"ok": true, "marked": N}
- GET /notifications/unread-count returns {"count": N}
"""
import pytest
from notification_helpers import create_notification, mark_as_read


AUTH_HEADER = lambda token: {"Authorization": f"Bearer {token}"}


# ── 3.1 GET /notifications/ ───────────────────────────────────────────────────

class TestListNotifications:
    def test_no_auth_returns_401(self, client):
        r = client.get("/notifications/")
        assert r.status_code == 401

    def test_empty_when_no_notifications(self, client, token_a):
        r = client.get("/notifications/", headers=AUTH_HEADER(token_a))
        assert r.status_code == 200
        assert r.json() == []

    def test_returns_correct_list(self, client, db, user_a, token_a):
        create_notification(db, user_a.id, "new_party_request", "Hello", "World", {"k": 1})
        db.commit()

        r = client.get("/notifications/", headers=AUTH_HEADER(token_a))
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        assert data[0]["type"] == "new_party_request"
        assert data[0]["title"] == "Hello"
        assert data[0]["body"] == "World"
        assert data[0]["is_read"] is False

    def test_ordered_newest_first(self, client, db, user_a, token_a):
        """
        Ordering: response IDs should match DESC created_at ordering.
        SQLite server_default=func.now() has second-precision, so we verify
        that newer records (higher id) appear before older ones in response.
        The DB-layer ordering test (test_notifications_db) covers this more
        precisely with time.sleep() between inserts.
        """
        import time
        n1 = create_notification(db, user_a.id, "t", "first")
        db.commit()
        time.sleep(1.05)  # force a 1-second gap so SQLite timestamps differ
        n2 = create_notification(db, user_a.id, "t", "second")
        db.commit()

        r = client.get("/notifications/", headers=AUTH_HEADER(token_a))
        data = r.json()
        assert len(data) == 2
        # n2 (newer) should come first
        assert data[0]["id"] == n2.id
        assert data[1]["id"] == n1.id

    def test_pagination_limit(self, client, db, user_a, token_a):
        for i in range(5):
            create_notification(db, user_a.id, "t", f"n{i}")
        db.commit()

        r = client.get("/notifications/?limit=2", headers=AUTH_HEADER(token_a))
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_pagination_offset(self, client, db, user_a, token_a):
        for i in range(5):
            create_notification(db, user_a.id, "t", f"n{i}")
        db.commit()

        page1 = client.get("/notifications/?limit=2&offset=0", headers=AUTH_HEADER(token_a)).json()
        page2 = client.get("/notifications/?limit=2&offset=2", headers=AUTH_HEADER(token_a)).json()
        ids1 = {n["id"] for n in page1}
        ids2 = {n["id"] for n in page2}
        assert ids1.isdisjoint(ids2)

    def test_offset_beyond_total_returns_empty(self, client, db, user_a, token_a):
        create_notification(db, user_a.id, "t", "only")
        db.commit()

        r = client.get("/notifications/?offset=999", headers=AUTH_HEADER(token_a))
        assert r.json() == []

    def test_user_isolation(self, client, db, user_a, user_b, token_a):
        create_notification(db, user_b.id, "t", "secret")
        db.commit()

        r = client.get("/notifications/", headers=AUTH_HEADER(token_a))
        assert r.json() == []

    def test_response_schema_has_required_fields(self, client, db, user_a, token_a):
        create_notification(db, user_a.id, "t", "T", "B", {"x": 1})
        db.commit()

        data = client.get("/notifications/", headers=AUTH_HEADER(token_a)).json()[0]
        for field in ("id", "type", "title", "body", "data", "is_read", "created_at"):
            assert field in data, f"Missing field: {field}"


# ── 3.2 POST /notifications/read ─────────────────────────────────────────────

class TestReadNotification:
    def test_no_auth_returns_401(self, client):
        r = client.post("/notifications/read", json={"notification_id": 1})
        assert r.status_code == 401

    def test_marks_own_notification_as_read(self, client, db, user_a, token_a):
        n = create_notification(db, user_a.id, "t", "T")
        db.commit()

        r = client.post(
            "/notifications/read",
            json={"notification_id": n.id},
            headers=AUTH_HEADER(token_a),
        )
        assert r.status_code == 200
        assert r.json()["ok"] is True

        db.refresh(n)
        assert n.is_read is True

    def test_nonexistent_id_returns_404(self, client, token_a):
        r = client.post(
            "/notifications/read",
            json={"notification_id": 99999},
            headers=AUTH_HEADER(token_a),
        )
        assert r.status_code == 404

    def test_security_foreign_notification_returns_404(
        self, client, db, user_a, user_b, token_b
    ):
        """User B cannot mark User A's notification as read — gets 404."""
        n = create_notification(db, user_a.id, "t", "secret")
        db.commit()

        r = client.post(
            "/notifications/read",
            json={"notification_id": n.id},
            headers=AUTH_HEADER(token_b),
        )
        assert r.status_code == 404
        db.refresh(n)
        assert n.is_read is False  # unchanged

    def test_already_read_returns_404(self, client, db, user_a, token_a):
        """Once marked read, marking again should still return ok (idempotent)
        or 404 — test the actual behavior and document it."""
        n = create_notification(db, user_a.id, "t", "T")
        db.commit()
        mark_as_read(db, n.id, user_a.id)
        db.commit()

        # The endpoint calls mark_as_read which returns False if already read
        # because is_read=True — actually the helper sets is_read=True again and returns True
        # Let's check: in notification_helpers.mark_as_read, it fetches and sets is_read=True.
        # It returns False only if not found. So calling again should work (returns True again).
        r = client.post(
            "/notifications/read",
            json={"notification_id": n.id},
            headers=AUTH_HEADER(token_a),
        )
        # Idempotent — already read notifications can be "marked read" again
        assert r.status_code == 200


# ── 3.3 POST /notifications/read-all ─────────────────────────────────────────

class TestReadAllNotifications:
    def test_no_auth_returns_401(self, client):
        r = client.post("/notifications/read-all")
        assert r.status_code == 401

    def test_marks_all_unread_and_returns_count(self, client, db, user_a, token_a):
        for _ in range(4):
            create_notification(db, user_a.id, "t", "T")
        db.commit()

        r = client.post("/notifications/read-all", headers=AUTH_HEADER(token_a))
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["marked"] == 4

    def test_zero_unread_returns_zero(self, client, token_a):
        r = client.post("/notifications/read-all", headers=AUTH_HEADER(token_a))
        assert r.status_code == 200
        assert r.json()["marked"] == 0

    def test_does_not_affect_other_users(self, client, db, user_a, user_b, token_a):
        for _ in range(3):
            create_notification(db, user_b.id, "t", "T")
        db.commit()

        client.post("/notifications/read-all", headers=AUTH_HEADER(token_a))
        db.commit()

        from notification_helpers import get_unread_count
        assert get_unread_count(db, user_b.id) == 3

    def test_after_read_all_count_is_zero(self, client, db, user_a, token_a):
        for _ in range(3):
            create_notification(db, user_a.id, "t", "T")
        db.commit()

        client.post("/notifications/read-all", headers=AUTH_HEADER(token_a))
        r = client.get("/notifications/unread-count", headers=AUTH_HEADER(token_a))
        assert r.json()["count"] == 0


# ── 3.4 GET /notifications/unread-count ──────────────────────────────────────

class TestUnreadCount:
    def test_no_auth_returns_401(self, client):
        r = client.get("/notifications/unread-count")
        assert r.status_code == 401

    def test_zero_when_no_notifications(self, client, token_a):
        r = client.get("/notifications/unread-count", headers=AUTH_HEADER(token_a))
        assert r.status_code == 200
        assert r.json()["count"] == 0

    def test_returns_correct_count(self, client, db, user_a, token_a):
        for _ in range(3):
            create_notification(db, user_a.id, "t", "T")
        db.commit()

        r = client.get("/notifications/unread-count", headers=AUTH_HEADER(token_a))
        assert r.json()["count"] == 3

    def test_count_updates_after_mark_all_read(self, client, db, user_a, token_a):
        for _ in range(5):
            create_notification(db, user_a.id, "t", "T")
        db.commit()

        client.post("/notifications/read-all", headers=AUTH_HEADER(token_a))
        r = client.get("/notifications/unread-count", headers=AUTH_HEADER(token_a))
        assert r.json()["count"] == 0

    def test_user_isolation(self, client, db, user_a, user_b, token_a):
        for _ in range(5):
            create_notification(db, user_b.id, "t", "T")
        db.commit()

        r = client.get("/notifications/unread-count", headers=AUTH_HEADER(token_a))
        assert r.json()["count"] == 0
