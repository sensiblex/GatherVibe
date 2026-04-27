"""Tests for post-event triggers (review reminder, recap reminder, gather-again).

Runs the synchronous helper `run_post_event_jobs(db, now_ts)` which the
background loop will call every 15 min. This shape lets us drive arbitrary
"now" values in tests without sleeping.
"""
import time
from unittest.mock import patch

import pytest

from models.party import EventParty, PartyMember
from models.notification import Notification


@pytest.fixture(autouse=True)
def _stub_push():
    """All tests in this module: stub push to avoid VAPID setup."""
    with patch("notification_helpers.send_push_to_user"):
        yield


@pytest.fixture
def user_c(db):
    from auth import hash_password
    from models.user import User
    u = User(username="user_c", email="c@test.com",
             hashed_password=hash_password("pw"))
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _make_party(db, creator_id: int, event_date_ts: int, title="P", event_id="e1"):
    p = EventParty(
        event_id=event_id, title=title, max_members=4,
        creator_id=creator_id, is_open=True,
        event_date_ts=event_date_ts,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _accept(db, party_id: int, user_id: int):
    db.add(PartyMember(party_id=party_id, user_id=user_id, status="accepted"))
    db.commit()




def test_review_reminder_sent_2h_after_event(db, user_a, user_b):
    from post_event_jobs import (
        run_post_event_jobs,
        POST_EVENT_REVIEW_DELAY,
        NOTIF_REVIEW_REMINDER,
    )
    now = 2_000_000_000
    party = _make_party(db, user_a.id, event_date_ts=now - POST_EVENT_REVIEW_DELAY - 60)
    _accept(db, party.id, user_b.id)

    counts = run_post_event_jobs(db, now)

    assert counts[NOTIF_REVIEW_REMINDER] == 2
    notifs = db.query(Notification).filter(
        Notification.type == NOTIF_REVIEW_REMINDER,
    ).all()
    assert {n.user_id for n in notifs} == {user_a.id, user_b.id}


def test_review_reminder_not_sent_before_threshold(db, user_a):
    from post_event_jobs import run_post_event_jobs, NOTIF_REVIEW_REMINDER
    now = 2_000_000_000
    _make_party(db, user_a.id, event_date_ts=now - 30 * 60)

    counts = run_post_event_jobs(db, now)
    assert counts[NOTIF_REVIEW_REMINDER] == 0


def test_review_reminder_idempotent(db, user_a):
    from post_event_jobs import (
        run_post_event_jobs,
        POST_EVENT_REVIEW_DELAY,
        NOTIF_REVIEW_REMINDER,
    )
    now = 2_000_000_000
    _make_party(db, user_a.id, event_date_ts=now - POST_EVENT_REVIEW_DELAY - 60)

    run_post_event_jobs(db, now)
    counts2 = run_post_event_jobs(db, now)

    assert counts2[NOTIF_REVIEW_REMINDER] == 0
    assert db.query(Notification).filter(
        Notification.type == NOTIF_REVIEW_REMINDER,
    ).count() == 1




def test_recap_reminder_sent_1d_after_event(db, user_a, user_b):
    from post_event_jobs import (
        run_post_event_jobs,
        POST_EVENT_RECAP_DELAY,
        NOTIF_RECAP_REMINDER,
    )
    now = 2_000_000_000
    party = _make_party(db, user_a.id, event_date_ts=now - POST_EVENT_RECAP_DELAY - 60)
    _accept(db, party.id, user_b.id)

    counts = run_post_event_jobs(db, now)

    assert counts[NOTIF_RECAP_REMINDER] == 2
    notifs = db.query(Notification).filter(
        Notification.type == NOTIF_RECAP_REMINDER,
    ).all()
    assert {n.user_id for n in notifs} == {user_a.id, user_b.id}




def test_gather_again_sent_14d_after_event(db, user_a, user_b):
    from post_event_jobs import (
        run_post_event_jobs,
        POST_EVENT_GATHER_AGAIN_DELAY,
        NOTIF_GATHER_AGAIN,
    )
    now = 2_000_000_000
    party = _make_party(db, user_a.id, event_date_ts=now - POST_EVENT_GATHER_AGAIN_DELAY - 60, title="Боулинг")
    _accept(db, party.id, user_b.id)

    counts = run_post_event_jobs(db, now)
    assert counts[NOTIF_GATHER_AGAIN] == 2
    n = db.query(Notification).filter(
        Notification.type == NOTIF_GATHER_AGAIN,
    ).first()
    assert "Боулинг" in n.body or "снова" in n.body.lower()




def test_only_accepted_members_targeted(db, user_a, user_b, user_c):
    from post_event_jobs import (
        run_post_event_jobs,
        POST_EVENT_REVIEW_DELAY,
        NOTIF_REVIEW_REMINDER,
    )
    now = 2_000_000_000
    party = _make_party(db, user_a.id, event_date_ts=now - POST_EVENT_REVIEW_DELAY - 60)
    _accept(db, party.id, user_b.id)
    db.add(PartyMember(party_id=party.id, user_id=user_c.id, status="pending"))
    db.commit()

    run_post_event_jobs(db, now)

    notifs_c = db.query(Notification).filter(
        Notification.type == NOTIF_REVIEW_REMINDER,
        Notification.user_id == user_c.id,
    ).all()
    assert notifs_c == []


def test_party_without_event_date_skipped(db, user_a):
    from post_event_jobs import run_post_event_jobs
    now = 2_000_000_000
    p = EventParty(
        event_id="x", title="x", max_members=4,
        creator_id=user_a.id, is_open=True, event_date_ts=None,
    )
    db.add(p)
    db.commit()
    counts = run_post_event_jobs(db, now)
    assert sum(counts.values()) == 0


def test_dedup_no_substring_collision(db, user_a):
    """Sending review_reminder for party_id=1 must not block party_id=11."""
    from post_event_jobs import (
        run_post_event_jobs,
        POST_EVENT_REVIEW_DELAY,
        NOTIF_REVIEW_REMINDER,
    )
    now = 2_000_000_000
    parties = []
    for i in range(11):
        p = _make_party(
            db, user_a.id,
            event_date_ts=now - POST_EVENT_REVIEW_DELAY - 60,
            event_id=f"e{i}", title=f"P{i}",
        )
        parties.append(p)

    run_post_event_jobs(db, now)

    notifs_count = (
        db.query(Notification)
        .filter(Notification.type == NOTIF_REVIEW_REMINDER, Notification.user_id == user_a.id)
        .count()
    )
    assert notifs_count == 11


def test_notification_data_carries_party_id(db, user_a):
    """Notification.data must include party_id so the frontend can deep-link."""
    import json
    from post_event_jobs import (
        run_post_event_jobs,
        POST_EVENT_RECAP_DELAY,
        NOTIF_RECAP_REMINDER,
    )
    now = 2_000_000_000
    party = _make_party(db, user_a.id, event_date_ts=now - POST_EVENT_RECAP_DELAY - 60)

    run_post_event_jobs(db, now)
    n = db.query(Notification).filter(
        Notification.type == NOTIF_RECAP_REMINDER,
        Notification.user_id == user_a.id,
    ).first()
    payload = json.loads(n.data)
    assert payload == {"party_id": party.id}


def test_each_job_independent_dedup(db, user_a):
    """Sending review_reminder for a party doesn't suppress recap_reminder later."""
    from post_event_jobs import (
        run_post_event_jobs,
        POST_EVENT_REVIEW_DELAY,
        POST_EVENT_RECAP_DELAY,
        NOTIF_REVIEW_REMINDER,
        NOTIF_RECAP_REMINDER,
    )
    now1 = 2_000_000_000
    party = _make_party(db, user_a.id, event_date_ts=now1 - 3 * 3600)
    counts1 = run_post_event_jobs(db, now1)
    assert counts1[NOTIF_REVIEW_REMINDER] == 1
    assert counts1[NOTIF_RECAP_REMINDER] == 0

    now2 = now1 + (22 * 3600)
    counts2 = run_post_event_jobs(db, now2)
    assert counts2[NOTIF_REVIEW_REMINDER] == 0
    assert counts2[NOTIF_RECAP_REMINDER] == 1


def test_push_dispatched_to_each_recipient(db, user_a, user_b):
    """Each recipient should get a push call (mocked)."""
    from post_event_jobs import (
        run_post_event_jobs,
        POST_EVENT_REVIEW_DELAY,
    )
    now = 2_000_000_000
    party = _make_party(db, user_a.id, event_date_ts=now - POST_EVENT_REVIEW_DELAY - 60)
    _accept(db, party.id, user_b.id)

    with patch("notification_helpers.send_push_to_user") as mock_push:
        run_post_event_jobs(db, now)

    assert mock_push.call_count >= 2
    user_ids_pushed = {call.args[1] for call in mock_push.call_args_list}
    assert {user_a.id, user_b.id}.issubset(user_ids_pushed)
