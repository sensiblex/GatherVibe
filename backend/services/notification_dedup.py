from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy import or_

from models.notification import Notification


def normalize_notification_payload(data: Mapping[str, Any] | None) -> str | None:
    """Serialize payload in deterministic JSON format for DB-stable comparisons."""
    if data is None:
        return None
    return json.dumps(dict(data), ensure_ascii=False, sort_keys=True, separators=(", ", ": "))


def has_notification(
    db: Session,
    user_id: int,
    notif_type: str,
    data: Mapping[str, Any] | None,
) -> bool:
    """Return True when a notification with same recipient/type/payload exists."""
    serialized = normalize_notification_payload(data)
    legacy_serialized = json.dumps(dict(data)) if data is not None else None
    query = (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.type == notif_type,
        )
    )
    if serialized is None:
        query = query.filter(Notification.data.is_(None))
    else:
        data_filters = [Notification.data == serialized]
        if legacy_serialized != serialized:
            data_filters.append(Notification.data == legacy_serialized)
        query = query.filter(or_(*data_filters))
    return query.first() is not None


def has_party_notification(
    db: Session,
    user_id: int,
    notif_type: str,
    party_id: int,
    extra_data: Mapping[str, Any] | None = None,
) -> bool:
    """Shortcut dedup helper for reminders/events that are keyed by party_id."""
    payload: dict[str, Any] = {"party_id": party_id}
    if extra_data:
        payload.update(extra_data)
    return has_notification(db, user_id, notif_type, payload)
