from passlib.context import CryptContext
from jwt_handler import create_access_token
from datetime import timedelta

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    '''хэширует пароль'''
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    '''проверяет пароль по хешу'''
    return pwd_context.verify(plain_password, hashed_password)


def authenticate_user(email: str, password: str, db):
    '''аутентифицирует пользователя по email и паролю'''
    from models.user import User

    user = db.query(User).filter(User.email == email).first()
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def create_user_token(user):
    '''генерирует токен для пользователя'''
    token = create_access_token(
        data={
            "sub": user.email,
            "id": user.id,
            "username": user.username,
            "role": getattr(user, "role", "user"),
        },
        expires_delta=timedelta(minutes=60 * 24 * 7),  # 7 дней
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user.id,
        "username": user.username,
        "email": user.email,
        "role": getattr(user, "role", "user"),
    }
