from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

import asyncio
import kudago_api_async
from auth import verify_password, hash_password
from deps import get_db, get_current_user_from_token, oauth2_scheme
from models.user import User
from models.attendee import EventAttendee
from models.party import EventParty, PartyMember
from models.chat_message import ChatMessage
from models.review import PartyReview
from models.report import Report
from models.notification import Notification
from schemas import UserUpdate

router = APIRouter(tags=["users"])


@router.get("/users/me/export")
def export_user_data(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """GDPR: экспорт всех данных текущего пользователя в JSON."""
    me = get_current_user_from_token(token, db)

    # GDPR-экспорт: ограничиваем выборки чтобы не дать DoS-вектор по памяти.
    # Для реального полного экспорта нужен background job + файл, здесь —
    # inline для разумных объёмов.
    EXPORT_MSGS_CAP = 5000
    EXPORT_NOTIF_CAP = 1000
    EXPORT_OTHER_CAP = 2000
    reviews_written = db.query(PartyReview).filter(
        PartyReview.reviewer_id == me.id
    ).order_by(PartyReview.id.desc()).limit(EXPORT_OTHER_CAP).all()
    reviews_received = db.query(PartyReview).filter(
        PartyReview.reviewed_id == me.id
    ).order_by(PartyReview.id.desc()).limit(EXPORT_OTHER_CAP).all()
    chat_msgs = db.query(ChatMessage).filter(
        ChatMessage.user_id == me.id  # user_id теперь Integer, а не str
    ).order_by(ChatMessage.id.desc()).limit(EXPORT_MSGS_CAP).all()
    reports_filed = db.query(Report).filter(
        Report.reporter_id == me.id
    ).order_by(Report.id.desc()).limit(EXPORT_OTHER_CAP).all()
    notifications = db.query(Notification).filter(
        Notification.user_id == me.id
    ).order_by(Notification.id.desc()).limit(EXPORT_NOTIF_CAP).all()
    memberships = db.query(PartyMember).filter(
        PartyMember.user_id == me.id
    ).order_by(PartyMember.id.desc()).limit(EXPORT_OTHER_CAP).all()
    parties_created = db.query(EventParty).filter(
        EventParty.creator_id == me.id
    ).order_by(EventParty.id.desc()).limit(EXPORT_OTHER_CAP).all()

    def _dt(v):
        return v.isoformat() if v else None

    return {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "profile": {
            "id": me.id, "email": me.email, "username": me.username,
            "city": me.city, "bio": me.bio, "interests": me.interests,
            "avatar_url": me.avatar_url, "role": me.role,
            "created_at": _dt(me.created_at),
            "trust_score": me.trust_score,
        },
        "reviews_written": [
            {"id": r.id, "reviewed_id": r.reviewed_id, "party_id": r.party_id,
             "rating": r.rating, "text": r.text, "tags": r.tags,
             "created_at": _dt(r.created_at)} for r in reviews_written
        ],
        "reviews_received": [
            {"id": r.id, "reviewer_id": r.reviewer_id, "party_id": r.party_id,
             "rating": r.rating, "text": r.text, "tags": r.tags,
             "created_at": _dt(r.created_at)} for r in reviews_received
        ],
        "chat_messages": [
            {"id": m.id, "room": m.room, "message": m.message,
             "timestamp": _dt(m.timestamp), "is_deleted": m.is_deleted}
            for m in chat_msgs
        ],
        "reports_filed": [
            {"id": r.id, "target_type": r.target_type, "target_id": r.target_id,
             "reason": r.reason, "status": r.status,
             "created_at": _dt(r.created_at)} for r in reports_filed
        ],
        "notifications": [
            {"id": n.id, "type": n.type, "title": n.title, "body": n.body,
             "created_at": _dt(n.created_at)} for n in notifications
        ],
        "party_memberships": [
            {"party_id": pm.party_id, "status": pm.status,
             "joined_at": _dt(pm.joined_at)} for pm in memberships
        ],
        "parties_created": [
            {"id": p.id, "event_id": p.event_id, "title": p.title,
             "description": p.description,
             "created_at": _dt(p.created_at)} for p in parties_created
        ],
    }


@router.get("/users")
def get_users(
    token: str = Depends(oauth2_scheme),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    search: Optional[str] = Query(default=None),
    city: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    get_current_user_from_token(token, db)
    query = db.query(User)
    if search:
        query = query.filter(
            (User.username.ilike(f"%{search}%")) |
            (User.interests.ilike(f"%{search}%"))
        )
    if city:
        query = query.filter(User.city.ilike(f"%{city}%"))
    users = query.offset(skip).limit(limit).all()
    return [
        {
            "id":        u.id,
            "username":  u.username,
            "email":     u.email if u.show_email else None,
            "city":      u.city if u.show_city else None,
            "interests": u.interests if u.show_interests else None,
            "bio":       u.bio,
            "avatar_url": u.avatar_url,
            "is_active": u.is_active,
        }
        for u in users
    ]


@router.get("/users/me/stats")
def get_my_stats(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)

    parties_created = db.query(EventParty).filter(
        EventParty.creator_id == user.id
    ).count()

    events_attended = db.query(EventAttendee).filter(
        EventAttendee.user_id == user.id
    ).count()

    matches_found = (
        db.query(PartyMember)
        .filter(
            PartyMember.user_id == user.id,
            PartyMember.status == "accepted",
        )
        .join(EventParty, PartyMember.party_id == EventParty.id)
        .filter(EventParty.creator_id != user.id)
        .count()
    )

    return {
        "parties_created": parties_created,
        "events_attended": events_attended,
        "matches_found": matches_found,
    }


@router.get("/users/me/events")
async def get_my_events(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    import time as _time
    user = get_current_user_from_token(token, db)
    now_ts = int(_time.time())

    attendee_rows = db.query(EventAttendee).filter(
        EventAttendee.user_id == user.id
    ).all()

    seen_event_ids = {a.event_id for a in attendee_rows}
    items: dict = {}

    for a in attendee_rows:
        items[a.event_id] = {
            "event_id":   a.event_id,
            "title":      a.event_title or f"Событие #{a.event_id}",
            "date_ts":    a.event_date_ts,
            "city":       a.event_city,
            "category":   a.event_category,
            "image_url":  a.event_image_url,
            "location":   a.event_location,
            "is_looking": a.is_looking,
            "comment":    a.comment,
        }

    member_event_ids = set(
        row[0] for row in (
            db.query(EventParty.event_id)
            .join(PartyMember, PartyMember.party_id == EventParty.id)
            .filter(
                PartyMember.user_id == user.id,
                PartyMember.status == "accepted",
            )
            .all()
        )
    )
    creator_event_ids = set(
        row[0] for row in (
            db.query(EventParty.event_id)
            .filter(EventParty.creator_id == user.id)
            .all()
        )
    )
    party_event_ids = (member_event_ids | creator_event_ids) - seen_event_ids

    for event_id in party_event_ids:
        try:
            raw = await asyncio.wait_for(
                kudago_api_async.get_event_by_id(int(event_id)), timeout=3.0
            )
            dates = raw.get("dates") or []
            date_ts: Optional[int] = None
            future = sorted(
                [d for d in dates if d.get("start") and int(d["start"]) >= now_ts],
                key=lambda d: int(d["start"]),
            )
            if future:
                date_ts = int(future[0]["start"])
            else:
                past_sorted = sorted(
                    [d for d in dates if d.get("start")],
                    key=lambda d: int(d["start"]),
                    reverse=True,
                )
                if past_sorted:
                    date_ts = int(past_sorted[0]["start"])
            images = raw.get("images") or []
            image_url = images[0].get("image") if images else None
            cats = raw.get("categories") or []
            category = cats[0] if cats else None
            place = raw.get("place") or {}
            location = place.get("address") or place.get("title") or None
            items[event_id] = {
                "event_id":   event_id,
                "title":      raw.get("title") or f"Событие #{event_id}",
                "date_ts":    date_ts,
                "city":       None,
                "category":   category,
                "image_url":  image_url,
                "location":   location,
                "is_looking": False,
                "comment":    None,
            }
        except Exception:
            pass

    upcoming: list = []
    past: list = []
    for item in sorted(items.values(), key=lambda x: x["date_ts"] or 0):
        if (item["date_ts"] or 0) >= now_ts:
            upcoming.append(item)
        else:
            past.append(item)

    return {"upcoming": upcoming, "past": past}


@router.get("/users/{user_id}")
def get_user(
    user_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    # Требуем авторизации — иначе любой бот может перебирать ID и собирать
    # username/bio/avatar. Приватность полей уже уважается (show_*).
    get_current_user_from_token(token, db)
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return {
        "id":         user.id,
        "username":   user.username,
        "email":      user.email      if user.show_email     else None,
        "city":       user.city       if user.show_city      else None,
        "interests":  user.interests  if user.show_interests else None,
        "bio":        user.bio,
        "avatar_url": user.avatar_url,
        "is_active":  user.is_active,
    }


# PATCH /users/me — handler живёт в routers/auth.py (регистрируется первым).
# Дубль отсюда удалён: маршрут всё равно перекрывался, код был недостижим.
