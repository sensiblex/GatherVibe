"""
Tests for race condition in poll voting.

Tests that duplicate votes are prevented via unique constraint.
"""
import pytest
from sqlalchemy.exc import IntegrityError
from models.party_coordination import PartyPoll, PollOption, PollVote
from models.party import PartyMember, EventParty
from models.user import User


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_duplicate_vote_prevented(client, token_a, db):
    """Duplicate vote from same user on same poll should be prevented."""
    from models.feature_flag import FeatureFlag
    from models.event import Event
    from datetime import datetime
    
    existing = db.query(FeatureFlag).filter_by(key="file_upload_enabled").first()
    if not existing:
        flag = FeatureFlag(key="file_upload_enabled", enabled=True)
        db.add(flag)
        db.commit()

    # Create an event first
    user = db.query(User).filter(User.username == "user_a").first()
    event = Event(
        title="Test Event",
        description="Test",
        city="Moscow",
        date_time=datetime(2025, 1, 1, 0, 0, 0),
        location="Test",
        created_by=user.id
    )
    db.add(event)
    db.flush()
    
    # Create a party linked to event
    party = EventParty(
        creator_id=user.id,
        title="Test Party",
        city="Moscow",
        event_date_ts=1234567890,
        event_id=event.id
    )
    db.add(party)
    db.flush()
    
    # Add user as member
    member = PartyMember(party_id=party.id, user_id=user.id, status="accepted")
    db.add(member)
    db.flush()
    
    # Create a poll
    poll = PartyPoll(
        party_id=party.id,
        question="Test question?",
        status="active",
        created_by=user.id,
        created_by_username=user.username
    )
    db.add(poll)
    db.flush()
    
    # Create an option
    option = PollOption(poll_id=poll.id, text="Option 1")
    db.add(option)
    db.flush()
    db.commit()
    
    # First vote - should succeed
    response1 = client.post(
        f"/polls/{poll.id}/vote",
        json={"option_id": option.id},
        headers=_auth(token_a)
    )
    assert response1.status_code == 200
    
    # Second vote - should fail with 400
    response2 = client.post(
        f"/polls/{poll.id}/vote",
        json={"option_id": option.id},
        headers=_auth(token_a)
    )
    assert response2.status_code == 400
    assert "уже проголосовали" in response2.json()["detail"]


def test_duplicate_vote_direct_db(db, user_a):
    """Test that unique constraint prevents duplicate votes at DB level."""
    from models.event import Event
    from datetime import datetime
    
    user = user_a
    
    event = Event(
        title="Test Event",
        description="Test",
        city="Moscow",
        date_time=datetime(2025, 1, 1, 0, 0, 0),
        location="Test",
        created_by=user.id
    )
    db.add(event)
    db.flush()
    
    party = EventParty(
        creator_id=user.id,
        title="Test Party",
        city="Moscow",
        event_date_ts=1234567890,
        event_id=event.id
    )
    db.add(party)
    db.flush()
    
    poll = PartyPoll(
        party_id=party.id,
        question="Test question?",
        status="active",
        created_by=user.id,
        created_by_username=user.username
    )
    db.add(poll)
    db.flush()
    
    option = PollOption(poll_id=poll.id, text="Option 1")
    db.add(option)
    db.flush()
    
    vote1 = PollVote(poll_id=poll.id, option_id=option.id, user_id=user.id)
    db.add(vote1)
    db.flush()
    
    # Try to add duplicate vote
    vote2 = PollVote(poll_id=poll.id, option_id=option.id, user_id=user.id)
    db.add(vote2)
    
    with pytest.raises(IntegrityError):
        db.flush()
    
    db.rollback()
