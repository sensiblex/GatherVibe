import base64
import json
import logging
import os
from urllib.parse import urlparse

from py_vapid import Vapid
from pywebpush import webpush, WebPushException
from sqlalchemy.orm import Session

from models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)

VAPID_CLAIMS_EMAIL = os.getenv("VAPID_CLAIMS_EMAIL", "webpush@gathervibe.ru")

_vapid_instance: Vapid | None = None
_vapid_load_error: Exception | None = None


def _get_vapid() -> Vapid | None:
    """Build (and cache) a py_vapid.Vapid instance from the configured env var.

    Accepts any of:
      * base64-encoded PEM (how production stores it — one line in .env)
      * raw PEM string (``-----BEGIN PRIVATE KEY-----`` ... multi-line)
      * raw base64url 32-byte EC private key (what py_vapid.from_string expects)

    Returns None (and logs once) if the key is missing or malformed.
    """
    global _vapid_instance, _vapid_load_error
    if _vapid_instance is not None:
        return _vapid_instance
    if _vapid_load_error is not None:
        return None

    raw = os.getenv("VAPID_PRIVATE_KEY", "")
    if not raw:
        return None

    pem: str | None = None
    try:
        decoded = base64.b64decode(raw).decode()
        if "BEGIN" in decoded:
            pem = decoded
    except Exception:
        pass

    if pem is None and "BEGIN" in raw:
        pem = raw

    try:
        if pem is not None:
            _vapid_instance = Vapid.from_pem(pem.encode())
        else:
            _vapid_instance = Vapid.from_string(raw)
        return _vapid_instance
    except Exception as exc:
        _vapid_load_error = exc
        logger.error("Failed to load VAPID private key: %s", exc)
        return None


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
    vapid = _get_vapid()
    if vapid is None:
        logger.warning("VAPID key not configured/invalid — skipping push")
        return True

    payload = json.dumps({"title": title, "body": body, "data": data or {}})

    aud = "{}://{}".format(*urlparse(endpoint)[:2])
    vapid_claims = {"sub": f"mailto:{VAPID_CLAIMS_EMAIL}", "aud": aud}

    try:
        webpush(
            subscription_info={
                "endpoint": endpoint,
                "keys": {"p256dh": p256dh, "auth": auth},
            },
            data=payload,
            vapid_private_key=vapid,
            vapid_claims=vapid_claims,
            ttl=86400,
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
