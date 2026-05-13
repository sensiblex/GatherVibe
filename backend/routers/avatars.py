import os
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from deps import current_user, get_db
from models.user import User

router = APIRouter(prefix="/users/me/avatar", tags=["avatars"])

_ALLOWED_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
_MAX_SIZE_BYTES = 5 * 1024 * 1024
_UPLOAD_DIR = Path("uploads/avatars")
_CHUNK_SIZE = 1024 * 1024


@router.post("")
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """Загружает аватар пользователя."""
    ext = _ALLOWED_TYPES.get(file.content_type or "")
    if ext is None:
        raise HTTPException(status_code=400, detail="Только изображения")

    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    target_path = _UPLOAD_DIR / f"{user.id}.{ext}"

    total = 0
    with target_path.open("wb") as out:
        while True:
            chunk = await file.read(_CHUNK_SIZE)
            if not chunk:
                break
            total += len(chunk)
            if total > _MAX_SIZE_BYTES:
                out.close()
                target_path.unlink(missing_ok=True)
                raise HTTPException(status_code=400, detail="Файл слишком большой (макс 5MB)")
            out.write(chunk)
    await file.close()

    old_avatar_url = user.avatar_url
    if old_avatar_url and old_avatar_url.startswith("/uploads/avatars/"):
        old_rel = old_avatar_url.removeprefix("/uploads/")
        old_path = Path("uploads") / old_rel
        if old_path != target_path and old_path.exists():
            os.remove(old_path)

    user.avatar_url = f"/uploads/avatars/{user.id}.{ext}"
    db.commit()
    db.refresh(user)

    return {"avatar_url": user.avatar_url}
