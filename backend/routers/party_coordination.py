"""
Party coordination router — polls, pinned block, attendance statuses.
All endpoints require accepted membership or creator role.
System messages are written to chat_messages and emitted via Socket.IO.
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import update as sql_update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from deps import get_db, get_current_user_from_token, oauth2_scheme
from utils.sanitize import sanitize_text


def _san(cls, v):
    return sanitize_text(v)


def _san_list(cls, v):
    if v is None:
        return None
    return [sanitize_text(x) for x in v if x is not None]
from models.chat_message import ChatMessage
from models.party import EventParty, PartyMember
from models.party_coordination import (
    PartyAttendance,
    PartyPinnedBlock,
    PartyPoll,
    PollOption,
    PollVote,
)
from models.user import User
from sio_instance import sio

router = APIRouter(tags=["party_coordination"])

# Ограничиваем размер и TTL, чтобы не утекала память на долгоживущих воркерах.
try:
    from cachetools import TTLCache
    _attendance_msg_cache = TTLCache(maxsize=10_000, ttl=600)
except ImportError:  # pragma: no cover — cachetools в requirements_docker.txt
    _attendance_msg_cache: dict[tuple, datetime] = {}
ATTENDANCE_RATE_LIMIT_SECONDS = 300




def _check_party_access(
    party_id: int,
    user_id: int,
    db: Session,
    require_creator: bool = False,
) -> EventParty:
    """Returns party if user has access. Raises 403/404 otherwise."""
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    is_creator = party.creator_id == user_id
    if require_creator and not is_creator:
        raise HTTPException(status_code=403, detail="Только создатель может выполнить это действие")
    if not is_creator:
        member = (
            db.query(PartyMember)
            .filter(
                PartyMember.party_id == party_id,
                PartyMember.user_id == user_id,
                PartyMember.status == "accepted",
            )
            .first()
        )
        if not member:
            raise HTTPException(status_code=403, detail="Нет доступа к этой компании")
    return party


async def _send_system_message(
    db: Session, party_id: int, event_type: str, text: str
) -> None:
    """Saves a system message to DB and emits it to the party Socket.IO room."""
    now = datetime.utcnow()
    msg = ChatMessage(
        room=f"party_{party_id}",
        user_id=None,
        username="Система",
        message=text,
        timestamp=now,
        is_system=True,
        event_type=event_type,
    )
    db.add(msg)
    db.flush()
    await sio.emit(
        "receive_party_message",
        {
            "message": text,
            "userId": None,
            "username": "Система",
            "avatarUrl": None,
            "timestamp": now.isoformat(),
            "partyId": party_id,
            "isSystem": True,
            "eventType": event_type,
        },
        room=f"party_{party_id}",
    )




class PollOptionOut(BaseModel):
    id: int
    text: str
    vote_count: int

    class Config:
        from_attributes = True


class PollOut(BaseModel):
    id: int
    party_id: int
    question: str
    status: str
    created_by: int
    created_by_username: str
    created_at: datetime
    closed_at: Optional[datetime]
    options: List[PollOptionOut]
    my_vote_option_id: Optional[int] = None

    class Config:
        from_attributes = True


class PollCreateBody(BaseModel):
    question: str = Field(..., min_length=3, max_length=200)
    options: List[str] = Field(..., min_length=2, max_length=10)

    _san_q = field_validator("question", mode="before")(_san)
    _san_o = field_validator("options", mode="before")(_san_list)


class VoteBody(BaseModel):
    option_id: int


class PinnedBlockOut(BaseModel):
    id: int
    party_id: int
    content: str
    updated_by: int
    updated_by_username: str
    updated_at: datetime

    class Config:
        from_attributes = True


class PinnedBlockEnvelope(BaseModel):
    pinned: Optional[PinnedBlockOut] = None


class PinnedBlockBody(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)

    _san = field_validator("content", mode="before")(_san)


class AttendanceStatusBody(BaseModel):
    status: Optional[str] = None


class AttendanceOut(BaseModel):
    user_id: int
    username: str
    status: str
    updated_at: datetime

    class Config:
        from_attributes = True




def _build_poll_out(poll: PartyPoll, db: Session, user_id: int) -> PollOut:
    options = (
        db.query(PollOption).filter(PollOption.poll_id == poll.id).all()
    )
    vote = (
        db.query(PollVote)
        .filter(PollVote.poll_id == poll.id, PollVote.user_id == user_id)
        .first()
    )
    return PollOut(
        id=poll.id,
        party_id=poll.party_id,
        question=poll.question,
        status=poll.status,
        created_by=poll.created_by,
        created_by_username=poll.created_by_username,
        created_at=poll.created_at,
        closed_at=poll.closed_at,
        options=[PollOptionOut(id=o.id, text=o.text, vote_count=o.vote_count) for o in options],
        my_vote_option_id=vote.option_id if vote else None,
    )




@router.post("/parties/{party_id}/polls", response_model=PollOut)
async def create_poll(
    party_id: int,
    body: PollCreateBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    _check_party_access(party_id, user.id, db, require_creator=True)

    options = list(dict.fromkeys(
        opt.strip() for opt in body.options if opt.strip()
    ))
    if len(options) < 2:
        raise HTTPException(status_code=400, detail="Нужно минимум 2 варианта ответа")
    if len(options) > 10:
        raise HTTPException(status_code=400, detail="Максимум 10 вариантов")
    for opt in options:
        if len(opt) > 100:
            raise HTTPException(status_code=400, detail="Вариант не может быть длиннее 100 символов")

    poll = PartyPoll(
        party_id=party_id,
        question=body.question.strip(),
        status="active",
        created_by=user.id,
        created_by_username=user.username,
    )
    db.add(poll)
    db.flush()

    for opt_text in options:
        db.add(PollOption(poll_id=poll.id, text=opt_text, vote_count=0))
    db.flush()

    out = _build_poll_out(poll, db, user.id)

    await sio.emit(
        "poll_created",
        out.model_dump(mode="json"),
        room=f"party_{party_id}",
    )
    await _send_system_message(
        db, party_id, "poll_created",
        f"📊 {user.username} создал голосование: «{poll.question}»",
    )
    db.commit()
    return _build_poll_out(poll, db, user.id)


@router.get("/parties/{party_id}/polls", response_model=List[PollOut])
def get_polls(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    _check_party_access(party_id, user.id, db)

    polls = (
        db.query(PartyPoll)
        .filter(PartyPoll.party_id == party_id)
        .order_by(PartyPoll.created_at.desc())
        .all()
    )
    return [_build_poll_out(p, db, user.id) for p in polls]


@router.post("/polls/{poll_id}/vote", response_model=PollOut)
async def vote_poll(
    poll_id: int,
    body: VoteBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    poll = db.query(PartyPoll).filter(PartyPoll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Голосование не найдено")
    if poll.status != "active":
        raise HTTPException(status_code=400, detail="Голосование уже завершено")

    _check_party_access(poll.party_id, user.id, db)

    option = (
        db.query(PollOption)
        .filter(PollOption.id == body.option_id, PollOption.poll_id == poll_id)
        .first()
    )
    if not option:
        raise HTTPException(status_code=404, detail="Вариант не найден")

    vote = PollVote(poll_id=poll_id, option_id=body.option_id, user_id=user.id)
    db.add(vote)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Вы уже проголосовали в этом голосовании")

    db.execute(
        sql_update(PollOption)
        .where(PollOption.id == body.option_id)
        .values(vote_count=PollOption.vote_count + 1)
    )
    db.flush()

    out = _build_poll_out(poll, db, user.id)
    await sio.emit(
        "poll_voted",
        out.model_dump(mode="json"),
        room=f"party_{poll.party_id}",
    )
    db.commit()
    return _build_poll_out(poll, db, user.id)


@router.post("/polls/{poll_id}/close", response_model=PollOut)
async def close_poll(
    poll_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    poll = db.query(PartyPoll).filter(PartyPoll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Голосование не найдено")
    if poll.status == "closed":
        raise HTTPException(status_code=400, detail="Голосование уже завершено")

    _check_party_access(poll.party_id, user.id, db, require_creator=True)

    poll.status = "closed"
    poll.closed_at = datetime.utcnow()
    db.flush()

    options = db.query(PollOption).filter(PollOption.poll_id == poll_id).all()
    winner = max(options, key=lambda o: o.vote_count) if options else None

    out = _build_poll_out(poll, db, user.id)
    await sio.emit(
        "poll_closed",
        out.model_dump(mode="json"),
        room=f"party_{poll.party_id}",
    )

    if winner:
        await _send_system_message(
            db, poll.party_id, "poll_closed",
            f"📊 Голосование «{poll.question}» завершено. "
            f"Победитель: «{winner.text}» ({winner.vote_count} гол.)",
        )
    else:
        await _send_system_message(
            db, poll.party_id, "poll_closed",
            f"📊 Голосование «{poll.question}» завершено без голосов",
        )

    db.commit()
    return _build_poll_out(poll, db, user.id)




@router.get("/parties/{party_id}/pinned", response_model=PinnedBlockEnvelope)
def get_pinned(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    _check_party_access(party_id, user.id, db)

    pinned = db.query(PartyPinnedBlock).filter(PartyPinnedBlock.party_id == party_id).first()
    return PinnedBlockEnvelope(pinned=pinned)


@router.put("/parties/{party_id}/pinned", response_model=PinnedBlockOut)
async def upsert_pinned(
    party_id: int,
    body: PinnedBlockBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    _check_party_access(party_id, user.id, db, require_creator=True)

    pinned = db.query(PartyPinnedBlock).filter(PartyPinnedBlock.party_id == party_id).first()
    if pinned:
        pinned.content = body.content.strip()
        pinned.updated_by = user.id
        pinned.updated_by_username = user.username
        pinned.updated_at = datetime.utcnow()
    else:
        pinned = PartyPinnedBlock(
            party_id=party_id,
            content=body.content.strip(),
            updated_by=user.id,
            updated_by_username=user.username,
        )
        db.add(pinned)
    db.flush()

    out = PinnedBlockOut(
        id=pinned.id,
        party_id=pinned.party_id,
        content=pinned.content,
        updated_by=pinned.updated_by,
        updated_by_username=pinned.updated_by_username,
        updated_at=pinned.updated_at,
    )
    await sio.emit(
        "pinned_updated",
        out.model_dump(mode="json"),
        room=f"party_{party_id}",
    )
    await _send_system_message(
        db, party_id, "pinned_updated",
        f"📌 {user.username} обновил закреп",
    )
    db.commit()
    return pinned




@router.patch("/parties/{party_id}/attendance/me")
async def set_attendance(
    party_id: int,
    body: AttendanceStatusBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    _check_party_access(party_id, user.id, db)

    valid_statuses = {"going", "late", "cant"}
    if body.status is not None and body.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Статус должен быть одним из: {', '.join(valid_statuses)}")

    attendance = (
        db.query(PartyAttendance)
        .filter(PartyAttendance.party_id == party_id, PartyAttendance.user_id == user.id)
        .first()
    )

    if body.status is None:
        if attendance:
            db.delete(attendance)
        db.commit()
        return {"ok": True}

    if attendance:
        attendance.status = body.status
        attendance.updated_at = datetime.utcnow()
    else:
        attendance = PartyAttendance(
            party_id=party_id,
            user_id=user.id,
            status=body.status,
        )
        db.add(attendance)
    db.flush()

    await sio.emit(
        "attendance_changed",
        {
            "userId": user.id,
            "username": user.username,
            "status": body.status,
            "partyId": party_id,
        },
        room=f"party_{party_id}",
    )

    cache_key = (party_id, user.id)
    now = datetime.utcnow()
    last_msg = _attendance_msg_cache.get(cache_key)
    if last_msg is None or (now - last_msg).total_seconds() >= ATTENDANCE_RATE_LIMIT_SECONDS:
        _attendance_msg_cache[cache_key] = now
        status_labels = {"going": "идёт", "late": "опоздает", "cant": "не придёт"}
        await _send_system_message(
            db, party_id, "attendance_changed",
            f"👤 {user.username} — {status_labels[body.status]}",
        )

    db.commit()
    return {"ok": True}


@router.get("/parties/{party_id}/attendance", response_model=List[AttendanceOut])
def get_attendance(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    _check_party_access(party_id, user.id, db)

    rows = (
        db.query(PartyAttendance, User)
        .join(User, PartyAttendance.user_id == User.id)
        .filter(PartyAttendance.party_id == party_id)
        .all()
    )
    return [
        AttendanceOut(
            user_id=attendance.user_id,
            username=user_obj.username,
            status=attendance.status,
            updated_at=attendance.updated_at,
        )
        for attendance, user_obj in rows
    ]
