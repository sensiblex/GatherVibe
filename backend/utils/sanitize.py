from typing import Optional
import bleach


def sanitize_text(value: Optional[str]) -> Optional[str]:
    """Strip all HTML tags and dangerous attributes from user-supplied text.

    Returns None if input is None. Preserves plain text including unicode.
    Pairs with frontend rendering that treats the value as plain text.
    """
    if value is None:
        return None
    cleaned = bleach.clean(value, tags=[], attributes={}, strip=True)
    return cleaned.strip()
