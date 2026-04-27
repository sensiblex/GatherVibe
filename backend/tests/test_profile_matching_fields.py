"""TDD integration tests for PATCH /users/me with matching fields."""
from datetime import date

import pytest

from services import embeddings


@pytest.fixture(autouse=True)
def _stub_embed(monkeypatch):
    """Avoid loading the real 120MB model in this test suite."""
    def _fake(text, *, is_query=False):
        return [0.1, 0.1, 0.1, 0.1]
    monkeypatch.setattr(embeddings, "embed_text", _fake)


def test_patch_accepts_birth_date(client, user_a, token_a, db):
    r = client.patch(
        "/users/me",
        json={"birth_date": "2000-05-15"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 200
    assert r.json()["birth_date"] == "2000-05-15"
    db.refresh(user_a)
    assert user_a.birth_date == date(2000, 5, 15)


def test_patch_accepts_geo(client, user_a, token_a, db):
    r = client.patch(
        "/users/me",
        json={"latitude": 55.7558, "longitude": 37.6176, "geo_precision": "exact"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["latitude"] == 55.7558
    assert data["longitude"] == 37.6176
    assert data["geo_precision"] == "exact"


def test_patch_rejects_invalid_lat_lon(client, token_a):
    r = client.patch(
        "/users/me",
        json={"latitude": 200.0, "longitude": 0.0},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code in (400, 422)


def test_patch_accepts_preferences(client, user_a, token_a, db):
    r = client.patch(
        "/users/me",
        json={
            "preferred_categories": "concert,theater",
            "preferred_days": "weekends",
            "preferred_time": "evening",
            "budget_max": 2000,
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["preferred_categories"] == "concert,theater"
    assert data["preferred_days"] == "weekends"
    assert data["preferred_time"] == "evening"
    assert data["budget_max"] == 2000


def test_patch_rejects_invalid_preferred_days(client, token_a):
    r = client.patch(
        "/users/me",
        json={"preferred_days": "bogus"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code in (400, 422)


def test_patch_toggles_discoverable_flag(client, user_a, token_a, db):
    r = client.patch(
        "/users/me",
        json={"is_discoverable_on_events": True},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 200
    db.refresh(user_a)
    assert user_a.is_discoverable_on_events is True


def test_patch_refreshes_user_embedding(client, user_a, token_a, db):
    """Updating profile text should trigger embedding refresh."""
    from models.embedding import EntityEmbedding
    assert db.query(EntityEmbedding).filter_by(entity_type="user").count() == 0

    r = client.patch(
        "/users/me",
        json={"interests": "concert,cinema,theater", "bio": "Люблю искусство"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 200

    rows = db.query(EntityEmbedding).filter_by(
        entity_type="user", entity_id=str(user_a.id)).all()
    assert len(rows) == 1
    db.refresh(user_a)
    assert user_a.embedding_updated_at is not None
