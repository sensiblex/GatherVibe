"""Security tests for JWT token type validation.

Verifies that verify_token rejects tokens with wrong token_type
(e.g. a refresh token used as access token).
"""

from jwt_handler import create_access_token, verify_token


def test_verify_token_rejects_refresh_token_as_access():
    """A token with token_type=refresh must be rejected when expected_type=access."""
    token = create_access_token(data={"sub": "test@example.com"}, token_type="refresh")
    result = verify_token(token, expected_type="access")
    assert result is None


def test_verify_token_accepts_valid_access_token():
    """A token with token_type=access must be accepted when expected_type=access."""
    token = create_access_token(data={"sub": "test@example.com"}, token_type="access")
    result = verify_token(token, expected_type="access")
    assert result is not None
    assert result.get("token_type") == "access"


def test_verify_token_default_expected_type_is_access():
    """By default verify_token expects access tokens — refresh tokens must be rejected."""
    token = create_access_token(data={"sub": "test@example.com"}, token_type="refresh")
    # Call without expected_type — default should be "access"
    result = verify_token(token)
    assert result is None


def test_verify_token_accepts_refresh_when_expected():
    """A refresh token must be accepted when expected_type=refresh."""
    token = create_access_token(data={"sub": "test@example.com"}, token_type="refresh")
    result = verify_token(token, expected_type="refresh")
    assert result is not None
    assert result.get("token_type") == "refresh"


def test_verify_token_rejects_token_without_type():
    """A legacy token without token_type field must be rejected when expected_type is set."""
    # Create a token without token_type by manually encoding
    from jose import jwt as _jwt
    from jwt_handler import SECRET_KEY, ALGORITHM
    token = _jwt.encode({"sub": "test@example.com"}, SECRET_KEY, algorithm=ALGORITHM)
    result = verify_token(token, expected_type="access")
    assert result is None
