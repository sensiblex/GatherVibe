from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func, select as sa_select, update as sa_update
from typing import Optional, List
from datetime import datetime
import httpx
import time
import os
import uuid
import pathlib

from pydantic import BaseModel
from deps import get_db, get_current_user_from_token, oauth2_scheme, require_admin
from schemas import EventCreate, EventResponse, EventUpdate
from models.event import Event
from models.attendee import EventAttendee
from models.chat_message import ChatMessage
from models.message_reaction import MessageReaction
from models.user import User
from models.party import EventParty, PartyMember
from models.kudago_event import KudaGoEvent
import kudago_api
import kudago_api_async
import kudago_cache

router = APIRouter(tags=["events"])




class AttendeeCreateBody(BaseModel):
    comment: Optional[str] = None
    is_looking: bool = True
    event_title:     Optional[str] = None
    event_date_ts:   Optional[int] = None
    event_city:      Optional[str] = None
    event_image_url: Optional[str] = None
    event_category:  Optional[str] = None
    event_location:  Optional[str] = None


class AttendeeOut(BaseModel):
    id: int
    user_id: int
    username: str
    city: Optional[str]
    interests: Optional[str]
    comment: Optional[str]
    is_looking: bool
    created_at: datetime
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class AttendeeMatchOut(AttendeeOut):
    common_count: int = 0




@router.get("/messages/{room}")
def get_messages(
    room: str,
    limit: int = Query(default=50, le=200),
    before_id: Optional[int] = Query(default=None),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    if room.startswith("event_"):
        event_id = room.split("_", 1)[1]
        is_attendee = db.query(EventAttendee).filter(
            EventAttendee.event_id == event_id,
            EventAttendee.user_id == current_user.id,
        ).first()
        if not is_attendee:
            raise HTTPException(status_code=403, detail="Нет доступа к чату этого события")
    if room.startswith("party_"):
        try:
            room_party_id = int(room.split("_", 1)[1])
            member = db.query(PartyMember).filter(
                PartyMember.party_id == room_party_id,
                PartyMember.user_id == current_user.id,
                PartyMember.status == "accepted",
            ).first()
            party_obj = db.query(EventParty).filter(EventParty.id == room_party_id).first()
            is_creator = party_obj and party_obj.creator_id == current_user.id
            if not member and not is_creator:
                raise HTTPException(status_code=403, detail="Нет доступа к чату этой компании")
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="Некорректный room")
    query = db.query(ChatMessage).filter(ChatMessage.room == room)
    if before_id is not None:
        query = query.filter(ChatMessage.id < before_id)
    rows = query.order_by(ChatMessage.id.desc()).limit(limit).all()
    rows = list(reversed(rows))
    user_ids = [r.user_id for r in rows if r.user_id]
    users_map = {}
    if user_ids:
        users_map = {
            str(u.id): u.avatar_url
            for u in db.query(User).filter(User.id.in_(user_ids)).all()
        }
    message_ids = [r.id for r in rows]
    reactions_map: dict = {}
    if message_ids:
        reaction_rows = (
            db.query(MessageReaction)
            .filter(MessageReaction.message_id.in_(message_ids))
            .all()
        )
        for rr in reaction_rows:
            msg_reactions = reactions_map.setdefault(rr.message_id, {})
            msg_reactions.setdefault(rr.emoji, []).append(rr.user_id)
    return {
        "messages": [
            {
                "id":         r.id,
                "message":    r.message,
                "userId":     r.user_id,
                "username":   r.username,
                "timestamp":  r.timestamp.isoformat(),
                "avatarUrl":  users_map.get(r.user_id),
                "isSystem":   r.is_system,
                "eventType":  r.event_type,
                "fileUrl":    r.file_url,
                "fileType":   r.file_type,
                "fileName":   r.file_name,
                "reactions":  reactions_map.get(r.id, {}),
            }
            for r in rows
        ],
        "has_more":  len(rows) == limit,
        "oldest_id": rows[0].id if rows else None,
    }


ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/zip",
}
MAX_UPLOAD_SIZE = 10 * 1024 * 1024


def _has_supported_image_signature(payload: bytes) -> bool:
    if payload.startswith(b"\x89PNG\r\n\x1a\n"):
        return True
    if payload.startswith(b"\xff\xd8\xff"):
        return True
    if payload.startswith((b"GIF87a", b"GIF89a")):
        return True
    if payload.startswith(b"RIFF") and payload[8:12] == b"WEBP":
        return True
    return False


@router.post("/upload/chat")
async def upload_chat_file(
    file: UploadFile = File(...),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    get_current_user_from_token(token, db)
    from services.feature_flags import is_flag_enabled
    if not is_flag_enabled(db, "file_upload_enabled"):
        raise HTTPException(status_code=403, detail="Загрузка файлов временно отключена")

    ext = pathlib.Path(file.filename or "").suffix.lower()
    FORBIDDEN_EXTENSIONS = {'.html', '.htm', '.svg', '.js', '.php', '.xml', '.xhtml'}
    if ext in FORBIDDEN_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Тип файла не разрешён")

    content_type = file.content_type or ""
    if content_type not in ALLOWED_MIME_TYPES and not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail=f"Недопустимый тип файла: {content_type}")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="Файл превышает допустимый размер (макс. 10 MB)")
    if content_type.startswith("image/") and not _has_supported_image_signature(contents):
        raise HTTPException(status_code=400, detail="Содержимое файла не соответствует image MIME")

    if content_type.startswith("image/"):
        file_type = "image"
    elif content_type == "application/pdf":
        file_type = "pdf"
    else:
        file_type = "file"

    bare_name = pathlib.Path(file.filename or "upload").name or "upload"
    safe_name = "".join(c if c.isalnum() or c in "._-" else "_" for c in bare_name)
    safe_name = safe_name[:128] or "upload"
    unique_name = f"{uuid.uuid4()}_{safe_name}"

    upload_dir = os.path.join("uploads", "chat")
    os.makedirs(upload_dir, exist_ok=True)
    save_path = os.path.join(upload_dir, unique_name)

    with open(save_path, "wb") as f:
        f.write(contents)

    return {
        "file_url":  f"/uploads/chat/{unique_name}",
        "file_type": file_type,
        "file_name": bare_name,
    }




@router.get("/events/categories")
def get_categories(db: Session = Depends(get_db)):
    categories = db.query(Event.category).distinct().all()
    return {"categories": [cat[0] for cat in categories if cat[0]]}


@router.get("/events/cities")
def get_cities(db: Session = Depends(get_db)):
    cities = db.query(Event.city).distinct().all()
    return {"cities": [city[0] for city in cities if city[0]]}


@router.get("/events", response_model=List[EventResponse])
def get_events(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=200),
    city: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[datetime] = Query(default=None),
    date_to: Optional[datetime] = Query(default=None),
    is_free: Optional[bool] = Query(default=None),
    max_price: Optional[float] = Query(default=None, ge=0),
    has_spots: Optional[bool] = Query(default=None),
    sort_by: Optional[str] = Query(default="date", pattern="^(date|price|participants)$"),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    query = db.query(Event).filter(Event.is_active == True, Event.date_time >= now)

    if city:
        query = query.filter(Event.city.ilike(f"%{city}%"))
    if category:
        query = query.filter(Event.category == category)
    if search:
        query = query.filter(
            (Event.title.ilike(f"%{search}%")) |
            (Event.description.ilike(f"%{search}%")) |
            (Event.location.ilike(f"%{search}%"))
        )
    if date_from:
        query = query.filter(Event.date_time >= date_from)
    if date_to:
        query = query.filter(Event.date_time <= date_to)

    if is_free is True:
        query = query.filter(
            (Event.price == None) | (Event.price == 0)  # noqa: E711
        )
    elif is_free is False:
        query = query.filter(Event.price > 0)
    if max_price is not None:
        query = query.filter(
            (Event.price == None) | (Event.price <= max_price)  # noqa: E711
        )

    if has_spots is True:
        query = query.filter(
            (Event.max_participants == None) |  # noqa: E711
            (Event.current_participants < Event.max_participants)
        )

    if sort_by == "price":
        query = query.order_by(Event.price.asc().nullsfirst())
    elif sort_by == "participants":
        query = query.order_by(Event.current_participants.desc())
    else:
        query = query.order_by(Event.date_time.asc())

    return query.offset(skip).limit(limit).all()


@router.get("/events/{event_id}")
async def get_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id, Event.is_active == True).first()
    if event is not None:
        return EventResponse.model_validate(event)

    cached = db.query(KudaGoEvent).filter(KudaGoEvent.kudago_id == event_id).first()
    if cached is not None:
        return kudago_cache._row_to_response(cached)

    try:
        raw = await kudago_api_async.get_event_by_id(event_id)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Событие не найдено")
        raise HTTPException(status_code=502, detail=f"Ошибка KudaGo API: {str(exc)}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка KudaGo API: {str(e)}")
    return kudago_api.parse_event_detail(raw)


@router.post("/events", response_model=EventResponse)
def create_event(
    event: EventCreate,
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme),
):
    user = get_current_user_from_token(token, db)
    db_event = Event(**event.dict(), created_by=user.id, current_participants=0)
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event


@router.patch("/events/{event_id}", response_model=EventResponse)
def update_event(
    event_id: int,
    data: EventUpdate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    event = db.query(Event).filter(Event.id == event_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    if event.created_by != user.id:
        raise HTTPException(status_code=403, detail="Только создатель может редактировать событие")

    if data.date_time is not None:
        if data.date_time < datetime.utcnow():
            raise HTTPException(status_code=400, detail="Дата не может быть в прошлом")
        event.date_time = data.date_time
    if data.title is not None:
        event.title = data.title
    if data.description is not None:
        event.description = data.description
    if data.location is not None:
        event.location = data.location
    if data.address is not None:
        event.address = data.address
    if data.city is not None:
        event.city = data.city
    if data.category is not None:
        event.category = data.category
    if data.price is not None:
        event.price = data.price
    if data.max_participants is not None:
        event.max_participants = data.max_participants
    if data.image_url is not None:
        event.image_url = data.image_url
    if data.external_link is not None:
        event.external_link = data.external_link
    if data.is_active is not None:
        event.is_active = data.is_active

    db.commit()
    db.refresh(event)
    return event




@router.get("/kudago/events")
def kudago_get_events(
    location: str = Query(default="msk"),
    categories: Optional[str] = Query(default=None),
    is_free: Optional[bool] = Query(default=None),
    search: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    actual_since: Optional[int] = Query(default=None),
    actual_until: Optional[int] = Query(default=None),
    max_age: Optional[int] = Query(default=None, ge=0, le=21),
    tags: Optional[str] = Query(default=None),
    place_search: Optional[str] = Query(default=None),
    lat: Optional[float] = Query(default=None, ge=-90, le=90),
    lon: Optional[float] = Query(default=None, ge=-180, le=180),
    radius_m: Optional[int] = Query(default=None, ge=100, le=50000),
    order_by: Optional[str] = Query(default=None, pattern="^(date|popularity|newest|ending_soon|most_discussed|alphabetical|nearest)$"),
    from_hour: Optional[int] = Query(default=None, ge=0, le=24),
    to_hour: Optional[int] = Query(default=None, ge=0, le=24),
    weekdays: Optional[str] = Query(default=None),
    hide_started: Optional[bool] = Query(default=None),
    min_price: Optional[float] = Query(default=None, ge=0),
    max_price: Optional[float] = Query(default=None, ge=0),
    has_party: Optional[bool] = Query(default=None),
    min_attendees: Optional[int] = Query(default=None, ge=0, le=10000),
    has_free_spots: Optional[bool] = Query(default=None),
    time_of_day: Optional[str] = Query(default=None, pattern="^(morning|day|evening|night)$"),
    only_permanent: Optional[bool] = Query(default=None),
    exclude_permanent: Optional[bool] = Query(default=None),
    has_cover: Optional[bool] = Query(default=None),
    starting_within_hours: Optional[int] = Query(default=None, ge=1, le=24),
    is_short: Optional[bool] = Query(default=None),
    is_long: Optional[bool] = Query(default=None),
    has_schedules: Optional[bool] = Query(default=None),
    only_verified_place: Optional[bool] = Query(default=None),
    db: Session = Depends(get_db),
):
    """Возвращает события из локального кэша. Фоллбэк на KudaGo API только для browsing без поиска."""
    # Защита от неизвестных локаций: KudaGo поддерживает только 5 городов в API,
    # а наш кэш — 3. Для остальных возвращаем пустой результат, а не 502.
    VALID_LOCATIONS = {"msk", "spb", "ekb", "kzn", "nnv"}
    if location not in VALID_LOCATIONS:
        return {
            "count": 0, "next": None, "previous": None,
            "page": page, "page_size": page_size,
            "results": [], "from_cache": False,
        }
    cache_has_location = kudago_cache.location_has_cache(db, location)
    search_trimmed = search.strip() if search else ""
    # Разрешаем API-фоллбэк, если кэш локации есть, но plain-browsing выдача пуста.
    # Это защищает от stale/полупустого кэша для конкретного города.
    plain_browsing = not any([
        categories,
        is_free is not None,
        bool(search_trimmed),
        actual_since is not None,
        actual_until is not None,
        max_age is not None,
        tags,
        bool(place_search and place_search.strip()),
        lat is not None,
        lon is not None,
        radius_m is not None,
        order_by is not None,
        from_hour is not None,
        to_hour is not None,
        bool(weekdays and str(weekdays).strip()),
        hide_started is True,
        min_price is not None,
        max_price is not None,
        has_party is not None,
        min_attendees is not None,
        has_free_spots is not None,
        time_of_day is not None,
        only_permanent is not None,
        exclude_permanent is not None,
        has_cover is not None,
        starting_within_hours is not None,
        is_short is not None,
        is_long is not None,
        has_schedules is not None,
        only_verified_place is not None,
    ])

    if cache_has_location:
        # Кэш есть — всегда читаем из него. Поиск точный, по title.
        try:
            cached = kudago_cache.query_cache(
                db=db,
                location=location,
                categories=categories,
                is_free=is_free,
                search=search,
                page=page,
                page_size=page_size,
                actual_since=actual_since,
                actual_until=actual_until,
                max_age=max_age,
                tags=tags,
                place_search=place_search,
                lat=lat,
                lon=lon,
                radius_m=radius_m,
                order_by=order_by,
                has_party=has_party,
                min_attendees=min_attendees,
                has_free_spots=has_free_spots,
                time_of_day=time_of_day,
                only_permanent=only_permanent,
                exclude_permanent=exclude_permanent,
                has_cover=has_cover,
                starting_within_hours=starting_within_hours,
                is_short=is_short,
                is_long=is_long,
                has_schedules=has_schedules,
                only_verified_place=only_verified_place,
                from_hour=from_hour,
                to_hour=to_hour,
                weekdays=weekdays,
                hide_started=hide_started,
                min_price=min_price,
                max_price=max_price,
            )
            if cached.get("count", 0) > 0 or not plain_browsing:
                return cached
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ошибка кэша: {str(e)}")
    else:
        # Cold cache for this location: try a lightweight on-demand warm-up first.
        # This is crucial for msk where direct large API calls often timeout.
        try:
            synced = kudago_cache.sync_location(location, pages=1)
            if synced > 0:
                warmed = kudago_cache.query_cache(
                    db=db,
                    location=location,
                    categories=categories,
                    is_free=is_free,
                    search=search,
                    page=page,
                    page_size=page_size,
                    actual_since=actual_since,
                    actual_until=actual_until,
                    max_age=max_age,
                    tags=tags,
                    place_search=place_search,
                    lat=lat,
                    lon=lon,
                    radius_m=radius_m,
                    order_by=order_by,
                    has_party=has_party,
                    min_attendees=min_attendees,
                    has_free_spots=has_free_spots,
                    time_of_day=time_of_day,
                    only_permanent=only_permanent,
                    exclude_permanent=exclude_permanent,
                    has_cover=has_cover,
                    starting_within_hours=starting_within_hours,
                    is_short=is_short,
                    is_long=is_long,
                    has_schedules=has_schedules,
                    only_verified_place=only_verified_place,
                    from_hour=from_hour,
                    to_hour=to_hour,
                    weekdays=weekdays,
                    hide_started=hide_started,
                    min_price=min_price,
                    max_price=max_price,
                )
                if warmed.get("count", 0) > 0:
                    return warmed
        except Exception:
            # Keep old fallback path below.
            pass

    # Кэш пустой — фоллбэк на KudaGo API. Но KudaGo не поддерживает
    # социальные/качественные/гео фильтры, поэтому если они заданы — возвращаем пусто,
    # иначе пользователь увидит данные, которые фильтр «не применил».
    cache_only_filter_active = any([
        has_party is True, has_free_spots is True,
        (min_attendees is not None and min_attendees > 0),
        bool(tags),
        bool(place_search and place_search.strip()),
        lat is not None and lon is not None and radius_m,
        time_of_day,
        only_permanent is True, exclude_permanent is True,
        has_cover is not None,
        (max_age is not None),
        order_by in ("popularity", "newest", "ending_soon", "most_discussed", "alphabetical", "nearest"),
        from_hour is not None or to_hour is not None,
        bool(weekdays and str(weekdays).strip()),
        hide_started is True,
        min_price is not None,
        max_price is not None,
        starting_within_hours is not None,
        is_short is True, is_long is True,
        has_schedules is True,
        only_verified_place is True,
    ])
    if cache_only_filter_active:
        return {
            "count": 0, "next": None, "previous": None,
            "page": page, "page_size": page_size,
            "results": [], "from_cache": False,
        }

    try:
        now_ts = int(time.time())
        effective_since = max(actual_since, now_ts) if actual_since else now_ts
        raw = kudago_api.get_events(
            location=location, categories=categories, is_free=is_free,
            page=page, page_size=min(page_size, 30),
            actual_since=effective_since, actual_until=actual_until,
        )
        events = kudago_api.parse_events(raw)

        # Если есть поиск — фильтруем по title на backend (KudaGo не умеет title-only search)
        if search:
            search_lower = search.lower()
            events = [e for e in events if search_lower in e.get("title", "").lower()]

        return {
            "count": len(events) if search else raw.get("count", len(events)),
            "next": None if search else raw.get("next"),
            "previous": None if search else raw.get("previous"),
            "page": page,
            "page_size": page_size,
            "results": events,
            "from_cache": False,
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка KudaGo API: {str(e)}")


@router.post("/kudago/sync", status_code=202)
def kudago_sync(
    background_tasks: BackgroundTasks,
    locations: Optional[str] = Query(default=None, description="Через запятую: msk,spb,kzn"),
    wait: bool = Query(default=False, description="Если true — ждать завершения и вернуть статистику"),
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Принудительная синхронизация кэша событий из KudaGo API.

    По умолчанию запускает задачу в фоне и возвращает 202. При wait=true
    выполняется синхронно и возвращает статистику — для ручных отладок.
    """
    loc_list = [l.strip() for l in locations.split(",")] if locations else kudago_cache.DEFAULT_LOCATIONS

    if wait:
        try:
            stats = kudago_cache.sync_all(loc_list)
            return {"status": "ok", "synced": stats}
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Ошибка синхронизации: {str(e)}")

    background_tasks.add_task(kudago_cache.sync_all, loc_list)
    return {"status": "accepted", "locations": loc_list}


@router.get("/kudago/debug")
def kudago_debug(
    location: str = Query(default="kzn"),
    search: str = Query(default="мир"),
    _admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    import time as _time
    from models.kudago_event import KudaGoEvent as KE
    from sqlalchemy import func as sf
    now_ts = int(_time.time())
    stats = db.query(KE.location, sf.count()).group_by(KE.location).all()
    search_lower = search.lower()

    # Все события с "мир" в title_lower (без фильтра дат)
    found_all = db.query(KE.kudago_id, KE.title, KE.is_permanent, KE.start_ts).filter(
        KE.location == location, KE.title_lower.like(f"%{search_lower}%")
    ).all()

    # После фильтра дат
    found_dated = db.query(KE.kudago_id, KE.title).filter(
        KE.location == location,
        KE.title_lower.like(f"%{search_lower}%"),
        (KE.is_permanent == True) | (KE.start_ts >= now_ts)  # noqa: E712
    ).all()

    query_cache_result = kudago_cache.query_cache(db=db, location=location, search=search, page=1, page_size=10)

    return {
        "cache_stats": {loc: cnt for loc, cnt in stats},
        "now_ts": now_ts,
        "found_before_date_filter": [
            {"id": r[0], "title": r[1], "is_permanent": r[2], "start_ts": r[3]}
            for r in found_all
        ],
        "found_after_date_filter": [r[1] for r in found_dated],
        "query_cache_count": query_cache_result["count"],
        "query_cache_titles": [e["title"] for e in query_cache_result["results"]],
    }


@router.get("/kudago/events/{event_id}")
async def kudago_get_event_detail(event_id: int, db: Session = Depends(get_db)):
    cached = db.query(KudaGoEvent).filter(KudaGoEvent.kudago_id == event_id).first()
    if cached is not None:
        return kudago_cache._row_to_response(cached)
    try:
        raw = await kudago_api_async.get_event_by_id(event_id)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Событие не найдено в KudaGo")
        raise HTTPException(status_code=502, detail=f"Ошибка KudaGo API: {str(exc)}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка KudaGo API: {str(e)}")
    return kudago_api.parse_event_detail(raw)


@router.get("/kudago/today")
def kudago_events_today(location: str = Query(default="kzn")):
    try:
        return kudago_api.get_events_today(location=location)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка KudaGo API: {str(e)}")


@router.get("/kudago/categories")
def kudago_categories():
    try:
        return kudago_api.get_event_categories()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка KudaGo API: {str(e)}")


@router.get("/kudago/locations")
def kudago_locations():
    try:
        return kudago_api.get_locations()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка KudaGo API: {str(e)}")




@router.get("/attendees/batch-counts")
def batch_attendee_counts(
    ids: str = Query(..., description="Comma-separated event IDs"),
    db: Session = Depends(get_db),
):
    """Return attendee counts for multiple events at once."""
    id_list = [i.strip() for i in ids.split(",") if i.strip()]
    if not id_list:
        return {}
    from sqlalchemy import func as sf
    rows = (
        db.query(EventAttendee.event_id, sf.count(EventAttendee.id).label("cnt"))
        .filter(EventAttendee.event_id.in_(id_list))
        .group_by(EventAttendee.event_id)
        .all()
    )
    counts = {row.event_id: row.cnt for row in rows}
    return {eid: counts.get(eid, 0) for eid in id_list}


@router.post("/attendees/{event_id}", response_model=AttendeeOut)
def join_event(
    event_id: str,
    body: AttendeeCreateBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    existing = db.query(EventAttendee).filter(
        EventAttendee.event_id == event_id, EventAttendee.user_id == user.id
    ).first()
    if existing:
        existing.comment    = body.comment
        existing.is_looking = body.is_looking
        if body.event_title     is not None: existing.event_title     = body.event_title
        if body.event_date_ts   is not None: existing.event_date_ts   = body.event_date_ts
        if body.event_city      is not None: existing.event_city      = body.event_city
        if body.event_image_url is not None: existing.event_image_url = body.event_image_url
        if body.event_category  is not None: existing.event_category  = body.event_category
        if body.event_location  is not None: existing.event_location  = body.event_location
        db.commit()
        db.refresh(existing)
        row = existing
    else:
        row = EventAttendee(
            event_id=event_id,
            user_id=user.id,
            comment=body.comment,
            is_looking=body.is_looking,
            event_title=body.event_title,
            event_date_ts=body.event_date_ts,
            event_city=body.event_city,
            event_image_url=body.event_image_url,
            event_category=body.event_category,
            event_location=body.event_location,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

    created_at = row.created_at or datetime.utcnow()

    try:
        eid_int = int(event_id)
        # Атомарный UPDATE с подзапросом — одна SQL-инструкция; корректен
        # относительно concurrent attend/leave и не требует промежуточного select.
        db.execute(
            sa_update(Event)
            .where(Event.id == eid_int)
            .values(current_participants=(
                sa_select(sa_func.count()).select_from(EventAttendee)
                .where(EventAttendee.event_id == event_id)
                .scalar_subquery()
            ))
        )
        db.commit()
    except (ValueError, TypeError):
        pass

    return AttendeeOut(
        id=row.id,
        user_id=user.id,
        username=user.username,
        city=user.city,
        interests=user.interests,
        comment=row.comment,
        is_looking=row.is_looking,
        created_at=created_at,
        avatar_url=user.avatar_url,
    )


@router.delete("/attendees/{event_id}", status_code=204)
def leave_event(
    event_id: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    db.query(EventAttendee).filter(
        EventAttendee.event_id == event_id, EventAttendee.user_id == user.id
    ).delete()
    db.commit()

    try:
        eid_int = int(event_id)
        db.execute(
            sa_update(Event)
            .where(Event.id == eid_int)
            .values(current_participants=(
                sa_select(sa_func.count()).select_from(EventAttendee)
                .where(EventAttendee.event_id == event_id)
                .scalar_subquery()
            ))
        )
        db.commit()
    except (ValueError, TypeError):
        pass


@router.get("/attendees/{event_id}/me")
def get_my_attendance(
    event_id: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    row = db.query(EventAttendee).filter(
        EventAttendee.event_id == event_id, EventAttendee.user_id == user.id
    ).first()
    if not row:
        return {"attending": False}
    return {"attending": True, "is_looking": row.is_looking, "comment": row.comment}


@router.get("/attendees/{event_id}/matches", response_model=List[AttendeeMatchOut])
def get_matches(
    event_id: str,
    only_looking: bool = Query(default=False),
    limit: int = Query(default=200, ge=1, le=500),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    my_interests: set = set(
        i.strip() for i in (user.interests or "").split(",") if i.strip()
    )

    # Pre-filter по is_looking ещё в БД; LIMIT применяем ПОСЛЕ scoring,
    # но чтобы не держать в памяти всех attendees популярного события —
    # загружаем хотя бы не больше 2000 (разумный потолок для in-Python sort).
    HARD_CAP = 2000
    query = (
        db.query(EventAttendee, User)
        .join(User, EventAttendee.user_id == User.id)
        .filter(EventAttendee.event_id == event_id, EventAttendee.user_id != user.id)
    )
    if only_looking:
        query = query.filter(EventAttendee.is_looking == True)  # noqa: E712
    rows = query.order_by(EventAttendee.created_at.desc()).limit(HARD_CAP).all()

    result = []
    for a, u in rows:
        their = set(i.strip() for i in (u.interests or "").split(",") if i.strip())
        common = len(my_interests & their)
        result.append(AttendeeMatchOut(
            id=a.id, user_id=u.id, username=u.username, city=u.city,
            interests=u.interests, comment=a.comment,
            is_looking=a.is_looking,
            created_at=a.created_at or datetime.utcnow(),
            common_count=common,
            avatar_url=u.avatar_url,
        ))

    result.sort(key=lambda x: x.common_count, reverse=True)
    return result[:limit]


@router.get("/attendees/{event_id}", response_model=List[AttendeeOut])
def get_attendees(
    event_id: str,
    only_looking: bool = Query(default=False),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    get_current_user_from_token(token, db)
    query = db.query(EventAttendee, User).join(User, EventAttendee.user_id == User.id).filter(
        EventAttendee.event_id == event_id
    )
    if only_looking:
        query = query.filter(EventAttendee.is_looking == True)
    # Добавили пагинацию: для популярных событий с тысячами attendees
    # полный `.all()` в Python — DoS-вектор по памяти.
    rows = query.order_by(EventAttendee.created_at.desc()).offset(offset).limit(limit).all()
    return [
        AttendeeOut(
            id=a.id,
            user_id=u.id,
            username=u.username,
            city=u.city if getattr(u, "show_city", True) else None,
            interests=u.interests if getattr(u, "show_interests", True) else None,
            comment=a.comment,
            is_looking=a.is_looking,
            created_at=a.created_at or datetime.utcnow(),
            avatar_url=u.avatar_url,
        )
        for a, u in rows
    ]
