import os
import uuid
import time
import pathlib
from collections import Counter
from typing import List, Literal, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from deps import get_db, get_current_user_from_token, oauth2_scheme
from models.user import User
from models.party import EventParty, PartyMember
from models.party_recap import PartyRecap, PartyRecapItem, PartyRecapReaction

router = APIRouter(tags=["party-recap"])


ACTIVE_WINDOW_SECONDS = 2 * 3600
RECAP_WINDOW_SECONDS  = 48 * 3600
MAX_PINNED_HIGHLIGHTS = 5
MAX_PHOTO_BYTES       = 10 * 1024 * 1024
ALLOWED_PHOTO_MIME    = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_PHOTO_EXTS    = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
FORBIDDEN_PHOTO_EXTS  = {".html", ".htm", ".svg", ".js", ".php", ".xml", ".xhtml"}




def _safe_url(v: Optional[str]) -> Optional[str]:
    """Разрешаем только относительные /uploads/... или https:// абсолютные.
    Отсекает javascript:, data:, file: и прочие стор-XSS векторы.
    """
    if v is None:
        return v
    s = v.strip()
    if not s:
        return None
    if s.startswith("/uploads/") or s.startswith("https://"):
        return s
    raise ValueError("URL должен начинаться с /uploads/ или https://")


class RecapItemCreate(BaseModel):
    kind: Literal["note", "photo"] = "note"
    media_url: Optional[str] = Field(None, max_length=500)
    caption: Optional[str] = Field(None, max_length=500)

    @field_validator("media_url", mode="after")
    @classmethod
    def _validate_media_url(cls, v):
        return _safe_url(v)


class RecapCoverUpdate(BaseModel):
    cover_url: Optional[str] = Field(None, max_length=500)

    @field_validator("cover_url", mode="after")
    @classmethod
    def _validate_cover_url(cls, v):
        return _safe_url(v)


class RecapReactionBody(BaseModel):
    emoji: str = Field(..., min_length=1, max_length=16)


class RecapItemOut(BaseModel):
    id: int
    author_id: int
    author_username: str
    author_avatar_url: Optional[str] = None
    kind: str
    media_url: Optional[str] = None
    caption: Optional[str] = None
    is_pinned_highlight: bool
    created_at: datetime
    reactions: dict
    my_reactions: List[str] = []

    class Config:
        from_attributes = True


class RecapOut(BaseModel):
    party_id: int
    cover_url: Optional[str]
    lifecycle_status: Literal["planned", "active", "ended", "archived"]
    can_post: bool
    items: List[RecapItemOut]
    highlights: List[RecapItemOut]




def _lifecycle(party: EventParty) -> str:
    """Возвращает статус жизненного цикла компании."""
    if party.event_date_ts is None:
        return "active"
    now = int(time.time())
    start = int(party.event_date_ts)
    end_active = start + ACTIVE_WINDOW_SECONDS
    end_recap  = end_active + RECAP_WINDOW_SECONDS
    if now < start:
        return "planned"
    if now < end_active:
        return "active"
    if now < end_recap:
        return "ended"
    return "archived"


def _load_party(db: Session, party_id: int) -> EventParty:
    """Загружает компанию или выбрасывает 404."""
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    return party


def _ensure_accepted_member(db: Session, party: EventParty, user: User) -> None:
    """Проверяет что пользователь является участником компании."""
    if party.creator_id == user.id:
        return
    member = db.query(PartyMember).filter(
        PartyMember.party_id == party.id,
        PartyMember.user_id == user.id,
        PartyMember.status == "accepted",
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Доступ только участникам компании")


def _get_or_create_recap(db: Session, party: EventParty) -> PartyRecap:
    """Получает или создаёт объект recap для компании."""
    recap = db.query(PartyRecap).filter(PartyRecap.party_id == party.id).first()
    if recap:
        return recap
    recap = PartyRecap(party_id=party.id)
    db.add(recap)
    db.commit()
    db.refresh(recap)
    return recap


def _serialize_item(
    db: Session,
    item: PartyRecapItem,
    user_id: int,
    authors_cache: dict[int, User] | None = None,
) -> RecapItemOut:
    """Сериализует элемент recap с реакциями."""
    if authors_cache is not None and item.author_id in authors_cache:
        author = authors_cache[item.author_id]
    else:
        author = db.query(User).filter(User.id == item.author_id).first()
        if authors_cache is not None and author:
            authors_cache[item.author_id] = author

    reactions_rows = db.query(PartyRecapReaction).filter(
        PartyRecapReaction.item_id == item.id
    ).all()
    counter: Counter = Counter(r.emoji for r in reactions_rows)
    my = [r.emoji for r in reactions_rows if r.user_id == user_id]

    return RecapItemOut(
        id=item.id,
        author_id=item.author_id,
        author_username=author.username if author else "?",
        author_avatar_url=getattr(author, "avatar_url", None),
        kind=item.kind,
        media_url=item.media_url,
        caption=item.caption,
        is_pinned_highlight=bool(item.is_pinned_highlight),
        created_at=item.created_at or datetime.utcnow(),
        reactions=dict(counter),
        my_reactions=my,
    )




@router.get("/parties/{party_id}/recap", response_model=RecapOut)
def get_recap(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Возвращает воспоминания компании."""
    user = get_current_user_from_token(token, db)
    party = _load_party(db, party_id)
    _ensure_accepted_member(db, party, user)
    recap = _get_or_create_recap(db, party)

    items_q = db.query(PartyRecapItem).filter(
        PartyRecapItem.recap_id == recap.id
    ).order_by(PartyRecapItem.created_at.asc()).all()

    cache: dict[int, User] = {}
    items_out = [_serialize_item(db, it, user.id, cache) for it in items_q]
    highlights = [it for it in items_out if it.is_pinned_highlight]

    status = _lifecycle(party)
    return RecapOut(
        party_id=party.id,
        cover_url=recap.cover_url,
        lifecycle_status=status,
        can_post=(status == "ended"),
        items=items_out,
        highlights=highlights,
    )


@router.post("/parties/{party_id}/recap/items", response_model=RecapItemOut)
def create_recap_item(
    party_id: int,
    body: RecapItemCreate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Создаёт элемент воспоминания компании."""
    user = get_current_user_from_token(token, db)
    party = _load_party(db, party_id)
    _ensure_accepted_member(db, party, user)

    if _lifecycle(party) != "ended":
        raise HTTPException(status_code=400,
                            detail="Воспоминания можно добавлять только после окончания события")

    if body.kind == "photo" and not body.media_url:
        raise HTTPException(status_code=400, detail="Фото требует media_url")
    if body.kind == "note" and not (body.caption and body.caption.strip()):
        raise HTTPException(status_code=400, detail="Заметка не может быть пустой")

    recap = _get_or_create_recap(db, party)
    item = PartyRecapItem(
        recap_id=recap.id,
        party_id=party.id,
        author_id=user.id,
        kind=body.kind,
        media_url=body.media_url,
        caption=body.caption,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_item(db, item, user.id)


@router.post("/parties/{party_id}/recap/photo", response_model=RecapItemOut)
async def upload_recap_photo(
    party_id: int,
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Загружает фото в воспоминания компании."""
    user = get_current_user_from_token(token, db)
    party = _load_party(db, party_id)
    _ensure_accepted_member(db, party, user)

    if _lifecycle(party) != "ended":
        raise HTTPException(status_code=400,
                            detail="Воспоминания можно добавлять только после окончания события")

    content_type = (file.content_type or "").lower()
    # Строгий whitelist по MIME — `startswith("image/")` больше не принимаем,
    # иначе `image/svg+xml` проходит и даёт stored XSS при прямом открытии файла.
    if content_type not in ALLOWED_PHOTO_MIME:
        raise HTTPException(status_code=400, detail=f"Недопустимый тип файла: {content_type}")

    # И whitelist, и blacklist по расширению, чтобы злодей не подсунул .svg/.html с MIME image/jpeg.
    ext = pathlib.Path(file.filename or "").suffix.lower()
    if ext in FORBIDDEN_PHOTO_EXTS or (ext and ext not in ALLOWED_PHOTO_EXTS):
        raise HTTPException(status_code=400, detail=f"Недопустимое расширение файла: {ext}")

    contents = await file.read()
    if len(contents) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="Файл превышает 10 MB")

    if caption and len(caption) > 500:
        raise HTTPException(status_code=422, detail="Подпись слишком длинная (макс. 500)")

    bare_name = pathlib.Path(file.filename or "photo.jpg").name or "photo.jpg"
    safe_name = "".join(c if c.isalnum() or c in "._-" else "_" for c in bare_name)
    safe_name = safe_name[:128] or "photo.jpg"
    unique_name = f"{uuid.uuid4()}_{safe_name}"

    upload_dir = os.path.join("uploads", "recap")
    os.makedirs(upload_dir, exist_ok=True)
    with open(os.path.join(upload_dir, unique_name), "wb") as f:
        f.write(contents)

    media_url = f"/uploads/recap/{unique_name}"

    recap = _get_or_create_recap(db, party)
    item = PartyRecapItem(
        recap_id=recap.id,
        party_id=party.id,
        author_id=user.id,
        kind="photo",
        media_url=media_url,
        caption=caption,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_item(db, item, user.id)


@router.delete("/parties/{party_id}/recap/items/{item_id}")
def delete_recap_item(
    party_id: int,
    item_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Удаляет элемент воспоминания компании."""
    user = get_current_user_from_token(token, db)
    party = _load_party(db, party_id)
    _ensure_accepted_member(db, party, user)

    item = db.query(PartyRecapItem).filter(
        PartyRecapItem.id == item_id,
        PartyRecapItem.party_id == party.id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Элемент не найден")

    if item.author_id != user.id and party.creator_id != user.id:
        raise HTTPException(status_code=403, detail="Можно удалять только свои посты")

    db.delete(item)
    db.commit()
    return {"ok": True}


@router.post("/parties/{party_id}/recap/items/{item_id}/pin", response_model=RecapItemOut)
def pin_highlight(
    party_id: int,
    item_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Закрепляет элемент воспоминания как highlight."""
    user = get_current_user_from_token(token, db)
    party = _load_party(db, party_id)
    if party.creator_id != user.id:
        raise HTTPException(status_code=403, detail="Только создатель компании может закреплять")

    item = db.query(PartyRecapItem).filter(
        PartyRecapItem.id == item_id,
        PartyRecapItem.party_id == party.id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Элемент не найден")

    if not item.is_pinned_highlight:
        pinned = db.query(PartyRecapItem).filter(
            PartyRecapItem.party_id == party.id,
            PartyRecapItem.is_pinned_highlight.is_(True),
        ).count()
        if pinned >= MAX_PINNED_HIGHLIGHTS:
            raise HTTPException(status_code=400,
                                detail=f"Можно закрепить не более {MAX_PINNED_HIGHLIGHTS} highlight'ов")

    item.is_pinned_highlight = True
    db.commit()
    db.refresh(item)
    return _serialize_item(db, item, user.id)


@router.delete("/parties/{party_id}/recap/items/{item_id}/pin", response_model=RecapItemOut)
def unpin_highlight(
    party_id: int,
    item_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Открепляет элемент воспоминания."""
    user = get_current_user_from_token(token, db)
    party = _load_party(db, party_id)
    if party.creator_id != user.id:
        raise HTTPException(status_code=403, detail="Только создатель компании может откреплять")

    item = db.query(PartyRecapItem).filter(
        PartyRecapItem.id == item_id,
        PartyRecapItem.party_id == party.id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Элемент не найден")

    item.is_pinned_highlight = False
    db.commit()
    db.refresh(item)
    return _serialize_item(db, item, user.id)


@router.patch("/parties/{party_id}/recap/cover", response_model=RecapOut)
def set_recap_cover(
    party_id: int,
    body: RecapCoverUpdate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Устанавливает обложку воспоминаний компании."""
    user = get_current_user_from_token(token, db)
    party = _load_party(db, party_id)
    if party.creator_id != user.id:
        raise HTTPException(status_code=403, detail="Только создатель может менять обложку")

    recap = _get_or_create_recap(db, party)
    recap.cover_url = body.cover_url
    db.commit()
    db.refresh(recap)
    return get_recap(party_id=party.id, token=token, db=db)


@router.post("/parties/{party_id}/recap/items/{item_id}/react")
def react_to_item(
    party_id: int,
    item_id: int,
    body: RecapReactionBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Добавляет реакцию к элементу воспоминания."""
    user = get_current_user_from_token(token, db)
    party = _load_party(db, party_id)
    _ensure_accepted_member(db, party, user)

    item = db.query(PartyRecapItem).filter(
        PartyRecapItem.id == item_id,
        PartyRecapItem.party_id == party.id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Элемент не найден")

    existing = db.query(PartyRecapReaction).filter(
        PartyRecapReaction.item_id == item.id,
        PartyRecapReaction.user_id == user.id,
        PartyRecapReaction.emoji == body.emoji,
    ).first()
    if existing:
        return {"ok": True, "added": False}

    db.add(PartyRecapReaction(item_id=item.id, user_id=user.id, emoji=body.emoji))
    db.commit()
    return {"ok": True, "added": True}


@router.delete("/parties/{party_id}/recap/items/{item_id}/react")
def unreact_to_item(
    party_id: int,
    item_id: int,
    emoji: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Удаляет реакцию с элемента воспоминания."""
    user = get_current_user_from_token(token, db)
    party = _load_party(db, party_id)
    _ensure_accepted_member(db, party, user)

    row = db.query(PartyRecapReaction).filter(
        PartyRecapReaction.item_id == item_id,
        PartyRecapReaction.user_id == user.id,
        PartyRecapReaction.emoji == emoji,
    ).first()
    if row:
        db.delete(row)
        db.commit()
    return {"ok": True}
