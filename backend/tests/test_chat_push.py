"""Tests for chat-message push notifications with per-user-per-party throttling.

The handler in main.py (`send_party_message`) calls
`chat_push.notify_chat_message(...)` after broadcast. This module tests that
helper directly with mocked push.
"""
import pytest
from unittest.mock import patch, MagicMock

from models.party import EventParty, PartyMember


@pytest.fixture(autouse=True)
def _reset_state():
    """Each test starts with empty throttle/presence state."""
    import chat_push
    chat_push.reset_state()
    yield
    chat_push.reset_state()


def _make_party(db, creator_id: int, max_members=4) -> EventParty:
    p = EventParty(
        event_id="e1", title="Тусовка", max_members=max_members,
        creator_id=creator_id, is_open=True,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _accept(db, party_id: int, user_id: int):
    db.add(PartyMember(party_id=party_id, user_id=user_id, status="accepted"))
    db.commit()




@pytest.mark.asyncio
async def test_push_sent_to_other_members(db, user_a, user_b):
    import chat_push
    party = _make_party(db, user_a.id)
    _accept(db, party.id, user_b.id)

    with patch("chat_push.push_helpers.send_push_to_user") as mock_push:
        pushed = await chat_push.notify_chat_message(
            db, party, sender_id=user_a.id,
            sender_username="user_a", message_text="привет",
            now_ts=1000,
        )
    assert pushed == {user_b.id}
    assert mock_push.call_count == 1


@pytest.mark.asyncio
async def test_sender_does_not_get_own_push(db, user_a, user_b):
    import chat_push
    party = _make_party(db, user_a.id)
    _accept(db, party.id, user_b.id)

    with patch("chat_push.push_helpers.send_push_to_user") as mock_push:
        pushed = await chat_push.notify_chat_message(
            db, party, sender_id=user_b.id,
            sender_username="user_b", message_text="hi",
            now_ts=1000,
        )
    assert user_b.id not in pushed
    assert pushed == {user_a.id}


@pytest.mark.asyncio
async def test_only_accepted_members_targeted(db, user_a, user_b, user_c):
    import chat_push
    party = _make_party(db, user_a.id)
    _accept(db, party.id, user_b.id)
    db.add(PartyMember(party_id=party.id, user_id=user_c.id, status="pending"))
    db.commit()

    with patch("chat_push.push_helpers.send_push_to_user"):
        pushed = await chat_push.notify_chat_message(
            db, party, sender_id=user_a.id,
            sender_username="user_a", message_text="hi", now_ts=1000,
        )
    assert pushed == {user_b.id}
    assert user_c.id not in pushed




@pytest.mark.asyncio
async def test_second_message_within_5min_throttled(db, user_a, user_b):
    import chat_push
    party = _make_party(db, user_a.id)
    _accept(db, party.id, user_b.id)

    with patch("chat_push.push_helpers.send_push_to_user") as mock_push:
        await chat_push.notify_chat_message(
            db, party, user_a.id, "user_a", "msg1", now_ts=1000,
        )
        await chat_push.notify_chat_message(
            db, party, user_a.id, "user_a", "msg2", now_ts=1000 + 60,
        )
        await chat_push.notify_chat_message(
            db, party, user_a.id, "user_a", "msg3", now_ts=1000 + 240,
        )
    assert mock_push.call_count == 1


@pytest.mark.asyncio
async def test_message_after_throttle_window_pushes_again(db, user_a, user_b):
    import chat_push
    party = _make_party(db, user_a.id)
    _accept(db, party.id, user_b.id)

    with patch("chat_push.push_helpers.send_push_to_user") as mock_push:
        await chat_push.notify_chat_message(
            db, party, user_a.id, "user_a", "msg1", now_ts=1000,
        )
        await chat_push.notify_chat_message(
            db, party, user_a.id, "user_a", "msg2", now_ts=1000 + 5 * 60 + 1,
        )
    assert mock_push.call_count == 2


@pytest.mark.asyncio
async def test_throttle_independent_per_party(db, user_a, user_b):
    import chat_push
    party1 = _make_party(db, user_a.id)
    party2 = EventParty(
        event_id="e2", title="P2", max_members=4,
        creator_id=user_a.id, is_open=True,
    )
    db.add(party2); db.commit(); db.refresh(party2)
    _accept(db, party1.id, user_b.id)
    _accept(db, party2.id, user_b.id)

    with patch("chat_push.push_helpers.send_push_to_user") as mock_push:
        await chat_push.notify_chat_message(
            db, party1, user_a.id, "user_a", "p1msg", now_ts=1000,
        )
        await chat_push.notify_chat_message(
            db, party2, user_a.id, "user_a", "p2msg", now_ts=1001,
        )
    assert mock_push.call_count == 2




@pytest.mark.asyncio
async def test_online_user_in_party_room_skipped(db, user_a, user_b):
    import chat_push
    party = _make_party(db, user_a.id)
    _accept(db, party.id, user_b.id)

    chat_push.mark_join_party("sid_b", user_b.id, party.id)

    with patch("chat_push.push_helpers.send_push_to_user") as mock_push:
        pushed = await chat_push.notify_chat_message(
            db, party, user_a.id, "user_a", "hi", now_ts=1000,
        )
    assert user_b.id not in pushed
    assert mock_push.call_count == 0


@pytest.mark.asyncio
async def test_user_disconnect_resumes_push(db, user_a, user_b):
    import chat_push
    party = _make_party(db, user_a.id)
    _accept(db, party.id, user_b.id)

    chat_push.mark_join_party("sid_b", user_b.id, party.id)
    chat_push.mark_disconnect("sid_b")

    with patch("chat_push.push_helpers.send_push_to_user") as mock_push:
        pushed = await chat_push.notify_chat_message(
            db, party, user_a.id, "user_a", "hi", now_ts=1000,
        )
    assert pushed == {user_b.id}
    assert mock_push.call_count == 1


@pytest.mark.asyncio
async def test_user_leave_party_resumes_push(db, user_a, user_b):
    import chat_push
    party = _make_party(db, user_a.id)
    _accept(db, party.id, user_b.id)

    chat_push.mark_join_party("sid_b", user_b.id, party.id)
    chat_push.mark_leave_party("sid_b", party.id)

    with patch("chat_push.push_helpers.send_push_to_user") as mock_push:
        pushed = await chat_push.notify_chat_message(
            db, party, user_a.id, "user_a", "hi", now_ts=1000,
        )
    assert pushed == {user_b.id}
    assert mock_push.call_count == 1


@pytest.mark.asyncio
async def test_multiple_tabs_only_disconnect_when_all_gone(db, user_a, user_b):
    """User has 2 sids in the same party; disconnecting one shouldn't expose them to push."""
    import chat_push
    party = _make_party(db, user_a.id)
    _accept(db, party.id, user_b.id)

    chat_push.mark_join_party("sid_b1", user_b.id, party.id)
    chat_push.mark_join_party("sid_b2", user_b.id, party.id)
    chat_push.mark_disconnect("sid_b1")

    with patch("chat_push.push_helpers.send_push_to_user") as mock_push:
        pushed = await chat_push.notify_chat_message(
            db, party, user_a.id, "user_a", "hi", now_ts=1000,
        )
    assert user_b.id not in pushed
    assert mock_push.call_count == 0




@pytest.mark.asyncio
async def test_push_payload_carries_party_id_and_type(db, user_a, user_b):
    import chat_push
    party = _make_party(db, user_a.id)
    _accept(db, party.id, user_b.id)

    with patch("chat_push.push_helpers.send_push_to_user") as mock_push:
        await chat_push.notify_chat_message(
            db, party, user_a.id, "user_a", "hello!", now_ts=1000,
        )
    args, kwargs = mock_push.call_args
    data_arg = args[4] if len(args) >= 5 else kwargs.get("data")
    assert data_arg["party_id"] == party.id
    assert data_arg["type"] == "chat_message"


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
