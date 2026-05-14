"""Security tests for email validation in email_helpers.

Verifies that send_event_reminder_email rejects invalid email addresses.
"""

from datetime import datetime, timezone
from unittest.mock import patch

import pytest


def _call_send_reminder(to_email: str) -> bool:
    """Helper: call send_event_reminder_email with minimal args."""
    from email_helpers import send_event_reminder_email
    return send_event_reminder_email(
        to_email=to_email,
        username="testuser",
        event_title="Test Event",
        event_date=datetime.now(timezone.utc),
        party_title="Test Party",
        party_id=1,
        members=["user1"],
        hours_before=24,
    )


def test_send_event_reminder_rejects_invalid_email():
    """Invalid email must be rejected before sending."""
    result = _call_send_reminder("invalid-email")
    assert result is False


def test_send_event_reminder_rejects_email_without_domain():
    """Email without domain part must be rejected."""
    result = _call_send_reminder("user@")
    assert result is False


def test_send_event_reminder_rejects_email_without_tld():
    """Email without TLD must be rejected."""
    result = _call_send_reminder("user@domain")
    assert result is False


@pytest.mark.parametrize("email", [
    "test@example.com",
    "user.name+tag@domain.co.uk",
    "user@sub.domain.com",
])
def test_send_event_reminder_accepts_valid_emails(email):
    """Valid emails must be accepted (Resend mock returns success)."""
    with patch("resend.Emails.send", return_value={"id": "test"}), \
         patch("email_helpers.resend.api_key", "re_test_key"):
        result = _call_send_reminder(email)
        assert result is True

