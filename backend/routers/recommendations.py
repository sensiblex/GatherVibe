"""Party recommendations endpoint.

Returns ranked party suggestions for the current user, computed via
services.matching. Results are cached per-user in-memory for 5 minutes to
avoid recomputing the O(parties × members) scoring on every page load.
"""
from __future__ import annotations

from datetime import datetime
from threading import Lock
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from deps import get_current_user_from_token, get_db, oauth2_scheme
from models.recommendation_impression import RecommendationImpression
from services.event_matching import recommend_events, serialize_event_rec
from services.matching import compute_recommendations
from services.people_matching import (
    recommend_event_peers,
    recommend_similar_users,
    serialize_user_rec,
)

router = APIRouter(tags=["recommendations"])


_CACHE_TTL_SECONDS = 300
_cache: dict[int, tuple[datetime, list[dict[str, Any]]]] = {}
_lock = Lock()


def _get_cached(user_id: int) -> list[dict[str, Any]] | None:
    with _lock:
        hit = _cache.get(user_id)
    if not hit:
        return None
    cached_at, data = hit
    if (datetime.now() - cached_at).total_seconds() >= _CACHE_TTL_SECONDS:
        with _lock:
            _cache.pop(user_id, None)
        return None
    return data


def _set_cached(user_id: int, data: list[dict[str, Any]]) -> None:
    with _lock:
        _cache[user_id] = (datetime.now(), data)


def invalidate_user_cache(user_id: int) -> None:
    with _lock:
        _cache.pop(user_id, None)


@router.get("/users/me/recommended-parties")
def get_recommended_parties(
    limit: int = Query(default=10, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    user = get_current_user_from_token(token, db)

    cached = _get_cached(user.id)
    if cached is not None:
        return cached[offset : offset + limit]

    full = compute_recommendations(db, user, limit=100, offset=0)
    _set_cached(user.id, full)
    return full[offset : offset + limit]


# ─── Event recommendations (Phase 3: event matching) ─────────────────────────

_event_cache: dict[int, tuple[datetime, list[dict[str, Any]]]] = {}
_event_lock = Lock()


def _get_cached_events(user_id: int) -> list[dict[str, Any]] | None:
    with _event_lock:
        hit = _event_cache.get(user_id)
    if not hit:
        return None
    cached_at, data = hit
    if (datetime.now() - cached_at).total_seconds() >= _CACHE_TTL_SECONDS:
        with _event_lock:
            _event_cache.pop(user_id, None)
        return None
    return data


def _set_cached_events(user_id: int, data: list[dict[str, Any]]) -> None:
    with _event_lock:
        _event_cache[user_id] = (datetime.now(), data)


def invalidate_user_event_cache(user_id: int) -> None:
    with _event_lock:
        _event_cache.pop(user_id, None)


@router.get("/users/me/recommended-events")
def get_recommended_events(
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    city: str | None = Query(default=None),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    user = get_current_user_from_token(token, db)

    if city is None:  # only cache default view
        cached = _get_cached_events(user.id)
        if cached is not None:
            return cached[offset : offset + limit]

    recs = recommend_events(db, user, limit=100, offset=0, city=city)
    full = [serialize_event_rec(r) for r in recs]
    if city is None:
        _set_cached_events(user.id, full)
    return full[offset : offset + limit]


# ─── People recommendations (Phase 4) ────────────────────────────────────────


@router.get("/users/me/similar-people")
def get_similar_people(
    limit: int = Query(default=20, ge=1, le=50),
    city_only: bool = Query(default=True),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    user = get_current_user_from_token(token, db)
    recs = recommend_similar_users(db, user, limit=limit, city_only=city_only)
    return [serialize_user_rec(r) for r in recs]


@router.get("/events/{event_id}/peers")
def get_event_peers(
    event_id: str,
    limit: int = Query(default=10, ge=1, le=30),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    user = get_current_user_from_token(token, db)
    recs = recommend_event_peers(db, user, event_id=event_id, limit=limit)
    return [serialize_user_rec(r) for r in recs]


# ─── Feedback loop (Phase 5) ─────────────────────────────────────────────────

_VALID_REC_TYPES = {"event", "person", "party"}
_VALID_ACTIONS = {"shown", "clicked", "dismissed", "liked", "disliked", "converted"}


class FeedbackPayload(BaseModel):
    rec_type: str = Field(pattern="^(event|person|party)$")
    target_id: str = Field(min_length=1, max_length=64)
    action: str = Field(pattern="^(shown|clicked|dismissed|liked|disliked|converted)$")
    score: int | None = Field(default=None, ge=0, le=100)
    surface: str | None = Field(default=None, max_length=30)


class ImpressionItem(BaseModel):
    rec_type: str = Field(pattern="^(event|person|party)$")
    target_id: str = Field(min_length=1, max_length=64)
    action: str = Field(pattern="^(shown|clicked|dismissed|liked|disliked|converted)$")
    score: int | None = Field(default=None, ge=0, le=100)
    surface: str | None = Field(default=None, max_length=30)


class ImpressionsBatch(BaseModel):
    items: list[ImpressionItem] = Field(default_factory=list, max_length=200)


@router.post("/recommendations/feedback")
def post_feedback(
    payload: FeedbackPayload,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    user = get_current_user_from_token(token, db)
    row = RecommendationImpression(
        user_id=user.id,
        rec_type=payload.rec_type,
        target_id=payload.target_id,
        action=payload.action,
        score=payload.score,
        surface=payload.surface,
    )
    db.add(row)
    db.commit()

    # Invalidate caches so dismissed items drop out immediately.
    if payload.action in {"dismissed", "disliked", "converted"}:
        if payload.rec_type == "event":
            invalidate_user_event_cache(user.id)
        elif payload.rec_type == "party":
            invalidate_user_cache(user.id)

    return {"ok": True}


@router.post("/recommendations/impressions")
def post_impressions(
    batch: ImpressionsBatch,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    user = get_current_user_from_token(token, db)
    rows = [
        RecommendationImpression(
            user_id=user.id,
            rec_type=it.rec_type,
            target_id=it.target_id,
            action=it.action,
            score=it.score,
            surface=it.surface,
        )
        for it in batch.items
    ]
    if rows:
        db.add_all(rows)
        db.commit()
    return {"ok": True, "recorded": len(rows)}
