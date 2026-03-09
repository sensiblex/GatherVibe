from passlib.context import CryptContext
from jwt_handler import create_access_token
from datetime import timedelta

# sha256 — достаточно для курсовика
pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def authenticate_user(email: str, password: str, db):
    from models.user import User

    user = db.query(User).filter(User.email == email).first()
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def create_user_token(user):
    token = create_access_token(
        data={"sub": user.email, "id": user.id, "username": user.username},
        expires_delta=timedelta(minutes=60 * 24 * 7),  # 7 дней
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user.id,
        "username": user.username,
        "email": user.email,
    }
