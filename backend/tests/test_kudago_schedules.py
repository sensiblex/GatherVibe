import json
import time
from datetime import datetime
from zoneinfo import ZoneInfo

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


MSK = ZoneInfo("Europe/Moscow")


def _msk_ts(year, month, day, hour=0, minute=0):
    return int(datetime(year, month, day, hour, minute, tzinfo=MSK).timestamp())


def _freeze_now(monkeypatch):
    monkeypatch.setattr(time, "time", lambda: _msk_ts(2026, 4, 28, 12, 0))


def test_parse_events_regular_event_uses_kudago_start_and_end_times(monkeypatch):
    _freeze_now(monkeypatch)
    start = _msk_ts(2026, 5, 14, 19, 0)
    end = _msk_ts(2026, 5, 14, 21, 30)

    parsed = kudago_api.parse_events({
        "results": [
            _base_raw_event(
                dates=[{"start": start, "end": end}]
            )
        ]
    })

    event = parsed[0]
    assert event["start_date"] == "2026-05-14"
    assert event["start_time"] == "19:00"
    assert event["all_dates"] == [
        {
            "start": "2026-05-14",
            "end": "2026-05-14",
            "start_time": "19:00",
            "end_time": "21:30",
            "is_continuous": False,
            "is_endless": False,
            "is_startless": False,
            "use_place_schedule": False,
            "schedules": [],
        }
    ]
    assert event["end_ts"] == end


def test_parse_event_detail_regular_event_uses_same_time_shape(monkeypatch):
    _freeze_now(monkeypatch)
    start = _msk_ts(2026, 5, 14, 19, 0)
    end = _msk_ts(2026, 5, 14, 21, 30)

    event = kudago_api.parse_event_detail(
        _base_raw_event(dates=[{"start": start, "end": end}])
    )

    assert event["start_date"] == "2026-05-14"
    assert event["start_time"] == "19:00"
    assert event["all_dates"][0]["end"] == "2026-05-14"
    assert event["all_dates"][0]["end_time"] == "21:30"


def test_parse_events_multiple_future_dates_selects_nearest_and_keeps_all(monkeypatch):
    _freeze_now(monkeypatch)
    later = _msk_ts(2026, 6, 1, 20, 0)
    nearest = _msk_ts(2026, 5, 2, 18, 15)
    middle = _msk_ts(2026, 5, 10, 12, 0)

    parsed = kudago_api.parse_events({
        "results": [
            _base_raw_event(
                dates=[
                    {"start": later, "end": later + 3600},
                    {"start": nearest, "end": nearest + 5400},
                    {"start": middle, "end": middle + 7200},
                ]
            )
        ]
    })

    event = parsed[0]
    assert event["start_date"] == "2026-05-02"
    assert event["start_time"] == "18:15"
    assert [d["start"] for d in event["all_dates"]] == [
        "2026-06-01",
        "2026-05-02",
        "2026-05-10",
    ]
    assert [d["start_time"] for d in event["all_dates"]] == ["20:00", "18:15", "12:00"]


def test_parse_events_ignores_past_dates_when_selecting_primary_date(monkeypatch):
    _freeze_now(monkeypatch)
    past = _msk_ts(2026, 4, 1, 18, 0)
    future = _msk_ts(2026, 4, 29, 10, 30)

    parsed = kudago_api.parse_events({
        "results": [
            _base_raw_event(
                dates=[
                    {"start": past, "end": past + 3600},
                    {"start": future, "end": future + 3600},
                ]
            )
        ]
    })

    assert parsed[0]["start_date"] == "2026-04-29"
    assert parsed[0]["start_time"] == "10:30"
    assert parsed[0]["all_dates"][0]["start"] == "2026-04-29"


def test_parse_events_skips_past_event_without_future_dates_unless_requested(monkeypatch):
    _freeze_now(monkeypatch)
    past = _msk_ts(2026, 4, 1, 18, 0)
    raw = {"results": [_base_raw_event(dates=[{"start": past, "end": past + 3600}])]}

    assert kudago_api.parse_events(raw, skip_date_filter=False) == []
    assert len(kudago_api.parse_events(raw, skip_date_filter=True)) == 1


def test_kudago_timestamp_formatting_is_explicitly_moscow_time():
    start = _msk_ts(2026, 5, 14, 19, 0)

    assert kudago_api._format_kudago_timestamp(start) == ("2026-05-14", "19:00")


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
