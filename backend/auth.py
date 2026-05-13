"""
Функции аутентификации и авторизации.
"""
from passlib.context import CryptContext
from jwt_handler import create_access_token
from datetime import timedelta

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Хэширует пароль."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверяет пароль по хешу."""
    return pwd_context.verify(plain_password, hashed_password)


def authenticate_user(email: str, password: str, db):
    """Аутентифицирует пользователя по email и паролю."""
    from models.user import User

    user = db.query(User).filter(User.email == email).first()
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def create_user_token(user):
    """Генерирует токен для пользователя."""
    role = getattr(user, "role", "user")
    token = create_access_token(
        data={
            "sub": user.email,
            "id": user.id,
            "username": user.username,
            "role": role,
        },
        expires_delta=timedelta(hours=2),
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user.id,
        "username": user.username,
        "email": user.email,
        "role": role,
    }
