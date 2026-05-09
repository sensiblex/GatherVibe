from pathlib import Path


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_avatar_upload_success(client, token_a, user_a):
    target = Path("uploads/avatars") / f"{user_a.id}.png"
    target.unlink(missing_ok=True)

    response = client.post(
        "/users/me/avatar",
        files={"file": ("avatar.png", b"\x89PNG\r\n\x1a\nfake", "image/png")},
        headers=_auth(token_a),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["avatar_url"] == f"/uploads/avatars/{user_a.id}.png"
    assert target.exists()

    target.unlink(missing_ok=True)


def test_avatar_upload_rejects_non_image(client, token_a):
    response = client.post(
        "/users/me/avatar",
        files={"file": ("note.txt", b"hello", "text/plain")},
        headers=_auth(token_a),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Только изображения"


def test_avatar_upload_rejects_too_large(client, token_a, user_a):
    target = Path("uploads/avatars") / f"{user_a.id}.jpg"
    target.unlink(missing_ok=True)

    big_content = b"a" * (5 * 1024 * 1024 + 1)
    response = client.post(
        "/users/me/avatar",
        files={"file": ("avatar.jpg", big_content, "image/jpeg")},
        headers=_auth(token_a),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Файл слишком большой (макс 5MB)"
    assert not target.exists()
