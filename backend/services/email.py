import logging
import resend
from core.config import settings

logger = logging.getLogger(__name__)


def send_verification_email(to_email: str, username: str, token: str) -> None:
    """Send verification email via Resend.

    In dev mode (DEV_EMAIL_OVERRIDE is set) all emails go to that address
    so you can test with arbitrary fake emails without owning the domain.
    """
    if not settings.RESEND_API_KEY:
        logger.warning("[email] RESEND_API_KEY не задан — отправка пропущена")
        return

    actual_to = settings.DEV_EMAIL_OVERRIDE or to_email
    resend.api_key = settings.RESEND_API_KEY

    subject = f"[DEV] Верификация для {to_email}" if settings.DEV_EMAIL_OVERRIDE else "Подтвердите ваш email — GatherVibe"
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"

    logger.info("[email] Отправка письма: to=%s, actual_to=%s, key_prefix=%s",
                to_email, actual_to, settings.RESEND_API_KEY[:8] + "...")

    try:
        result = resend.Emails.send({
            "from": "GatherVibe <onboarding@resend.dev>",
            "to": [actual_to],
            "subject": subject,
            "html": f"""
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
                    <h2 style="color:#01696f">Добро пожаловать в GatherVibe! 👋</h2>
                    {"<p style='background:#fef3c7;border-radius:8px;padding:10px;font-size:13px;'>"
                     f"<b>DEV:</b> оригинальный получатель — <code>{to_email}</code></p>"
                     if settings.DEV_EMAIL_OVERRIDE else ""}
                    <p>Нажмите кнопку ниже, чтобы подтвердить email и начать пользоваться сервисом.</p>
                    <a href="{verify_url}"
                       style="display:inline-block;margin:24px 0;padding:14px 28px;
                              background:#01696f;color:#fff;border-radius:10px;
                              text-decoration:none;font-weight:bold;">
                       Подтвердить email
                    </a>
                    <p style="color:#888;font-size:13px;">
                        Ссылка действует 24 часа.<br>
                        Если вы не регистрировались — просто проигнорируйте письмо.
                    </p>
                </div>
            """,
        })
        logger.info("[email] Resend ответ: %s", result)
    except Exception as exc:
        logger.error("[email] Ошибка отправки: %s", exc, exc_info=True)
