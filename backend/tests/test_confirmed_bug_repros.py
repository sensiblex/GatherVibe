"""Reproduction tests for confirmed bugs.

These tests encode expected correct behavior and are expected to fail
on current implementation until bugs are fixed.
"""

from __future__ import annotations

import asyncio
import os
import time
from multiprocessing import Manager, Process
from types import SimpleNamespace

import pytest

from models.party import PartyMember


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _set_tz(tz_name: str) -> bool:
    """Set process timezone if supported by platform/runtime."""
    if not hasattr(time, "tzset"):
        return False
    os.environ["TZ"] = tz_name
    time.tzset()
    return True


@pytest.mark.asyncio
async def test_kudago_async_parse_events_should_not_depend_on_process_timezone():
    import kudago_api_async

    raw = {
        "results": [
            {
                "id": 1,
                "title": "TZ Event",
                "short_title": "TZ Event",
                "description": "",
                "categories": [],
                "price": "",
                "is_free": True,
                "images": [],
                "site_url": "",
                "dates": [{"start": 1767225600, "end": 1767229200}],  # 2026-01-01 00:00:00 UTC
            }
        ]
    }

    if not _set_tz("UTC"):
        pytest.skip("time.tzset is unavailable on this runtime")
    utc_out = await kudago_api_async.parse_events(raw)

    if not _set_tz("Europe/Moscow"):
        pytest.skip("time.tzset is unavailable on this runtime")
    moscow_out = await kudago_api_async.parse_events(raw)

    # Correct behavior: parser should be timezone-stable and not drift with process TZ.
    assert utc_out == moscow_out


@pytest.mark.asyncio
async def test_kudago_async_parse_event_detail_should_not_depend_on_process_timezone():
    import kudago_api_async

    raw = {
        "id": 1,
        "title": "TZ Detail",
        "short_title": "TZ Detail",
        "description": "",
        "body_text": "",
        "categories": [],
        "tags": [],
        "price": "",
        "is_free": True,
        "images": [],
        "site_url": "",
        "participants": [],
        "dates": [{"start": 1767225600, "end": 1767229200}],  # 2026-01-01 00:00:00 UTC
    }

    if not _set_tz("UTC"):
        pytest.skip("time.tzset is unavailable on this runtime")
    utc_out = await kudago_api_async.parse_event_detail(raw)

    if not _set_tz("Europe/Moscow"):
        pytest.skip("time.tzset is unavailable on this runtime")
    moscow_out = await kudago_api_async.parse_event_detail(raw)

    assert utc_out["start_date"] == moscow_out["start_date"]
    assert utc_out["start_time"] == moscow_out["start_time"]
    assert utc_out["all_dates"] == moscow_out["all_dates"]


def _worker_chat_push_once(shared_calls, db_url):
    import chat_push
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    chat_push.reset_state()
    party = SimpleNamespace(id=777, title="P")

    def fake_participants(_db, _party):
        return [11]

    def fake_online(_uid, _party_id):
        return False

    def fake_send(_db, uid, _title, _body, _payload):
        shared_calls.append(uid)

    chat_push._participant_user_ids = fake_participants
    chat_push.is_user_online_in_party = fake_online
    chat_push.push_helpers.send_push_to_user = fake_send

    # Используем реальную БД для throttle с переданным URL
    engine = create_engine(db_url)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    try:
        asyncio.run(
            chat_push.notify_chat_message(
                db=db,
                party=party,
                sender_id=1,
                sender_username="u1",
                message_text="hello",
                now_ts=1000,
            )
        )
    finally:
        db.close()
        engine.dispose()


def test_chat_push_throttle_should_hold_across_workers():
    """Correct behavior for multi-worker: global throttle should prevent duplicate push."""
    try:
        import tempfile
        import os
        from database import Base
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        # Используем файловую БД для межпроцессного разделения состояния
        with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as f:
            db_path = f.name

        try:
            db_url = f"sqlite:///{db_path}"
            engine = create_engine(db_url)
            Base.metadata.create_all(bind=engine)
            engine.dispose()

            with Manager() as manager:
                calls = manager.list()
                p1 = Process(target=_worker_chat_push_once, args=(calls, db_url))
                p2 = Process(target=_worker_chat_push_once, args=(calls, db_url))
                p1.start()
                p2.start()
                p1.join()
                p2.join()
                # Expected with shared state: only one push.
                assert len(list(calls)) == 1
        finally:
            if os.path.exists(db_path):
                os.unlink(db_path)
    except PermissionError:
        pytest.skip("multiprocessing manager is blocked in this environment")


@pytest.mark.asyncio
async def test_chat_push_notify_should_not_block_event_loop(db, user_a, user_b):
    import chat_push
    from models.party import EventParty
    from models.user import User
    from auth import hash_password

    party = EventParty(
        event_id="e_block",
        title="Blocking",
        max_members=5,
        creator_id=user_a.id,
        is_open=True,
    )
    db.add(party)
    db.commit()
    db.refresh(party)
    user_c = User(username="user_c_block", email="uc_block@test.com", hashed_password=hash_password("pw"))
    db.add(user_c)
    db.commit()
    db.refresh(user_c)
    db.add(PartyMember(party_id=party.id, user_id=user_b.id, status="accepted"))
    db.add(PartyMember(party_id=party.id, user_id=user_c.id, status="accepted"))
    db.commit()

    ticks = {"n": 0}
    running = {"v": True}

    async def ticker():
        while running["v"]:
            ticks["n"] += 1
            await asyncio.sleep(0.01)

    def slow_send(_db, _uid, _title, _body, _payload):
        time.sleep(0.25)

    t = asyncio.create_task(ticker())
    try:
        from unittest.mock import patch

        with patch("chat_push.push_helpers.send_push_to_user", side_effect=slow_send):
            await chat_push.notify_chat_message(
                db=db,
                party=party,
                sender_id=user_a.id,
                sender_username="a",
                message_text="x",
                now_ts=2000,
            )
    finally:
        running["v"] = False
        await t

    # Non-blocking behavior should allow ticker to progress significantly while sends run.
    assert ticks["n"] >= 20


def test_join_by_token_should_allow_last_available_slot(client, db, token_a, token_b):
    """With max_members=4: creator + 2 accepted => one remaining slot must still be joinable."""
    from auth import hash_password
    from models.user import User
    from jwt_handler import create_access_token
    from datetime import timedelta

    user_c = User(username="user_c2", email="c2@test.com", hashed_password=hash_password("pw"))
    user_d = User(username="user_d2", email="d2@test.com", hashed_password=hash_password("pw"))
    db.add(user_c)
    db.add(user_d)
    db.commit()
    db.refresh(user_c)
    db.refresh(user_d)
    token_c = create_access_token(
        data={"sub": user_c.email, "id": user_c.id, "username": user_c.username},
        expires_delta=timedelta(minutes=60),
    )
    token_d = create_access_token(
        data={"sub": user_d.email, "id": user_d.id, "username": user_d.username},
        expires_delta=timedelta(minutes=60),
    )

    create_resp = client.post(
        "/parties/event/evt-capacity-4",
        headers=_auth(token_a),
        json={"title": "cap4", "max_members": 4},
    )
    assert create_resp.status_code == 200
    invite_token = create_resp.json()["invite_token"]

    join_b = client.post(f"/parties/by-token/{invite_token}/join", headers=_auth(token_b))
    assert join_b.status_code == 200
    join_c = client.post(f"/parties/by-token/{invite_token}/join", headers=_auth(token_c))
    assert join_c.status_code == 200

    # Last free seat should be allowed; current bug rejects it with 400.
    join_d = client.post(f"/parties/by-token/{invite_token}/join", headers=_auth(token_d))
    assert join_d.status_code == 200
