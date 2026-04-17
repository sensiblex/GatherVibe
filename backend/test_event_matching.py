"""TDD tests for services.event_matching.

Focus on the scoring contract, filters, and reasons — not on the ML model.
Embedding calls are stubbed via monkeypatch so tests are fast and deterministic.
"""
import json
import os
import sys
import time
from datetime import date

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
sys.path.insert(0, os.path.dirname(__file__))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models.user import User
from models.kudago_event import KudaGoEvent
from models.attendee import EventAttendee
from models.recommendation_impression import RecommendationImpression
from services import embeddings, event_matching  # event_matching doesn't exist yet → test fails


# ─── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def stub_embed(monkeypatch):
    """Returns a tunable vector source — same text → same vector."""
    registry: dict[str, list[float]] = {}

    def _embed(text, *, is_query=False):
        return registry.get(text, [0.1, 0.1, 0.1, 0.1])

    monkeypatch.setattr(embeddings, "embed_text", _embed)
    return registry


def _mk_user(db, uid=1, **kw):
    defaults = dict(
        email=f"u{uid}@x", username=f"u{uid}", hashed_password="x",
        city="msk", interests="concert,cinema",
    )
    defaults.update(kw)
    u = User(id=uid, **defaults)
    db.add(u); db.commit(); return u


def _mk_event(db, kid: int, *, title="Event", categories=None, tags=None,
              location="msk", start_offset_days=5, is_free=True, price="",
              age_restriction=0, lat=None, lon=None, favorites_count=0):
    now = int(time.time())
    ev = KudaGoEvent(
        kudago_id=kid, location=location, title=title,
        title_lower=title.lower(), description=f"desc {kid}",
        categories=json.dumps(categories or []),
        tags=json.dumps(tags or []),
        is_free=is_free, price=price, age_restriction=age_restriction,
        lat=lat, lon=lon, favorites_count=favorites_count,
        start_ts=now + start_offset_days * 86400,
        end_ts=now + start_offset_days * 86400 + 3600,
    )
    db.add(ev); db.commit(); return ev


# ─── Core scoring contract ──────────────────────────────────────────────────


def test_recommend_returns_empty_for_no_events(db, stub_embed):
    u = _mk_user(db)
    result = event_matching.recommend_events(db, u, limit=10)
    assert result == []


def test_recommend_excludes_past_events(db, stub_embed):
    u = _mk_user(db)
    _mk_event(db, 1, start_offset_days=-1)  # past
    _mk_event(db, 2, start_offset_days=2)   # future
    result = event_matching.recommend_events(db, u, limit=10)
    ids = [r.event_id for r in result]
    assert "1" not in ids
    assert "2" in ids


def test_recommend_scores_in_0_100_range(db, stub_embed):
    u = _mk_user(db)
    _mk_event(db, 1, categories=["concert"], start_offset_days=2)
    result = event_matching.recommend_events(db, u, limit=10)
    assert len(result) == 1
    assert 0 <= result[0].score <= 100


def test_recommend_returns_sorted_desc(db, stub_embed):
    u = _mk_user(db, interests="concert")
    _mk_event(db, 1, title="A", categories=["concert"], start_offset_days=2)
    _mk_event(db, 2, title="B", categories=["sport"], start_offset_days=2)
    result = event_matching.recommend_events(db, u, limit=10)
    scores = [r.score for r in result]
    assert scores == sorted(scores, reverse=True)


def test_recommend_respects_limit(db, stub_embed):
    u = _mk_user(db)
    for i in range(1, 11):
        _mk_event(db, i, categories=["concert"], start_offset_days=i)
    result = event_matching.recommend_events(db, u, limit=3)
    assert len(result) == 3


# ─── Age restriction (hard filter) ──────────────────────────────────────────


def test_recommend_blocks_underage_user(db, stub_embed):
    u = _mk_user(db, birth_date=date(2015, 1, 1))  # ~10 years old in 2026
    _mk_event(db, 1, age_restriction=18, start_offset_days=3)
    _mk_event(db, 2, age_restriction=0, start_offset_days=3)
    result = event_matching.recommend_events(db, u, limit=10)
    ids = [r.event_id for r in result]
    assert "1" not in ids
    assert "2" in ids


def test_recommend_without_birthdate_does_not_block_18plus(db, stub_embed):
    """No birth_date → treat as adult (can't block people who opt out of disclosing age)."""
    u = _mk_user(db, birth_date=None)
    _mk_event(db, 1, age_restriction=18, start_offset_days=3)
    result = event_matching.recommend_events(db, u, limit=10)
    assert len(result) == 1


# ─── Interest/category matching boosts score ─────────────────────────────────


def test_matching_categories_beat_non_matching(db, stub_embed):
    u = _mk_user(db, interests="concert,cinema")
    m = _mk_event(db, 1, title="match", categories=["concert"], start_offset_days=3)
    n = _mk_event(db, 2, title="nomatch", categories=["lecture"], start_offset_days=3)
    result = event_matching.recommend_events(db, u, limit=10)
    scores = {r.event_id: r.score for r in result}
    assert scores["1"] > scores["2"]


# ─── City filter ────────────────────────────────────────────────────────────


def test_city_filter_excludes_other_cities(db, stub_embed):
    u = _mk_user(db, city="msk")
    _mk_event(db, 1, location="msk", start_offset_days=3)
    _mk_event(db, 2, location="spb", start_offset_days=3)
    result = event_matching.recommend_events(db, u, limit=10, city="msk")
    ids = [r.event_id for r in result]
    assert ids == ["1"]


# ─── Reasons (human-readable) ───────────────────────────────────────────────


def test_reasons_include_interest_hit(db, stub_embed):
    u = _mk_user(db, interests="concert")
    _mk_event(db, 1, categories=["concert"], start_offset_days=2)
    result = event_matching.recommend_events(db, u, limit=10)
    reasons_joined = " ".join(result[0].reasons)
    assert any("интерес" in r.lower() or "concert" in r.lower() or "🎭" in r or "🎯" in r
               for r in result[0].reasons)


def test_reasons_include_soon_indicator(db, stub_embed):
    u = _mk_user(db)
    _mk_event(db, 1, categories=["concert"], start_offset_days=0)
    result = event_matching.recommend_events(db, u, limit=10)
    assert any("🔥" in r or "Сегодня" in r for r in result[0].reasons)


def test_reasons_max_three(db, stub_embed):
    u = _mk_user(db, interests="concert", city="msk")
    _mk_event(db, 1, categories=["concert"], location="msk",
              favorites_count=10000, start_offset_days=0)
    result = event_matching.recommend_events(db, u, limit=10)
    assert len(result[0].reasons) <= 3


# ─── Feedback suppression ──────────────────────────────────────────────────


def test_dismissed_events_are_excluded(db, stub_embed):
    u = _mk_user(db)
    _mk_event(db, 1, categories=["concert"], start_offset_days=3)
    _mk_event(db, 2, categories=["concert"], start_offset_days=3)
    # user dismissed event 1
    db.add(RecommendationImpression(
        user_id=u.id, rec_type="event", target_id="1", action="dismissed"))
    db.commit()
    result = event_matching.recommend_events(db, u, limit=10)
    ids = [r.event_id for r in result]
    assert "1" not in ids
    assert "2" in ids


def test_attended_events_are_excluded(db, stub_embed):
    u = _mk_user(db)
    _mk_event(db, 1, categories=["concert"], start_offset_days=3)
    _mk_event(db, 2, categories=["concert"], start_offset_days=3)
    db.add(EventAttendee(event_id="1", user_id=u.id, is_looking=True))
    db.commit()
    result = event_matching.recommend_events(db, u, limit=10)
    ids = [r.event_id for r in result]
    assert "1" not in ids


# ─── History affinity boost ─────────────────────────────────────────────────


def test_history_boost_favors_previously_attended_category(db, stub_embed):
    u = _mk_user(db, interests="")  # no explicit interests
    # User historically attended concerts
    db.add(EventAttendee(event_id="old1", user_id=u.id, event_category="concert"))
    db.add(EventAttendee(event_id="old2", user_id=u.id, event_category="concert"))
    db.commit()
    _mk_event(db, 1, categories=["concert"], start_offset_days=3)
    _mk_event(db, 2, categories=["lecture"], start_offset_days=3)
    result = event_matching.recommend_events(db, u, limit=10)
    scores = {r.event_id: r.score for r in result}
    assert scores["1"] > scores["2"]


# ─── Serialization ──────────────────────────────────────────────────────────


def test_recommendation_has_all_required_fields(db, stub_embed):
    u = _mk_user(db)
    _mk_event(db, 1, categories=["concert"], start_offset_days=3,
              favorites_count=42)
    result = event_matching.recommend_events(db, u, limit=10)
    r = result[0]
    assert r.event_id == "1"
    assert isinstance(r.score, int)
    assert isinstance(r.reasons, list)
    assert r.event is not None  # raw KudaGoEvent attached for serialization
