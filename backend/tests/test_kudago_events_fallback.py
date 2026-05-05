def test_kudago_events_falls_back_to_api_when_cache_empty_for_plain_browsing(monkeypatch):
    import routers.events as events_router

    class _DummyDB:
        pass

    monkeypatch.setattr(events_router.kudago_cache, "location_has_cache", lambda db, location: True)
    monkeypatch.setattr(
        events_router.kudago_cache,
        "query_cache",
        lambda **kwargs: {
            "count": 0,
            "next": None,
            "previous": None,
            "page": 1,
            "page_size": 20,
            "results": [],
            "from_cache": True,
        },
    )
    monkeypatch.setattr(
        events_router.kudago_api,
        "get_events",
        lambda **kwargs: {"count": 1, "next": None, "previous": None, "results": [{"id": 101}]},
    )
    monkeypatch.setattr(
        events_router.kudago_api,
        "parse_events",
        lambda raw: [{"kudago_id": 101, "title": "Fallback Event"}],
    )

    body = events_router.kudago_get_events(
        location="msk",
        categories=None,
        is_free=None,
        search=None,
        page=1,
        page_size=20,
        actual_since=None,
        actual_until=None,
        max_age=None,
        tags=None,
        place_search=None,
        lat=None,
        lon=None,
        radius_m=None,
        order_by=None,
        from_hour=None,
        to_hour=None,
        weekdays=None,
        hide_started=None,
        min_price=None,
        max_price=None,
        has_party=None,
        min_attendees=None,
        has_free_spots=None,
        time_of_day=None,
        only_permanent=None,
        exclude_permanent=None,
        has_cover=None,
        starting_within_hours=None,
        is_short=None,
        is_long=None,
        has_schedules=None,
        only_verified_place=None,
        db=_DummyDB(),
    )
    assert body["from_cache"] is False
    assert body["count"] == 1
    assert len(body["results"]) == 1
    assert body["results"][0]["kudago_id"] == 101
