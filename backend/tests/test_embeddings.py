"""Tests for services.embeddings — TDD-first.

Uses in-memory SQLite. Avoid loading real sentence-transformers model in unit
tests (slow, downloads 118MB). Tests that need a vector use a monkey-patched
`embed_text` that returns deterministic fake vectors.
"""
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
from models.embedding import EntityEmbedding
from services import embeddings




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
def fake_embed(monkeypatch):
    """Deterministic 4-dim vectors based on text content — no ML model needed."""
    def _fake(text, *, is_query=False):
        import hashlib
        h = hashlib.sha256(text.encode("utf-8")).digest()
        raw = [(b - 128) / 128.0 for b in h[:4]]
        norm = sum(x * x for x in raw) ** 0.5 or 1.0
        return [x / norm for x in raw]

    monkeypatch.setattr(embeddings, "embed_text", _fake)
    monkeypatch.setattr(embeddings, "EMBEDDING_DIM", 4)
    return _fake




def test_compose_user_text_combines_fields():
    u = User(id=1, email="a@b", username="alex", hashed_password="x",
             bio="Люблю концерты", interests="concert,cinema", city="msk",
             preferred_categories="music,theater")
    text = embeddings.compose_user_text(u)
    assert "Люблю концерты" in text
    assert "concert" in text and "cinema" in text
    assert "music" in text and "theater" in text
    assert "msk" in text


def test_compose_user_text_empty_user_falls_back_to_username():
    u = User(id=1, email="a@b", username="alex", hashed_password="x")
    text = embeddings.compose_user_text(u)
    assert text == "alex"




def test_compose_event_text_with_json_fields():
    from types import SimpleNamespace
    ev = SimpleNamespace(
        title="Концерт Бориса Гребенщикова",
        description="Рок легенда",
        categories=json.dumps(["concert", "music"]),
        tags=json.dumps(["rock", "acoustic"]),
        kudago_id="12345",
    )
    text = embeddings.compose_event_text(ev)
    assert "Концерт" in text
    assert "concert" in text and "music" in text
    assert "rock" in text


def test_compose_event_text_handles_list_categories():
    from types import SimpleNamespace
    ev = SimpleNamespace(title="T", description="", categories=["concert"], tags=[], kudago_id="1")
    text = embeddings.compose_event_text(ev)
    assert "concert" in text


def test_compose_event_text_survives_malformed_json():
    from types import SimpleNamespace
    ev = SimpleNamespace(title="T", description="D", categories="{not json", tags="also bad", kudago_id="1")
    text = embeddings.compose_event_text(ev)
    assert "T" in text and "D" in text




def test_cosine_identical_vectors_is_one():
    v = [0.5, 0.5, 0.5, 0.5]
    assert abs(embeddings.cosine(v, v) - 1.0) < 1e-9


def test_cosine_orthogonal_is_zero():
    a = [1.0, 0.0, 0.0, 0.0]
    b = [0.0, 1.0, 0.0, 0.0]
    assert abs(embeddings.cosine(a, b)) < 1e-9


def test_cosine_mismatched_lengths_returns_zero():
    assert embeddings.cosine([1.0, 2.0], [1.0, 2.0, 3.0]) == 0.0


def test_cosine_empty_returns_zero():
    assert embeddings.cosine([], []) == 0.0




def test_upsert_then_get(db):
    embeddings.upsert_embedding(db, "user", "1", [0.1, 0.2, 0.3, 0.4])
    db.commit()
    vec = embeddings.get_embedding(db, "user", "1")
    assert vec == [0.1, 0.2, 0.3, 0.4]


def test_upsert_updates_existing(db):
    embeddings.upsert_embedding(db, "user", "1", [0.1, 0.2, 0.3, 0.4])
    db.commit()
    embeddings.upsert_embedding(db, "user", "1", [0.9, 0.9, 0.9, 0.9])
    db.commit()
    rows = db.query(EntityEmbedding).filter_by(entity_type="user", entity_id="1").all()
    assert len(rows) == 1
    assert embeddings.get_embedding(db, "user", "1") == [0.9, 0.9, 0.9, 0.9]


def test_get_embedding_missing_returns_none(db):
    assert embeddings.get_embedding(db, "user", "999") is None


def test_load_embeddings_bulk(db):
    embeddings.upsert_embedding(db, "event", "a", [1.0, 0, 0, 0])
    embeddings.upsert_embedding(db, "event", "b", [0, 1.0, 0, 0])
    embeddings.upsert_embedding(db, "user", "a", [0, 0, 1.0, 0])
    db.commit()
    result = embeddings.load_embeddings_bulk(db, "event", ["a", "b", "missing"])
    assert set(result.keys()) == {"a", "b"}
    assert result["a"] == [1.0, 0, 0, 0]




def test_find_similar_ranks_by_cosine(db):
    embeddings.upsert_embedding(db, "event", "close", [1.0, 0, 0, 0])
    embeddings.upsert_embedding(db, "event", "medium", [0.7, 0.7, 0, 0])
    embeddings.upsert_embedding(db, "event", "far", [0, 1.0, 0, 0])
    db.commit()
    results = embeddings.find_similar(db, "event", [1.0, 0, 0, 0], limit=10)
    ids_in_order = [eid for eid, _ in results]
    assert ids_in_order[0] == "close"
    assert ids_in_order[-1] == "far"


def test_find_similar_respects_exclude(db):
    embeddings.upsert_embedding(db, "event", "a", [1.0, 0, 0, 0])
    embeddings.upsert_embedding(db, "event", "b", [1.0, 0, 0, 0])
    db.commit()
    results = embeddings.find_similar(db, "event", [1.0, 0, 0, 0], exclude_ids=["a"])
    ids = [eid for eid, _ in results]
    assert "a" not in ids
    assert "b" in ids


def test_find_similar_respects_limit(db):
    for i in range(10):
        embeddings.upsert_embedding(db, "event", str(i), [1.0, 0, 0, 0])
    db.commit()
    results = embeddings.find_similar(db, "event", [1.0, 0, 0, 0], limit=3)
    assert len(results) == 3




def test_refresh_user_embedding_persists_vector(db, fake_embed):
    u = User(id=1, email="a@b", username="alex", hashed_password="x",
             interests="concert", city="msk")
    db.add(u); db.commit()
    embeddings.refresh_user_embedding(db, u)
    db.commit()
    vec = embeddings.get_embedding(db, "user", "1")
    assert vec is not None and len(vec) == 4
    assert u.embedding_updated_at is not None


def test_refresh_event_embedding_persists_vector(db, fake_embed):
    from types import SimpleNamespace
    ev = SimpleNamespace(
        title="Концерт", description="Рок",
        categories=json.dumps(["concert"]), tags=json.dumps(["rock"]),
        kudago_id="42",
    )
    embeddings.refresh_event_embedding(db, ev)
    db.commit()
    vec = embeddings.get_embedding(db, "event", "42")
    assert vec is not None and len(vec) == 4


def test_refresh_event_skips_when_id_missing(db, fake_embed):
    from types import SimpleNamespace
    ev = SimpleNamespace(title="T", description="", categories="", tags="", kudago_id=None, id=None)
    embeddings.refresh_event_embedding(db, ev)
    db.commit()
    assert db.query(EntityEmbedding).count() == 0
