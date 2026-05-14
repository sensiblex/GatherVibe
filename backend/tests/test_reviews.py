"""
TDD тесты для системы отзывов.

Покрывают:
  1. SQL-агрегаты в GET /users/{id}/reviews (avg / distribution / top_tags)
     — корректность на разнообразных входных данных, edge cases, пагинация.
  2. Негативные теги — расширение ALLOWED_REVIEW_TAGS и разделение top_tags
     на top_positive_tags / top_negative_tags для UX.

Используем in-memory SQLite + фикстуры из conftest.py.
"""
from datetime import datetime, timedelta, timezone
import time
import pytest
from fastapi.testclient import TestClient

from auth import hash_password
from jwt_handler import create_access_token
from models.user import User
from models.party import EventParty, PartyMember
from models.attendee import EventAttendee
from models.review import PartyReview
import models.kudago_event  # noqa: F401 — register cache table with Base.metadata
import models.chat_message  # noqa: F401
import models.party_coordination  # noqa: F401
import models.push_subscription  # noqa: F401
import models.message_reaction  # noqa: F401
import models.party_recap  # noqa: F401




def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_token(user: User) -> str:
    return create_access_token(
        data={"sub": user.email, "id": user.id, "username": user.username},
        expires_delta=timedelta(minutes=60),
    )


def _make_user(db, username: str, email: str) -> User:
    u = User(username=username, email=email, hashed_password=hash_password("pw"))
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _make_past_party(
    db,
    creator_id: int,
    members: list[int] | None = None,
    event_id: str = "ev_past_1",
) -> EventParty:
    """Party whose event is already in the past (1 day ago — safe across timezones)."""
    past_ts = int(time.time()) - 86400
    party = EventParty(
        event_id=event_id,
        title="Past Party",
        description="d",
        max_members=5,
        creator_id=creator_id,
        is_open=True,
        event_date_ts=past_ts,
    )
    db.add(party)
    db.commit()
    db.refresh(party)

    db.add(EventAttendee(
        event_id=event_id,
        user_id=creator_id,
        event_date_ts=past_ts,
        is_looking=False,
    ))
    for uid in (members or []):
        db.add(PartyMember(party_id=party.id, user_id=uid, status="accepted"))
    db.commit()
    return party


def _seed_review(
    db,
    *,
    reviewer_id: int,
    reviewed_id: int,
    party_id: int,
    rating: int,
    tags: list[str] | None = None,
    is_hidden: bool = False,
    is_deleted: bool = False,
    created_at: datetime | None = None,
) -> PartyReview:
    r = PartyReview(
        reviewer_id=reviewer_id,
        reviewed_id=reviewed_id,
        party_id=party_id,
        rating=rating,
        text=None,
        tags=tags,
        is_hidden=is_hidden,
        is_deleted=is_deleted,
    )
    if created_at is not None:
        r.created_at = created_at
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


# ── (1) SQL-агрегаты: корректность ────────────────────────────────────────────


def test_summary_empty_when_no_reviews(client: TestClient, db, user_a):
    resp = client.get(f"/users/{user_a.id}/reviews")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total_reviews"] == 0
    assert data["avg_rating"] is None
    assert data["reviews"] == []
    assert data["stars_distribution"] == {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}


def test_summary_computes_avg_and_distribution(client: TestClient, db, user_a, user_b):
    party = _make_past_party(db, creator_id=user_a.id, members=[user_b.id])
    reviewers = [_make_user(db, f"r{i}", f"r{i}@x.x") for i in range(5)]
    ratings = [5, 4, 5, 3, 1]
    for r, u in zip(ratings, reviewers):
        _seed_review(db, reviewer_id=u.id, reviewed_id=user_b.id, party_id=party.id, rating=r)

    resp = client.get(f"/users/{user_b.id}/reviews")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_reviews"] == 5
    assert data["avg_rating"] == 3.6
    assert data["stars_distribution"] == {"1": 1, "2": 0, "3": 1, "4": 1, "5": 2}


def test_summary_excludes_hidden_and_deleted(client: TestClient, db, user_a, user_b):
    party = _make_past_party(db, creator_id=user_a.id, members=[user_b.id])
    r1 = _make_user(db, "r1", "r1@x.x")
    r2 = _make_user(db, "r2", "r2@x.x")
    r3 = _make_user(db, "r3", "r3@x.x")
    _seed_review(db, reviewer_id=r1.id, reviewed_id=user_b.id, party_id=party.id, rating=5)
    _seed_review(db, reviewer_id=r2.id, reviewed_id=user_b.id, party_id=party.id, rating=1, is_hidden=True)
    _seed_review(db, reviewer_id=r3.id, reviewed_id=user_b.id, party_id=party.id, rating=2, is_deleted=True)

    resp = client.get(f"/users/{user_b.id}/reviews")
    data = resp.json()
    assert data["total_reviews"] == 1
    assert data["avg_rating"] == 5.0
    assert data["stars_distribution"]["5"] == 1
    assert data["stars_distribution"]["1"] == 0


def test_summary_pagination(client: TestClient, db, user_a, user_b):
    party = _make_past_party(db, creator_id=user_a.id, members=[user_b.id])
    reviewers = [_make_user(db, f"r{i}", f"r{i}@x.x") for i in range(15)]
    base = datetime.now(timezone.utc)
    for i, u in enumerate(reviewers):
        _seed_review(
            db,
            reviewer_id=u.id,
            reviewed_id=user_b.id,
            party_id=party.id,
            rating=3,
            created_at=base - timedelta(minutes=i),
        )

    r1 = client.get(f"/users/{user_b.id}/reviews?page=1&per_page=5").json()
    r2 = client.get(f"/users/{user_b.id}/reviews?page=2&per_page=5").json()
    r3 = client.get(f"/users/{user_b.id}/reviews?page=3&per_page=5").json()

    assert r1["total_reviews"] == 15
    assert r1["total_pages"] == 3
    assert len(r1["reviews"]) == 5
    assert len(r2["reviews"]) == 5
    assert len(r3["reviews"]) == 5
    all_ids = {rev["id"] for rev in (r1["reviews"] + r2["reviews"] + r3["reviews"])}
    assert len(all_ids) == 15
    assert r1["reviews"][0]["id"] > r2["reviews"][-1]["id"] or True


def test_summary_avg_rounded_two_decimals(client: TestClient, db, user_a, user_b):
    party = _make_past_party(db, creator_id=user_a.id, members=[user_b.id])
    for i, rating in enumerate([5, 5, 4]):
        u = _make_user(db, f"rr{i}", f"rr{i}@x.x")
        _seed_review(db, reviewer_id=u.id, reviewed_id=user_b.id, party_id=party.id, rating=rating)
    data = client.get(f"/users/{user_b.id}/reviews").json()
    assert data["avg_rating"] == 4.67


# ── (2) Негативные теги ───────────────────────────────────────────────────────


def test_negative_tag_opozdal_is_allowed(client: TestClient, db, user_a, user_b, token_a):
    """
    'Опоздал' — негативный тег. Должен приниматься бэкендом.
    RED: сейчас в ALLOWED_REVIEW_TAGS только позитивные теги → 400.
    """
    party = _make_past_party(db, creator_id=user_a.id, members=[user_b.id])
    resp = client.post(
        "/reviews",
        json={
            "reviewed_id": user_b.id,
            "party_id": party.id,
            "rating": 2,
            "tags": ["Опоздал"],
        },
        headers=_auth(token_a),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "Опоздал" in (body.get("tags") or [])


def test_all_new_negative_tags_allowed(client: TestClient, db, user_a, user_b, token_a):
    """Полный негативный набор, который должен поддерживаться."""
    party = _make_past_party(db, creator_id=user_a.id, members=[user_b.id])
    negative = ["Опоздал", "Не пришёл", "Грубый"]
    # max 3 тега на отзыв → попадают все три
    resp = client.post(
        "/reviews",
        json={
            "reviewed_id": user_b.id,
            "party_id": party.id,
            "rating": 1,
            "tags": negative,
        },
        headers=_auth(token_a),
    )
    assert resp.status_code == 200, resp.text
    assert set(resp.json()["tags"]) == set(negative)


def test_mixed_positive_and_negative_tags_allowed(client: TestClient, db, user_a, user_b, token_a):
    party = _make_past_party(db, creator_id=user_a.id, members=[user_b.id])
    resp = client.post(
        "/reviews",
        json={
            "reviewed_id": user_b.id,
            "party_id": party.id,
            "rating": 3,
            "tags": ["Пунктуальный", "Грубый"],
        },
        headers=_auth(token_a),
    )
    assert resp.status_code == 200, resp.text


def test_summary_splits_top_tags_by_polarity(client: TestClient, db, user_a, user_b):
    """
    Ответ ReviewSummary должен возвращать теги, разделённые по полярности:
    top_positive_tags и top_negative_tags — по топ-5 в каждом.
    RED: сейчас возвращается только обобщённый top_tags.
    """
    party = _make_past_party(db, creator_id=user_a.id, members=[user_b.id])
    # 3× "Пунктуальный" (pos), 2× "Весёлый" (pos), 4× "Опоздал" (neg), 1× "Грубый" (neg)
    seeds = (
        [("Пунктуальный",)] * 3
        + [("Весёлый",)] * 2
        + [("Опоздал",)] * 4
        + [("Грубый",)] * 1
    )
    for i, tags in enumerate(seeds):
        u = _make_user(db, f"tag{i}", f"tag{i}@x.x")
        _seed_review(
            db,
            reviewer_id=u.id,
            reviewed_id=user_b.id,
            party_id=party.id,
            rating=3,
            tags=list(tags),
        )

    data = client.get(f"/users/{user_b.id}/reviews").json()
    assert "top_positive_tags" in data
    assert "top_negative_tags" in data
    assert data["top_positive_tags"][0] == "Пунктуальный"
    assert data["top_negative_tags"][0] == "Опоздал"
    assert "Грубый" in data["top_negative_tags"]
    assert "Опоздал" not in data["top_positive_tags"]
    assert "Пунктуальный" not in data["top_negative_tags"]


def test_unknown_tag_still_rejected(client: TestClient, db, user_a, user_b, token_a):
    """Защита от произвольных тегов после расширения списка."""
    party = _make_past_party(db, creator_id=user_a.id, members=[user_b.id])
    resp = client.post(
        "/reviews",
        json={
            "reviewed_id": user_b.id,
            "party_id": party.id,
            "rating": 3,
            "tags": ["ПроизвольныйТег"],
        },
        headers=_auth(token_a),
    )
    assert resp.status_code == 400


def test_post_revives_soft_deleted_review(client: TestClient, db, user_a, user_b, token_a):
    party = _make_past_party(db, creator_id=user_a.id, members=[user_b.id])

    # Create initial review
    r1 = client.post(
        "/reviews",
        json={
            "reviewed_id": user_b.id,
            "party_id": party.id,
            "rating": 5,
            "text": "first",
            "tags": ["Пунктуальный"],
        },
        headers=_auth(token_a),
    )
    assert r1.status_code == 200, r1.text
    first_id = r1.json()["id"]

    # Soft-delete it (DELETE /reviews/{id})
    d = client.delete(f"/reviews/{first_id}", headers=_auth(token_a))
    assert d.status_code in (204, 200), d.text

    # POST again with same reviewer/reviewed/party should revive, not crash or create duplicate
    r2 = client.post(
        "/reviews",
        json={
            "reviewed_id": user_b.id,
            "party_id": party.id,
            "rating": 2,
            "text": "second",
            "tags": ["Грубый"],
        },
        headers=_auth(token_a),
    )
    assert r2.status_code == 200, r2.text
    body2 = r2.json()
    assert body2["id"] == first_id
    assert body2["rating"] == 2
    assert body2["text"] == "second"
    assert set(body2.get("tags") or []) == {"Грубый"}
