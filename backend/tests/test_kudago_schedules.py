import json
import time
from datetime import datetime

import kudago_api
import kudago_cache
from models.kudago_event import KudaGoEvent


def _base_raw_event(**overrides):
    event = {
        "id": 101,
        "title": "Museum",
        "dates": [],
        "categories": [],
        "tags": [],
        "place": {},
        "images": [],
    }
    event.update(overrides)
    return event


def test_parse_events_keeps_permanent_schedules_in_all_dates():
    schedules = [{"weekday": 1, "from": "10:00", "to": "18:00"}]
    raw = {
        "results": [
            _base_raw_event(
                dates=[
                    {
                        "is_endless": True,
                        "is_startless": False,
                        "is_continuous": False,
                        "use_place_schedule": False,
                        "schedules": schedules,
                    }
                ]
            )
        ]
    }

    parsed = kudago_api.parse_events(raw)

    assert parsed[0]["is_permanent"] is True
    assert parsed[0]["has_schedules"] is True
    assert parsed[0]["start_date"] is None
    assert parsed[0]["start_time"] is None
    assert parsed[0]["all_dates"][0]["schedules"] == schedules
    assert parsed[0]["all_dates"][0]["use_place_schedule"] is False


def test_parse_event_detail_uses_same_all_dates_shape_for_permanent_schedules():
    schedules = [{"weekday": 5, "from": "11:00", "to": "20:00"}]
    parsed = kudago_api.parse_event_detail(
        _base_raw_event(
            dates=[
                {
                    "is_endless": False,
                    "is_startless": True,
                    "is_continuous": False,
                    "use_place_schedule": False,
                    "schedules": schedules,
                }
            ]
        )
    )

    date = parsed["all_dates"][0]
    assert parsed["is_permanent"] is True
    assert set(date) == {
        "start",
        "end",
        "start_time",
        "end_time",
        "is_continuous",
        "is_endless",
        "is_startless",
        "use_place_schedule",
        "schedules",
    }
    assert date["schedules"] == schedules


def test_parse_events_keeps_use_place_schedule_without_fake_date():
    raw = {
        "results": [
            _base_raw_event(
                dates=[
                    {
                        "is_endless": False,
                        "is_startless": False,
                        "is_continuous": False,
                        "use_place_schedule": True,
                        "schedules": [],
                    }
                ]
            )
        ]
    }

    parsed = kudago_api.parse_events(raw)

    assert parsed[0]["is_permanent"] is True
    assert parsed[0]["has_schedules"] is False
    assert parsed[0]["start_date"] is None
    assert parsed[0]["all_dates"][0]["use_place_schedule"] is True
    assert parsed[0]["all_dates"][0]["schedules"] == []


def test_parse_events_regular_event_keeps_existing_date_fields_with_empty_schedules():
    start = int(time.time()) + 3600
    end = start + 7200
    raw = {
        "results": [
            _base_raw_event(
                dates=[
                    {
                        "start": start,
                        "end": end,
                        "is_continuous": False,
                        "is_endless": False,
                        "is_startless": False,
                        "use_place_schedule": False,
                    }
                ]
            )
        ]
    }

    parsed = kudago_api.parse_events(raw)

    assert parsed[0]["is_permanent"] is False
    assert parsed[0]["start_date"] is not None
    assert parsed[0]["start_time"] is not None
    assert parsed[0]["all_dates"][0]["schedules"] == []
    assert parsed[0]["all_dates"][0]["use_place_schedule"] is False


def test_cache_roundtrip_preserves_all_dates_schedules_and_has_schedules(db):
    schedules = [{"weekday": 2, "from": "12:00", "to": "19:00"}]
    parsed = {
        "kudago_id": 202,
        "title": "Permanent Expo",
        "all_dates": [
            {
                "start": None,
                "end": None,
                "start_time": None,
                "end_time": None,
                "is_continuous": False,
                "is_endless": True,
                "is_startless": False,
                "use_place_schedule": False,
                "schedules": schedules,
            }
        ],
        "is_permanent": True,
        "has_schedules": False,
    }

    row_data = kudago_cache._row_from_parsed(parsed, "msk")
    event = KudaGoEvent(
        **row_data,
        start_ts=None,
        cached_at=datetime.utcnow(),
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    response = kudago_cache._row_to_response(event)

    assert json.loads(row_data["all_dates"])[0]["schedules"] == schedules
    assert row_data["has_schedules"] is True
    assert response["all_dates"][0]["schedules"] == schedules
