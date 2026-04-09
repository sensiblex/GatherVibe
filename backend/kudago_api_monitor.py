"""
Система мониторинга API KudaGo.
Включает логирование запросов, метрики доступности, latency, ошибки.
Поддержка экспорта в Prometheus.
"""
import time
import logging
import asyncio
from typing import Optional, Callable, Any
from functools import wraps
from datetime import datetime
from dataclasses import dataclass, field
from threading import Lock

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("kudago_api")


# ==================== Метрики ====================

class APIMetricsCollector:
    """Сборщик метрик API с thread-safe операциями."""
    
    def __init__(self):
        self._lock = Lock()
        self._total_requests = 0
        self._successful_requests = 0
        self._failed_requests = 0
        self._cache_hits = 0
        self._cache_misses = 0
        self._latencies = []
        self._max_latencies_store = 1000  # Храним последние 1000 значений
    
    def increment_total(self):
        with self._lock:
            self._total_requests += 1
    
    def increment_success(self):
        with self._lock:
            self._successful_requests += 1
    
    def increment_failed(self):
        with self._lock:
            self._failed_requests += 1
    
    def increment_cache_hits(self):
        with self._lock:
            self._cache_hits += 1
    
    def increment_cache_misses(self):
        with self._lock:
            self._cache_misses += 1
    
    def record_latency(self, latency_ms: float):
        with self._lock:
            self._latencies.append(latency_ms)
            if len(self._latencies) > self._max_latencies_store:
                self._latencies.pop(0)
    
    def get_metrics(self) -> dict:
        with self._lock:
            avg_latency = sum(self._latencies) / len(self._latencies) if self._latencies else 0
            return {
                "total_requests": self._total_requests,
                "successful_requests": self._successful_requests,
                "failed_requests": self._failed_requests,
                "cache_hits": self._cache_hits,
                "cache_misses": self._cache_misses,
                "avg_latency_ms": round(avg_latency, 2),
                "min_latency_ms": round(min(self._latencies), 2) if self._latencies else 0,
                "max_latency_ms": round(max(self._latencies), 2) if self._latencies else 0,
                "success_rate": round(self._successful_requests / self._total_requests * 100, 2) if self._total_requests > 0 else 0,
            }
    
    def reset(self):
        with self._lock:
            self._total_requests = 0
            self._successful_requests = 0
            self._failed_requests = 0
            self._cache_hits = 0
            self._cache_misses = 0
            self._latencies = []


# Глобальный экземпляр сборщика метрик
metrics_collector = APIMetricsCollector()


# ==================== Декораторы мониторинга ====================

def monitor_request(func: Callable) -> Callable:
    """
    Декоратор для мониторинга синхронных функций.
    Логирует запросы, записывает метрики latency и ошибки.
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        metrics_collector.increment_total()
        
        logger.info(f"API Request: {func.__name__} | Args: {args[1:] if args else ()} | Kwargs: {kwargs}")
        
        try:
            result = func(*args, **kwargs)
            latency_ms = (time.perf_counter() - start_time) * 1000
            metrics_collector.record_latency(latency_ms)
            metrics_collector.increment_success()
            
            logger.info(f"API Response: {func.__name__} | Latency: {latency_ms:.2f}ms | Status: SUCCESS")
            return result
            
        except Exception as e:
            latency_ms = (time.perf_counter() - start_time) * 1000
            metrics_collector.record_latency(latency_ms)
            metrics_collector.increment_failed()
            
            logger.error(f"API Error: {func.__name__} | Latency: {latency_ms:.2f}ms | Error: {str(e)}")
            raise
    
    return wrapper


def monitor_async_request(func: Callable) -> Callable:
    """
    Декоратор для мониторинга асинхронных функций.
    Логирует запросы, записывает метрики latency и ошибки.
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        metrics_collector.increment_total()
        
        logger.info(f"API Request (async): {func.__name__} | Args: {args[1:] if args else ()} | Kwargs: {kwargs}")
        
        try:
            result = await func(*args, **kwargs)
            latency_ms = (time.perf_counter() - start_time) * 1000
            metrics_collector.record_latency(latency_ms)
            metrics_collector.increment_success()
            
            logger.info(f"API Response: {func.__name__} | Latency: {latency_ms:.2f}ms | Status: SUCCESS")
            return result
            
        except Exception as e:
            latency_ms = (time.perf_counter() - start_time) * 1000
            metrics_collector.record_latency(latency_ms)
            metrics_collector.increment_failed()
            
            logger.error(f"API Error: {func.__name__} | Latency: {latency_ms:.2f}ms | Error: {str(e)}")
            raise
    
    return wrapper


# ==================== Prometheus-экспортер ====================

class PrometheusExporter:
    """
    Экспортер метрик в формате Prometheus.
    """
    
    def __init__(self, prefix: str = "kudago_api"):
        self.prefix = prefix
    
    def generate_metrics(self) -> str:
        """Генерирует текстовый формат метрик для Prometheus."""
        metrics = metrics_collector.get_metrics()
        
        lines = [
            f"# HELP {self.prefix}_total_requests Total number of API requests",
            f"# TYPE {self.prefix}_total_requests counter",
            f"{self.prefix}_total_requests {metrics['total_requests']}",
            "",
            f"# HELP {self.prefix}_successful_requests Number of successful API requests",
            f"# TYPE {self.prefix}_successful_requests counter",
            f"{self.prefix}_successful_requests {metrics['successful_requests']}",
            "",
            f"# HELP {self.prefix}_failed_requests Number of failed API requests",
            f"# TYPE {self.prefix}_failed_requests counter",
            f"{self.prefix}_failed_requests {metrics['failed_requests']}",
            "",
            f"# HELP {self.prefix}_cache_hits Number of cache hits",
            f"# TYPE {self.prefix}_cache_hits counter",
            f"{self.prefix}_cache_hits {metrics['cache_hits']}",
            "",
            f"# HELP {self.prefix}_cache_misses Number of cache misses",
            f"# TYPE {self.prefix}_cache_misses counter",
            f"{self.prefix}_cache_misses {metrics['cache_misses']}",
            "",
            f"# HELP {self.prefix}_avg_latency_ms Average latency in milliseconds",
            f"# TYPE {self.prefix}_avg_latency_ms gauge",
            f"{self.prefix}_avg_latency_ms {metrics['avg_latency_ms']}",
            "",
            f"# HELP {self.prefix}_min_latency_ms Minimum latency in milliseconds",
            f"# TYPE {self.prefix}_min_latency_ms gauge",
            f"{self.prefix}_min_latency_ms {metrics['min_latency_ms']}",
            "",
            f"# HELP {self.prefix}_max_latency_ms Maximum latency in milliseconds",
            f"# TYPE {self.prefix}_max_latency_ms gauge",
            f"{self.prefix}_max_latency_ms {metrics['max_latency_ms']}",
            "",
            f"# HELP {self.prefix}_success_rate Success rate percentage",
            f"# TYPE {self.prefix}_success_rate gauge",
            f"{self.prefix}_success_rate {metrics['success_rate']}",
        ]
        
        return "\n".join(lines)


# ==================== Health Check ====================

async def check_api_health() -> dict:
    """
    Проверяет здоровье API.
    Возвращает статус и метрики.
    """
    from kudago_api_async import get_event_categories
    
    start_time = time.perf_counter()
    
    try:
        await get_event_categories()
        latency_ms = (time.perf_counter() - start_time) * 1000
        
        if latency_ms < 1000:
            status = "healthy"
        elif latency_ms < 3000:
            status = "degraded"
        else:
            status = "unhealthy"
            
    except Exception as e:
        latency_ms = (time.perf_counter() - start_time) * 1000
        status = "unhealthy"
        logger.error(f"Health check failed: {str(e)}")
    
    return {
        "status": status,
        "latency_ms": round(latency_ms, 2),
        "timestamp": datetime.utcnow().isoformat(),
        "service": "kudago_api"
    }


# ==================== Утилиты ====================

def get_current_metrics() -> dict:
    """Возвращает текущие метрики API."""
    return metrics_collector.get_metrics()


def reset_metrics():
    """Сбрасывает все метрики."""
    metrics_collector.reset()
    logger.info("Metrics reset")