"""Shared pure scoring helpers used by matching services.

Общие математические утилиты без ORM и I/O. Вынесены сюда, чтобы избежать
дублирования между services/matching.py, services/event_matching.py и
services/people_matching.py.
"""
from datetime import date


def parse_csv_to_set(raw: str | None) -> set[str]:
    """Разбирает CSV-строку в нормализованный нижнерегистровый set."""
    if not raw:
        return set()
    return {t.strip().lower() for t in raw.split(",") if t.strip()}


def jaccard(a: set[str], b: set[str]) -> float:
    """Jaccard similarity |a∩b|/|a∪b|. Возвращает 0.0 если любой set пуст."""
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def age_from_birthdate(bd: date | None, today: date | None = None) -> int | None:
    """Возраст в годах или None если дата рождения не задана."""
    if bd is None:
        return None
    today = today or date.today()
    years = today.year - bd.year
    if (today.month, today.day) < (bd.month, bd.day):
        years -= 1
    return max(0, years)
