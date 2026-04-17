"""Party recommendations endpoint.

Returns ranked party suggestions for the current user, computed via
services.matching. Results are cached per-user in-memory for 5 minutes to
avoid recomputing the O(parties × members) scoring on every page load.
"""
from __future__ import annotations

from datetime import datetime
from threading import Lock
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from deps import get_current_user_from_token, get_db, oauth2_scheme
from services.matching import compute_recommendations

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
