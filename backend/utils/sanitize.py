from __future__ import annotations

from typing import Optional
import re

import bleach

_SCRIPT_BLOCK_RE = re.compile(r"<script\b[^>]*>.*?</script>", flags=re.IGNORECASE | re.DOTALL)
_INLINE_HANDLER_RE = re.compile(r"on[a-z0-9_]+\s*=", flags=re.IGNORECASE)
_DANGEROUS_PROTOCOL_RE = re.compile(r"\b(?:javascript|data|vbscript)\s*:", flags=re.IGNORECASE)
_SQL_KEYWORD_RE = re.compile(
    r"\b(?:union|select|drop|insert|update|delete|exec|execute)\b",
    flags=re.IGNORECASE,
)
_SQL_META_CHARS = ("'", '"', ";", "--", "/*", "*/")


def sanitize_input(value: Optional[str], field_type: str = "text") -> Optional[str]:
    """Sanitize user-supplied text against common SQLi and XSS payloads."""
    if value is None:
        return None

    cleaned = str(value)

    # Drop complete script blocks with their bodies before HTML stripping.
    cleaned = _SCRIPT_BLOCK_RE.sub(" ", cleaned)
    cleaned = bleach.clean(cleaned, tags=[], attributes={}, strip=True)
    cleaned = _INLINE_HANDLER_RE.sub("", cleaned)
    cleaned = _DANGEROUS_PROTOCOL_RE.sub("", cleaned)

    for token in _SQL_META_CHARS:
        cleaned = cleaned.replace(token, "")
    cleaned = _SQL_KEYWORD_RE.sub("", cleaned)

    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def sanitize_text(value: Optional[str]) -> Optional[str]:
    """Backward-compatible alias for shared text sanitization."""
    return sanitize_input(value)
