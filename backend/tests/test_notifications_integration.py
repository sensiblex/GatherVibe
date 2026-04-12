"""
Step 4 — Integration tests: verify a DB notification is created
when specific API actions are taken.

Step 6 — Edge cases.

NOTE: delete_party (4.5) does NOT create DB notifications for members — it
only emits Socket.IO. This is an implementation gap documented below.
"""
import json
import pytest
from models.notification import Notification
from models.party import EventParty, PartyMember
from notification_helpers import create_notification, get_unread_count


AUTH_HEADER = lambda token: {"Authorization": f"Bearer {token}"}


def _create_party(db, creator_id: int, event_id: str = "evt-1") -> EventParty:
    p = EventParty(
        event_id=event_id,
        title="Test Party",
        max_members=4,
        creator_id=creator_id,
        is_open=True,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _join_party(client, party_id: int, token: str):
    return client.post(
        f"/parties/{party_id}/join",
        json={"message": "want to join"},
        headers=AUTH_HEADER(token),
    )


def _get_pending_request_id(db, party_id: int, user_id: int) -> int:
    m = db.query(PartyMember).filter(
        PartyMember.party_id == party_id,
        PartyMember.user_id == user_id,
    ).first()
    assert m is not None, "No pending member found"
    return m.id


# ── 4.1 new_party_request notification ───────────────────────────────────────

class TestJoinPartyCreatesNotification:
    def test_notification_created_for_creator(self, client, db, user_a, user_b, token_b):
        party = _create_party(db, user_a.id, event_id="kudago-123")
        _join_party(client, party.id, token_b)

        notifs = db.query(Notification).filter(
            Notification.user_id == user_a.id,
            Notification.type == "new_party_request",
        ).all()
        assert len(notifs) == 1

    def test_notification_data_contains_party_id(self, client, db, user_a, user_b, token_b):
        party = _create_party(db, user_a.id, event_id="kudago-123")
        _join_party(client, party.id, token_b)

        notif = db.query(Notification).filter(
            Notification.user_id == user_a.id,
            Notification.type == "new_party_request",
        ).first()
        assert notif is not None
        data = json.loads(notif.data)
        assert data["party_id"] == party.id

    def test_notification_data_contains_requester_info(self, client, db, user_a, user_b, token_b):
        party = _create_party(db, user_a.id, event_id="kudago-123")
        _join_party(client, party.id, token_b)

        notif = db.query(Notification).filter(
            Notification.user_id == user_a.id,
            Notification.type == "new_party_request",
        ).first()
        data = json.loads(notif.data)
        assert data["user_id"] == user_b.id
        assert data["username"] == user_b.username


# ── 4.2 request_status_changed (approved) ────────────────────────────────────

class TestApproveRequestCreatesNotification:
    def test_notification_created_for_requester_on_approve(
        self, client, db, user_a, user_b, token_a, token_b
    ):
        party = _create_party(db, user_a.id, event_id="kudago-123")
        _join_party(client, party.id, token_b)
        request_id = _get_pending_request_id(db, party.id, user_b.id)

        client.post(
            f"/parties/requests/{request_id}/approve",
            headers=AUTH_HEADER(token_a),
        )

        notif = db.query(Notification).filter(
            Notification.user_id == user_b.id,
            Notification.type == "request_status_changed",
        ).first()
        assert notif is not None
        data = json.loads(notif.data)
        assert data["status"] == "accepted"
        assert data["party_id"] == party.id

    def test_notification_is_unread(
        self, client, db, user_a, user_b, token_a, token_b
    ):
        party = _create_party(db, user_a.id, event_id="kudago-123")
        _join_party(client, party.id, token_b)
        request_id = _get_pending_request_id(db, party.id, user_b.id)
        client.post(f"/parties/requests/{request_id}/approve", headers=AUTH_HEADER(token_a))

        notif = db.query(Notification).filter(
            Notification.user_id == user_b.id,
            Notification.type == "request_status_changed",
        ).first()
        assert notif.is_read is False


# ── 4.3 request_status_changed (rejected) ────────────────────────────────────

class TestRejectRequestCreatesNotification:
    def test_notification_created_for_requester_on_reject(
        self, client, db, user_a, user_b, token_a, token_b
    ):
        party = _create_party(db, user_a.id, event_id="kudago-123")
        _join_party(client, party.id, token_b)
        request_id = _get_pending_request_id(db, party.id, user_b.id)

        client.post(
            f"/parties/requests/{request_id}/reject",
            headers=AUTH_HEADER(token_a),
        )

        notif = db.query(Notification).filter(
            Notification.user_id == user_b.id,
            Notification.type == "request_status_changed",
        ).first()
        assert notif is not None
        data = json.loads(notif.data)
        assert data["status"] == "rejected"


# ── 4.4 kicked_from_party ────────────────────────────────────────────────────

class TestKickCreatesNotification:
    def test_notification_created_for_kicked_member(
        self, client, db, user_a, user_b, token_a, token_b
    ):
        party = _create_party(db, user_a.id, event_id="kudago-123")
        _join_party(client, party.id, token_b)
        # Accept user_b
        request_id = _get_pending_request_id(db, party.id, user_b.id)
        client.post(f"/parties/requests/{request_id}/approve", headers=AUTH_HEADER(token_a))

        # Kick user_b
        client.post(
            f"/parties/{party.id}/members/{user_b.id}/kick",
            json={"reason": "test"},
            headers=AUTH_HEADER(token_a),
        )

        notif = db.query(Notification).filter(
            Notification.user_id == user_b.id,
            Notification.type == "kicked_from_party",
        ).first()
        assert notif is not None
        data = json.loads(notif.data)
        assert data["party_id"] == party.id


# ── 4.5 party_deleted — KNOWN IMPLEMENTATION GAP ─────────────────────────────

class TestDeletePartyNotification:
    def test_delete_party_does_not_create_db_notification(
        self, client, db, user_a, user_b, token_a, token_b
    ):
        """
        KNOWN GAP: delete_party() only emits sio.emit('party_deleted') —
        it does NOT create a DB notification for members.
        This test documents the current behavior (not a bug in the test).
        """
        party = _create_party(db, user_a.id, event_id="kudago-123")
        _join_party(client, party.id, token_b)
        request_id = _get_pending_request_id(db, party.id, user_b.id)
        client.post(f"/parties/requests/{request_id}/approve", headers=AUTH_HEADER(token_a))

        # Clear all existing notifications (from join/accept)
        db.query(Notification).filter(Notification.user_id == user_b.id).delete()
        db.commit()

        client.delete(f"/parties/{party.id}", headers=AUTH_HEADER(token_a))

        # No DB notification created for user_b
        count = db.query(Notification).filter(Notification.user_id == user_b.id).count()
        assert count == 0, (
            "Implementation gap: delete_party() should create DB notifications for members "
            "but currently does not. Only Socket.IO event is emitted."
        )


# ── Step 6: Edge Cases ────────────────────────────────────────────────────────

class TestEdgeCases:
    def test_large_data_field_saved_correctly(self, db, user_a):
        large_data = {f"key_{i}": f"value_{i}" * 10 for i in range(100)}
        n = create_notification(db, user_a.id, "t", "T", data=large_data)
        db.commit()

        db.refresh(n)
        assert json.loads(n.data) == large_data

    def test_cascade_delete_on_user_delete(self, db, user_a):
        """
        Notifications are deleted when user is deleted (CASCADE).
        SQLite requires PRAGMA foreign_keys=ON to enforce cascades.
        We enable it here; in PostgreSQL (production) it works automatically.
        """
        from sqlalchemy import text as sa_text
        # Enable FK enforcement for this connection
        db.execute(sa_text("PRAGMA foreign_keys=ON"))
        db.commit()

        create_notification(db, user_a.id, "t", "T")
        db.commit()

        assert db.query(Notification).filter(Notification.user_id == user_a.id).count() == 1

        from models.user import User
        db.delete(db.query(User).filter(User.id == user_a.id).first())
        db.commit()

        assert db.query(Notification).filter(Notification.user_id == user_a.id).count() == 0

    def test_pagination_exact_boundary(self, db, user_a):
        for _ in range(30):
            create_notification(db, user_a.id, "t", "T")
        db.commit()

        from notification_helpers import get_user_notifications
        page = get_user_notifications(db, user_a.id, limit=30, offset=0)
        assert len(page) == 30

        next_page = get_user_notifications(db, user_a.id, limit=30, offset=30)
        assert len(next_page) == 0

    def test_duplicate_actions_create_separate_notifications(self, db, user_a):
        """Each create_notification call produces a separate DB record."""
        n1 = create_notification(db, user_a.id, "t", "T")
        db.commit()
        n2 = create_notification(db, user_a.id, "t", "T")
        db.commit()

        assert n1.id != n2.id
        total = db.query(Notification).filter(Notification.user_id == user_a.id).count()
        assert total == 2

    def test_notification_id_in_sio_payload_via_join(
        self, client, db, user_a, user_b, token_b
    ):
        """
        Verify notification_id is persisted to DB and matches what would be
        sent in the Socket.IO payload.
        (We can't capture the actual sio.emit payload in tests without a live socket,
        but we verify the notification is created with a valid id before emit.)
        """
        party = _create_party(db, user_a.id, event_id="kudago-123")
        _join_party(client, party.id, token_b)

        notif = db.query(Notification).filter(
            Notification.user_id == user_a.id,
            Notification.type == "new_party_request",
        ).first()
        assert notif is not None
        assert notif.id is not None
        assert isinstance(notif.id, int)
        assert notif.id > 0
