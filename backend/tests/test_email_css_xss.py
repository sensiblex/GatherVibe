"""Tests for CSS completeness and XSS safety in email.py."""
import html
from unittest.mock import patch, MagicMock

from services.email import send_verification_email


def _capture_html(**kwargs):
    """Call send_verification_email and return the html string sent to Resend."""
    with patch("services.email.resend") as mock_resend:
        mock_resend.Emails.send = MagicMock(return_value="ok")
        mock_resend.api_key = None
        send_verification_email(**kwargs)
        call_args = mock_resend.Emails.send.call_args
        return call_args[0][0]["html"]


# ── CSS: background must have a value ──────────────────────────────────

def test_button_has_background_color():
    """Inline style of the CTA button must include a non-empty background value."""
    html_body = _capture_html(
        to_email="user@example.com", username="Alice", token="abc123"
    )
    # Find the <a> tag (the button)
    assert "background:" in html_body, "background CSS property missing"
    # background: must be followed by a color, not by another property or whitespace+end
    assert "background:#01696f" in html_body, (
        "background CSS property has no value — button will be invisible"
    )


# ── XSS: to_email must be escaped in HTML body ────────────────────────

def test_to_email_escaped_in_dev_block():
    """When DEV_EMAIL_OVERRIDE is set, to_email is shown in a <code> block
    and must be HTML-escaped to prevent XSS."""
    with patch("services.email.settings") as mock_settings:
        mock_settings.RESEND_API_KEY = "re_test_12345678"
        mock_settings.DEV_EMAIL_OVERRIDE = "dev@test.com"
        mock_settings.FRONTEND_URL = "http://localhost:3000"

        with patch("services.email.resend") as mock_resend:
            mock_resend.Emails.send = MagicMock(return_value="ok")
            mock_resend.api_key = None
            send_verification_email(
                to_email='<script>alert(1)</script>@x.com',
                username="Bob",
                token="tok",
            )
            html_body = mock_resend.Emails.send.call_args[0][0]["html"]

    # The raw <script> tag must NOT appear in the HTML body
    assert "<script>" not in html_body, (
        "Unescaped to_email allows HTML injection (XSS)"
    )
    # The escaped version must be present
    escaped = html.escape('<script>alert(1)</script>@x.com')
    assert escaped in html_body, (
        f"Expected escaped email '{escaped}' not found in HTML body"
    )


def test_to_email_escaped_normal_mode():
    """Even in normal (non-DEV) mode, to_email appears in the subject line
    which is not HTML — but we verify it's not injected into the body."""
    with patch("services.email.settings") as mock_settings:
        mock_settings.RESEND_API_KEY = "re_test_12345678"
        mock_settings.DEV_EMAIL_OVERRIDE = None
        mock_settings.FRONTEND_URL = "http://localhost:3000"

        with patch("services.email.resend") as mock_resend:
            mock_resend.Emails.send = MagicMock(return_value="ok")
            mock_resend.api_key = None
            send_verification_email(
                to_email='<img onerror=alert(1)>@evil.com',
                username="Eve",
                token="tok2",
            )
            html_body = mock_resend.Emails.send.call_args[0][0]["html"]

    # No raw HTML tags from to_email should appear in the body
    assert "<img" not in html_body, "Unescaped to_email in HTML body (XSS)"
