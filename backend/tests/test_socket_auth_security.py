"""Security tests for Socket.IO connect handler.

Verifies that authentication failures are logged, not silently swallowed.
"""

from unittest.mock import patch, MagicMock, AsyncMock
import pytest


@pytest.mark.asyncio
async def test_connect_logs_authentication_errors():
    """Socket connect must log a warning when token auth fails, not silently pass."""
    import main

    sid = "test-sid-123"
    environ = {"HTTP_COOKIE": "token=invalid.jwt.token"}

    with patch("main.get_user_from_socket_token", side_effect=ValueError("Неверный токен")):
        with patch("main.SessionLocal") as mock_session_local:
            mock_db = MagicMock()
            mock_session_local.return_value = mock_db
            with patch.object(main.logger, "warning") as mock_warning:
                await main.connect(sid, environ)
                # The handler must have logged something about the auth failure
                mock_warning.assert_called()
                call_args_str = " ".join(str(a) for a in mock_warning.call_args[0])
                assert "auth" in call_args_str.lower() or "failed" in call_args_str.lower()


@pytest.mark.asyncio
async def test_connect_saves_session_on_valid_token():
    """Socket connect must save user session when token is valid."""
    import main

    sid = "test-sid-valid"
    valid_token = "valid.jwt.token"
    environ = {"HTTP_COOKIE": f"token={valid_token}"}

    mock_user = MagicMock()
    mock_user.id = 42
    mock_user.username = "testuser"

    with patch("main.get_user_from_socket_token", return_value=mock_user):
        with patch("main.SessionLocal") as mock_session_local:
            mock_db = MagicMock()
            mock_session_local.return_value = mock_db
            with patch.object(main.sio, "save_session", new_callable=AsyncMock) as mock_save:
                await main.connect(sid, environ)
                mock_save.assert_called_once_with(sid, {"user_id": 42, "username": "testuser"})
