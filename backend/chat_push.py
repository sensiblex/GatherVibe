"""Throttled push notifications for new party-chat messages.

Goal: keep the in-app chat as good as Telegram for retention. If a member
isn't actively in the chat room, ping them — but at most once per 5 minutes
per (user, party) pair so we don't flood.

State is in-process. Single-worker deployment. Move to Redis if we ever
go multi-process.
"""
import asyncio
import logging
import time

from sqlalchemy.orm import Session

from models.party import EventParty, PartyMember
import push_helpers

logger = logging.getLogger(__name__)

CHAT_PUSH_THROTTLE_SECONDS = 5 * 60

_last_pushed: dict[tuple[int, int], int] = {}

_sid_user: dict[str, int] = {}

_presence: dict[tuple[int, int], set[str]] = {}


def reset_state() -> None:
    """Test-only helper."""
    _last_pushed.clear()
    _sid_user.clear()
    _presence.clear()


def mark_join_party(sid: str, user_id: int, party_id: int) -> None:
    _sid_user[sid] = user_id
    _presence.setdefault((user_id, party_id), set()).add(sid)


def mark_leave_party(sid: str, party_id: int) -> None:
    user_id = _sid_user.get(sid)
    if user_id is None:
        return
    sids = _presence.get((user_id, party_id))
    if not sids:
        return
    sids.discard(sid)
    if not sids:
        _presence.pop((user_id, party_id), None)


def mark_disconnect(sid: str) -> None:
    user_id = _sid_user.pop(sid, None)
    if user_id is None:
        return
    for key in list(_presence.keys()):
        if key[0] != user_id:
            continue
        _presence[key].discard(sid)
        if not _presence[key]:
            _presence.pop(key, None)


def is_user_online_in_party(user_id: int, party_id: int) -> bool:
    return bool(_presence.get((user_id, party_id)))


def _participant_user_ids(db: Session, party: EventParty) -> list[int]:
    rows = (
        db.query(PartyMember)
        .filter(PartyMember.party_id == party.id, PartyMember.status == "accepted")
        .all()
    )
    ids = [r.user_id for r in rows]
    ids.append(party.creator_id)
    return ids


def _truncate(text: str, limit: int = 100) -> str:
    if not text:
        return ""
    return text if len(text) <= limit else text[: limit - 1] + "…"


async def notify_chat_message(
    db: Session,
    party: EventParty,
    sender_id: int,
    sender_username: str,
    message_text: str,
    now_ts: int | None = None,
) -> set[int]:
    """Send a throttled Web Push to offline party members.

    Returns the set of user_ids that actually got pushed (for tests/telemetry).
    Push send is offloaded to a thread so this never blocks the Socket.IO loop.
    """
    now = now_ts if now_ts is not None else int(time.time())
    pushed: set[int] = set()

    body = _truncate(message_text) if message_text else "📎 Вложение"
    title = f"{sender_username} в «{party.title}»"
    payload = {"party_id": party.id, "type": "chat_message"}

    for uid in _participant_user_ids(db, party):
        if uid == sender_id:
            continue
        last = _last_pushed.get((uid, party.id), 0)
        if now - last < CHAT_PUSH_THROTTLE_SECONDS:
            continue
        if is_user_online_in_party(uid, party.id):
            continue
        try:
            push_helpers.send_push_to_user(db, uid, title, body, payload)
        except Exception as exc:
            logger.warning("chat_push send failed for user_id=%s: %s", uid, exc)
            continue
        _last_pushed[(uid, party.id)] = now
        pushed.add(uid)

    return pushed
