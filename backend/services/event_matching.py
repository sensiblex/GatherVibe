"""Event → user recommendations.

Hybrid scoring over KudaGo cached events:
  - semantic similarity (embeddings)
  - interest/category overlap (Jaccard)
  - history affinity (past attended categories)
  - geo proximity / city
  - age fit (hard cutoff for age_restriction)
  - time fit (freshness)
  - popularity (favorites_count, log-scaled)

Feedback loop: dismissed events (last 14 days) are excluded; attended events too.
"""
from __future__ import annotations

import json
import math
import time
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from models.attendee import EventAttendee
from models.kudago_event import KudaGoEvent
from models.recommendation_impression import RecommendationImpression
from models.user import User
from services import embeddings
from services.scoring_utils import (
    age_from_birthdate as _age_from_birthdate,
    jaccard as _jaccard,
    parse_csv_to_set as _parse_csv,
)



W_SEMANTIC = 0.30
W_CATEGORY = 0.25
W_HISTORY = 0.15
W_GEO = 0.10
W_POPULARITY = 0.10
W_TIME = 0.10

DISMISS_COOLDOWN_DAYS = 14




def _decode_json_list(raw) -> list[str]:
    if not raw:
        return []
    if isinstance(raw, list):
        return [str(x) for x in raw]
    try:
        data = json.loads(raw)
        return [str(x) for x in data] if isinstance(data, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _time_score(start_ts: int | None, now_ts: int) -> float:
    if not start_ts:
        return 0.2
    days = (start_ts - now_ts) / 86400
    if days < 0:
        return 0.0
    if days <= 1:
        return 1.0
    if days <= 3:
        return 0.85
    if days <= 7:
        return 0.65
    if days <= 30:
        return 0.4
    return 0.2


def _popularity_score(favorites: int | None) -> float:
    if not favorites or favorites < 0:
        return 0.0
    return min(1.0, math.log10(favorites + 1) / 4.0)


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _geo_score(user: User, ev: KudaGoEvent) -> float:
    if user.latitude is not None and user.longitude is not None and ev.lat is not None and ev.lon is not None:
        km = _haversine_km(user.latitude, user.longitude, ev.lat, ev.lon)
        return math.exp(-(km ** 2) / (2 * 5 * 5))
    if user.city and ev.location and user.city.strip().lower() == ev.location.strip().lower():
        return 0.7
    return 0.0


_INTEREST_ALIASES = {
    "concert": {"concert", "concerts", "music", "concerts-music"},
    "cinema": {"cinema", "movies", "films", "film"},
    "theater": {"theater", "theatre", "theaters"},
    "sport": {"sport", "sports", "fitness"},
    "yoga": {"yoga", "fitness"},
    "exhibition": {"exhibition", "exhibitions", "art", "museum"},
    "lecture": {"lecture", "lectures", "education"},
    "party": {"party", "parties", "nightlife"},
    "food": {"food", "gastro", "restaurants"},
    "travel": {"tour", "tours", "travel"},
}


def _expand_interests_to_categories(interests: set[str]) -> set[str]:
    out = set(interests)
    for i in interests:
        out |= _INTEREST_ALIASES.get(i, set())
    return out




@dataclass
class EventRecommendation:
    event_id: str
    score: int
    reasons: list[str]
    event: KudaGoEvent
    components: dict[str, float]


@dataclass
class _UserCtx:
    user: User
    interests: set[str]
    interest_categories: set[str]
    history_category_freq: Counter
    attended_event_ids: set[str]
    dismissed_event_ids: set[str]
    age: int | None
    embedding: list[float] | None


def _build_ctx(db: Session, user: User) -> _UserCtx:
    interests = _parse_csv(user.interests)
    pref = _parse_csv(getattr(user, "preferred_categories", None))
    interests_plus_prefs = interests | pref
    expanded = _expand_interests_to_categories(interests_plus_prefs)

    attendee_rows = (
        db.query(EventAttendee.event_id, EventAttendee.event_category)
        .filter(EventAttendee.user_id == user.id)
        .all()
    )
    history_counter: Counter = Counter()
    attended_ids: set[str] = set()
    for eid, cat in attendee_rows:
        attended_ids.add(str(eid))
        if cat:
            history_counter[cat.strip().lower()] += 1

    cutoff = datetime.now(timezone.utc) - timedelta(days=DISMISS_COOLDOWN_DAYS)
    dismiss_rows = (
        db.query(RecommendationImpression.target_id)
        .filter(
            RecommendationImpression.user_id == user.id,
            RecommendationImpression.rec_type == "event",
            RecommendationImpression.action.in_(["dismissed", "disliked"]),
            RecommendationImpression.created_at >= cutoff,
        )
        .all()
    )
    dismissed = {str(t[0]) for t in dismiss_rows}

    age = _age_from_birthdate(getattr(user, "birth_date", None))

    user_embedding = embeddings.get_embedding(db, "user", str(user.id))

    return _UserCtx(
        user=user,
        interests=interests_plus_prefs,
        interest_categories=expanded,
        history_category_freq=history_counter,
        attended_event_ids=attended_ids,
        dismissed_event_ids=dismissed,
        age=age,
        embedding=user_embedding,
    )




def _score_event(
    db: Session, ctx: _UserCtx, ev: KudaGoEvent, now_ts: int
) -> EventRecommendation | None:
    if ev.start_ts is not None and ev.start_ts < now_ts:
        return None
    str_id = str(ev.kudago_id)
    if str_id in ctx.attended_event_ids or str_id in ctx.dismissed_event_ids:
        return None
    if ev.age_restriction and ctx.age is not None and ctx.age < ev.age_restriction:
        return None

    ev_categories = {c.lower() for c in _decode_json_list(ev.categories)}
    ev_tags = {t.lower() for t in _decode_json_list(ev.tags)}

    semantic = 0.0
    if ctx.embedding is not None:
        ev_vec = embeddings.get_embedding(db, "event", str_id)
        if ev_vec:
            semantic = max(0.0, embeddings.cosine(ctx.embedding, ev_vec))

    category_overlap = _jaccard(ctx.interest_categories, ev_categories | ev_tags)
    category_hits = len(ctx.interest_categories & (ev_categories | ev_tags))

    history = 0.0
    total_hist = sum(ctx.history_category_freq.values())
    if total_hist > 0:
        matching_hist = sum(
            ctx.history_category_freq.get(c, 0) for c in ev_categories
        )
        history = matching_hist / total_hist

    geo = _geo_score(ctx.user, ev)

    popularity = _popularity_score(ev.favorites_count)

    time_fit = _time_score(ev.start_ts, now_ts)

    raw = (
        semantic * W_SEMANTIC
        + category_overlap * W_CATEGORY
        + history * W_HISTORY
        + geo * W_GEO
        + popularity * W_POPULARITY
        + time_fit * W_TIME
    )
    score = int(round(max(0.0, min(1.0, raw)) * 100))

    reasons = _build_reasons(
        category_hits=category_hits,
        geo=geo,
        history=history,
        popularity=ev.favorites_count or 0,
        start_ts=ev.start_ts,
        now_ts=now_ts,
        same_city=bool(ctx.user.city and ev.location and
                       ctx.user.city.strip().lower() == ev.location.strip().lower()),
    )

    return EventRecommendation(
        event_id=str_id,
        score=score,
        reasons=reasons,
        event=ev,
        components={
            "semantic": semantic,
            "category": category_overlap,
            "history": history,
            "geo": geo,
            "popularity": popularity,
            "time": time_fit,
        },
    )


def _build_reasons(
    *, category_hits: int, geo: float, history: float,
    popularity: int, start_ts: int | None, now_ts: int, same_city: bool,
) -> list[str]:
    out: list[str] = []
    if category_hits > 0:
        word = "интерес" if category_hits == 1 else (
            "интереса" if category_hits < 5 else "интересов")
        out.append(f"🎭 {category_hits} общих {word}")
    if history > 0.3:
        out.append("🎯 Ты ходил на похожие")
    if geo >= 0.5 and not same_city:
        out.append("📍 Рядом с тобой")
    elif same_city:
        out.append("📍 Твой город")
    if start_ts:
        days = max(0, (start_ts - now_ts) // 86400)
        if days == 0:
            out.append("🔥 Сегодня")
        elif days <= 3:
            out.append(f"🔥 Через {days} дн.")
        elif days <= 7:
            out.append(f"📅 Через {days} дн.")
    if popularity >= 1000:
        out.append(f"👥 {popularity} интересуются")
    return out[:3]




def recommend_events(
    db: Session,
    user: User,
    *,
    limit: int = 20,
    offset: int = 0,
    city: str | None = None,
    exclude_attended: bool = True,
) -> list[EventRecommendation]:
    ctx = _build_ctx(db, user)
    q = db.query(KudaGoEvent)
    if city:
        q = q.filter(KudaGoEvent.location == city)
    elif user.city:
        q = q.filter(KudaGoEvent.location == user.city.strip().lower())
    candidates = q.all()

    now_ts = int(time.time())
    scored: list[EventRecommendation] = []
    for ev in candidates:
        rec = _score_event(db, ctx, ev, now_ts)
        if rec is not None and rec.score > 0:
            scored.append(rec)

    scored.sort(key=lambda r: r.score, reverse=True)
    return scored[offset : offset + limit]


def serialize_event_rec(rec: EventRecommendation) -> dict:
    ev = rec.event
    return {
        "event_id": rec.event_id,
        "kudago_id": ev.kudago_id,
        "title": ev.title,
        "description": ev.description,
        "cover_url": ev.cover_url,
        "start_ts": ev.start_ts,
        "location": ev.location,
        "place_title": ev.place_title,
        "place_address": ev.place_address,
        "is_free": ev.is_free,
        "price": ev.price,
        "favorites_count": ev.favorites_count,
        "match_score": rec.score,
        "match_reasons": rec.reasons,
    }
