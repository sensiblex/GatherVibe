"""Regression tests for removed recommendation endpoints."""


def test_recommendation_endpoints_are_not_registered(client, token_a):
    headers = {"Authorization": f"Bearer {token_a}"}

    endpoints = [
        "/users/me/recommended-events",
        "/users/me/recommended-parties",
        "/users/me/similar-people",
        "/events/e1/peers",
    ]

    for endpoint in endpoints:
        assert client.get(endpoint, headers=headers).status_code == 404

    assert client.post(
        "/recommendations/feedback",
        headers=headers,
        json={
            "rec_type": "event",
            "target_id": "e1",
            "action": "dismissed",
        },
    ).status_code == 404
    assert client.post(
        "/recommendations/impressions",
        headers=headers,
        json={"items": []},
    ).status_code == 404
