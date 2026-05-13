"""Тесты для системы кэширования KudaGo API."""
import pytest
from datetime import datetime

from kudago_api_cache import cached, InMemoryCache


# ==================== Phase 1: NameError при async ====================

@cached(ttl=60)
async def dummy_async_func(x: int) -> int:
    return x * 2


@pytest.mark.asyncio
async def test_cached_decorator_works_for_async_function():
    """Декоратор @cached должен работать с асинхронными функциями без NameError."""
    # Сбрасываем кэш перед тестом
    from kudago_api_cache import _cache_instance
    if _cache_instance:
        _cache_instance.clear()

    result = await dummy_async_func(5)
    assert result == 10


# ==================== Phase 2: Нестабильные ключи кэша ====================

@cached(ttl=60, key_prefix="test_dt")
def func_with_datetime(dt: datetime) -> str:
    return f"result-{dt}"


def test_cache_key_stability_with_datetime():
    """Одинаковые datetime должны давать одинаковый ключ кэша."""
    from kudago_api_cache import _cache_instance
    if _cache_instance:
        _cache_instance.clear()

    dt1 = datetime(2024, 1, 1, 12, 0, 0)
    dt2 = datetime(2024, 1, 1, 12, 0, 0)

    result1 = func_with_datetime(dt1)
    result2 = func_with_datetime(dt2)

    assert result1 == result2


# ==================== Phase 2: LRU edge case ====================

def test_inmemory_cache_lru_edge_case():
    """LRU eviction должен работать корректно при граничных условиях."""
    cache = InMemoryCache(max_size=2)

    cache.set("key1", "value1")
    cache.set("key2", "value2")
    cache.set("key3", "value3")

    assert cache.get("key1") is None, "key1 должен быть вытолкнут"
    assert cache.get("key2") is not None
    assert cache.get("key3") is not None
