"""Embedding service for matching system.

Uses `intfloat/multilingual-e5-small` (118MB, 384-dim, CPU-friendly, RU-capable).
E5 convention: prefix user/query text with "query: ", event/passage text with "passage: ".

Storage: `entity_embeddings` table, JSON-encoded list[float] in `embedding_json`
(SQLite-compatible; future upgrade path to pgvector keeps the same table).
"""
from __future__ import annotations

import json
import math
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy.orm import Session

from models.embedding import EntityEmbedding

MODEL_NAME = "intfloat/multilingual-e5-small"
MODEL_VERSION = "e5-small-v2"
EMBEDDING_DIM = 384

_model = None
_model_lock = threading.Lock()


def _load_model():
    """Lazy singleton load — keeps test startup fast."""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from sentence_transformers import SentenceTransformer
                _model = SentenceTransformer(MODEL_NAME)
    return _model


# ─── Core embedding API ──────────────────────────────────────────────────────


def embed_text(text: str, *, is_query: bool = False) -> list[float]:
    """Return 384-dim embedding for arbitrary text.

    E5 models need prefixes: 'query: ' for user input, 'passage: ' for documents.
    """
    if not text or not text.strip():
        return [0.0] * EMBEDDING_DIM
    prefix = "query: " if is_query else "passage: "
    model = _load_model()
    vec = model.encode(prefix + text.strip(), normalize_embeddings=True)
    return [float(x) for x in vec.tolist()]


def cosine(a: list[float], b: list[float]) -> float:
    """Cosine similarity. Vectors are normalized by encode(), so dot product suffices."""
    if len(a) != len(b) or not a:
        return 0.0
    # normalize_embeddings=True → dot product == cosine
    return sum(x * y for x, y in zip(a, b))


# ─── User / Event text composition ───────────────────────────────────────────


def compose_user_text(user) -> str:
    """Flatten user profile fields into a single text blob for embedding."""
    parts: list[str] = []
    if user.bio:
        parts.append(user.bio)
    if user.interests:
        parts.append("интересы: " + user.interests.replace(",", ", "))
    if user.preferred_categories:
        parts.append("категории: " + user.preferred_categories.replace(",", ", "))
    if user.city:
        parts.append("город: " + user.city)
    return " | ".join(parts) or (user.username or "")


def compose_event_text(event) -> str:
    """KudaGoEvent → text blob. Works with either KudaGoEvent or dict-like."""
    title = getattr(event, "title", None) or ""
    description = getattr(event, "description", None) or ""
    categories_raw = getattr(event, "categories", None) or ""
    tags_raw = getattr(event, "tags", None) or ""

    def _decode_json_field(raw):
        if not raw:
            return []
        if isinstance(raw, list):
            return raw
        try:
            data = json.loads(raw)
            return data if isinstance(data, list) else []
        except (json.JSONDecodeError, TypeError):
            return []

    cats = _decode_json_field(categories_raw)
    tags = _decode_json_field(tags_raw)

    parts = [title, description]
    if cats:
        parts.append("категории: " + ", ".join(cats))
    if tags:
        parts.append("теги: " + ", ".join(tags))
    return " | ".join(p for p in parts if p)


# ─── Persistence ─────────────────────────────────────────────────────────────


@dataclass
class EmbeddingRecord:
    entity_type: str
    entity_id: str
    vector: list[float]


def upsert_embedding(db: Session, entity_type: str, entity_id: str, vector: list[float]) -> None:
    """Insert or update embedding row. Commits are caller's responsibility."""
    row = (
        db.query(EntityEmbedding)
        .filter(
            EntityEmbedding.entity_type == entity_type,
            EntityEmbedding.entity_id == str(entity_id),
        )
        .one_or_none()
    )
    payload = json.dumps(vector)
    now = datetime.now(timezone.utc)
    if row is None:
        row = EntityEmbedding(
            entity_type=entity_type,
            entity_id=str(entity_id),
            embedding_json=payload,
            model_version=MODEL_VERSION,
            updated_at=now,
        )
        db.add(row)
    else:
        row.embedding_json = payload
        row.model_version = MODEL_VERSION
        row.updated_at = now


def get_embedding(db: Session, entity_type: str, entity_id: str) -> list[float] | None:
    row = (
        db.query(EntityEmbedding)
        .filter(
            EntityEmbedding.entity_type == entity_type,
            EntityEmbedding.entity_id == str(entity_id),
        )
        .one_or_none()
    )
    if row is None:
        return None
    try:
        vec = json.loads(row.embedding_json)
        return vec if isinstance(vec, list) else None
    except (json.JSONDecodeError, TypeError):
        return None


def load_embeddings_bulk(
    db: Session, entity_type: str, entity_ids: Iterable[str]
) -> dict[str, list[float]]:
    ids = [str(x) for x in entity_ids]
    if not ids:
        return {}
    rows = (
        db.query(EntityEmbedding.entity_id, EntityEmbedding.embedding_json)
        .filter(
            EntityEmbedding.entity_type == entity_type,
            EntityEmbedding.entity_id.in_(ids),
        )
        .all()
    )
    out: dict[str, list[float]] = {}
    for eid, payload in rows:
        try:
            vec = json.loads(payload)
            if isinstance(vec, list):
                out[eid] = vec
        except (json.JSONDecodeError, TypeError):
            continue
    return out


def find_similar(
    db: Session,
    entity_type: str,
    query_vector: list[float],
    *,
    limit: int = 50,
    exclude_ids: Iterable[str] | None = None,
) -> list[tuple[str, float]]:
    """Brute-force cosine search over stored embeddings of `entity_type`.

    Returns [(entity_id, similarity), ...] sorted desc.
    For N>10K entities, switch to pgvector ivfflat index (same table).
    """
    exclude = {str(x) for x in (exclude_ids or [])}
    rows = (
        db.query(EntityEmbedding.entity_id, EntityEmbedding.embedding_json)
        .filter(EntityEmbedding.entity_type == entity_type)
        .all()
    )
    scored: list[tuple[str, float]] = []
    for eid, payload in rows:
        if eid in exclude:
            continue
        try:
            vec = json.loads(payload)
        except (json.JSONDecodeError, TypeError):
            continue
        if not isinstance(vec, list) or len(vec) != len(query_vector):
            continue
        scored.append((eid, cosine(query_vector, vec)))
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:limit]


# ─── High-level helpers ──────────────────────────────────────────────────────


def refresh_user_embedding(db: Session, user) -> None:
    """Recompute and store embedding for a user. Caller commits."""
    text = compose_user_text(user)
    vec = embed_text(text, is_query=True)
    upsert_embedding(db, "user", str(user.id), vec)
    if hasattr(user, "embedding_updated_at"):
        user.embedding_updated_at = datetime.now(timezone.utc)


def refresh_event_embedding(db: Session, event) -> None:
    """Recompute and store embedding for a KudaGo event. Caller commits."""
    text = compose_event_text(event)
    vec = embed_text(text, is_query=False)
    raw_id = getattr(event, "kudago_id", None) or getattr(event, "id", None)
    if raw_id is None or raw_id == "":
        return
    upsert_embedding(db, "event", str(raw_id), vec)
