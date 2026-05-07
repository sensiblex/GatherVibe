"""Общие утилиты для KudaGo-слоёв (sync и async API, кэш).

Содержит чистые функции без I/O и без зависимостей от httpx/asyncio.
Вынесено сюда, чтобы устранить дублирование между kudago_api.py и
kudago_api_async.py.
"""
from typing import Any


def safe_str(val: Any) -> str:
    """Безопасное преобразование значения KudaGo в строку.

    - Falsy (пусто/None/пустой dict) → "" (кроме 0, который сохраняется).
    - str → без изменений.
    - dict → первое непустое из name/slug/title/id или "".
    - остальное → str(val).
    """
    if not val and val != 0:
        return ""
    if isinstance(val, str):
        return val
    if isinstance(val, dict):
        return str(val.get("name") or val.get("slug") or val.get("title") or val.get("id") or "")
    return str(val)
