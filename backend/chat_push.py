import asyncio
import json
import logging
import os
import tempfile
import time
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from models.notification import Notification
from models.party import EventParty, PartyMember
import push_helpers

logger = logging.getLogger(__name__)

CHAT_PUSH_THROTTLE_SECONDS = 5 * 60
_THROTTLE_NOTIF_TYPE = "__internal:chat_push_throttle"

_last_pushed: dict[tuple[int, int], int] = {}

_sid_user: dict[str, int] = {}

_presence: dict[tuple[int, int], set[str]] = {}

_user_party_sids: dict[int, set[tuple[int, str]]] = {}


def reset_state() -> None:
    """Сброс состояния — только для тестов."""
    _last_pushed.clear()
    _sid_user.clear()
    _presence.clear()
    _user_party_sids.clear()


def mark_join_party(sid: str, user_id: int, party_id: int) -> None:
    """Отметить что пользователь с данным sid присоединился к вечеринке."""
    _sid_user[sid] = user_id
    _presence.setdefault((user_id, party_id), set()).add(sid)
    _user_party_sids.setdefault(user_id, set()).add((party_id, sid))


def mark_leave_party(sid: str, party_id: int) -> None:
    """Отметить что пользователь с данным sid покинул вечеринку."""
    user_id = _sid_user.get(sid)
    if user_id is None:
        return
    sids = _presence.get((user_id, party_id))
    if not sids:
        return
    sids.discard(sid)
    if not sids:
        _presence.pop((user_id, party_id), None)
    user_entries = _user_party_sids.get(user_id)
    if user_entries:
        user_entries.discard((party_id, sid))
        if not user_entries:
            _user_party_sids.pop(user_id, None)


def mark_disconnect(sid: str) -> None:
    """Отметить отключение пользователя по sid."""
    user_id = _sid_user.pop(sid, None)
    if user_id is None:
        return
    entries = _user_party_sids.pop(user_id, None)
    if entries:
        for party_id, _sid in entries:
            sids = _presence.get((user_id, party_id))
            if sids:
                sids.discard(sid)
                if not sids:
                    _presence.pop((user_id, party_id), None)


def is_user_online_in_party(user_id: int, party_id: int) -> bool:
    """Проверить онлайн ли пользователь в вечерине."""
    return bool(_presence.get((user_id, party_id)))


def _participant_user_ids(db: Session, party: EventParty) -> list[int]:
    """Получить ID всех участников вечеринки."""
    rows = (
        db.query(PartyMember)
        .filter(PartyMember.party_id == party.id, PartyMember.status == "accepted")
        .all()
    )
    ids = [r.user_id for r in rows]
    ids.append(party.creator_id)
    return ids


def _truncate(text: str, limit: int = 100) -> str:
    """Обрезать текст до указанного лимита."""
    if not text:
        return ""
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _ensure_cross_worker_throttle(db: Session, user_id: int, party_id: int, now: int) -> bool:
    """Разрешить push если throttling не exceeded и обновить маркер."""
    marker_key = f"party:{party_id}"
    now_dt = datetime.fromtimestamp(now, tz=timezone.utc)

    # Сериализация проверок по (пользователь, вечеринка) в Postgres
    lock_file = None
    try:
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            lock_key = (user_id << 32) + party_id
            db.execute(text("SELECT pg_advisory_xact_lock(:lock_key)"), {"lock_key": lock_key})
        elif db.bind is not None and db.bind.dialect.name == "sqlite":
            # Fallback на файловый lock для SQLite (поддержка мультипроцесса)
            lock_dir = tempfile.gettempdir()
            lock_path = os.path.join(lock_dir, f"chat_push_throttle_{user_id}_{party_id}.lock")
            lock_file = open(lock_path, "w")
            # Кроссплатформенный файловый lock
            if os.name == "nt":  # Windows
                import msvcrt
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_LOCK, 1)
            else:  # Unix
                import fcntl
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
    except Exception as exc:
        # Fallback на best-effort если advisory lock недоступен.
        logger.warning("Advisory lock unavailable for user_id=%s party_id=%s: %s", user_id, party_id, exc)
        if lock_file:
            lock_file.close()
            lock_file = None

    try:
        marker = (
            db.query(Notification)
            .filter(
                Notification.user_id == user_id,
                Notification.type == _THROTTLE_NOTIF_TYPE,
                Notification.title == marker_key,
            )
            .order_by(Notification.id.desc())
            .first()
        )
        if marker and marker.created_at:
            created = marker.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            last_ts = int(created.timestamp())
            if now - last_ts < CHAT_PUSH_THROTTLE_SECONDS:
                return False

        payload = json.dumps({"party_id": party_id, "ts": now}, ensure_ascii=False)
        if marker:
            marker.created_at = now_dt
            marker.data = payload
            marker.is_read = True
        else:
            db.add(
                Notification(
                    user_id=user_id,
                    type=_THROTTLE_NOTIF_TYPE,
                    title=marker_key,
                    body=None,
                    data=payload,
                    is_read=True,
                    created_at=now_dt,
                )
            )
        db.flush()
        return True
    finally:
        if lock_file:
            lock_file.close()


async def notify_chat_message(
    db: Session,
    party: EventParty,
    sender_id: int,
    sender_username: str,
    message_text: str,
    now_ts: int | None = None,
) -> set[int]:
    """
    Отправить Web Push оффлайн участникам вечеринки
    """
    now = now_ts if now_ts is not None else int(time.time())
    pushed: set[int] = set()

    body = _truncate(message_text) if message_text else "Вложение"
    title = f"{sender_username} в «{party.title}»"
    payload = {"party_id": party.id, "type": "chat_message"}

    loop = asyncio.get_running_loop()
    for uid in _participant_user_ids(db, party):
        if uid == sender_id:
            continue
        if is_user_online_in_party(uid, party.id):
            continue
        if not _ensure_cross_worker_throttle(db, uid, party.id, now):
            continue
        try:
            await loop.run_in_executor(
                None,
                lambda: push_helpers.send_push_to_user(db, uid, title, body, payload),
            )
        except Exception as exc:
            logger.warning("chat_push send failed for user_id=%s: %s", uid, exc)
            # Удаляем throttle marker чтобы push можно было повторить позже
            marker = (
                db.query(Notification)
                .filter(
                    Notification.user_id == uid,
                    Notification.type == _THROTTLE_NOTIF_TYPE,
                    Notification.title == f"party:{party.id}",
                )
                .first()
            )
            if marker:
                db.delete(marker)
                db.flush()
            continue
        pushed.add(uid)

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to commit chat push transaction")
    return pushed
