"""Party recommendation scoring.

Pure math — no ML, no external services. Computes a weighted match score
(0–100) for each candidate EventParty for a given user based on interest
overlap, city compatibility, review-tag overlap, event proximity, and
free-spot availability.
"""
from __future__ import annotations

import time
from collections import Counter
from dataclasses import dataclass
from typing import Iterable

from sqlalchemy.orm import Session

from models.party import EventParty, PartyMember
from models.review import PartyReview
from models.user import User
from services.scoring_utils import (
    jaccard as _jaccard,
    parse_csv_to_set as _parse_interests,
)


# ─── Weights ──────────────────────────────────────────────────────────────────

W_INTEREST = 0.40
W_CITY = 0.25          # substitutes age_compatibility (no age field on User)
W_REVIEW_TAGS = 0.20
W_ACTIVITY = 0.10
W_FILL = 0.05


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _top_review_tags(db: Session, user_id: int, n: int = 3) -> set[str]:
    rows = (
        db.query(PartyReview.tags)
        .filter(
            PartyReview.reviewed_id == user_id,
            PartyReview.is_hidden.is_(False),
            PartyReview.is_deleted.is_(False),
        )
        .all()
    )
    counter: Counter[str] = Counter()
    for (tags,) in rows:
        if tags:
            counter.update(tags)
    return {tag for tag, _ in counter.most_common(n)}


def _activity_score(event_date_ts: int | None, now_ts: int) -> float:
    if not event_date_ts:
        return 0.2
    seconds_until = event_date_ts - now_ts
    if seconds_until < 0:
        return 0.0
    days = seconds_until / 86400
    if days <= 3:
        return 1.0
    if days <= 7:
        return 0.7
    if days <= 30:
        return 0.4
    return 0.2


# ─── Context ──────────────────────────────────────────────────────────────────


@dataclass
class UserContext:
    user_id: int
    interests: set[str]
    city: str | None
    review_tags: set[str]


def build_user_context(db: Session, user: User) -> UserContext:
    return UserContext(
        user_id=user.id,
        interests=_parse_interests(user.interests),
        city=(user.city or "").strip().lower() or None,
        review_tags=_top_review_tags(db, user.id),
    )


# ─── Scoring ──────────────────────────────────────────────────────────────────


@dataclass
class PartyScore:
    party: EventParty
    member_count: int
    members: list[User]
    score: int
    reasons: list[str]


def _reasons(
    interest_hits: int,
    same_city: bool,
    review_tag_hits: int,
    event_date_ts: int | None,
    now_ts: int,
    spots_left: int,
) -> list[str]:
    out: list[str] = []
    if interest_hits > 0:
        word = "интерес" if interest_hits == 1 else ("интереса" if interest_hits < 5 else "интересов")
        out.append(f"🎭 {interest_hits} общих {word}")
    if same_city:
        out.append("📍 Твой город")
    if review_tag_hits > 0:
        out.append("⭐ Похожие отзывы")
    if event_date_ts:
        days = max(0, (event_date_ts - now_ts) // 86400)
        if days == 0:
            out.append("🔥 Сегодня")
        elif days <= 3:
            out.append(f"🔥 Через {days} дн.")
        elif days <= 7:
            out.append(f"📅 Через {days} дн.")
    if spots_left == 1:
        out.append("⚡ Последнее место")
    return out[:3]


def score_party(
    db: Session,
    ctx: UserContext,
    party: EventParty,
    members: list[User],
    member_count: int,
    now_ts: int,
) -> PartyScore:
    party_interests: set[str] = set()
    for m in members:
        party_interests |= _parse_interests(m.interests)
    interest_overlap = _jaccard(ctx.interests, party_interests)
    interest_hits = len(ctx.interests & party_interests)

    party_city = (party.city or "").strip().lower() or None
    same_city = bool(ctx.city and party_city and ctx.city == party_city)
    city_compatibility = 1.0 if same_city else 0.0

    party_tags: set[str] = set()
    for m in members:
        party_tags |= _top_review_tags(db, m.id)
    review_overlap = _jaccard(ctx.review_tags, party_tags)
    review_tag_hits = len(ctx.review_tags & party_tags)

    activity = _activity_score(party.event_date_ts, now_ts)

    max_members = party.max_members or 4
    spots_left = max(0, max_members - member_count)
    fill_rate = (spots_left / max_members) if max_members > 0 else 0.0

    raw = (
        interest_overlap * W_INTEREST
        + city_compatibility * W_CITY
        + review_overlap * W_REVIEW_TAGS
        + activity * W_ACTIVITY
        + fill_rate * W_FILL
    )
    score = int(round(raw * 100))

    reasons = _reasons(
        interest_hits=interest_hits,
        same_city=same_city,
        review_tag_hits=review_tag_hits,
        event_date_ts=party.event_date_ts,
        now_ts=now_ts,
        spots_left=spots_left,
    )

    return PartyScore(
        party=party,
        member_count=member_count,
        members=members,
        score=score,
        reasons=reasons,
    )


# ─── Candidate fetch ──────────────────────────────────────────────────────────


def fetch_candidate_parties(db: Session, user_id: int) -> list[EventParty]:
    """Open, future, not-yet-joined parties."""
    now_ts = int(time.time())

    joined_ids = {
        row[0]
        for row in db.query(PartyMember.party_id)
        .filter(
            PartyMember.user_id == user_id,
            PartyMember.status.in_(["pending", "accepted"]),
        )
        .all()
    }

    q = db.query(EventParty).filter(
        EventParty.is_open.is_(True),
        EventParty.creator_id != user_id,
    )
    q = q.filter(
        (EventParty.event_date_ts.is_(None)) | (EventParty.event_date_ts >= now_ts)
    )
    if joined_ids:
        q = q.filter(~EventParty.id.in_(joined_ids))
    return q.all()


def collect_members(
    db: Session, party_ids: Iterable[int]
) -> dict[int, list[User]]:
    """Return {party_id: [accepted members incl. creator]}."""
    ids = list(party_ids)
    if not ids:
        return {}

    rows = (
        db.query(PartyMember.party_id, User)
        .join(User, User.id == PartyMember.user_id)
        .filter(
            PartyMember.party_id.in_(ids),
            PartyMember.status == "accepted",
        )
        .all()
    )
    out: dict[int, list[User]] = {pid: [] for pid in ids}
    for pid, u in rows:
        out[pid].append(u)

    creators = (
        db.query(EventParty.id, User)
        .join(User, User.id == EventParty.creator_id)
        .filter(EventParty.id.in_(ids))
        .all()
    )
    for pid, creator in creators:
        if not any(m.id == creator.id for m in out[pid]):
            out[pid].append(creator)
    return out


# ─── Public API ───────────────────────────────────────────────────────────────


def compute_recommendations(
    db: Session, user: User, limit: int, offset: int
) -> list[dict]:
    ctx = build_user_context(db, user)
    parties = fetch_candidate_parties(db, user.id)
    if not parties:
        return []

    members_by_party = collect_members(db, [p.id for p in parties])
    now_ts = int(time.time())

    scored: list[PartyScore] = []
    for p in parties:
        members = members_by_party.get(p.id, [])
        scored.append(
            score_party(
                db=db,
                ctx=ctx,
                party=p,
                members=members,
                member_count=len(members),
                now_ts=now_ts,
            )
        )

    # Hide parties that are already full or scored zero
    scored = [s for s in scored if s.score > 0 and s.member_count < (s.party.max_members or 4)]
    scored.sort(key=lambda s: s.score, reverse=True)
    page = scored[offset : offset + limit]

    return [_serialize(s) for s in page]


def _serialize(s: PartyScore) -> dict:
    max_members = s.party.max_members or 4
    return {
        "party_id": s.party.id,
        "event_id": s.party.event_id,
        "event_title": s.party.event_title or s.party.title,
        "event_date_ts": s.party.event_date_ts,
        "event_image": s.party.event_image_url,
        "match_score": s.score,
        "match_reasons": s.reasons,
        "members_preview": [
            {
                "user_id": m.id,
                "username": m.username,
                "avatar": m.avatar_url,
            }
            for m in s.members[:3]
        ],
        "spots_left": max(0, max_members - s.member_count),
        "total_spots": max_members,
        "member_count": s.member_count,
    }
