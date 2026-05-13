"""TDD: RED-тесты для CheckConstraint rating BETWEEN 1 AND 5 в PartyReview."""
import pytest
from sqlalchemy.exc import IntegrityError
from models.review import PartyReview
from models.user import User
from auth import hash_password


def _make_user(db, username: str, email: str) -> User:
    u = User(
        username=username,
        email=email,
        hashed_password=hash_password("password123"),
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _make_party(db):
    from models.party import EventParty
    p = EventParty(event_id="ev1", title="Test Party", creator_id=1)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


class TestRatingValidation:
    """RED: rating вне [1,5] должен отклоняться на уровне БД."""

    def test_rating_rejects_zero(self, db):
        reviewer = _make_user(db, "rev1", "rev1@test.com")
        reviewed = _make_user(db, "rev2", "rev2@test.com")
        party = _make_party(db)
        with pytest.raises(IntegrityError):
            review = PartyReview(
                reviewer_id=reviewer.id,
                reviewed_id=reviewed.id,
                party_id=party.id,
                rating=0,
            )
            db.add(review)
            db.commit()

    def test_rating_rejects_negative(self, db):
        reviewer = _make_user(db, "rev3", "rev3@test.com")
        reviewed = _make_user(db, "rev4", "rev4@test.com")
        party = _make_party(db)
        with pytest.raises(IntegrityError):
            review = PartyReview(
                reviewer_id=reviewer.id,
                reviewed_id=reviewed.id,
                party_id=party.id,
                rating=-5,
            )
            db.add(review)
            db.commit()

    def test_rating_rejects_above_five(self, db):
        reviewer = _make_user(db, "rev5", "rev5@test.com")
        reviewed = _make_user(db, "rev6", "rev6@test.com")
        party = _make_party(db)
        with pytest.raises(IntegrityError):
            review = PartyReview(
                reviewer_id=reviewer.id,
                reviewed_id=reviewed.id,
                party_id=party.id,
                rating=6,
            )
            db.add(review)
            db.commit()

    def test_rating_accepts_valid_range(self, db):
        """GREEN: rating от 1 до 5 должен приниматься."""
        reviewer = _make_user(db, "rev7", "rev7@test.com")
        reviewed = _make_user(db, "rev8", "rev8@test.com")
        party = _make_party(db)
        for rating in [1, 2, 3, 4, 5]:
            review = PartyReview(
                reviewer_id=reviewer.id,
                reviewed_id=reviewed.id,
                party_id=party.id,
                rating=rating,
            )
            db.add(review)
            db.commit()
            db.delete(review)
            db.commit()
