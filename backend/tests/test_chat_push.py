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


@pytest.mark.asyncio
async def test_mark_disconnect_removes_all_party_presence(db, user_a, user_b):
    """mark_disconnect must remove the user from ALL parties, not just one."""
    import chat_push
    party1 = _make_party(db, user_a.id)
    party2 = EventParty(
        event_id="e2", title="P2", max_members=4,
        creator_id=user_a.id, is_open=True,
    )
    db.add(party2); db.commit(); db.refresh(party2)

    # user_b joins both parties with the same sid
    chat_push.mark_join_party("sid_b", user_b.id, party1.id)
    chat_push.mark_join_party("sid_b", user_b.id, party2.id)

    # Disconnect should remove from both
    chat_push.mark_disconnect("sid_b")
    assert not chat_push.is_user_online_in_party(user_b.id, party1.id)
    assert not chat_push.is_user_online_in_party(user_b.id, party2.id)


@pytest.mark.asyncio
async def test_file_lock_released_on_exception(db, user_a, user_b):
    """File lock must be released even if lock acquisition raises after open()."""
    import chat_push

    opened_files = []
    original_open = open

    def _tracking_open(*args, **kwargs):
        f = original_open(*args, **kwargs)
        opened_files.append(f)
        # Simulate msvcrt.locking failure right after open
        if args and ".lock" in str(args[0]):
            raise OSError("lock acquisition failed")
        return f

    with patch("builtins.open", side_effect=_tracking_open):
        with patch("chat_push.push_helpers.send_push_to_user"):
            pushed = await chat_push.notify_chat_message(
                db, _make_party(db, user_a.id),
                sender_id=user_a.id,
                sender_username="user_a", message_text="hi",
                now_ts=1000,
            )

    # Lock file opened before the exception must be closed in the except block
    for f in opened_files:
        assert f.closed, f"File {f.name} was not closed"


@pytest.mark.asyncio
async def test_advisory_lock_failure_logged(db, user_a, user_b, caplog):
    """Advisory lock failure must be logged, not silently swallowed."""
    import chat_push
    import logging

    # Patch db.bind.dialect.name to "postgresql" so the pg_advisory branch
    # runs, then make the advisory lock execute() raise.
    dialect_mock = MagicMock()
    dialect_mock.name = "postgresql"
    bind_mock = MagicMock()
    bind_mock.dialect = dialect_mock

    original_bind = db.bind
    original_execute = db.execute
    db.bind = bind_mock

    def _execute_selective(*args, **kwargs):
        # Only raise for the advisory lock call
        stmt = args[0] if args else None
        if stmt is not None and "pg_advisory_xact_lock" in str(stmt):
            raise OSError("lock failed")
        return original_execute(*args, **kwargs)

    try:
        with patch.object(db, "execute", side_effect=_execute_selective):
            with caplog.at_level(logging.WARNING, logger="chat_push"):
                result = chat_push._ensure_cross_worker_throttle(
                    db, user_b.id, 1, now=1000,
                )
    finally:
        db.bind = original_bind

    # Should fall back to best-effort (return True) and log a warning
    assert result is True
    assert any(
        "Advisory lock unavailable" in r.message for r in caplog.records
    )


@pytest.mark.asyncio
async def test_push_failure_rolls_back_transaction(db, user_a, user_b):
    """If push fails after some sends, db.commit() must not leave a broken transaction."""
    import chat_push
    party = _make_party(db, user_a.id)
    _accept(db, party.id, user_b.id)

    call_count = 0

    def _flaky_push(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise RuntimeError("push service down")

    with patch("chat_push.push_helpers.send_push_to_user", side_effect=_flaky_push):
        pushed = await chat_push.notify_chat_message(
            db, party, sender_id=user_a.id,
            sender_username="user_a", message_text="hi",
            now_ts=1000,
        )

    # The push for user_b failed, so nobody was pushed
    assert pushed == set()

    # The session must still be usable (not in a broken transaction state)
    # Verify by performing a simple query
    from models.notification import Notification
    count = db.query(Notification).count()
    assert count == 0


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
