from __future__ import annotations

import logging
import os

from sqlalchemy import inspect
from sqlalchemy.engine import Engine

from database import Base, engine

logger = logging.getLogger(__name__)


def _load_model_modules() -> None:
    """Import all ORM models so that Base.metadata is fully populated."""
    import models.user  # noqa: F401
    import models.event  # noqa: F401
    import models.attendee  # noqa: F401
    import models.party  # noqa: F401
    import models.chat_message  # noqa: F401
    import models.review  # noqa: F401
    import models.notification  # noqa: F401
    import models.kudago_event  # noqa: F401
    import models.party_coordination  # noqa: F401
    import models.push_subscription  # noqa: F401
    import models.message_reaction  # noqa: F401
    import models.party_recap  # noqa: F401
    import models.report  # noqa: F401
    import models.audit_log  # noqa: F401
    import models.feature_flag  # noqa: F401
    import models.banned_word  # noqa: F401
    import models.appeal  # noqa: F401
    import models.token_revocation  # noqa: F401


def _required_schema() -> dict[str, set[str]]:
    _load_model_modules()
    required: dict[str, set[str]] = {}
    for table in Base.metadata.sorted_tables:
        required[table.name] = {column.name for column in table.columns}
    return required


def _resolve_mode(raw_mode: str | None) -> str:
    if raw_mode:
        mode = raw_mode.strip().lower()
        if mode in {"strict", "soft", "skip"}:
            return mode
        logger.warning("Unknown SCHEMA_CHECK_MODE=%s, using fallback.", mode)

    if os.getenv("SKIP_SCHEMA_CHECK", "").strip().lower() == "1":
        return "skip"

    if os.getenv("PYTEST_CURRENT_TEST"):
        return "soft"

    app_env = (
        os.getenv("APP_ENV")
        or os.getenv("ENV")
        or os.getenv("ENVIRONMENT")
        or os.getenv("NODE_ENV")
        or ""
    ).lower()
    if app_env in {"production", "prod", "production-like"}:
        return "strict"
    return "soft"


def _schema_issues(bind: Engine) -> tuple[list[str], dict[str, list[str]]]:
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())
    required = _required_schema()
    missing_tables: list[str] = []
    missing_columns: dict[str, list[str]] = {}

    for table_name, required_cols in required.items():
        if table_name not in existing_tables:
            missing_tables.append(table_name)
            continue

        existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
        missing = sorted(required_cols - existing_cols)
        if missing:
            missing_columns[table_name] = missing

    return missing_tables, missing_columns


def _format_error(missing_tables: list[str], missing_columns: dict[str, list[str]]) -> str:
    parts: list[str] = ["Database schema mismatch detected."]

    if missing_tables:
        parts.append(
            "Missing tables: "
            + ", ".join(sorted(missing_tables))
        )

    if missing_columns:
        parts.append("Missing columns:")
        for table_name in sorted(missing_columns):
            parts.append(f"  - {table_name}: {', '.join(missing_columns[table_name])}")

    parts.append("Run migration: `alembic upgrade head`.")
    parts.append("For local/dev/test flows use `SCHEMA_CHECK_MODE=soft`.")
    parts.append("To bypass in controlled environments: `SKIP_SCHEMA_CHECK=1`.")
    return "\n".join(parts)


def ensure_db_schema_compatibility(
    bind: Engine | None = None,
    mode: str | None = None,
) -> None:
    """Validate that required models exist in DB schema.

    `strict` raises RuntimeError and fails startup.
    `soft` logs warning and returns.
    `skip` bypasses checks.
    """
    check_mode = _resolve_mode(mode)
    if check_mode == "skip":
        logger.warning("SCHEMA_CHECK_MODE=skip/SKIP_SCHEMA_CHECK -> schema compatibility check skipped.")
        return

    bind = bind or engine
    try:
        missing_tables, missing_columns = _schema_issues(bind)
    except Exception as exc:
        message = (
            "Schema check failed (db inspection error). "
            "Ensure DB is reachable and run `alembic upgrade head` after fixing connection issues."
        )
        if check_mode == "strict":
            raise RuntimeError(message) from exc
        logger.warning("%s", message)
        logger.debug("Schema check failure details", exc_info=exc)
        return

    if not missing_tables and not missing_columns:
        return

    message = _format_error(missing_tables, missing_columns)
    if check_mode == "strict":
        raise RuntimeError(message)
    logger.warning("%s", message)


def get_current_schema_check_mode() -> str:
    return _resolve_mode(os.getenv("SCHEMA_CHECK_MODE"))
