"""
Unit tests for push_helpers.py — Web Push sending logic.

pywebpush.webpush is always mocked so no real network calls are made.
"""
from unittest.mock import patch, MagicMock

import pytest
from pywebpush import WebPushException

import push_helpers
from models.push_subscription import PushSubscription


@pytest.fixture(autouse=True)
def _mock_vapid():
    """All send_push tests: skip real VAPID loading; return a fake Vapid instance."""
    fake = MagicMock(name="Vapid")
    with patch("push_helpers._get_vapid", return_value=fake):
        yield fake


# ── send_push() ──────────────────────────────────────────────────────────────


def test_send_push_success_returns_true():
    with patch("push_helpers.webpush") as mock_webpush:
        mock_webpush.return_value = None
        alive = push_helpers.send_push(
            endpoint="https://fcm.googleapis.com/fcm/send/ABC",
            p256dh="p256dh_key",
            auth="auth_secret",
            title="Hello",
            body="World",
            data={"party_id": 1},
        )
        assert alive is True
        mock_webpush.assert_called_once()
        # Verify VAPID claims use endpoint origin
        _, kwargs = mock_webpush.call_args
        assert kwargs["vapid_claims"]["aud"] == "https://fcm.googleapis.com"


def test_send_push_410_returns_false():
    """Expired subscription — caller should delete the row."""
    response = MagicMock()
    response.status_code = 410
    with patch("push_helpers.webpush") as mock_webpush:
        mock_webpush.side_effect = WebPushException("Gone", response=response)
        alive = push_helpers.send_push(
            endpoint="https://fcm.googleapis.com/fcm/send/EXPIRED",
            p256dh="x",
            auth="y",
            title="t",
            body="b",
        )
        assert alive is False


def test_send_push_404_returns_false():
    response = MagicMock()
    response.status_code = 404
    with patch("push_helpers.webpush") as mock_webpush:
        mock_webpush.side_effect = WebPushException("Not Found", response=response)
        alive = push_helpers.send_push(
            endpoint="https://push.com/x", p256dh="x", auth="y", title="t", body="b"
        )
        assert alive is False


def test_send_push_500_returns_true_transient():
    """Transient upstream error — keep subscription, retry later."""
    response = MagicMock()
    response.status_code = 500
    with patch("push_helpers.webpush") as mock_webpush:
        mock_webpush.side_effect = WebPushException("Server Error", response=response)
        alive = push_helpers.send_push(
            endpoint="https://push.com/x", p256dh="x", auth="y", title="t", body="b"
        )
        assert alive is True


def test_send_push_no_vapid_key_returns_true_noop():
    """Missing key → log + return True, never touch webpush."""
    with patch("push_helpers.webpush") as mock_webpush, patch(
        "push_helpers._get_vapid", return_value=None
    ):
        alive = push_helpers.send_push(
            endpoint="https://push.com/x", p256dh="x", auth="y", title="t", body="b"
        )
        assert alive is True
        mock_webpush.assert_not_called()


def test_send_push_unexpected_exception_returns_true():
    """Unknown error shouldn't kill subscription — log + return True."""
    with patch("push_helpers.webpush") as mock_webpush:
        mock_webpush.side_effect = RuntimeError("boom")
        alive = push_helpers.send_push(
            endpoint="https://push.com/x", p256dh="x", auth="y", title="t", body="b"
        )
        assert alive is True


# ── send_push_to_user() ──────────────────────────────────────────────────────


def _add_sub(db, user_id: int, endpoint: str) -> PushSubscription:
    sub = PushSubscription(
        user_id=user_id,
        endpoint=endpoint,
        p256dh="p256",
        auth="auth",
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def test_send_push_to_user_no_subs_is_noop(db, user_a):
    with patch("push_helpers.send_push") as mock_send:
        push_helpers.send_push_to_user(db, user_a.id, "t", "b")
        mock_send.assert_not_called()


def test_send_push_to_user_sends_to_all_subs(db, user_a):
    _add_sub(db, user_a.id, "https://push.com/1")
    _add_sub(db, user_a.id, "https://push.com/2")
    with patch("push_helpers.send_push", return_value=True) as mock_send:
        push_helpers.send_push_to_user(db, user_a.id, "t", "b", {"x": 1})
        assert mock_send.call_count == 2


def test_send_push_to_user_removes_expired_subs(db, user_a):
    _add_sub(db, user_a.id, "https://push.com/alive")
    _add_sub(db, user_a.id, "https://push.com/dead")

    def fake_send(endpoint, *args, **kwargs):
        return endpoint != "https://push.com/dead"

    with patch("push_helpers.send_push", side_effect=fake_send):
        push_helpers.send_push_to_user(db, user_a.id, "t", "b")

    remaining = db.query(PushSubscription).filter_by(user_id=user_a.id).all()
    assert len(remaining) == 1
    assert remaining[0].endpoint == "https://push.com/alive"


def test_send_push_to_user_other_user_unaffected(db, user_a, user_b):
    _add_sub(db, user_a.id, "https://push.com/a")
    _add_sub(db, user_b.id, "https://push.com/b")
    with patch("push_helpers.send_push", return_value=True) as mock_send:
        push_helpers.send_push_to_user(db, user_a.id, "t", "b")
        assert mock_send.call_count == 1
        called_endpoint = mock_send.call_args[0][0]
        assert called_endpoint == "https://push.com/a"
