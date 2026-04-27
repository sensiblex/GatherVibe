"""
Step 2 — DB layer tests for the notification system.

Covers: model creation, create_notification(), get_user_notifications(),
        mark_as_read(), mark_all_as_read(), get_unread_count().
"""
import json
import time
import pytest
from models.notification import Notification
from notification_helpers import (
    create_notification,
    get_user_notifications,
    mark_as_read,
    mark_all_as_read,
    get_unread_count,
)



class TestNotificationModel:
    def test_create_directly_all_fields_saved(self, db, user_a):
        n = Notification(
            user_id=user_a.id,
            type="request_status_changed",
            title="Test title",
            body="Test body",
            data=json.dumps({"party_id": 1}),
            is_read=False,
        )
        db.add(n)
        db.commit()
        db.refresh(n)

        assert n.id is not None
        assert n.user_id == user_a.id
        assert n.type == "request_status_changed"
        assert n.title == "Test title"
        assert n.body == "Test body"
        assert json.loads(n.data) == {"party_id": 1}
        assert n.is_read is False
        assert n.created_at is not None

    def test_is_read_defaults_to_false(self, db, user_a):
        n = Notification(user_id=user_a.id, type="t", title="x")
        db.add(n)
        db.commit()
        db.refresh(n)
        assert n.is_read is False

    def test_created_at_set_automatically(self, db, user_a):
        n = Notification(user_id=user_a.id, type="t", title="x")
        db.add(n)
        db.commit()
        db.refresh(n)
        assert n.created_at is not None

    def test_data_none_is_allowed(self, db, user_a):
        n = Notification(user_id=user_a.id, type="t", title="x", data=None)
        db.add(n)
        db.commit()
        db.refresh(n)
        assert n.data is None

    def test_body_none_is_allowed(self, db, user_a):
        n = Notification(user_id=user_a.id, type="t", title="x", body=None)
        db.add(n)
        db.commit()
        db.refresh(n)
        assert n.body is None

    def test_data_json_round_trips(self, db, user_a):
        payload = {"key": "value", "nested": {"a": 1}}
        n = Notification(user_id=user_a.id, type="t", title="x", data=json.dumps(payload))
        db.add(n)
        db.commit()
        db.refresh(n)
        assert json.loads(n.data) == payload



class TestCreateNotification:
    def test_returns_notification_with_correct_fields(self, db, user_a):
        n = create_notification(db, user_a.id, "new_party_request", "Title", "Body", {"k": "v"})
        db.commit()

        assert n.id is not None
        assert n.user_id == user_a.id
        assert n.type == "new_party_request"
        assert n.title == "Title"
        assert n.body == "Body"
        assert json.loads(n.data) == {"k": "v"}
        assert n.is_read is False

    def test_persisted_in_db(self, db, user_a):
        n = create_notification(db, user_a.id, "t", "T")
        db.commit()

        fetched = db.query(Notification).filter(Notification.id == n.id).first()
        assert fetched is not None

    def test_with_data_none(self, db, user_a):
        n = create_notification(db, user_a.id, "t", "T", data=None)
        db.commit()
        assert n.data is None

    def test_with_body_none(self, db, user_a):
        n = create_notification(db, user_a.id, "t", "T", body=None)
        db.commit()
        assert n.body is None

    def test_all_notification_types(self, db, user_a):
        types = ["request_status_changed", "kicked_from_party", "new_party_request"]
        for t in types:
            n = create_notification(db, user_a.id, t, "title")
            db.commit()
            assert n.type == t



class TestGetUserNotifications:
    def test_returns_only_requesting_user_notifications(self, db, user_a, user_b):
        for i in range(5):
            create_notification(db, user_a.id, "t", f"a{i}")
        for i in range(3):
            create_notification(db, user_b.id, "t", f"b{i}")
        db.commit()

        results = get_user_notifications(db, user_a.id)
        assert len(results) == 5
        assert all(n.user_id == user_a.id for n in results)

    def test_ordered_newest_first(self, db, user_a):
        for i in range(3):
            create_notification(db, user_a.id, "t", f"n{i}")
            db.commit()
            time.sleep(0.01)

        results = get_user_notifications(db, user_a.id)
        timestamps = [n.created_at for n in results]
        assert timestamps == sorted(timestamps, reverse=True)

    def test_pagination_limit(self, db, user_a):
        for i in range(5):
            create_notification(db, user_a.id, "t", f"n{i}")
        db.commit()

        results = get_user_notifications(db, user_a.id, limit=2, offset=0)
        assert len(results) == 2

    def test_pagination_offset(self, db, user_a):
        for i in range(5):
            create_notification(db, user_a.id, "t", f"n{i}")
        db.commit()

        page1 = get_user_notifications(db, user_a.id, limit=2, offset=0)
        page2 = get_user_notifications(db, user_a.id, limit=2, offset=2)
        ids1 = {n.id for n in page1}
        ids2 = {n.id for n in page2}
        assert ids1.isdisjoint(ids2)
        assert len(ids2) == 2

    def test_empty_for_user_with_no_notifications(self, db, user_a):
        results = get_user_notifications(db, user_a.id)
        assert results == []

    def test_offset_beyond_total_returns_empty(self, db, user_a):
        create_notification(db, user_a.id, "t", "only one")
        db.commit()

        results = get_user_notifications(db, user_a.id, limit=10, offset=999)
        assert results == []



class TestMarkAsRead:
    def test_marks_own_notification_as_read(self, db, user_a):
        n = create_notification(db, user_a.id, "t", "T")
        db.commit()

        result = mark_as_read(db, n.id, user_a.id)
        db.commit()

        assert result is True
        db.refresh(n)
        assert n.is_read is True

    def test_returns_false_for_nonexistent_id(self, db, user_a):
        result = mark_as_read(db, 99999, user_a.id)
        assert result is False

    def test_security_cannot_mark_other_users_notification(self, db, user_a, user_b):
        n = create_notification(db, user_a.id, "t", "T")
        db.commit()

        result = mark_as_read(db, n.id, user_b.id)
        db.commit()

        assert result is False
        db.refresh(n)
        assert n.is_read is False



class TestMarkAllAsRead:
    def test_marks_all_unread_for_user(self, db, user_a):
        for _ in range(5):
            create_notification(db, user_a.id, "t", "T")
        db.commit()

        count = mark_all_as_read(db, user_a.id)
        db.commit()

        assert count == 5
        remaining_unread = get_unread_count(db, user_a.id)
        assert remaining_unread == 0

    def test_does_not_touch_other_users(self, db, user_a, user_b):
        for _ in range(3):
            create_notification(db, user_b.id, "t", "T")
        db.commit()

        mark_all_as_read(db, user_a.id)
        db.commit()

        assert get_unread_count(db, user_b.id) == 3

    def test_returns_correct_count(self, db, user_a):
        for _ in range(4):
            create_notification(db, user_a.id, "t", "T")
        n = create_notification(db, user_a.id, "t", "T")
        db.commit()
        mark_as_read(db, n.id, user_a.id)
        db.commit()

        count = mark_all_as_read(db, user_a.id)
        db.commit()
        assert count == 4

    def test_zero_unread_returns_zero(self, db, user_a):
        count = mark_all_as_read(db, user_a.id)
        db.commit()
        assert count == 0



class TestGetUnreadCount:
    def test_correct_count_with_mixed_state(self, db, user_a):
        n1 = create_notification(db, user_a.id, "t", "T")
        n2 = create_notification(db, user_a.id, "t", "T")
        create_notification(db, user_a.id, "t", "T")
        db.commit()

        mark_as_read(db, n1.id, user_a.id)
        mark_as_read(db, n2.id, user_a.id)
        db.commit()

        assert get_unread_count(db, user_a.id) == 1

    def test_count_decreases_after_mark_as_read(self, db, user_a):
        n = create_notification(db, user_a.id, "t", "T")
        create_notification(db, user_a.id, "t", "T")
        db.commit()

        assert get_unread_count(db, user_a.id) == 2
        mark_as_read(db, n.id, user_a.id)
        db.commit()
        assert get_unread_count(db, user_a.id) == 1

    def test_zero_for_user_with_no_notifications(self, db, user_a):
        assert get_unread_count(db, user_a.id) == 0

    def test_user_isolation(self, db, user_a, user_b):
        for _ in range(3):
            create_notification(db, user_b.id, "t", "T")
        db.commit()

        assert get_unread_count(db, user_a.id) == 0
