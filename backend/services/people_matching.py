"""User → user recommendations.

Two modes:
  - recommend_similar_users(): global similarity (interests + semantic + mutuals)
  - recommend_event_peers(): candidates sharing a specific event (opt-in required)

Both share a scoring function, with different weights for each context.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from models.attendee import EventAttendee
from models.user import User
from services import embeddings


W_SEMANTIC = 0.30
W_INTEREST = 0.25
W_MUTUAL_EVENTS = 0.20
W_CITY_OR_GEO = 0.10
W_AGE = 0.10
W_TRUST = 0.05


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _parse_csv(raw: str | None) -> set[str]:
    if not raw:
        return set()
    return {t.strip().lower() for t in raw.split(",") if t.strip()}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _age_from_birthdate(bd: date | None, today: date | None = None) -> int | None:
    if bd is None:
        return None
    today = today or date.today()
    years = today.year - bd.year
    if (today.month, today.day) < (bd.month, bd.day):
        years -= 1
    return max(0, years)


def _age_score(a: int | None, b: int | None) -> float:
    if a is None or b is None:
        return 0.0
    diff = abs(a - b)
    # gaussian decay: 1.0 @ 0 diff, ~0.6 @ 5y, ~0.1 @ 15y
    return math.exp(-(diff ** 2) / (2 * 5 * 5))


def _city_score(me: User, other: User) -> float:
    if me.city and other.city and me.city.strip().lower() == other.city.strip().lower():
        return 1.0
    return 0.0


def _trust_score(other: User) -> float:
    ts = getattr(other, "trust_score", None)
    if ts is None:
        return 0.0
    # trust_score is float; normalize to [0, 1] if it's already 0..1 or 0..5
    if ts > 1.0:
        return min(1.0, ts / 5.0)
    return max(0.0, min(1.0, ts))


def _mutual_events(db: Session, user_id_a: int, user_id_b: int) -> int:
    a_events = {
        row[0]
        for row in db.query(EventAttendee.event_id)
        .filter(EventAttendee.user_id == user_id_a).all()
    }
    if not a_events:
        return 0
    cnt = (
        db.query(EventAttendee.event_id)
        .filter(
            EventAttendee.user_id == user_id_b,
            EventAttendee.event_id.in_(a_events),
        )
        .count()
    )
    return cnt


# ─── Dataclass ───────────────────────────────────────────────────────────────


@dataclass
class UserRecommendation:
    user_id: int
    score: int
    reasons: list[str]
    user: User
    components: dict[str, float]


# ─── Scoring ─────────────────────────────────────────────────────────────────


def _score_pair(
    db: Session,
    me: User,
    me_interests: set[str],
    me_embedding: list[float] | None,
    other: User,
) -> UserRecommendation | None:
    if other.id == me.id:
        return None

    other_interests = _parse_csv(other.interests)
    interest_overlap = _jaccard(me_interests, other_interests)
    interest_hits = len(me_interests & other_interests)

    semantic = 0.0
    if me_embedding is not None:
        other_vec = embeddings.get_embedding(db, "user", str(other.id))
        if other_vec:
            semantic = max(0.0, embeddings.cosine(me_embedding, other_vec))

    mutual_count = _mutual_events(db, me.id, other.id)
    mutuals_score = min(1.0, mutual_count / 5.0)  # saturates at 5 mutuals

    geo = _city_score(me, other)

    my_age = _age_from_birthdate(getattr(me, "birth_date", None))
    their_age = _age_from_birthdate(getattr(other, "birth_date", None))
    age_fit = _age_score(my_age, their_age)

    trust = _trust_score(other)

    raw = (
        semantic * W_SEMANTIC
        + interest_overlap * W_INTEREST
        + mutuals_score * W_MUTUAL_EVENTS
        + geo * W_CITY_OR_GEO
        + age_fit * W_AGE
        + trust * W_TRUST
    )
    score = int(round(max(0.0, min(1.0, raw)) * 100))

    if score <= 0:
        return None

    reasons: list[str] = []
    if interest_hits > 0:
        word = "интерес" if interest_hits == 1 else (
            "интереса" if interest_hits < 5 else "интересов")
        reasons.append(f"🎭 {interest_hits} общих {word}")
    if mutual_count > 0:
        word = "событии" if mutual_count == 1 else "событиях"
        reasons.append(f"📅 Пересекались на {mutual_count} {word}")
    if geo == 1.0:
        reasons.append("📍 Твой город")
    if trust > 0.6:
        reasons.append("⭐ Высокий trust score")
    reasons = reasons[:3]

    return UserRecommendation(
        user_id=other.id,
        score=score,
        reasons=reasons,
        user=other,
        components={
            "semantic": semantic,
            "interest": interest_overlap,
            "mutuals": mutuals_score,
            "geo": geo,
            "age": age_fit,
            "trust": trust,
        },
    )


# ─── Public API ──────────────────────────────────────────────────────────────


def recommend_similar_users(
    db: Session,
    user: User,
    *,
    limit: int = 20,
    city_only: bool = True,
) -> list[UserRecommendation]:
    me_interests = _parse_csv(user.interests)
    me_embedding = embeddings.get_embedding(db, "user", str(user.id))

    q = db.query(User).filter(User.id != user.id, User.is_active.is_(True))
    if city_only and user.city:
        q = q.filter(User.city == user.city)
    candidates = q.all()

    scored: list[UserRecommendation] = []
    for other in candidates:
        rec = _score_pair(db, user, me_interests, me_embedding, other)
        if rec is not None:
            scored.append(rec)

    scored.sort(key=lambda r: r.score, reverse=True)
    return scored[:limit]


def recommend_event_peers(
    db: Session,
    user: User,
    *,
    event_id: str,
    limit: int = 10,
) -> list[UserRecommendation]:
    """Return opt-in attendees of the given event, ranked by compatibility."""
    attendee_ids = [
        row[0]
        for row in db.query(EventAttendee.user_id)
        .filter(EventAttendee.event_id == str(event_id))
        .all()
    ]
    if not attendee_ids:
        return []

    me_interests = _parse_csv(user.interests)
    me_embedding = embeddings.get_embedding(db, "user", str(user.id))

    candidates = (
        db.query(User)
        .filter(
            User.id.in_(attendee_ids),
            User.id != user.id,
            User.is_discoverable_on_events.is_(True),
            User.is_active.is_(True),
        )
        .all()
    )

    scored: list[UserRecommendation] = []
    for other in candidates:
        rec = _score_pair(db, user, me_interests, me_embedding, other)
        if rec is not None:
            scored.append(rec)

    scored.sort(key=lambda r: r.score, reverse=True)
    return scored[:limit]


def serialize_user_rec(rec: UserRecommendation) -> dict:
    u = rec.user
    return {
        "user_id": rec.user_id,
        "username": u.username,
        "avatar_url": u.avatar_url,
        "city": u.city if u.show_city else None,
        "interests": u.interests if u.show_interests else None,
        "bio": u.bio,
        "match_score": rec.score,
        "match_reasons": rec.reasons,
    }
