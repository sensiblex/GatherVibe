"""Smoke tests for services.matching — uses an in-memory SQLite DB."""
import os
import sys
import time
from types import SimpleNamespace

# Force sqlite in-memory for tests BEFORE any import from the app
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models.user import User
from models.party import EventParty, PartyMember
from models.review import PartyReview
from services import matching


def _make_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _mk_user(db, uid: int, username: str, *, interests: str = "", city: str = "msk"):
    u = User(id=uid, email=f"{username}@x.com", username=username,
             hashed_password="x", city=city, interests=interests)
    db.add(u); db.commit(); return u


def _mk_party(db, pid: int, creator_id: int, *, event_id="e1", city="msk",
              max_members=4, days_from_now=5, is_open=True):
    ts = int(time.time()) + days_from_now * 86400
    p = EventParty(id=pid, event_id=event_id, title=f"p{pid}", city=city,
                   max_members=max_members, creator_id=creator_id, is_open=is_open,
                   event_title=f"Event {pid}", event_date_ts=ts,
                   event_image_url=None)
    db.add(p); db.commit(); return p


def _add_member(db, party_id: int, user_id: int, status="accepted"):
    db.add(PartyMember(party_id=party_id, user_id=user_id, status=status))
    db.commit()


# ─── Tests ────────────────────────────────────────────────────────────────────

def test_user_with_no_interests():
    db = _make_session()
    me = _mk_user(db, 1, "me", interests="", city="msk")
    creator = _mk_user(db, 2, "alex", interests="кино,театр", city="msk")
    _mk_party(db, 10, creator.id)
    res = matching.compute_recommendations(db, me, limit=10, offset=0)
    # Still gets recommendations (from city/activity/fill components)
    assert len(res) == 1, f"expected 1 party, got {res}"
    assert 0 < res[0]["match_score"] <= 100
    print("✓ test_user_with_no_interests — score =", res[0]["match_score"])


def test_interest_overlap_boosts_score():
    db = _make_session()
    me = _mk_user(db, 1, "me", interests="кино,театр,спорт", city="msk")
    good_creator = _mk_user(db, 2, "good", interests="кино,театр,музыка", city="msk")
    bad_creator = _mk_user(db, 3, "bad", interests="готовка,садоводство", city="msk")
    _mk_party(db, 10, good_creator.id)
    _mk_party(db, 11, bad_creator.id)
    res = matching.compute_recommendations(db, me, limit=10, offset=0)
    assert len(res) == 2
    # sorted desc by score
    assert res[0]["match_score"] > res[1]["match_score"]
    assert res[0]["party_id"] == 10
    assert any("интерес" in r for r in res[0]["match_reasons"])
    print(f"✓ test_interest_overlap — good={res[0]['match_score']}, bad={res[1]['match_score']}")


def test_full_party_excluded():
    db = _make_session()
    me = _mk_user(db, 1, "me", interests="кино", city="msk")
    creator = _mk_user(db, 2, "c", interests="кино", city="msk")
    m2 = _mk_user(db, 3, "m2", interests="кино", city="msk")
    m3 = _mk_user(db, 4, "m3", interests="кино", city="msk")
    m4 = _mk_user(db, 5, "m4", interests="кино", city="msk")
    _mk_party(db, 10, creator.id, max_members=4)
    # Creator is counted + 3 accepted members = 4 members, spots_left=0
    _add_member(db, 10, m2.id, "accepted")
    _add_member(db, 10, m3.id, "accepted")
    _add_member(db, 10, m4.id, "accepted")
    res = matching.compute_recommendations(db, me, limit=10, offset=0)
    assert len(res) == 0, f"full party should be excluded, got {res}"
    print("✓ test_full_party_excluded")


def test_user_already_member_excluded():
    db = _make_session()
    me = _mk_user(db, 1, "me", interests="кино", city="msk")
    creator = _mk_user(db, 2, "c", interests="кино", city="msk")
    _mk_party(db, 10, creator.id)
    _add_member(db, 10, me.id, "accepted")
    res = matching.compute_recommendations(db, me, limit=10, offset=0)
    assert len(res) == 0, f"user is member, should be excluded, got {res}"
    print("✓ test_user_already_member_excluded")


def test_past_event_excluded():
    db = _make_session()
    me = _mk_user(db, 1, "me", interests="кино", city="msk")
    creator = _mk_user(db, 2, "c", interests="кино", city="msk")
    _mk_party(db, 10, creator.id, days_from_now=-2)  # event 2 days ago
    res = matching.compute_recommendations(db, me, limit=10, offset=0)
    assert len(res) == 0, f"past event should be excluded, got {res}"
    print("✓ test_past_event_excluded")


def test_city_match_reason():
    db = _make_session()
    me = _mk_user(db, 1, "me", interests="кино", city="msk")
    creator = _mk_user(db, 2, "c", interests="кино", city="msk")
    _mk_party(db, 10, creator.id, city="msk")
    res = matching.compute_recommendations(db, me, limit=10, offset=0)
    reasons = res[0]["match_reasons"]
    assert any("город" in r.lower() for r in reasons), f"expected city reason in {reasons}"
    print("✓ test_city_match_reason")


def test_members_preview_and_spots():
    db = _make_session()
    me = _mk_user(db, 1, "me", interests="кино", city="msk")
    creator = _mk_user(db, 2, "alex", interests="кино", city="msk")
    m2 = _mk_user(db, 3, "bob", interests="кино", city="msk")
    _mk_party(db, 10, creator.id, max_members=5)
    _add_member(db, 10, m2.id, "accepted")
    res = matching.compute_recommendations(db, me, limit=10, offset=0)
    p = res[0]
    assert p["total_spots"] == 5
    # creator + 1 accepted = 2 members
    assert p["member_count"] == 2
    assert p["spots_left"] == 3
    assert len(p["members_preview"]) == 2
    print("✓ test_members_preview_and_spots")


def test_jaccard():
    # sanity check on jaccard helper
    assert matching._jaccard(set(), set()) == 0.0
    assert matching._jaccard({"a"}, set()) == 0.0
    assert matching._jaccard({"a", "b"}, {"a", "b"}) == 1.0
    assert matching._jaccard({"a", "b"}, {"b", "c"}) == 1 / 3
    print("✓ test_jaccard")


def test_activity_score():
    now = 1000000
    assert matching._activity_score(now - 10, now) == 0.0  # past
    assert matching._activity_score(now + 86400, now) == 1.0  # 1 day
    assert matching._activity_score(now + 5 * 86400, now) == 0.7
    assert matching._activity_score(now + 20 * 86400, now) == 0.4
    assert matching._activity_score(now + 60 * 86400, now) == 0.2
    assert matching._activity_score(None, now) == 0.2
    print("✓ test_activity_score")


if __name__ == "__main__":
    test_jaccard()
    test_activity_score()
    test_user_with_no_interests()
    test_interest_overlap_boosts_score()
    test_full_party_excluded()
    test_user_already_member_excluded()
    test_past_event_excluded()
    test_city_match_reason()
    test_members_preview_and_spots()
    print("\nAll tests passed ✓")
