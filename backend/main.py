import asyncio
import logging
import socketio
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os as _os
from urllib.parse import urlparse as _urlparse

from deps import (
    get_user_from_socket_token,
)
from services.db_schema import (
    ensure_db_schema_compatibility,
    get_current_schema_check_mode,
)
from sio_instance import sio  # noqa: E402
from database import SessionLocal  # noqa: E402
from models.chat_message import ChatMessage  # noqa: E402
from models.message_reaction import MessageReaction  # noqa: E402
from models.user import User  # noqa: E402
from models.party import EventParty, PartyMember  # noqa: E402
from routers.parties import MemberStatus  # noqa: E402
import chat_push  # noqa: E402

import kudago_cache  # noqa: E402

CACHE_SYNC_INTERVAL = 3600  # Интервал синхронизации кэша (1 час)
REMINDER_LOOP_INTERVAL = 900  # Интервал цикла напоминаний (15 минут)
REMINDER_BATCH_SIZE = 100  # Размер пакета для обработки


async def _cache_sync_loop():
    """Фоновая задача: синхронизирует кэш событий каждый час."""
    while True:
        try:
            loop = asyncio.get_event_loop()
            stats = await loop.run_in_executor(None, kudago_cache.sync_all)
            logger.info("Синхронизация кэша KudaGo завершена: %s", stats)
        except Exception as exc:
            logger.error("Ошибка синхронизации кэша KudaGo: %s", exc)
        await asyncio.sleep(CACHE_SYNC_INTERVAL)


async def _reminder_loop():
    """Фоновая задача: каждые 15 минут проверяет события и рассылает email-напоминания."""
    import time
    from email_helpers import send_event_reminder_email, _hours_label
    from models.party import EventParty, PartyMember
    from models.user import User
    from notification_helpers import create_notification
    from services.notification_dedup import has_party_notification

    # Окно ±7 минут вокруг порогового момента (24 ч или 1 ч до события)
    WINDOW = 420  # секунд

    while True:
        await asyncio.sleep(REMINDER_LOOP_INTERVAL)
        try:
            now_ts = int(time.time())
            thresholds = [
                (24 * 3600, "email_reminder_24h"),
                (1 * 3600, "email_reminder_1h"),
            ]
            db = SessionLocal()
            try:
                for delta_secs, notif_type in thresholds:
                    target_low = now_ts + delta_secs - WINDOW
                    target_high = now_ts + delta_secs + WINDOW

                    parties = (
                    db.query(EventParty)
                        .filter(
                            EventParty.event_date_ts.isnot(None),
                            EventParty.event_date_ts >= target_low,
                            EventParty.event_date_ts <= target_high,
                        )
                        .limit(REMINDER_BATCH_SIZE)
                        .all()
                    )
                    if not parties:
                        continue

                    party_ids = [p.id for p in parties]
                    party_to_recipients: dict[int, set[int]] = {
                        p.id: {p.creator_id} for p in parties
                    }

                    accepted_rows = (
                        db.query(PartyMember.party_id, PartyMember.user_id)
                        .filter(
                            PartyMember.party_id.in_(party_ids),
                            PartyMember.status == "accepted",
                        )
                        .all()
                    )
                    for party_id, user_id in accepted_rows:
                        party_to_recipients.setdefault(party_id, set()).add(user_id)

                    all_recipient_ids = {
                        user_id
                        for recipient_ids in party_to_recipients.values()
                        for user_id in recipient_ids
                    }
                    user_by_id = {
                        user.id: user
                        for user in db.query(User).filter(User.id.in_(all_recipient_ids)).all()
                    } if all_recipient_ids else {}

                    email_jobs = []
                    event_loop = asyncio.get_event_loop()

                    for party in parties:
                        recipient_ids = party_to_recipients.get(party.id, {party.creator_id})
                        recipient_list = sorted(recipient_ids)
                        member_usernames = [
                            user_by_id[uid].username
                            for uid in recipient_list
                            if uid in user_by_id
                        ]
                        event_date = datetime.utcfromtimestamp(party.event_date_ts)
                        hours_before = delta_secs // 3600

                        for uid in recipient_ids:
                            if has_party_notification(
                                db,
                                user_id=uid,
                                notif_type=notif_type,
                                party_id=party.id,
                            ):
                                continue
                            user = user_by_id.get(uid)
                            if not user:
                                continue
                            try:
                                create_notification(
                                    db,
                                    uid,
                                    notif_type,
                                    f"Событие «{party.event_title or party.title}» через {_hours_label(hours_before)}",
                                    f"Компания «{party.title}» встречается {event_date.strftime('%d.%m в %H:%M')}",
                                    {"party_id": party.id},
                                )
                                db.commit()
                            except Exception as exc:
                                logger.error("Ошибка создания/фиксации в цикле напоминаний: %s", exc)
                                db.rollback()
                                continue

                            if user.email_notifications:
                                email_jobs.append(
                                    event_loop.run_in_executor(
                                        None,
                                        lambda u=user, pt=party, ed=event_date, hb=hours_before: (
                                            send_event_reminder_email(
                                                to_email=u.email,
                                                username=u.username,
                                                event_title=pt.event_title or pt.title,
                                                event_date=ed,
                                                party_title=pt.title,
                                                party_id=pt.id,
                                                members=member_usernames,
                                                hours_before=hb,
                                            )
                                        ),
                                    )
                                )

                    if email_jobs:
                        for send_result in await asyncio.gather(*email_jobs, return_exceptions=True):
                            if isinstance(send_result, Exception):
                                logger.warning("Не удалось отправить email-напоминание: %s", send_result)
            except Exception as exc:
                logger.error("Внутренняя ошибка цикла напоминаний: %s", exc)
                db.rollback()
            finally:
                db.close()
        except Exception as exc:
            logger.error("Ошибка цикла напоминаний: %s", exc)


async def _post_event_loop():
    """Фоновая задача: каждые 15 минут отправляет напоминания после события (+2ч / +1д / +14д)."""
    import time
    from post_event_jobs import run_post_event_jobs

    while True:
        await asyncio.sleep(REMINDER_LOOP_INTERVAL)
        try:
            db = SessionLocal()
            try:
                counts = await asyncio.get_event_loop().run_in_executor(
                    None, run_post_event_jobs, db, int(time.time())
                )
                if any(counts.values()):
                    logger.info("post_event_jobs отправлено: %s", counts)
            finally:
                db.close()
        except Exception as exc:
            logger.error("Ошибка цикла post-event: %s", exc)


async def _invite_expiry_loop():
    """Фоновая задача: каждые 15 минут помечает приглашения declined за 24h до события."""
    from routers.parties import expire_pending_invites

    while True:
        await asyncio.sleep(REMINDER_LOOP_INTERVAL)
        try:
            db = SessionLocal()
            try:
                expired_ids = expire_pending_invites(db)
                if expired_ids:
                    db.commit()
                    logger.info("Истёкло %d приглашений к компании рядом с началом события", len(expired_ids))
                    for mid in expired_ids:
                        m = db.query(PartyMember).filter(PartyMember.id == mid).first()
                        if not m or m.invited_by_user_id is None:
                            continue
                        try:
                            await sio.emit(
                                "party_invite_expired",
                                {"invite_id": mid, "party_id": m.party_id},
                                room=f"user_{m.invited_by_user_id}",
                            )
                        except Exception:
                            pass
            except Exception as exc:
                logger.error("Внутренняя ошибка цикла истечения приглашений: %s", exc)
                db.rollback()
            finally:
                db.close()
        except Exception as exc:
            logger.error("Ошибка цикла истечения приглашений: %s", exc)


async def _db_cleanup_loop():
    """Периодически чистит таблицы, которые растут неограниченно.

    - revoked_tokens: удаляем записи с exp < NOW() (JWT уже истёк — blacklist-check не нужен).

    Интервал: раз в час. Пропуск одного запуска допустим.
    """
    import logging as _lg
    logger = _lg.getLogger(__name__)
    from models.token_revocation import RevokedToken
    from datetime import datetime, timezone

    from sqlalchemy import delete as sa_delete
    while True:
        try:
            await asyncio.sleep(3600)
            db = SessionLocal()
            try:
                now = datetime.now(timezone.utc)
                try:
                    r1 = db.execute(sa_delete(RevokedToken).where(RevokedToken.exp < now))
                    db.commit()
                    logger.info("db_cleanup: revoked=%s", r1.rowcount)
                except Exception as exc:
                    logger.warning("Внутренняя ошибка db_cleanup: %s", exc)
                    db.rollback()
            finally:
                db.close()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("Ошибка цикла db_cleanup: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Управляет жизненным циклом приложения: запускает фоновые задачи."""
    import os as _os_lifespan

    schema_check_mode = get_current_schema_check_mode()
    logger.info("Режим проверки схемы: %s", schema_check_mode)
    ensure_db_schema_compatibility(mode=schema_check_mode)

    if _os_lifespan.environ.get("SKIP_BACKGROUND_LOOPS") == "1":
        yield
        return
    loop = asyncio.get_event_loop()
    if not kudago_cache.location_has_cache_direct("kzn"):
        logger.info("[KudaGo] Кэш пуст — синхронизация kzn при запуске...")
        try:
            n = await loop.run_in_executor(None, lambda: kudago_cache.sync_location("kzn", pages=3))
            logger.info(f"[KudaGo] Синхронизация kzn завершена: {n} событий")
        except Exception as exc:
            logger.error(f"[KudaGo] Синхронизация kzn не удалась: {exc}")
    else:
        logger.info("[KudaGo] Кэш kzn уже заполнен, пропускаем синхронизацию при запуске")
    cache_task = asyncio.create_task(_cache_sync_loop())
    reminder_task = asyncio.create_task(_reminder_loop())
    invite_expiry_task = asyncio.create_task(_invite_expiry_loop())
    post_event_task = asyncio.create_task(_post_event_loop())
    db_cleanup_task = asyncio.create_task(_db_cleanup_loop())
    yield
    cache_task.cancel()
    reminder_task.cancel()
    invite_expiry_task.cancel()
    post_event_task.cancel()
    db_cleanup_task.cancel()


app = FastAPI(title="GatherVibe API", lifespan=lifespan)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

_os.makedirs("uploads/chat", exist_ok=True)
_os.makedirs("uploads/avatars", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="/app/uploads"), name="uploads")

DEFAULT_MAX_REQUEST_SIZE_BYTES = 10 * 1024 * 1024  # Максимальный размер запроса (10 МБ)
app.state.max_request_size_bytes = int(
    _os.environ.get("MAX_REQUEST_SIZE_BYTES", DEFAULT_MAX_REQUEST_SIZE_BYTES)
)


@app.middleware("http")
async def request_size_limit_middleware(request, call_next):
    """Ограничивает размер входящего HTTP-запроса."""
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > app.state.max_request_size_bytes:
                from fastapi.responses import JSONResponse

                return JSONResponse(
                    status_code=413,
                    content={"detail": "Размер запроса превышает допустимый лимит"},
                )
        except ValueError:
            pass
    return await call_next(request)


_CSP_HEADER_VALUE = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https:; "
    "font-src 'self'; "
    "connect-src 'self'; "
    "frame-ancestors 'none';"
)


@app.middleware("http")
async def csp_middleware(request, call_next):
    """Добавляет Content-Security-Policy заголовок ко всем ответам."""
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = _CSP_HEADER_VALUE
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:53669",
        "http://127.0.0.1:49907"
    ],
    allow_origin_regex=r"^http://(127\.0\.0\.1|localhost):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from routers import auth, users, events, parties, reviews, notifications, party_coordination, avatars  # noqa: E402
from routers.party_plan import router as party_plan_router  # noqa: E402
from routers.party_recap import router as party_recap_router  # noqa: E402
from routers.admin import router as admin_router  # noqa: E402
from routers.reports import router as reports_router  # noqa: E402
from routers.appeals import router as appeals_router  # noqa: E402

app.include_router(auth.router)
app.include_router(admin_router)
app.include_router(reports_router)
app.include_router(appeals_router)
app.include_router(parties.router)
app.include_router(party_coordination.router)
app.include_router(party_plan_router)
app.include_router(party_recap_router)
app.include_router(reviews.router)
app.include_router(users.router)
app.include_router(avatars.router)
app.include_router(events.router)
app.include_router(notifications.router)


@app.get("/")
def read_root():
    """Корневой эндпоинт для проверки работы API."""
    return {"message": "GatherVibe API работает!"}


@app.get("/health")
def health_check():
    """Эндпоинт для проверки здоровья сервиса."""
    return {"status": "ok", "service": "gathervibe-backend"}


PARTY_MESSAGE_ALLOWED_HTTPS_HOSTS = {
    host.strip().lower()
    for host in _os.environ.get(
        "PARTY_MESSAGE_ALLOWED_HTTPS_HOSTS",
        "localhost,127.0.0.1",
    ).split(",")
    if host.strip()
}


def is_allowed_party_file_url(file_url: str) -> bool:
    """Проверяет, является ли URL файла допустимым для сообщений компании."""
    if file_url.startswith("/uploads/"):
        return True
    parsed = _urlparse(file_url)
    if parsed.scheme != "https":
        return False
    host = (parsed.hostname or "").lower()
    return host in PARTY_MESSAGE_ALLOWED_HTTPS_HOSTS and parsed.path.startswith("/uploads/")


def _extract_token_from_environ(environ: dict) -> str | None:
    """Читаем JWT из cookie (HttpOnly или non-HttpOnly) в handshake headers.

    Позволяет фронту не передавать токен в socket.emit явно — достаточно того,
    что браузер сам отправил cookie при установке WS-соединения.
    Делаем unquote: если кто-то percent-encodit токен (напр. `eyJ...%3D`),
    без декодирования JWT потом не провалидируется.
    """
    from urllib.parse import unquote as _unquote
    cookie_header = environ.get("HTTP_COOKIE", "") or ""
    for chunk in cookie_header.split(";"):
        chunk = chunk.strip()
        if chunk.startswith("token="):
            return _unquote(chunk[len("token="):])
    return None


@sio.event
async def connect(sid, environ):
    """Обработка подключения клиента к Socket.IO с аутентификацией по cookie."""
    # Пытаемся аутентифицировать по cookie ещё на handshake и сохранить user_id
    # в сессии sio. Если токена нет / невалиден — соединение остаётся анонимным
    # (события типа join_event_chat потом отклонят такие sid).
    token = _extract_token_from_environ(environ)
    if token:
        db = SessionLocal()
        try:
            user = get_user_from_socket_token(token, db)
            await sio.save_session(sid, {"user_id": user.id, "username": user.username})
        except Exception as exc:
            logger.warning("Socket auth failed for sid %s: %s", sid, exc)
        finally:
            db.close()
    logger.info(f"Client {sid} connected")


async def _get_session_user(sid, db):
    """Возвращает User из sio-сессии (установленной в connect), либо None."""
    try:
        sess = await sio.get_session(sid)
    except Exception:
        return None
    uid = (sess or {}).get("user_id")
    if not uid:
        return None
    return db.query(User).filter(User.id == uid).first()


async def _authenticate_sid(sid, data, db):
    """Возвращает User для sid. Сначала пытается session (из cookie handshake),
    затем падает на data.get('token') ради обратной совместимости с фронтом,
    который ещё шлёт токен в emit. Raises ValueError если не удалось."""
    user = await _get_session_user(sid, db)
    if user is not None:
        return user
    token = (data or {}).get('token') if isinstance(data, dict) else None
    if not token:
        raise ValueError("Требуется авторизация")
    return get_user_from_socket_token(token, db)


@sio.event
async def disconnect(sid):
    """Обработка отключения клиента от Socket.IO."""
    logger.info(f"Client {sid} disconnected")
    chat_push.mark_disconnect(sid)


@sio.on('join_event_chat')
async def join_event_chat(sid, data):
    """Пользователь присоединяется к чату события."""
    data = _normalize_socket_data(data)
    db = SessionLocal()
    try:
        user = await _authenticate_sid(sid, data, db)
    except (ValueError, Exception) as e:
        logger.warning(f"join_event_chat: auth failed, sid={sid}, error={e}")
        await sio.emit('error', {'message': 'Требуется авторизация'}, room=sid)
        db.close()
        return
    event_id = data.get('eventId')
    if not event_id:
        db.close()
        return
    if not _check_event_attendance(db, event_id, user.id):
        logger.warning(f"join_event_chat: user {user.id} не подписан на event {event_id}, sid={sid}")
        await sio.emit('error', {'message': 'Нужно быть участником события'}, room=sid)
        db.close()
        return
    await sio.enter_room(sid, f'event_{event_id}')
    await sio.emit('user_joined', {'sid': sid, 'userId': user.id, 'username': user.username}, room=f'event_{event_id}')
    db.close()


def _socket_sanction_block(user) -> str | None:
    """Возвращает сообщение об ошибке если user забанен/замьючен, иначе None."""
    from deps import _is_user_banned
    if _is_user_banned(user):
        return "Вы заблокированы"
    muted_until = getattr(user, "muted_until", None)
    if muted_until is not None:
        now = datetime.now(timezone.utc)
        if muted_until.tzinfo is None:
            muted_until = muted_until.replace(tzinfo=timezone.utc)
        if muted_until > now:
            return "Вы временно не можете отправлять сообщения"
    return None


def _check_party_access(db, party: EventParty, user_id: int) -> bool:
    """Проверяет, имеет ли пользователь доступ к чату компании."""
    if party.creator_id == user_id:
        return True
    return db.query(PartyMember).filter(
        PartyMember.party_id == party.id,
        PartyMember.user_id == user_id,
        PartyMember.status == MemberStatus.accepted,
    ).first() is not None


def _check_event_attendance(db, event_id: str | int, user_id: int) -> bool:
    """Проверяет, имеет ли пользователь доступ к чату события."""
    from models.attendee import EventAttendee
    from models.event import Event

    event_id_str = str(event_id)
    try:
        local_id = int(event_id_str)
        is_local = db.query(Event).filter(Event.id == local_id).first() is not None
    except (ValueError, TypeError):
        is_local = False

    if is_local:
        return db.query(EventAttendee).filter(
            EventAttendee.event_id == event_id_str,
            EventAttendee.user_id == user_id,
        ).first() is not None
    return True  # События KudaGo публичные


def _normalize_socket_data(data: any) -> dict:
    """Нормализует данные из Socket.IO в dict."""
    if data is None or not isinstance(data, dict):
        return {}
    return data


@contextmanager
def get_db_session():
    """Context manager для управления сессией БД."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@sio.on('send_message')
async def send_message(sid, data: dict):
    """Отправляет сообщение в чат события."""
    data = _normalize_socket_data(data)
    db = SessionLocal()
    try:
        user = await _authenticate_sid(sid, data, db)
    except (ValueError, Exception) as e:
        await sio.emit('error', {'message': str(e)}, room=sid)
        db.close()
        return
    block = _socket_sanction_block(user)
    if block:
        await sio.emit('error', {'message': block}, room=sid)
        db.close()
        return
    event_id = data.get('eventId')
    message_text = data.get('message', '').strip()
    if not event_id or not message_text:
        db.close()
        await sio.emit('error', {'message': 'eventId и message обязательны'}, room=sid)
        return
    if not _check_event_attendance(db, event_id, user.id):
        db.close()
        await sio.emit('error', {'message': 'Нужно быть участником события'}, room=sid)
        return
    if len(message_text) > 2000:
        db.close()
        await sio.emit('error', {'message': 'Сообщение слишком длинное (макс. 2000 символов)'}, room=sid)
        return
    try:
        from services.moderation_filter import filter_text
        message_text, _ = filter_text(db, message_text)
    except Exception:
        pass
    msg = {
        'message':   message_text,
        'userId':    str(user.id),
        'username':  user.username,
        'avatarUrl': user.avatar_url,
        'timestamp': datetime.now(timezone.utc).isoformat()
    }
    try:
        db.add(ChatMessage(
            room=f'event_{event_id}',
            user_id=str(user.id),
            username=user.username,
            message=message_text,
            timestamp=datetime.now(timezone.utc),
        ))
        db.commit()
    finally:
        db.close()
    await sio.emit('receive_message', msg, room=f'event_{event_id}')


@sio.on('leave_event_chat')
async def leave_event_chat(sid, event_id: str):
    """Пользователь покидает чат события."""
    await sio.leave_room(sid, f'event_{event_id}')


@sio.on('join_party_chat')
async def join_party_chat(sid, data: dict):
    """Пользователь присоединяется к чату компании."""
    data = _normalize_socket_data(data)
    db = SessionLocal()
    try:
        user = await _authenticate_sid(sid, data, db)
    except (ValueError, Exception) as e:
        await sio.emit('error', {'message': str(e)}, room=sid)
        db.close()
        return
    party_id = data.get('partyId')
    if not party_id:
        await sio.emit('error', {'message': 'partyId отсутствует'}, room=sid)
        db.close()
        return
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if party is None:
        await sio.emit('error', {'message': 'Пати не найдена'}, room=sid)
        db.close()
        return
    if not _check_party_access(db, party, user.id):
        await sio.emit('error', {'message': 'Нет доступа к этому чату'}, room=sid)
        db.close()
        return
    db.close()
    await sio.enter_room(sid, f'party_{party_id}')
    chat_push.mark_join_party(sid, user.id, party_id)
    await sio.emit(
        'party_user_joined',
        {'sid': sid, 'userId': user.id, 'username': user.username},
        room=f'party_{party_id}'
    )


ALLOWED_PARTY_MESSAGE_FILE_TYPES = {
    "image",
    "pdf",
    "file",
    # Legacy/client-compatible values accepted by older socket payloads.
    "document",
    "video",
    "audio",
}


def _is_allowed_party_file_type(file_type: str) -> bool:
    """Проверяет, разрешён ли тип файла для сообщений компании."""
    return file_type in ALLOWED_PARTY_MESSAGE_FILE_TYPES


@sio.on('send_party_message')
async def send_party_message(sid, data: dict):
    """Отправляет сообщение в чат компании."""
    data = _normalize_socket_data(data)
    db = SessionLocal()
    try:
        user = await _authenticate_sid(sid, data, db)
    except (ValueError, Exception) as e:
        logger.warning("send_party_message: auth failed sid=%s err=%s", sid, e)
        await sio.emit('error', {'message': str(e)}, room=sid)
        db.close()
        return
    block = _socket_sanction_block(user)
    if block:
        await sio.emit('error', {'message': block}, room=sid)
        db.close()
        return
    party_id = data.get('partyId')
    message_text = data.get('message', '').strip()
    file_url = data.get('file_url')
    file_type = data.get('file_type')
    file_name = data.get('file_name')
    if not party_id or (not message_text and not file_url):
        await sio.emit('error', {'message': 'partyId и message (или file_url) обязательны'}, room=sid)
        db.close()
        return
    # Валидация file_url: принимаем только локальные /uploads/* и https://<allowed-host>/uploads/*.
    if file_url:
        if not isinstance(file_url, str) or len(file_url) > 500:
            await sio.emit('error', {'message': 'Некорректный file_url'}, room=sid)
            db.close()
            return
        if not is_allowed_party_file_url(file_url):
            await sio.emit('error', {'message': 'file_url должен быть /uploads/... или https://<allowed-host>/uploads/...'}, room=sid)
            db.close()
            return
    if file_type and (not isinstance(file_type, str) or not _is_allowed_party_file_type(file_type)):
        await sio.emit('error', {'message': 'Некорректный file_type'}, room=sid)
        db.close()
        return
    if file_name and (not isinstance(file_name, str) or len(file_name) > 255):
        await sio.emit('error', {'message': 'Некорректный file_name'}, room=sid)
        db.close()
        return
    if message_text and len(message_text) > 2000:
        await sio.emit('error', {'message': 'Сообщение слишком длинное (макс. 2000 символов)'}, room=sid)
        db.close()
        return
    if message_text:
        try:
            from services.moderation_filter import filter_text
            message_text, _ = filter_text(db, message_text)
        except Exception:
            pass

    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party or not _check_party_access(db, party, user.id):
        await sio.emit('error', {'message': 'Нет доступа к этому чату'}, room=sid)
        db.close()
        return

    try:
        chat_msg = ChatMessage(
            room=f'party_{party_id}',
            user_id=str(user.id),
            username=user.username,
            message=message_text,
            timestamp=datetime.now(timezone.utc),
            file_url=file_url,
            file_type=file_type,
            file_name=file_name,
        )
        db.add(chat_msg)
        db.commit()
        db.refresh(chat_msg)
        msg_id = chat_msg.id
        user_id_str  = str(user.id)
        user_username = user.username
        user_avatar   = user.avatar_url
    finally:
        db.close()
    msg = {
        'messageId': msg_id,
        'message':   message_text,
        'userId':    user_id_str,
        'username':  user_username,
        'avatarUrl': user_avatar,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'partyId':   party_id,
        'fileUrl':   file_url,
        'fileType':  file_type,
        'fileName':  file_name,
        'reactions': {},
    }
    await sio.emit('receive_party_message', msg, room=f'party_{party_id}')

    try:
        push_db = SessionLocal()
        try:
            party_for_push = push_db.query(EventParty).filter(
                EventParty.id == party_id
            ).first()
            if party_for_push is not None:
                await chat_push.notify_chat_message(
                    push_db, party_for_push,
                    sender_id=user.id,
                    sender_username=user.username,
                    message_text=message_text,
                )
        finally:
            push_db.close()
    except Exception as exc:
        logger.warning("chat_push.notify_chat_message failed: %s", exc)


@sio.on('leave_party_chat')
async def leave_party_chat(sid, data: dict):
    """Пользователь покидает чат компании."""
    party_id = (data or {}).get('partyId')
    if not party_id:
        return
    await sio.leave_room(sid, f'party_{party_id}')
    chat_push.mark_leave_party(sid, party_id)


ALLOWED_REACTION_EMOJIS = {'👍', '❤️', '😂'}


@sio.on('add_party_reaction')
async def add_party_reaction(sid, data: dict):
    """Добавляет или удаляет реакцию на сообщение в чате компании."""
    data = _normalize_socket_data(data)
    party_id = data.get('party_id')
    message_id = data.get('message_id')
    emoji = data.get('emoji')
    if not party_id or not message_id or not emoji:
        await sio.emit('error', {'message': 'party_id, message_id и emoji обязательны'}, room=sid)
        return
    if emoji not in ALLOWED_REACTION_EMOJIS:
        await sio.emit('error', {'message': f'Недопустимый эмодзи. Разрешены: {", ".join(ALLOWED_REACTION_EMOJIS)}'}, room=sid)
        return

    db = SessionLocal()
    try:
        try:
            user = await _authenticate_sid(sid, data, db)
        except (ValueError, Exception) as e:
            await sio.emit('error', {'message': str(e)}, room=sid)
            return

        party = db.query(EventParty).filter(EventParty.id == party_id).first()
        if not party or not _check_party_access(db, party, user.id):
            await sio.emit('error', {'message': 'Нет доступа к этому чату'}, room=sid)
            return

        existing = db.query(MessageReaction).filter(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == str(user.id),
            MessageReaction.emoji == emoji,
        ).first()
        if existing:
            db.delete(existing)
        else:
            db.add(MessageReaction(
                message_id=message_id,
                room=f'party_{party_id}',
                user_id=str(user.id),
                emoji=emoji,
            ))
        db.commit()

        reaction_rows = (
            db.query(MessageReaction)
            .filter(MessageReaction.message_id == message_id)
            .all()
        )
        reactions: dict = {}
        for rr in reaction_rows:
            reactions.setdefault(rr.emoji, []).append(rr.user_id)
    finally:
        db.close()

    await sio.emit(
        'party_reaction_updated',
        {
            'messageId': message_id,
            'partyId':   party_id,
            'reactions': reactions,
        },
        room=f'party_{party_id}',
    )



@sio.on('subscribe_notifications')
async def subscribe_notifications(sid, data: dict):
    """Подписывает пользователя на личные уведомления."""
    if data is not None and not isinstance(data, dict):
        data = {}
    db = SessionLocal()
    try:
        try:
            user = await _authenticate_sid(sid, data or {}, db)
        except (ValueError, Exception) as e:
            await sio.emit('error', {'message': str(e)}, room=sid)
            return
    finally:
        db.close()
    await sio.enter_room(sid, f'user_{user.id}')
    logger.info(f"[notifications] {sid} подписан на user_{user.id}")


socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
