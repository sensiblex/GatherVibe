"""TDD tests for scripts.rebuild_embeddings — bulk computes and stores vectors."""
import json
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models.user import User
from models.kudago_event import KudaGoEvent
from models.embedding import EntityEmbedding
from services import embeddings
from scripts import rebuild_embeddings


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def stub_embed(monkeypatch):
    """Deterministic fake vector per input text."""
    def _fake(text, *, is_query=False):
        import hashlib
        h = hashlib.sha256(text.encode("utf-8")).digest()
        raw = [(b - 128) / 128.0 for b in h[:4]]
        norm = sum(x * x for x in raw) ** 0.5 or 1.0
        return [x / norm for x in raw]
    monkeypatch.setattr(embeddings, "embed_text", _fake)
    return _fake


def _mk_user(db, uid=1, **kw):
    defaults = dict(
        email=f"u{uid}@x", username=f"u{uid}", hashed_password="x",
        city="msk", interests="concert",
    )
    defaults.update(kw)
    u = User(id=uid, **defaults)
    db.add(u); db.commit(); return u


def _mk_event(db, kid=1, **kw):
    ev = KudaGoEvent(
        kudago_id=kid, location=kw.get("location", "msk"),
        title=kw.get("title", f"Event {kid}"),
        title_lower=kw.get("title", f"Event {kid}").lower(),
        description=kw.get("description", ""),
        categories=json.dumps(kw.get("categories", [])),
        tags=json.dumps([]), is_free=True,
        start_ts=kw.get("start_ts", 0),
    )
    db.add(ev); db.commit(); return ev




def test_rebuild_users_creates_embeddings(db, stub_embed):
    _mk_user(db, 1, interests="concert,cinema")
    _mk_user(db, 2, interests="sport")
    stats = rebuild_embeddings.rebuild_users(db)
    assert stats["processed"] == 2
    assert db.query(EntityEmbedding).filter_by(entity_type="user").count() == 2


def test_rebuild_users_updates_embedding_updated_at(db, stub_embed):
    u = _mk_user(db, 1, interests="concert")
    rebuild_embeddings.rebuild_users(db)
    db.refresh(u)
    assert u.embedding_updated_at is not None


def test_rebuild_users_skips_if_unchanged(db, stub_embed):
    """If skip_fresh=True, already-embedded users are skipped."""
    _mk_user(db, 1, interests="concert")
    rebuild_embeddings.rebuild_users(db)
    stats = rebuild_embeddings.rebuild_users(db, skip_fresh=True)
    assert stats["processed"] == 0
    assert stats["skipped"] == 1


def test_rebuild_users_force_reprocesses(db, stub_embed):
    _mk_user(db, 1, interests="concert")
    rebuild_embeddings.rebuild_users(db)
    stats = rebuild_embeddings.rebuild_users(db, skip_fresh=False)
    assert stats["processed"] == 1




def test_rebuild_events_creates_embeddings(db, stub_embed):
    _mk_event(db, 1, categories=["concert"])
    _mk_event(db, 2, categories=["sport"])
    stats = rebuild_embeddings.rebuild_events(db)
    assert stats["processed"] == 2
    assert db.query(EntityEmbedding).filter_by(entity_type="event").count() == 2


def test_rebuild_events_skips_fresh(db, stub_embed):
    _mk_event(db, 1, categories=["concert"])
    rebuild_embeddings.rebuild_events(db)
    stats = rebuild_embeddings.rebuild_events(db, skip_fresh=True)
    assert stats["processed"] == 0
    assert stats["skipped"] == 1


def test_rebuild_events_handles_empty_table(db, stub_embed):
    stats = rebuild_embeddings.rebuild_events(db)
    assert stats["processed"] == 0




def test_rebuild_all_returns_combined_stats(db, stub_embed):
    _mk_user(db, 1)
    _mk_user(db, 2)
    _mk_event(db, 1, categories=["concert"])
    stats = rebuild_embeddings.rebuild_all(db)
    assert stats["users"]["processed"] == 2
    assert stats["events"]["processed"] == 1




def test_main_accepts_entity_flag(monkeypatch, stub_embed):
    """--entity users|events|all selects which subset to rebuild."""
    calls: list[str] = []

    class FakeSession:
        def close(self): pass

    def fake_session_factory():
        return FakeSession()

    def fake_users(db, skip_fresh=True, batch=200):
        calls.append("users"); return {"processed": 0, "skipped": 0}

    def fake_events(db, skip_fresh=True, batch=200):
        calls.append("events"); return {"processed": 0, "skipped": 0}

    monkeypatch.setattr(rebuild_embeddings, "SessionLocal", fake_session_factory)
    monkeypatch.setattr(rebuild_embeddings, "rebuild_users", fake_users)
    monkeypatch.setattr(rebuild_embeddings, "rebuild_events", fake_events)

    rebuild_embeddings.main(["--entity", "users"])
    assert calls == ["users"]

    calls.clear()
    rebuild_embeddings.main(["--entity", "events"])
    assert calls == ["events"]

    calls.clear()
    rebuild_embeddings.main(["--entity", "all"])
    assert calls == ["users", "events"]
