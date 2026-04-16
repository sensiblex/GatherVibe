"""
Step 4 — Integration tests: verify a DB notification is created
when specific API actions are taken.

Step 5 — Smoke tests for new accept/reject member endpoints added in the
notification-system refactor (POST /parties/{id}/members/{uid}/accept|reject).

Step 6 — Edge cases.

NOTE: delete_party (4.5) does NOT create DB notifications for members — it
only emits Socket.IO. This is an implementation gap documented below.

Refactor changes covered here:
- subscribe_notifications Socket.IO handler now uses room user_{id} instead of
  creator_{id}. This is verified by inspecting main.py in test_sio_room_naming.
- New HTTP endpoints accept_member / reject_member now emit new_notification
  into room user_{member_id}. The DB-side notification creation is verified in
  TestAcceptMemberCreatesNotification and TestRejectMemberCreatesNotification.
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


# ── Step 5: New endpoints from notification refactor ─────────────────────────
# These endpoints were added in the refactor alongside the subscribe_notifications
# room-name change (creator_{id} → user_{id}).

# ── 5.1  POST /parties/{party_id}/members/{user_id}/accept ───────────────────

class TestAcceptMemberCreatesNotification:
    """
    Smoke tests for the accept_member endpoint.

    The endpoint:
      1. Sets member status → accepted.
      2. Creates a request_status_changed notification for the member.
      3. Emits new_notification into room user_{member_id}.
      4. Emits request_status_changed into room user_{member_id}.

    Tests here verify steps 1 and 2 (the DB-observable side).
    Socket.IO emissions (steps 3-4) cannot be captured without a live transport.
    """

    def test_notification_created_for_accepted_member(
        self, client, db, user_a, user_b, token_a, token_b
    ):
        # Arrange: party owned by user_a, user_b submits join request
        party = _create_party(db, user_a.id, event_id="kudago-accept-1")
        _join_party(client, party.id, token_b)

        # Act: creator (user_a) accepts user_b via the new endpoint
        r = client.post(
            f"/parties/{party.id}/members/{user_b.id}/accept",
            headers=AUTH_HEADER(token_a),
        )
        assert r.status_code == 200

        # Assert: notification created for user_b (the accepted member)
        notif = db.query(Notification).filter(
            Notification.user_id == user_b.id,
            Notification.type == "request_status_changed",
        ).first()
        assert notif is not None

    def test_notification_data_status_is_accepted(
        self, client, db, user_a, user_b, token_a, token_b
    ):
        # Arrange
        party = _create_party(db, user_a.id, event_id="kudago-accept-2")
        _join_party(client, party.id, token_b)

        # Act
        client.post(
            f"/parties/{party.id}/members/{user_b.id}/accept",
            headers=AUTH_HEADER(token_a),
        )

        # Assert: payload carries status=accepted and correct party_id
        notif = db.query(Notification).filter(
            Notification.user_id == user_b.id,
            Notification.type == "request_status_changed",
        ).first()
        assert notif is not None
        data = json.loads(notif.data)
        assert data["status"] == "accepted"
        assert data["party_id"] == party.id

    def test_notification_is_unread_after_accept(
        self, client, db, user_a, user_b, token_a, token_b
    ):
        # Arrange
        party = _create_party(db, user_a.id, event_id="kudago-accept-3")
        _join_party(client, party.id, token_b)

        # Act
        client.post(
            f"/parties/{party.id}/members/{user_b.id}/accept",
            headers=AUTH_HEADER(token_a),
        )

        # Assert: new notification is unread
        notif = db.query(Notification).filter(
            Notification.user_id == user_b.id,
            Notification.type == "request_status_changed",
        ).first()
        assert notif is not None
        assert notif.is_read is False

    def test_member_status_set_to_accepted_in_db(
        self, client, db, user_a, user_b, token_a, token_b
    ):
        # Arrange
        party = _create_party(db, user_a.id, event_id="kudago-accept-4")
        _join_party(client, party.id, token_b)

        # Act
        client.post(
            f"/parties/{party.id}/members/{user_b.id}/accept",
            headers=AUTH_HEADER(token_a),
        )

        # Assert: PartyMember row is now accepted
        member = db.query(PartyMember).filter(
            PartyMember.party_id == party.id,
            PartyMember.user_id == user_b.id,
        ).first()
        assert member is not None
        assert member.status == "accepted"

    def test_non_creator_cannot_accept(
        self, client, db, user_a, user_b, token_b
    ):
        # Arrange: user_a owns party, user_b tries to accept themselves
        party = _create_party(db, user_a.id, event_id="kudago-accept-5")
        _join_party(client, party.id, token_b)

        # Act: user_b (not creator) tries to accept
        r = client.post(
            f"/parties/{party.id}/members/{user_b.id}/accept",
            headers=AUTH_HEADER(token_b),
        )

        # Assert: forbidden
        assert r.status_code == 403


# ── 5.2  POST /parties/{party_id}/members/{user_id}/reject ───────────────────

class TestRejectMemberCreatesNotification:
    """
    Smoke tests for the reject_member endpoint.

    The endpoint:
      1. Sets member status → rejected.
      2. Creates a request_status_changed notification for the member.
      3. Emits new_notification into room user_{member_id}.
      4. Emits request_status_changed into room user_{member_id}.

    Tests here verify steps 1 and 2 (the DB-observable side).
    """

    def test_notification_created_for_rejected_member(
        self, client, db, user_a, user_b, token_a, token_b
    ):
        # Arrange
        party = _create_party(db, user_a.id, event_id="kudago-reject-1")
        _join_party(client, party.id, token_b)

        # Act: creator rejects user_b via new endpoint
        r = client.post(
            f"/parties/{party.id}/members/{user_b.id}/reject",
            headers=AUTH_HEADER(token_a),
        )
        assert r.status_code == 200

        # Assert: notification created for user_b
        notif = db.query(Notification).filter(
            Notification.user_id == user_b.id,
            Notification.type == "request_status_changed",
        ).first()
        assert notif is not None

    def test_notification_data_status_is_rejected(
        self, client, db, user_a, user_b, token_a, token_b
    ):
        # Arrange
        party = _create_party(db, user_a.id, event_id="kudago-reject-2")
        _join_party(client, party.id, token_b)

        # Act
        client.post(
            f"/parties/{party.id}/members/{user_b.id}/reject",
            headers=AUTH_HEADER(token_a),
        )

        # Assert: data carries status=rejected
        notif = db.query(Notification).filter(
            Notification.user_id == user_b.id,
            Notification.type == "request_status_changed",
        ).first()
        assert notif is not None
        data = json.loads(notif.data)
        assert data["status"] == "rejected"
        assert data["party_id"] == party.id

    def test_notification_is_unread_after_reject(
        self, client, db, user_a, user_b, token_a, token_b
    ):
        # Arrange
        party = _create_party(db, user_a.id, event_id="kudago-reject-3")
        _join_party(client, party.id, token_b)

        # Act
        client.post(
            f"/parties/{party.id}/members/{user_b.id}/reject",
            headers=AUTH_HEADER(token_a),
        )

        # Assert
        notif = db.query(Notification).filter(
            Notification.user_id == user_b.id,
            Notification.type == "request_status_changed",
        ).first()
        assert notif is not None
        assert notif.is_read is False

    def test_member_status_set_to_rejected_in_db(
        self, client, db, user_a, user_b, token_a, token_b
    ):
        # Arrange
        party = _create_party(db, user_a.id, event_id="kudago-reject-4")
        _join_party(client, party.id, token_b)

        # Act
        client.post(
            f"/parties/{party.id}/members/{user_b.id}/reject",
            headers=AUTH_HEADER(token_a),
        )

        # Assert: PartyMember row is now rejected
        member = db.query(PartyMember).filter(
            PartyMember.party_id == party.id,
            PartyMember.user_id == user_b.id,
        ).first()
        assert member is not None
        assert member.status == "rejected"

    def test_non_creator_cannot_reject(
        self, client, db, user_a, user_b, token_b
    ):
        # Arrange: user_a owns party, user_b tries to reject themselves
        party = _create_party(db, user_a.id, event_id="kudago-reject-5")
        _join_party(client, party.id, token_b)

        # Act: user_b (not creator) tries to reject
        r = client.post(
            f"/parties/{party.id}/members/{user_b.id}/reject",
            headers=AUTH_HEADER(token_b),
        )

        # Assert: forbidden
        assert r.status_code == 403


# ── 5.3  Socket.IO room-naming regression check ──────────────────────────────

class TestSioRoomNaming:
    """
    Verify that subscribe_notifications registers the socket into room
    user_{id} (not creator_{id} which was the pre-refactor name).

    Without a live Socket.IO transport we can't call the handler directly,
    so we inspect the handler source to assert the correct room string is used.
    This is a lightweight regression guard that will fail if someone reverts
    the room name back to creator_{id}.
    """

    def test_subscribe_notifications_uses_user_room(self):
        import inspect
        import main as app_module

        # Retrieve the registered handler for 'subscribe_notifications'
        handler = app_module.sio.handlers.get("/", {}).get("subscribe_notifications")
        assert handler is not None, (
            "subscribe_notifications Socket.IO handler not found — was it renamed or removed?"
        )

        source = inspect.getsource(handler)

        # Must contain user_{...} room entry
        assert "user_" in source, (
            "subscribe_notifications must use room 'user_{user.id}' (post-refactor). "
            "Found neither 'user_' substring. Check main.py."
        )

        # Must NOT still reference the old creator_ room
        assert "creator_" not in source, (
            "subscribe_notifications still references old room 'creator_{id}'. "
            "The refactor should have changed this to 'user_{id}'."
        )
