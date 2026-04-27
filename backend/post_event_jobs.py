"""Post-event background jobs.

Three reminders fire AFTER an event finishes, designed to pull users back
into the app instead of drifting to external messengers:

  +2h   → review reminder    (drives reviews / trust score)
  +1d   → recap reminder     (drives photo upload while memories are fresh)
  +14d  → gather-again       (drives repeat events with the same crew)

The runner is sync and takes an explicit `now_ts` so it's trivially testable.
The background loop in main.py wraps it.
"""
import json
import logging
from typing import Callable

from sqlalchemy.orm import Session

from models.notification import Notification
from models.party import EventParty, PartyMember
from notification_helpers import create_notification

logger = logging.getLogger(__name__)

POST_EVENT_REVIEW_DELAY = 2 * 3600
POST_EVENT_RECAP_DELAY = 24 * 3600
POST_EVENT_GATHER_AGAIN_DELAY = 14 * 24 * 3600

NOTIF_REVIEW_REMINDER = "post_event_review_reminder"
NOTIF_RECAP_REMINDER = "post_event_recap_reminder"
NOTIF_GATHER_AGAIN = "gather_again"

LOOKBACK_WINDOW_SECONDS = 7 * 24 * 3600


def _accepted_recipients(db: Session, party: EventParty) -> set[int]:
    rows = (
        db.query(PartyMember)
        .filter(PartyMember.party_id == party.id, PartyMember.status == "accepted")
        .all()
    )
    ids = {r.user_id for r in rows}
    ids.add(party.creator_id)
    return ids


def _already_sent(db: Session, user_id: int, notif_type: str, party_id: int) -> bool:
    expected = json.dumps({"party_id": party_id})
    return (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.type == notif_type,
            Notification.data == expected,
        )
        .first()
        is not None
    )


_TitleFn = Callable[[EventParty], str]
_BodyFn = Callable[[EventParty], str]


def _jobs() -> list[tuple[int, str, _TitleFn, _BodyFn]]:
    return [
        (
            POST_EVENT_REVIEW_DELAY,
            NOTIF_REVIEW_REMINDER,
            lambda p: "Как прошло?",
            lambda p: f"Оставьте отзыв участникам компании «{p.title}»",
        ),
        (
            POST_EVENT_RECAP_DELAY,
            NOTIF_RECAP_REMINDER,
            lambda p: "Соберите воспоминания",
            lambda p: f"Загрузите фото и заметки в recap компании «{p.title}»",
        ),
        (
            POST_EVENT_GATHER_AGAIN_DELAY,
            NOTIF_GATHER_AGAIN,
            lambda p: "Соберитесь снова?",
            lambda p: f"Прошло 2 недели с «{p.title}» — самое время собрать новую встречу",
        ),
    ]


def run_post_event_jobs(
    db: Session,
    now_ts: int,
    lookback_window: int = LOOKBACK_WINDOW_SECONDS,
) -> dict[str, int]:
    """Dispatch any due post-event reminders. Returns counts per notif type.

    Idempotent: each (user, party, notif_type) triple is sent at most once.
    """
    counts: dict[str, int] = {
        NOTIF_REVIEW_REMINDER: 0,
        NOTIF_RECAP_REMINDER: 0,
        NOTIF_GATHER_AGAIN: 0,
    }

    for delay, notif_type, title_fn, body_fn in _jobs():
        target_high = now_ts - delay
        target_low = target_high - lookback_window

        parties = (
            db.query(EventParty)
            .filter(
                EventParty.event_date_ts.isnot(None),
                EventParty.event_date_ts >= target_low,
                EventParty.event_date_ts <= target_high,
            )
            .all()
        )

        for party in parties:
            for uid in _accepted_recipients(db, party):
                if _already_sent(db, uid, notif_type, party.id):
                    continue
                try:
                    create_notification(
                        db, uid, notif_type,
                        title_fn(party), body_fn(party),
                        {"party_id": party.id},
                    )
                    counts[notif_type] += 1
                except Exception as exc:
                    logger.error(
                        "post_event_jobs: failed to notify user_id=%s party_id=%s type=%s: %s",
                        uid, party.id, notif_type, exc,
                    )
                    db.rollback()
        db.commit()

    return counts
