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
            for d in dates:
                ts = d.get("start")
                if ts:
                    date_ts = int(ts)
                    break
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
        user.hashed_password = hash_password(body.new_password)

    if body.city is not None:
        user.city = body.city
    if body.bio is not None:
        user.bio = body.bio
    if body.interests is not None:
        user.interests = body.interests
    if body.avatar_url is not None:
        user.avatar_url = body.avatar_url

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
    }
