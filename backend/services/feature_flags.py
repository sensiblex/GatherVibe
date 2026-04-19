"""Feature-flag helpers. Defaults to True if flag row absent."""
from sqlalchemy.orm import Session
from models.feature_flag import FeatureFlag

KNOWN_FLAGS: dict[str, str] = {
    "registration_enabled": "Разрешена регистрация новых пользователей",
    "party_creation_enabled": "Разрешено создание новых party",
    "file_upload_enabled": "Разрешена загрузка файлов в чат",
}


def ensure_known_flags(db: Session) -> None:
    """Создаёт строки для известных флагов, если их ещё нет. Не трогает существующие значения."""
    existing = {row.key for row in db.query(FeatureFlag.key).all()}
    new_rows = False
    for key, desc in KNOWN_FLAGS.items():
        if key not in existing:
            db.add(FeatureFlag(key=key, enabled=True, description=desc))
            new_rows = True
    if new_rows:
        db.commit()


def is_flag_enabled(db: Session, key: str, default: bool = True) -> bool:
    row = db.query(FeatureFlag).filter(FeatureFlag.key == key).first()
    if row is None:
        return default
    return bool(row.enabled)
