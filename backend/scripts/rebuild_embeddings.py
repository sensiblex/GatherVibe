"""Bulk rebuild of user and event embeddings.

Usage:
    python -m scripts.rebuild_embeddings --entity all
    python -m scripts.rebuild_embeddings --entity users --force
    python -m scripts.rebuild_embeddings --entity events --batch 200

By default, already-embedded entities (embedding row exists with current model
version) are skipped; pass --force to reprocess everything.
"""
from __future__ import annotations

import argparse
import logging
import sys
import time
from typing import Iterable

from sqlalchemy.orm import Session

from database import SessionLocal
from models.embedding import EntityEmbedding
from models.kudago_event import KudaGoEvent
from models.user import User
from services import embeddings

log = logging.getLogger(__name__)


def _existing_ids(db: Session, entity_type: str, model_version: str) -> set[str]:
    rows = (
        db.query(EntityEmbedding.entity_id)
        .filter(
            EntityEmbedding.entity_type == entity_type,
            EntityEmbedding.model_version == model_version,
        )
        .all()
    )
    return {r[0] for r in rows}


def rebuild_users(
    db: Session, *, skip_fresh: bool = True, batch: int = 200
) -> dict[str, int]:
    existing = _existing_ids(db, "user", embeddings.MODEL_VERSION) if skip_fresh else set()
    stats = {"processed": 0, "skipped": 0, "errors": 0}
    users = db.query(User).all()

    buffered = 0
    for u in users:
        if skip_fresh and str(u.id) in existing:
            stats["skipped"] += 1
            continue
        try:
            embeddings.refresh_user_embedding(db, u)
            stats["processed"] += 1
            buffered += 1
            if buffered >= batch:
                db.commit()
                buffered = 0
        except Exception as exc:  # noqa: BLE001
            stats["errors"] += 1
            log.warning("user %s failed: %s", u.id, exc)
            db.rollback()

    if buffered:
        db.commit()
    return stats


def rebuild_events(
    db: Session, *, skip_fresh: bool = True, batch: int = 200
) -> dict[str, int]:
    existing = _existing_ids(db, "event", embeddings.MODEL_VERSION) if skip_fresh else set()
    stats = {"processed": 0, "skipped": 0, "errors": 0}
    events = db.query(KudaGoEvent).all()

    buffered = 0
    for ev in events:
        if skip_fresh and str(ev.kudago_id) in existing:
            stats["skipped"] += 1
            continue
        try:
            embeddings.refresh_event_embedding(db, ev)
            stats["processed"] += 1
            buffered += 1
            if buffered >= batch:
                db.commit()
                buffered = 0
        except Exception as exc:  # noqa: BLE001
            stats["errors"] += 1
            log.warning("event %s failed: %s", ev.kudago_id, exc)
            db.rollback()

    if buffered:
        db.commit()
    return stats


def rebuild_all(db: Session, *, skip_fresh: bool = True, batch: int = 200) -> dict[str, dict]:
    return {
        "users": rebuild_users(db, skip_fresh=skip_fresh, batch=batch),
        "events": rebuild_events(db, skip_fresh=skip_fresh, batch=batch),
    }


# ─── CLI ─────────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Rebuild embeddings for matching system")
    parser.add_argument("--entity", choices=["users", "events", "all"], default="all")
    parser.add_argument("--force", action="store_true",
                        help="Reprocess entities that already have current-version embeddings")
    parser.add_argument("--batch", type=int, default=200,
                        help="Commit every N embeddings (default: 200)")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    skip_fresh = not args.force
    db = SessionLocal()
    start = time.monotonic()
    try:
        log.info("Starting rebuild (entity=%s, force=%s, batch=%d)",
                 args.entity, args.force, args.batch)
        if args.entity in ("users", "all"):
            stats = rebuild_users(db, skip_fresh=skip_fresh, batch=args.batch)
            log.info("Users: %s", stats)
        if args.entity in ("events", "all"):
            stats = rebuild_events(db, skip_fresh=skip_fresh, batch=args.batch)
            log.info("Events: %s", stats)
    finally:
        db.close()

    log.info("Done in %.1fs", time.monotonic() - start)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
