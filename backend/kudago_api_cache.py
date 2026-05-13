"""
Система кэширования для API KudaGo.
Поддержка Redis и in-memory кэширования (lru_cache).
"""
import hashlib
import inspect
import json
import logging
import time
from typing import Optional, Any, Callable
from functools import wraps
from dataclasses import dataclass

logger = logging.getLogger("kudago_api_cache")


# ==================== Конфигурация кэша ====================

@dataclass
class CacheConfig:
    """Конфигурация кэширования."""
    enabled: bool = True
    default_ttl: int = 300  # 5 минут по умолчанию
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: Optional[str] = None
    use_redis: bool = False  # Использовать Redis или in-memory
    max_memory_items: int = 1000  # Максимум элементов в in-memory кэше


# Глобальная конфигурация
cache_config = CacheConfig()


# ==================== In-memory кэш ====================

class InMemoryCache:
    """Простой in-memory кэш с TTL и LRU вытеснением."""
    
    def __init__(self, max_size: int = 1000):
        self._cache = {}
        self._timestamps = {}
        self._max_size = max_size
    
    def _make_key(self, key: str) -> str:
        """Создание хэш-ключа."""
        return hashlib.md5(key.encode()).hexdigest()
    
    def get(self, key: str) -> Optional[Any]:
        """Получить значение из кэша."""
        hashed_key = self._make_key(key)
        
        if hashed_key not in self._cache:
            return None
        
        # Проверка TTL
        if time.time() - self._timestamps[hashed_key] > cache_config.default_ttl:
            self.delete(key)
            return None
        
        logger.debug(f"Cache HIT: {key}")
        return self._cache[hashed_key]
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Установить значение в кэш."""
        hashed_key = self._make_key(key)
        
        # LRU: удалить старые записи если кэш полон
        if len(self._cache) >= self._max_size and hashed_key not in self._cache:
            if not self._timestamps:
                return
            oldest_key = min(self._timestamps, key=self._timestamps.get)
            del self._cache[oldest_key]
            del self._timestamps[oldest_key]
        
        self._cache[hashed_key] = value
        self._timestamps[hashed_key] = time.time()
        
        logger.debug(f"Cache SET: {key} (TTL: {ttl or cache_config.default_ttl}s)")
    
    def delete(self, key: str) -> None:
        """Удалить значение из кэша."""
        hashed_key = self._make_key(key)
        if hashed_key in self._cache:
            del self._cache[hashed_key]
            del self._timestamps[hashed_key]
            logger.debug(f"Cache DELETE: {key}")
    
    def clear(self) -> None:
        """Очистить весь кэш."""
        self._cache.clear()
        self._timestamps.clear()
        logger.info("Cache cleared")
    
    def get_stats(self) -> dict:
        """Получить статистику кэша."""
        return {
            "size": len(self._cache),
            "max_size": self._max_size,
        }


# ==================== Redis кэш ====================

class RedisCache:
    """Кэш на базе Redis."""
    
    def __init__(self, host: str = "localhost", port: int = 6379, db: int = 0, password: Optional[str] = None):
        self._redis = None
        self._host = host
        self._port = port
        self._db = db
        self._password = password
        self._connected = False
    
    def _get_redis(self):
        """Ленивая инициализация Redis."""
        if not self._connected:
            try:
                import redis
                self._redis = redis.Redis(
                    host=self._host,
                    port=self._port,
                    db=self._db,
                    password=self._password,
                    decode_responses=True,
                    socket_connect_timeout=5,
                )
                self._redis.ping()
                self._connected = True
                logger.info("Redis connected")
            except ImportError:
                logger.warning("Redis not installed, falling back to in-memory cache")
                self._connected = False
                return None
            except Exception as e:
                logger.warning(f"Redis connection failed: {e}, falling back to in-memory cache")
                self._connected = False
                return None
        return self._redis
    
    def get(self, key: str) -> Optional[Any]:
        """Получить значение из кэша."""
        redis = self._get_redis()
        if not redis:
            return None
        
        try:
            value = redis.get(f"kudago:{key}")
            if value:
                logger.debug(f"Redis Cache HIT: {key}")
                return json.loads(value)
            return None
        except Exception as e:
            logger.error(f"Redis get error: {e}")
            return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Установить значение в кэш."""
        redis = self._get_redis()
        if not redis:
            return
        
        try:
            ttl = ttl or cache_config.default_ttl
            redis.setex(f"kudago:{key}", ttl, json.dumps(value))
            logger.debug(f"Redis Cache SET: {key} (TTL: {ttl}s)")
        except Exception as e:
            logger.error(f"Redis set error: {e}")
    
    def delete(self, key: str) -> None:
        """Удалить значение из кэша."""
        redis = self._get_redis()
        if not redis:
            return
        
        try:
            redis.delete(f"kudago:{key}")
            logger.debug(f"Redis Cache DELETE: {key}")
        except Exception as e:
            logger.error(f"Redis delete error: {e}")
    
    def clear(self) -> None:
        """Очистить весь кэш."""
        redis = self._get_redis()
        if not redis:
            return
        
        try:
            for key in redis.scan_iter("kudago:*"):
                redis.delete(key)
            logger.info("Redis cache cleared")
        except Exception as e:
            logger.error(f"Redis clear error: {e}")
    
    def get_stats(self) -> dict:
        """Получить статистику кэша."""
        redis = self._get_redis()
        if not redis:
            return {"size": 0, "type": "unavailable"}
        
        try:
            count = 0
            for _ in redis.scan_iter("kudago:*"):
                count += 1
            return {"size": count, "type": "redis"}
        except Exception as e:
            return {"size": 0, "type": "error", "error": str(e)}


# ==================== Фабрика кэша ====================

def get_cache() -> Any:
    """Получить экземпляр кэша в зависимости от конфигурации."""
    if cache_config.use_redis:
        return RedisCache(
            host=cache_config.redis_host,
            port=cache_config.redis_port,
            db=cache_config.redis_db,
            password=cache_config.redis_password,
        )
    return InMemoryCache(max_size=cache_config.max_memory_items)


# Глобальный экземпляр кэша
_cache_instance = None

def get_cache_instance() -> Any:
    """Получить глобальный экземпляр кэша (singleton)."""
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = get_cache()
    return _cache_instance


# ==================== Декораторы кэширования ====================

def cached(ttl: Optional[int] = None, key_prefix: str = ""):
    """
    Декоратор для кэширования результатов функции.
    
    Args:
        ttl: Время жизни кэша в секундах
        key_prefix: Префикс для ключа кэша
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            if not cache_config.enabled:
                return func(*args, **kwargs)
            
            # Создание ключа кэша
            cache_key = f"{key_prefix}:{func.__name__}:{json.dumps(args, default=str)}:{json.dumps(kwargs, default=str)}"
            
            cache = get_cache_instance()
            cached_value = cache.get(cache_key)
            
            if cached_value is not None:
                from kudago_api_monitor import metrics_collector
                metrics_collector.increment_cache_hits()
                logger.info(f"Cache hit for {func.__name__}")
                return cached_value
            
            from kudago_api_monitor import metrics_collector
            metrics_collector.increment_cache_misses()
            
            # Вызов функции и кэширование результата
            result = func(*args, **kwargs)
            cache.set(cache_key, result, ttl)
            
            return result
        
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            if not cache_config.enabled:
                return await func(*args, **kwargs)
            
            # Создание ключа кэша
            cache_key = f"{key_prefix}:{func.__name__}:{json.dumps(args, default=str)}:{json.dumps(kwargs, default=str)}"
            
            cache = get_cache_instance()
            cached_value = cache.get(cache_key)
            
            if cached_value is not None:
                from kudago_api_monitor import metrics_collector
                metrics_collector.increment_cache_hits()
                logger.info(f"Cache hit for {func.__name__}")
                return cached_value
            
            from kudago_api_monitor import metrics_collector
            metrics_collector.increment_cache_misses()
            
            # Вызов функции и кэширование результата
            result = await func(*args, **kwargs)
            cache.set(cache_key, result, ttl)
            
            return result
        
        # Возвращаем соответствующую обёртку
        if inspect.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator


# ==================== Утилиты ====================

def clear_cache():
    """Очистить кэш."""
    cache = get_cache_instance()
    cache.clear()


def get_cache_stats() -> dict:
    """Получить статистику кэша."""
    cache = get_cache_instance()
    return cache.get_stats()


def configure_cache(
    enabled: bool = True,
    use_redis: bool = False,
    redis_host: str = "localhost",
    redis_port: int = 6379,
    redis_db: int = 0,
    redis_password: Optional[str] = None,
    default_ttl: int = 300,
):
    """Настроить кэширование."""
    cache_config.enabled = enabled
    cache_config.use_redis = use_redis
    cache_config.redis_host = redis_host
    cache_config.redis_port = redis_port
    cache_config.redis_db = redis_db
    cache_config.redis_password = redis_password
    cache_config.default_ttl = default_ttl
    
    # Пересоздать экземпляр кэша
    global _cache_instance
    _cache_instance = get_cache()
    
    logger.info(f"Cache configured: enabled={enabled}, use_redis={use_redis}, ttl={default_ttl}s")