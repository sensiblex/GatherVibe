"""
search_utils.py — Умный препроцессор поисковых запросов для GatherVibe.

Возможности:
  1. Нормализация запроса (lowercase, лишние пробелы, пунктуация)
  2. Транслитерация Latin → Cyrillic и обратно
  3. Словарь синонимов / алиасов категорий
  4. Раскладка клавиатуры (QWERTY → ЙЦУКЕН)
  5. Мульти-запросная стратегия: если основной запрос вернул мало результатов,
     автоматически пробуем альтернативы и объединяем.
  6. Fuzzy re-ranking результатов по близости к оригинальному запросу.
"""

import re
import unicodedata
from difflib import SequenceMatcher
from typing import Callable


# ─── 1. Нормализация ─────────────────────────────────────────────────────────

def normalize(query: str) -> str:
    """Lowercase, убираем лишние символы и пробелы."""
    q = query.strip().lower()
    # Убираем двойные пробелы
    q = re.sub(r"\s+", " ", q)
    # Убираем знаки пунктуации кроме дефиса и точки (нужны для аббревиатур)
    q = re.sub(r"[^\w\s\-\.]", "", q, flags=re.UNICODE)
    return q.strip()


# ─── 2. Транслитерация ───────────────────────────────────────────────────────

# Латиница → Кириллица (по звуку, не по ГОСТ)
_LAT_TO_CYR: dict[str, str] = {
    "yo":  "ё",  "ya":  "я",  "yu":  "ю",  "ye":  "е",
    "zh":  "ж",  "kh":  "х",  "ts":  "ц",  "ch":  "ч",
    "sh":  "ш",  "sch": "щ",  "shch":"щ",
    "a": "а", "b": "б", "v": "в", "g": "г", "d": "д",
    "e": "е", "z": "з", "i": "и", "j": "й", "k": "к",
    "l": "л", "m": "м", "n": "н", "o": "о", "p": "п",
    "r": "р", "s": "с", "t": "т", "u": "у", "f": "ф",
    "h": "х", "c": "к", "w": "в", "x": "кс", "q": "к",
    "y": "й",
}

# Кириллица → Латиница (обратная, тоже по звуку)
_CYR_TO_LAT: dict[str, str] = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d",
    "е": "e", "ё": "yo", "ж": "zh", "з": "z", "и": "i",
    "й": "j", "к": "k", "л": "l", "м": "m", "н": "n",
    "о": "o", "п": "p", "р": "r", "с": "s", "т": "t",
    "у": "u", "ф": "f", "х": "kh", "ц": "ts", "ч": "ch",
    "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "",
    "э": "e", "ю": "yu", "я": "ya",
}


def _lat_to_cyr(text: str) -> str:
    """Конвертирует латинский текст в кириллицу по звуку."""
    result = []
    i = 0
    text = text.lower()
    # Пробуем 4-буквенные комбинации, потом 3, потом 2, потом 1
    while i < len(text):
        matched = False
        for length in (4, 3, 2, 1):
            chunk = text[i:i + length]
            if chunk in _LAT_TO_CYR:
                result.append(_LAT_TO_CYR[chunk])
                i += length
                matched = True
                break
        if not matched:
            result.append(text[i])
            i += 1
    return "".join(result)


def _cyr_to_lat(text: str) -> str:
    """Конвертирует кириллицу в латиницу."""
    return "".join(_CYR_TO_LAT.get(ch, ch) for ch in text.lower())


def is_latin(text: str) -> bool:
    """True если большинство букв — латиница."""
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return False
    latin_count = sum(1 for c in letters if ord(c) < 128)
    return latin_count / len(letters) > 0.5


def is_cyrillic(text: str) -> bool:
    """True если большинство букв — кириллица."""
    return not is_latin(text)


def transliterate(query: str) -> str | None:
    """
    Возвращает транслитерированную версию, если она отличается от оригинала.
    Lat→Cyr или Cyr→Lat.
    """
    q = query.strip().lower()
    if is_latin(q):
        result = _lat_to_cyr(q)
    else:
        result = _cyr_to_lat(q)
    return result if result != q else None


# ─── 3. QWERTY → ЙЦУКЕН (частая ошибка: писали в английской раскладке) ───────

_QWERTY_TO_RU = str.maketrans(
    "qwertyuiop[]asdfghjkl;'zxcvbnm,."
    "QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>",
    "йцукенгшщзхъфывапролджэячсмитьбю"
    "ЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ",
)

_RU_TO_QWERTY = str.maketrans(
    "йцукенгшщзхъфывапролджэячсмитьбю"
    "ЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ",
    "qwertyuiop[]asdfghjkl;'zxcvbnm,."
    "QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>",
)


def switch_layout(query: str) -> str | None:
    """
    Если запрос написан в неправильной раскладке — переключает.
    Определяет нужность переключения по наличию «бессмысленных» символов.
    """
    q = query.strip()
    if is_latin(q):
        # Все буквы латинские, но возможно человек печатал в русской раскладке
        switched = q.translate(_QWERTY_TO_RU)
        # Считаем переключение полезным если результат содержит кириллицу
        if any("а" <= c.lower() <= "я" for c in switched):
            return switched.lower()
    else:
        # Кириллический запрос — может быть написан в QWERTY
        switched = q.translate(_RU_TO_QWERTY)
        if switched.lower() != q.lower() and switched.strip():
            return switched.lower()
    return None


# ─── 4. Синонимы и алиасы ────────────────────────────────────────────────────

_SYNONYMS: dict[str, list[str]] = {
    # Музыка
    "концерт":      ["концерты", "выступление", "шоу", "music", "concert"],
    "музыка":       ["концерт", "джаз", "рок", "поп", "фестиваль"],
    "джаз":         ["джазовый", "jazz"],
    "рок":          ["rock", "металл", "punk"],
    "рэп":          ["хип-хоп", "hip-hop", "rap"],
    # Спорт
    "тренинг":      ["тренировка", "воркшоп", "training", "семинар"],
    "спорт":        ["фитнес", "йога", "бег", "футбол", "баскетбол", "спортивный"],
    "йога":         ["yoga", "медитация", "фитнес"],
    "бег":          ["марафон", "пробежка", "running"],
    "фитнес":       ["тренировка", "зал", "спорт"],
    # Культура
    "театр":        ["театральный", "спектакль", "пьеса", "опера", "мюзикл"],
    "кино":         ["фильм", "кинотеатр", "cinema", "movie", "показ"],
    "выставка":     ["экспозиция", "галерея", "музей", "exhibition"],
    "музей":        ["выставка", "галерея", "экспозиция"],
    "лекция":       ["доклад", "семинар", "воркшоп", "лекторий"],
    "воркшоп":      ["workshop", "мастер-класс", "тренинг", "курс"],
    "мастер-класс": ["воркшоп", "workshop", "мк", "обучение"],
    # Еда
    "еда":          ["гастро", "ресторан", "кулинария", "дегустация"],
    "вино":         ["дегустация", "сомелье", "wine"],
    "кофе":         ["кофейня", "coffee", "бариста"],
    # Детям
    "дети":         ["детский", "ребёнок", "ребенок", "kids", "family"],
    "детский":      ["дети", "семейный", "для детей"],
    # Прочее
    "экскурсия":    ["тур", "прогулка", "путешествие", "tour"],
    "фестиваль":    ["festival", "праздник", "ярмарка"],
    "праздник":     ["вечеринка", "party", "фестиваль", "event"],
    "вечеринка":    ["party", "клуб", "дискотека", "тусовка"],
    "квест":        ["игра", "квиз", "escape", "загадка"],
    "квиз":         ["квест", "игра", "викторина", "quiz"],
    "танцы":        ["dancing", "dance", "хореография", "балет"],
    "балет":        ["танцы", "хореография", "опера"],
    "онлайн":       ["online", "вебинар", "трансляция", "стрим"],
    "стендап":      ["comedy", "юмор", "stand-up", "комедия"],
    "комедия":      ["стендап", "юмор", "comedy"],
}

# Нормализуем ключи и значения
_NORMALIZED_SYNONYMS: dict[str, list[str]] = {
    normalize(k): [normalize(v) for v in vs]
    for k, vs in _SYNONYMS.items()
}


def get_synonyms(query: str) -> list[str]:
    """Возвращает синонимы для запроса (или его слов)."""
    q = normalize(query)
    results: list[str] = []

    # Точное совпадение
    if q in _NORMALIZED_SYNONYMS:
        results.extend(_NORMALIZED_SYNONYMS[q])

    # Поиск по словам
    for word in q.split():
        if word in _NORMALIZED_SYNONYMS and word != q:
            results.extend(_NORMALIZED_SYNONYMS[word][:2])  # не больше 2 на слово

    # Обратный поиск: если запрос — это синоним, возвращаем ключевое слово
    for key, syns in _NORMALIZED_SYNONYMS.items():
        if q in syns and key not in results:
            results.append(key)

    # Убираем дубли и сам запрос
    seen = {q}
    unique = []
    for r in results:
        if r not in seen:
            seen.add(r)
            unique.append(r)
    return unique


# ─── 5. Генерация вариантов запроса ──────────────────────────────────────────

def generate_variants(query: str) -> list[str]:
    """
    Возвращает список вариантов запроса для мульти-поиска.
    Порядок: оригинал, транслит, раскладка, синонимы, первое слово.
    """
    q = normalize(query)
    variants: list[str] = [q]
    seen: set[str] = {q}

    def add(v: str | None) -> None:
        if v and v.strip() and normalize(v) not in seen:
            n = normalize(v)
            seen.add(n)
            variants.append(n)

    # Транслитерация
    add(transliterate(q))

    # Смена раскладки
    add(switch_layout(q))

    # Синонимы (берём первые 3)
    for syn in get_synonyms(q)[:3]:
        add(syn)

    # Для составных запросов — ключевое слово (первое содержательное)
    words = [w for w in q.split() if len(w) > 2]
    if len(words) > 1:
        add(words[0])

    return variants


# ─── 6. Fuzzy re-ranking ──────────────────────────────────────────────────────

def _text_similarity(a: str, b: str) -> float:
    """SequenceMatcher ratio между двумя строками."""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def score_event(event: dict, original_query: str) -> float:
    """
    Вычисляет релевантность события для оригинального запроса.
    Учитывает заголовок, описание и теги.
    """
    q = normalize(original_query)
    title = normalize(event.get("title", ""))
    short_title = normalize(event.get("short_title", "") or "")
    description = normalize(event.get("description", "") or "")
    tags = " ".join(normalize(t) for t in (event.get("tags") or []))

    score = 0.0

    # Точное вхождение — максимальный бонус
    if q in title:
        score += 1.0
    elif q in short_title:
        score += 0.9
    elif q in description:
        score += 0.5
    elif q in tags:
        score += 0.4

    # Fuzzy similarity по title
    title_sim = _text_similarity(q, title)
    score += title_sim * 0.8

    # Каждое слово запроса в title
    for word in q.split():
        if len(word) > 2 and word in title:
            score += 0.3

    # Синонимы: если синоним встречается в title — небольшой бонус
    for syn in get_synonyms(q)[:2]:
        if syn in title:
            score += 0.15

    return score


def rerank(events: list[dict], original_query: str) -> list[dict]:
    """
    Пересортировывает события по релевантности к оригинальному запросу.
    Стабильная сортировка: события с одинаковым score сохраняют исходный порядок.
    """
    if not original_query.strip():
        return events
    scored = [(score_event(e, original_query), i, e) for i, e in enumerate(events)]
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [e for _, _, e in scored]


# ─── 7. Мульти-запросная стратегия ───────────────────────────────────────────

def smart_search(
    query: str,
    search_fn: Callable[[str], dict],
    min_results: int = 3,
    max_variants: int = 3,
) -> dict:
    """
    Выполняет умный поиск:
      1. Основной запрос (нормализованный).
      2. Если результатов < min_results — пробует альтернативные варианты.
      3. Объединяет результаты, убирает дубли.
      4. Re-rank по оригинальному запросу.

    Args:
        query: оригинальный поисковый запрос пользователя
        search_fn: callable(query_str) → dict с ключами "results", "count", "next"
        min_results: порог для запуска fallback-поиска
        max_variants: максимум альтернативных запросов

    Returns:
        dict в формате KudaGo (count, results, next, previous, _variants_used)
    """
    variants = generate_variants(query)
    primary = variants[0]

    # Основной запрос
    primary_raw = search_fn(primary)
    primary_results: list[dict] = primary_raw.get("results", [])

    # Если достаточно результатов — просто re-rank и возвращаем
    if len(primary_results) >= min_results:
        ranked = rerank(primary_results, query)
        return {**primary_raw, "results": ranked, "_variants_used": [primary]}

    # Fallback: пробуем альтернативные варианты
    all_results: list[dict] = list(primary_results)
    seen_ids: set[int] = {e["id"] for e in primary_results if "id" in e}
    variants_used = [primary]

    for variant in variants[1:max_variants + 1]:
        if len(all_results) >= min_results * 3:
            break
        try:
            raw = search_fn(variant)
            for event in raw.get("results", []):
                eid = event.get("id")
                if eid and eid not in seen_ids:
                    seen_ids.add(eid)
                    all_results.append(event)
            variants_used.append(variant)
        except Exception:
            continue

    # Re-rank объединённых результатов
    ranked = rerank(all_results, query)

    return {
        "count": len(ranked),
        "next": primary_raw.get("next") if len(primary_results) >= min_results else None,
        "previous": primary_raw.get("previous"),
        "results": ranked,
        "_variants_used": variants_used,
    }
