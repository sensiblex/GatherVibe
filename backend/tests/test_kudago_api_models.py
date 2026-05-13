"""Тесты для Pydantic-моделей KudaGo API."""
import pytest
from pydantic import ValidationError
from datetime import datetime, timezone

from kudago_api_models import SearchRequest, APIHealthStatus


# ==================== Phase 3: timezone-aware datetime ====================

def test_api_health_status_uses_timezone_aware_datetime():
    """timestamp должен быть timezone-aware."""
    status = APIHealthStatus(status="healthy", latency_ms=100.0)
    assert status.timestamp.tzinfo is not None, "timestamp должен быть timezone-aware"


# ==================== Phase 3: ctype validation ====================

def test_search_request_ctype_validation():
    """ctype должен быть только 'event' или 'place'."""
    SearchRequest(query="test", ctype="event")
    SearchRequest(query="test", ctype="place")

    with pytest.raises(ValidationError):
        SearchRequest(query="test", ctype="invalid")
