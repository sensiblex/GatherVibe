import logging
import os
from datetime import datetime

import resend

logger = logging.getLogger(__name__)

resend.api_key = os.getenv("RESEND_API_KEY", "")
_APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:3000")

_FROM_ADDRESS = "GatherVibe <noreply@gathervibe.ru>"


def _hours_label(n: int) -> str:
    """Correct Russian plural form for hours: 1 час, 2 часа, 5 часов."""
    if n % 10 == 1 and n % 100 != 11:
        return f"{n} час"
    if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14):
        return f"{n} часа"
    return f"{n} часов"


def _build_reminder_html(
    username: str,
    event_title: str,
    event_date: datetime,
    party_title: str,
    party_id: int,
    members: list[str],
    hours_before: int,
) -> str:
    formatted_date = event_date.strftime("%d.%m.%Y в %H:%M")
    members_html = "".join(
        f'<li style="margin:4px 0;color:#374151;">{m}</li>' for m in members
    )
    party_url = f"{_APP_BASE_URL}/parties/{party_id}"

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Напоминание о событии — GatherVibe</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;overflow:hidden;
                      box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#610bef;padding:28px 40px;">
              <span style="font-size:24px;font-weight:700;color:#ffffff;
                           letter-spacing:-0.5px;">GatherVibe</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 24px;">
              <p style="margin:0 0 6px;font-size:14px;color:#6b7280;font-weight:500;
                         text-transform:uppercase;letter-spacing:0.5px;">
                Напоминание
              </p>
              <h1 style="margin:0 0 24px;font-size:26px;font-weight:700;color:#111827;
                          line-height:1.3;">
                Событие через {_hours_label(hours_before)}
              </h1>

              <!-- Event card -->
              <div style="background:#f5f3ff;border-left:4px solid #610bef;
                           border-radius:8px;padding:20px 24px;margin-bottom:24px;">
                <p style="margin:0 0 4px;font-size:12px;color:#8b5cf6;font-weight:600;
                           text-transform:uppercase;letter-spacing:0.5px;">Событие</p>
                <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1f2937;">
                  {event_title}
                </p>
                <p style="margin:0;font-size:15px;color:#4b5563;">
                  {formatted_date}
                </p>
              </div>

              <!-- Party info -->
              <p style="margin:0 0 8px;font-size:14px;color:#6b7280;font-weight:600;
                         text-transform:uppercase;letter-spacing:0.5px;">
                Ваша компания
              </p>
              <p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#1f2937;">
                {party_title}
              </p>

              <p style="margin:0 0 8px;font-size:14px;color:#6b7280;font-weight:600;
                         text-transform:uppercase;letter-spacing:0.5px;">
                Участники
              </p>
              <ul style="margin:0 0 28px;padding-left:20px;">
                {members_html}
              </ul>

              <!-- CTA button -->
              <a href="{party_url}"
                 style="display:inline-block;background:#610bef;color:#ffffff;
                        text-decoration:none;font-size:15px;font-weight:600;
                        padding:14px 32px;border-radius:8px;letter-spacing:0.2px;">
                Открыть компанию
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                Это письмо отправлено автоматически сервисом GatherVibe.<br/>
                Вы получили его, потому что включены email-уведомления в настройках.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def send_event_reminder_email(
    to_email: str,
    username: str,
    event_title: str,
    event_date: datetime,
    party_title: str,
    party_id: int,
    members: list[str],
    hours_before: int,
) -> bool:
    """Send an HTML event-reminder email via Resend.

    Returns True on success, False on failure.
    """
    if not resend.api_key:
        logger.warning("RESEND_API_KEY not configured — skipping reminder email")
        return False

    subject = f"Событие «{event_title}» через {_hours_label(hours_before)}"
    html_body = _build_reminder_html(
        username=username,
        event_title=event_title,
        event_date=event_date,
        party_title=party_title,
        party_id=party_id,
        members=members,
        hours_before=hours_before,
    )

    # Honour DEV_EMAIL_OVERRIDE when set (avoids sending to real addresses in dev)
    recipient = os.getenv("DEV_EMAIL_OVERRIDE") or to_email

    try:
        resend.Emails.send({
            "from": _FROM_ADDRESS,
            "to": [recipient],
            "subject": subject,
            "html": html_body,
        })
        logger.info(
            "Reminder email sent to %s (party_id=%d, hours_before=%d)",
            recipient,
            party_id,
            hours_before,
        )
        return True
    except Exception as exc:
        logger.error(
            "Failed to send reminder email to %s: %s",
            recipient,
            exc,
        )
        return False
