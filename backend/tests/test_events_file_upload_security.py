"""
Security tests for file upload endpoint in events.py.

Tests for XSS vulnerability: SVG files with image/svg+xml MIME type
should be blocked even though they start with "image/".
"""
import io


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_svg_mime_type_blocked(client, token_a, db):
    """SVG with correct image/svg+xml MIME should be rejected (XSS prevention)."""
    from models.feature_flag import FeatureFlag
    
    existing = db.query(FeatureFlag).filter_by(key="file_upload_enabled").first()
    if not existing:
        flag = FeatureFlag(key="file_upload_enabled", enabled=True)
        db.add(flag)
        db.commit()

    svg_content = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"
    # Используем .jpg расширение чтобы обойти blacklist расширений
    files = {"file": ("malicious.jpg", io.BytesIO(svg_content), "image/svg+xml")}
    response = client.post("/upload/chat", files=files, headers=_auth(token_a))
    
    assert response.status_code == 400
    assert "Недопустимый тип файла" in response.json()["detail"]


def test_svg_with_fake_jpeg_mime_blocked(client, token_a, db):
    """SVG file with spoofed image/jpeg MIME should be rejected by signature check."""
    from models.feature_flag import FeatureFlag
    
    existing = db.query(FeatureFlag).filter_by(key="file_upload_enabled").first()
    if not existing:
        flag = FeatureFlag(key="file_upload_enabled", enabled=True)
        db.add(flag)
        db.commit()

    svg_content = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"
    files = {"file": ("fake.jpg", io.BytesIO(svg_content), "image/jpeg")}
    response = client.post("/upload/chat", files=files, headers=_auth(token_a))
    
    assert response.status_code == 400
    assert "Содержимое файла не соответствует image MIME" in response.json()["detail"]


def test_legitimate_png_allowed(client, token_a, db):
    """Valid PNG file should still be allowed."""
    from models.feature_flag import FeatureFlag
    
    existing = db.query(FeatureFlag).filter_by(key="file_upload_enabled").first()
    if not existing:
        flag = FeatureFlag(key="file_upload_enabled", enabled=True)
        db.add(flag)
        db.commit()

    # PNG signature: \x89PNG\r\n\x1a\n
    png_content = b"\x89PNG\r\n\x1a\n" + b"fake image data"
    files = {"file": ("image.png", io.BytesIO(png_content), "image/png")}
    response = client.post("/upload/chat", files=files, headers=_auth(token_a))
    
    assert response.status_code == 200
    data = response.json()
    assert "file_url" in data
    assert data["file_type"] == "image"


def test_legitimate_jpeg_allowed(client, token_a, db):
    """Valid JPEG file should still be allowed."""
    from models.feature_flag import FeatureFlag
    
    existing = db.query(FeatureFlag).filter_by(key="file_upload_enabled").first()
    if not existing:
        flag = FeatureFlag(key="file_upload_enabled", enabled=True)
        db.add(flag)
        db.commit()

    # JPEG signature: \xff\xd8\xff
    jpeg_content = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"fake data"
    files = {"file": ("image.jpg", io.BytesIO(jpeg_content), "image/jpeg")}
    response = client.post("/upload/chat", files=files, headers=_auth(token_a))
    
    assert response.status_code == 200
    data = response.json()
    assert "file_url" in data
    assert data["file_type"] == "image"


def test_legitimate_webp_allowed(client, token_a, db):
    """Valid WebP file should still be allowed."""
    from models.feature_flag import FeatureFlag
    
    existing = db.query(FeatureFlag).filter_by(key="file_upload_enabled").first()
    if not existing:
        flag = FeatureFlag(key="file_upload_enabled", enabled=True)
        db.add(flag)
        db.commit()

    # WebP signature: RIFF....WEBP
    webp_content = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"fake data"
    files = {"file": ("image.webp", io.BytesIO(webp_content), "image/webp")}
    response = client.post("/upload/chat", files=files, headers=_auth(token_a))
    
    assert response.status_code == 200
    data = response.json()
    assert "file_url" in data
    assert data["file_type"] == "image"
