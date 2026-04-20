"""TDD tests for services.people_matching — user-to-user recommendations."""
import os
import sys
import time
from datetime import date

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models.user import User
from models.attendee import EventAttendee
from services import embeddings, people_matching  # module doesn't exist yet


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
    def _embed(text, *, is_query=False):
        return [0.1, 0.1, 0.1, 0.1]
    monkeypatch.setattr(embeddings, "embed_text", _embed)
    return _embed


def _mk(db, uid, *, interests="", city="msk", birth_date=None,
        is_discoverable_on_events=True, trust_score=None):
    u = User(
        id=uid, email=f"u{uid}@x", username=f"u{uid}", hashed_password="x",
        city=city, interests=interests, birth_date=birth_date,
        is_discoverable_on_events=is_discoverable_on_events,
        trust_score=trust_score,
    )
    db.add(u); db.commit(); return u


# ─── similar_users ──────────────────────────────────────────────────────────


def test_recommend_similar_excludes_self(db, stub_embed):
    me = _mk(db, 1, interests="concert")
    _mk(db, 2, interests="concert")
    results = people_matching.recommend_similar_users(db, me, limit=10)
    ids = [r.user_id for r in results]
    assert 1 not in ids
    assert 2 in ids


def test_recommend_similar_ranks_by_interest_overlap(db, stub_embed):
    me = _mk(db, 1, interests="concert,cinema,yoga")
    _mk(db, 2, interests="concert,cinema,yoga")   # full overlap
    _mk(db, 3, interests="concert")                # partial
    _mk(db, 4, interests="sport,business")         # no overlap
    results = people_matching.recommend_similar_users(db, me, limit=10, city_only=False)
    scores = {r.user_id: r.score for r in results}
    assert scores[2] > scores[3]
    # user 4 likely not returned (score 0 or very low) — ok either way
    assert scores.get(4, 0) <= scores[3]


def test_recommend_similar_city_only_filter(db, stub_embed):
    me = _mk(db, 1, interests="concert", city="msk")
    _mk(db, 2, interests="concert", city="msk")
    _mk(db, 3, interests="concert", city="spb")
    results = people_matching.recommend_similar_users(db, me, limit=10, city_only=True)
    ids = [r.user_id for r in results]
    assert 2 in ids
    assert 3 not in ids


def test_mutual_events_boost(db, stub_embed):
    """Two users who attended the same event get boost vs stranger."""
    me = _mk(db, 1, interests="concert")
    friend = _mk(db, 2, interests="concert")
    stranger = _mk(db, 3, interests="concert")
    db.add_all([
        EventAttendee(event_id="e1", user_id=1),
        EventAttendee(event_id="e1", user_id=2),
    ])
    db.commit()
    results = people_matching.recommend_similar_users(db, me, limit=10, city_only=False)
    scores = {r.user_id: r.score for r in results}
    assert scores[2] > scores[3]


def test_respects_limit(db, stub_embed):
    me = _mk(db, 1, interests="concert")
    for i in range(2, 12):
        _mk(db, i, interests="concert")
    results = people_matching.recommend_similar_users(db, me, limit=3, city_only=False)
    assert len(results) == 3


# ─── event_peers ────────────────────────────────────────────────────────────


def test_peers_require_opt_in(db, stub_embed):
    """Users who set is_discoverable_on_events=False must not appear as peers."""
    me = _mk(db, 1, interests="concert", is_discoverable_on_events=True)
    public_peer = _mk(db, 2, interests="concert", is_discoverable_on_events=True)
    hidden_peer = _mk(db, 3, interests="concert", is_discoverable_on_events=False)

    db.add_all([
        EventAttendee(event_id="e1", user_id=1),
        EventAttendee(event_id="e1", user_id=2),
        EventAttendee(event_id="e1", user_id=3),
    ])
    db.commit()

    results = people_matching.recommend_event_peers(db, me, event_id="e1", limit=10)
    ids = [r.user_id for r in results]
    assert 2 in ids
    assert 3 not in ids
    assert 1 not in ids  # self excluded


def test_peers_only_from_same_event(db, stub_embed):
    me = _mk(db, 1, interests="concert")
    same_evt = _mk(db, 2, interests="concert")
    diff_evt = _mk(db, 3, interests="concert")
    db.add_all([
        EventAttendee(event_id="e1", user_id=1),
        EventAttendee(event_id="e1", user_id=2),
        EventAttendee(event_id="e2", user_id=3),
    ])
    db.commit()
    results = people_matching.recommend_event_peers(db, me, event_id="e1", limit=10)
    ids = [r.user_id for r in results]
    assert 2 in ids
    assert 3 not in ids


def test_peers_empty_when_no_attendees(db, stub_embed):
    me = _mk(db, 1)
    results = people_matching.recommend_event_peers(db, me, event_id="ghost", limit=10)
    assert results == []


# ─── Serialization / reasons ────────────────────────────────────────────────


def test_result_has_required_fields(db, stub_embed):
    me = _mk(db, 1, interests="concert")
    _mk(db, 2, interests="concert")
    results = people_matching.recommend_similar_users(db, me, limit=5, city_only=False)
    r = results[0]
    assert r.user_id == 2
    assert isinstance(r.score, int)
    assert 0 <= r.score <= 100
    assert isinstance(r.reasons, list)
    assert r.user is not None
