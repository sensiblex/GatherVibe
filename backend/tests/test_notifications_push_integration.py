"""
Integration tests: every create_notification() also fires Web Push to the
target user's subscriptions. pywebpush is mocked; DB uses the shared test
SQLite from conftest.
"""
from unittest.mock import patch

from notification_helpers import create_notification
from models.notification import Notification
from models.push_subscription import PushSubscription


def _add_sub(db, user_id: int, endpoint: str = "https://push.example/abc"):
    sub = PushSubscription(user_id=user_id, endpoint=endpoint, p256dh="p", auth="a")
    db.add(sub)
    db.commit()


def test_create_notification_dispatches_push_when_subscribed(db, user_a):
    _add_sub(db, user_a.id)
    with patch("notification_helpers.send_push_to_user") as mock_push:
        n = create_notification(
            db, user_a.id, "test_type", "Hello", body="World", data={"k": 1}
        )
        db.commit()
        assert isinstance(n, Notification)
        mock_push.assert_called_once()
        args, kwargs = mock_push.call_args
        call_args = {**kwargs}
        positional = list(args)
        if len(positional) >= 2:
            call_args["user_id"] = positional[1]
        if len(positional) >= 3:
            call_args["title"] = positional[2]
        if len(positional) >= 4:
            call_args["body"] = positional[3]
        if len(positional) >= 5:
            call_args["data"] = positional[4]
        assert call_args["user_id"] == user_a.id
        assert call_args["title"] == "Hello"
        assert call_args["body"] == "World"
        assert call_args["data"] == {"k": 1}


def test_create_notification_no_subscription_no_error(db, user_a):
    """User without push sub should still get in-app notification, no crash."""
    with patch("notification_helpers.send_push_to_user") as mock_push:
        create_notification(db, user_a.id, "test_type", "T", body="B")
        db.commit()
    row = db.query(Notification).filter_by(user_id=user_a.id).first()
    assert row is not None
    assert row.title == "T"


def test_create_notification_push_failure_does_not_break_db(db, user_a):
    """Push raising must not break in-app notification creation."""
    _add_sub(db, user_a.id)
    with patch(
        "notification_helpers.send_push_to_user",
        side_effect=RuntimeError("upstream down"),
    ):
        create_notification(db, user_a.id, "test_type", "T", body="B")
        db.commit()
    row = db.query(Notification).filter_by(user_id=user_a.id).first()
    assert row is not None


def test_create_notification_expired_sub_is_pruned(db, user_a):
    """End-to-end: 410 response from pywebpush removes subscription row."""
    _add_sub(db, user_a.id, "https://push.example/expired")
    from pywebpush import WebPushException
    from unittest.mock import MagicMock

    response = MagicMock()
    response.status_code = 410
    fake_vapid = MagicMock(name="Vapid")
    with patch("push_helpers.webpush") as mock_webpush, patch(
        "push_helpers._get_vapid", return_value=fake_vapid
    ):
        mock_webpush.side_effect = WebPushException("Gone", response=response)
        create_notification(db, user_a.id, "test_type", "T", body="B")
        db.commit()

    remaining = db.query(PushSubscription).filter_by(user_id=user_a.id).count()
    assert remaining == 0


def test_create_notification_only_target_user_gets_push(db, user_a, user_b):
    _add_sub(db, user_a.id, "https://push.example/a")
    _add_sub(db, user_b.id, "https://push.example/b")
    with patch("notification_helpers.send_push_to_user") as mock_push:
        create_notification(db, user_b.id, "test_type", "For B", body="hi")
        db.commit()
        assert mock_push.call_count == 1
        args, kwargs = mock_push.call_args
        target_user_id = args[1] if len(args) > 1 else kwargs.get("user_id")
        assert target_user_id == user_b.id
