import re
from typing import Tuple
from sqlalchemy.orm import Session
from models.banned_word import BannedWord


_REPLACEMENT = "***"


def filter_text(db: Session, text: str) -> Tuple[str, bool]:
    """Заменяет совпадения на ***. Возвращает (text, was_changed)."""
    if not text:
        return text, False
    rows = db.query(BannedWord).all()
    if not rows:
        return text, False

    result = text
    changed = False
    for w in rows:
        p = w.pattern or ""
        if not p:
            continue
        try:
            if w.is_regex:
                rx = re.compile(p, re.IGNORECASE)
            else:
                rx = re.compile(re.escape(p), re.IGNORECASE)
        except re.error:
            continue
        new_result, n = rx.subn(_REPLACEMENT, result)
        if n > 0:
            changed = True
            result = new_result
    return result, changed
