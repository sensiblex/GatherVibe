from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

import asyncio
import kudago_api_async
from auth import verify_password, hash_password
from deps import get_db, get_current_user_from_token, oauth2_scheme
from models.user import User
from models.attendee import EventAttendee
from models.party import EventParty, PartyMember
from schemas import UserUpdate

router = APIRouter(tags=["users"])


@router.get("/users")
def get_users(
    token: str = Depends(oauth2_scheme),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    search: Optional[str] = Query(default=None),
    city: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """Возвращает список пользователей с фильтрацией и пагинацией."""
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
    """Возвращает статистику пользователя."""
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
    """Возвращает события пользователя (предстоящие и прошедшие)."""
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
    parties_by_event_id = {
        row.event_id: row
        for row in db.query(EventParty)
        .filter(EventParty.event_id.in_(list(party_event_ids)))
        .all()
    }

    for event_id in party_event_ids:
        try:
            date_ts: Optional[int] = None
            title: Optional[str] = None
            image_url: Optional[str] = None
            category: Optional[str] = None
            location: Optional[str] = None
            party = parties_by_event_id.get(event_id)

            if party and party.event_date_ts:
                date_ts = int(party.event_date_ts)
                title = party.event_title
                image_url = party.event_image_url
            else:
                raw = await asyncio.wait_for(
                    kudago_api_async.get_event_by_id(int(event_id)), timeout=3.0
                )
                dates = raw.get("dates") or []
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
                title = raw.get("title")
            items[event_id] = {
                "event_id":   event_id,
                "title":      title or f"Событие #{event_id}",
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
    """Возвращает профиль пользователя."""

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