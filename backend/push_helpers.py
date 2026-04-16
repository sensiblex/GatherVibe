import base64
import json
import logging
import os
from urllib.parse import urlparse

from pywebpush import webpush, WebPushException
from sqlalchemy.orm import Session

from models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)

VAPID_CLAIMS_EMAIL = os.getenv("VAPID_CLAIMS_EMAIL", "webpush@gathervibe.ru")


def _get_vapid_private_key() -> str:
    """Return VAPID private key as PEM string.

    The env var stores the PEM base64-encoded (to survive .env line limits).
    Falls back to treating the raw value as a PEM string or base64url key.
    """
    raw = os.getenv("VAPID_PRIVATE_KEY", "")
    if not raw:
        return ""
    # Try base64-decode → PEM
    try:
        decoded = base64.b64decode(raw).decode()
        if "BEGIN" in decoded:
            return decoded
    except Exception:
        pass
    # Already a PEM string or raw base64url key — return as-is
    return raw


def send_push(
    endpoint: str,
    p256dh: str,
    auth: str,
    title: str,
    body: str,
    data: dict = None,
) -> bool:
    """Send a Web Push notification to a single subscription.

    Returns False when the subscription is expired (HTTP 410/404).
    Returns True for every other outcome (success or transient error).
    """
    private_key = _get_vapid_private_key()
    if not private_key:
        logger.warning("VAPID_PRIVATE_KEY not configured — skipping push")
        return True

    payload = json.dumps({"title": title, "body": body, "data": data or {}})

    # Derive audience from endpoint origin
    aud = "{}://{}".format(*urlparse(endpoint)[:2])
    vapid_claims = {"sub": f"mailto:{VAPID_CLAIMS_EMAIL}", "aud": aud}

    try:
        webpush(
            subscription_info={
                "endpoint": endpoint,
                "keys": {"p256dh": p256dh, "auth": auth},
            },
            data=payload,
            vapid_private_key=private_key,
            vapid_claims=vapid_claims,
        )
        return True
    except WebPushException as exc:
        response = getattr(exc, "response", None)
        status_code = response.status_code if response is not None else None
        if status_code in (404, 410):
            logger.info(
                "Push subscription expired (HTTP %s), endpoint=%s",
                status_code,
                endpoint[:60],
            )
            return False
        logger.error(
            "WebPushException (HTTP %s): %s, endpoint=%s",
            status_code,
            exc,
            endpoint[:60],
        )
        return True
    except Exception as exc:
        logger.error("Unexpected push error: %s, endpoint=%s", exc, endpoint[:60])
        return True


def send_push_to_user(
    db: Session,
    user_id: int,
    title: str,
    body: str,
    data: dict = None,
) -> None:
    """Send a Web Push notification to all subscriptions of a user.

    Subscriptions that return HTTP 410/404 are removed from the database.
    """
    subscriptions = (
        db.query(PushSubscription)
        .filter(PushSubscription.user_id == user_id)
        .all()
    )

    expired_ids = []
    for sub in subscriptions:
        alive = send_push(sub.endpoint, sub.p256dh, sub.auth, title, body, data)
        if not alive:
            expired_ids.append(sub.id)

    if expired_ids:
        db.query(PushSubscription).filter(
            PushSubscription.id.in_(expired_ids)
        ).delete(synchronize_session=False)
        db.commit()
        logger.info(
            "Removed %d expired push subscription(s) for user_id=%d",
            len(expired_ids),
            user_id,
        )
