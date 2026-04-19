from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

import kudago_api
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

    reviews_written = db.query(PartyReview).filter(PartyReview.reviewer_id == me.id).all()
    reviews_received = db.query(PartyReview).filter(PartyReview.reviewed_id == me.id).all()
    chat_msgs = db.query(ChatMessage).filter(ChatMessage.user_id == str(me.id)).all()
    reports_filed = db.query(Report).filter(Report.reporter_id == me.id).all()
    notifications = db.query(Notification).filter(Notification.user_id == me.id).all()
    memberships = db.query(PartyMember).filter(PartyMember.user_id == me.id).all()
    parties_created = db.query(EventParty).filter(EventParty.creator_id == me.id).all()

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
def get_my_events(
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
            raw = kudago_api.get_event_by_id(int(event_id))
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
def get_user(user_id: int, db: Session = Depends(get_db)):
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


@router.patch("/users/me")
def update_me(
    body: UserUpdate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)

    if body.username is not None:
        if not body.username.strip():
            raise HTTPException(status_code=400, detail="Имя пользователя не может быть пустым")
        user.username = body.username.strip()

    if body.new_password is not None:
        if not body.old_password:
            raise HTTPException(status_code=400, detail="Необходимо указать текущий пароль для смены")
        if len(body.new_password) < 8:
            raise HTTPException(status_code=400, detail="Новый пароль должен содержать минимум 8 символов")
        if not verify_password(body.old_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Неверный текущий пароль")
        if body.new_password == body.old_password:
            raise HTTPException(status_code=400, detail="Новый пароль должен отличаться от текущего")
        user.hashed_password = hash_password(body.new_password)

    if body.city is not None:
        user.city = body.city
    if body.bio is not None:
        user.bio = body.bio
    if body.interests is not None:
        user.interests = body.interests
    if body.avatar_url is not None:
        user.avatar_url = body.avatar_url

    # Matching fields
    matching_touched = False
    if body.birth_date is not None:
        user.birth_date = body.birth_date
    if body.latitude is not None:
        user.latitude = body.latitude
    if body.longitude is not None:
        user.longitude = body.longitude
    if body.geo_precision is not None:
        user.geo_precision = body.geo_precision
    if body.show_age is not None:
        user.show_age = body.show_age
    if body.is_discoverable_on_events is not None:
        user.is_discoverable_on_events = body.is_discoverable_on_events
    if body.preferred_categories is not None:
        user.preferred_categories = body.preferred_categories
        matching_touched = True
    if body.preferred_days is not None:
        user.preferred_days = body.preferred_days
    if body.preferred_time is not None:
        user.preferred_time = body.preferred_time
    if body.budget_max is not None:
        user.budget_max = body.budget_max

    # Refresh embedding if any field feeding into compose_user_text changed
    if body.interests is not None or body.bio is not None or body.city is not None or matching_touched:
        try:
            from services import embeddings
            from routers.recommendations import (
                invalidate_user_cache, invalidate_user_event_cache,
            )
            embeddings.refresh_user_embedding(db, user)
            invalidate_user_cache(user.id)
            invalidate_user_event_cache(user.id)
        except Exception:
            # Embedding refresh is best-effort — don't fail the PATCH
            pass

    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "city": user.city,
        "bio": user.bio,
        "interests": user.interests,
        "avatar_url": user.avatar_url,
        "is_active": user.is_active,
        "birth_date": user.birth_date.isoformat() if user.birth_date else None,
        "latitude": user.latitude,
        "longitude": user.longitude,
        "geo_precision": user.geo_precision,
        "show_age": user.show_age,
        "is_discoverable_on_events": user.is_discoverable_on_events,
        "preferred_categories": user.preferred_categories,
        "preferred_days": user.preferred_days,
        "preferred_time": user.preferred_time,
        "budget_max": user.budget_max,
    }
