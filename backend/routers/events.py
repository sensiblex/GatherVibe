from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
import time
import os
import uuid
import pathlib

from pydantic import BaseModel
from deps import get_db, get_current_user_from_token, oauth2_scheme
from schemas import EventCreate, EventResponse, EventUpdate
from models.event import Event
from models.attendee import EventAttendee
from models.chat_message import ChatMessage
from models.message_reaction import MessageReaction
from models.user import User
import kudago_api
import kudago_cache

router = APIRouter(tags=["events"])


# ─── Attendee schemas ──────────────────────────────────────────────────────


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


# ─── Chat / messages ────────────────────────────────────────────────────────


@router.get("/messages/{room}")
def get_messages(
    room: str,
    limit: int = Query(default=50, le=200),
    before_id: Optional[int] = Query(default=None),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    get_current_user_from_token(token, db)
    query = db.query(ChatMessage).filter(ChatMessage.room == room)
    if before_id is not None:
        query = query.filter(ChatMessage.id < before_id)
    rows = query.order_by(ChatMessage.id.desc()).limit(limit).all()
    rows = list(reversed(rows))
    user_ids = [int(r.user_id) for r in rows if r.user_id and r.user_id.isdigit()]
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
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/upload/chat")
async def upload_chat_file(
    file: UploadFile = File(...),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    get_current_user_from_token(token, db)

    content_type = file.content_type or ""
    if content_type not in ALLOWED_MIME_TYPES and not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail=f"Недопустимый тип файла: {content_type}")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="Файл превышает допустимый размер (макс. 10 MB)")

    if content_type.startswith("image/"):
        file_type = "image"
    elif content_type == "application/pdf":
        file_type = "pdf"
    else:
        file_type = "file"

    # Strip any directory components from the filename (path traversal guard)
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


# ─── Local events ───────────────────────────────────────────────────────────


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
    skip: int = 0,
    limit: int = 20,
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


@router.get("/events/{event_id}", response_model=EventResponse)
def get_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id, Event.is_active == True).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    return event


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


# ─── KudaGo ─────────────────────────────────────────────────────────────────


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
    db: Session = Depends(get_db),
):
    """Возвращает события из локального кэша. Фоллбэк на KudaGo API только для browsing без поиска."""
    cache_has_location = kudago_cache.location_has_cache(db, location)

    if cache_has_location:
        # Кэш есть — всегда читаем из него. Поиск точный, по title.
        try:
            return kudago_cache.query_cache(
                db=db,
                location=location,
                categories=categories,
                is_free=is_free,
                search=search,
                page=page,
                page_size=page_size,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ошибка кэша: {str(e)}")

    # Кэш пустой — фоллбэк на KudaGo API
    try:
        now_ts = int(time.time())
        effective_since = max(actual_since, now_ts) if actual_since else now_ts
        raw = kudago_api.get_events(
            location=location, categories=categories, is_free=is_free,
            page=page, page_size=page_size,
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


@router.post("/kudago/sync")
def kudago_sync(
    locations: Optional[str] = Query(default=None, description="Через запятую: msk,spb,kzn"),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Принудительная синхронизация кэша событий из KudaGo API."""
    get_current_user_from_token(token, db)
    loc_list = [l.strip() for l in locations.split(",")] if locations else kudago_cache.DEFAULT_LOCATIONS
    try:
        stats = kudago_cache.sync_all(loc_list)
        return {"synced": stats}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка синхронизации: {str(e)}")


@router.get("/kudago/debug")
def kudago_debug(location: str = Query(default="kzn"), search: str = Query(default="мир"), db: Session = Depends(get_db)):
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
def kudago_get_event_detail(event_id: int):
    try:
        return kudago_api.parse_event_detail(kudago_api.get_event_by_id(event_id))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ошибка KudaGo API: {str(e)}")


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


# ─── Attendees ───────────────────────────────────────────────────────────────


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
        local_event = db.query(Event).filter(Event.id == int(event_id)).first()
        if local_event:
            local_event.current_participants = (
                db.query(EventAttendee)
                .filter(EventAttendee.event_id == event_id)
                .count()
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
        local_event = db.query(Event).filter(Event.id == int(event_id)).first()
        if local_event:
            local_event.current_participants = (
                db.query(EventAttendee)
                .filter(EventAttendee.event_id == event_id)
                .count()
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
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    my_interests: set = set(
        i.strip() for i in (user.interests or "").split(",") if i.strip()
    )

    rows = (
        db.query(EventAttendee, User)
        .join(User, EventAttendee.user_id == User.id)
        .filter(EventAttendee.event_id == event_id, EventAttendee.user_id != user.id)
        .all()
    )

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
    return result


@router.get("/attendees/{event_id}", response_model=List[AttendeeOut])
def get_attendees(
    event_id: str,
    only_looking: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    query = db.query(EventAttendee, User).join(User, EventAttendee.user_id == User.id).filter(
        EventAttendee.event_id == event_id
    )
    if only_looking:
        query = query.filter(EventAttendee.is_looking == True)
    rows = query.order_by(EventAttendee.created_at.desc()).all()
    return [
        AttendeeOut(
            id=a.id, user_id=u.id, username=u.username, city=u.city,
            interests=u.interests, comment=a.comment,
            is_looking=a.is_looking,
            created_at=a.created_at or datetime.utcnow(),
            avatar_url=u.avatar_url,
        )
        for a, u in rows
    ]
