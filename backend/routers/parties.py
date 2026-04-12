from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field
from deps import get_db, get_current_user_from_token, oauth2_scheme
from sio_instance import sio
from models.user import User
from models.event import Event
from models.attendee import EventAttendee
from models.party import EventParty, PartyMember
from notification_helpers import create_notification

router = APIRouter(tags=["parties"])


# ─── Enums & schemas ────────────────────────────────────────────────────────


class MemberStatus(str, Enum):
    pending  = "pending"
    accepted = "accepted"
    rejected = "rejected"
    left     = "left"


class PartyCreateBody(BaseModel):
    title: str
    description: Optional[str] = None
    max_members: int = 4


class PartyUpdateBody(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    max_members: Optional[int] = None


class PartyKickBody(BaseModel):
    reason: Optional[str] = None


class PartyJoinBody(BaseModel):
    message: Optional[str] = Field(None, max_length=100)


class PendingRequestOut(BaseModel):
    id: int
    user_id: int
    username: str
    party_id: int
    event_title: Optional[str] = None
    created_at: datetime
    message: Optional[str] = None

    class Config:
        from_attributes = True


class PartyMemberOut(BaseModel):
    user_id: int
    username: str
    city: Optional[str]
    interests: Optional[str]
    status: MemberStatus
    joined_at: datetime
    message: Optional[str] = None

    class Config:
        from_attributes = True


class PartyOut(BaseModel):
    id: int
    event_id: str
    title: str
    description: Optional[str]
    max_members: int
    creator_id: int
    creator_username: str
    is_open: bool
    members: List[PartyMemberOut]
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Helpers ────────────────────────────────────────────────────────────────


def _build_party_out(party: EventParty, db: Session) -> PartyOut:
    creator = db.query(User).filter(User.id == party.creator_id).first()
    members_rows = db.query(PartyMember, User).join(User, PartyMember.user_id == User.id).filter(
        PartyMember.party_id == party.id,
        PartyMember.user_id != party.creator_id,
        PartyMember.status.in_([MemberStatus.pending, MemberStatus.accepted])
    ).all()
    members = [
        PartyMemberOut(user_id=u.id, username=u.username, city=u.city,
                       interests=u.interests, status=m.status, joined_at=m.joined_at,
                       message=m.message)
        for m, u in members_rows
    ]
    return PartyOut(
        id=party.id, event_id=party.event_id, title=party.title,
        description=party.description, max_members=party.max_members,
        creator_id=party.creator_id,
        creator_username=creator.username if creator else "?",
        is_open=party.is_open, members=members, created_at=party.created_at,
    )


def _check_and_close_party(party: EventParty, db: Session) -> None:
    """Checks party capacity. Must be called AFTER db.flush() with member already accepted."""
    accepted_total = (
        db.query(PartyMember).filter(
            PartyMember.party_id == party.id,
            PartyMember.status == MemberStatus.accepted,
        ).count()
        + 1  # +1 for creator who has no row in party_members
    )

    if accepted_total > party.max_members:
        raise HTTPException(status_code=400, detail="Компания уже заполнена")

    if accepted_total >= party.max_members:
        party.is_open = False


# ─── Routes ─────────────────────────────────────────────────────────────────


@router.get("/users/me/parties", response_model=List[PartyOut])
def get_my_parties(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)

    created = db.query(EventParty).filter(EventParty.creator_id == user.id).all()

    member_party_ids = db.query(PartyMember.party_id).filter(
        PartyMember.user_id == user.id,
        PartyMember.status == MemberStatus.accepted,
    ).all()
    member_parties = db.query(EventParty).filter(
        EventParty.id.in_([r[0] for r in member_party_ids]),
        EventParty.creator_id != user.id,
    ).all()

    all_parties = list({p.id: p for p in created + member_parties}.values())
    all_parties.sort(key=lambda p: p.created_at or datetime.min, reverse=True)
    return [_build_party_out(p, db) for p in all_parties]


@router.get("/parties/my-pending-requests", response_model=List[PendingRequestOut])
def get_my_pending_requests(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    rows = (
        db.query(PartyMember, User, EventParty)
        .join(User, PartyMember.user_id == User.id)
        .join(EventParty, PartyMember.party_id == EventParty.id)
        .filter(
            EventParty.creator_id == current_user.id,
            PartyMember.status == MemberStatus.pending,
            PartyMember.user_id != current_user.id,
        )
        .order_by(PartyMember.joined_at.desc())
        .all()
    )
    result = []
    for member, user, party in rows:
        result.append(PendingRequestOut(
            id=member.id,
            user_id=user.id,
            username=user.username,
            party_id=party.id,
            event_title=party.title,
            created_at=member.joined_at,
            message=member.message,
        ))
    return result


@router.get("/parties/by-id/{party_id}", response_model=PartyOut)
def get_party_detail(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    return _build_party_out(party, db)


@router.get("/parties/detail/{party_id}", response_model=PartyOut)
def get_party_detail_public(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    return _build_party_out(party, db)


@router.get("/parties/{event_id}", response_model=List[PartyOut])
def get_parties(
    event_id: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    get_current_user_from_token(token, db)
    try:
        local_event = db.query(Event).filter(Event.id == int(event_id)).first()
        if local_event and local_event.date_time < datetime.utcnow():
            return []
    except (ValueError, TypeError):
        pass

    parties = db.query(EventParty).filter(EventParty.event_id == event_id).order_by(
        EventParty.created_at.desc()
    ).all()
    return [_build_party_out(p, db) for p in parties]


@router.post("/parties/requests/{request_id}/approve", response_model=PartyOut)
async def approve_request(
    request_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    member = db.query(PartyMember).filter(PartyMember.id == request_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    party = db.query(EventParty).filter(EventParty.id == member.party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может принимать участников")
    member.status = MemberStatus.accepted
    db.flush()
    _check_and_close_party(party, db)
    notif = create_notification(
        db, member.user_id, "request_status_changed",
        "Заявка принята",
        f"Вас приняли в компанию «{party.title}»",
        {"party_id": party.id, "status": "accepted"},
    )
    db.commit()
    await sio.emit(
        "request_status_changed",
        {"status": "accepted", "party_id": party.id, "party_title": party.title,
         "notification_id": notif.id},
        room=f"user_{member.user_id}",
    )
    return _build_party_out(party, db)


@router.post("/parties/requests/{request_id}/reject", response_model=PartyOut)
async def reject_request(
    request_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    member = db.query(PartyMember).filter(PartyMember.id == request_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    party = db.query(EventParty).filter(EventParty.id == member.party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может отклонять заявки")
    member.status = MemberStatus.rejected
    notif = create_notification(
        db, member.user_id, "request_status_changed",
        "Заявка отклонена",
        f"Заявка в компанию «{party.title}» отклонена",
        {"party_id": party.id, "status": "rejected"},
    )
    db.commit()
    await sio.emit(
        "request_status_changed",
        {"status": "rejected", "party_id": party.id, "party_title": party.title,
         "notification_id": notif.id},
        room=f"user_{member.user_id}",
    )
    return _build_party_out(party, db)


@router.post("/parties/event/{event_id}", response_model=PartyOut)
def create_party(
    event_id: str,
    body: PartyCreateBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    if body.max_members < 2 or body.max_members > 20:
        raise HTTPException(status_code=400, detail="max_members must be between 2 and 20")
    existing_count = db.query(EventParty).filter(
        EventParty.event_id == event_id,
        EventParty.creator_id == user.id,
        EventParty.is_open == True,
    ).count()
    if existing_count >= 2:
        raise HTTPException(
            status_code=400,
            detail="Нельзя создать более 2 активных компаний для одного события",
        )
    party = EventParty(
        event_id=event_id,
        title=body.title.strip(),
        description=body.description,
        max_members=body.max_members,
        creator_id=user.id,
        is_open=True,
    )
    db.add(party)
    db.commit()
    db.refresh(party)
    return _build_party_out(party, db)


@router.patch("/parties/{party_id}", response_model=PartyOut)
def update_party(
    party_id: int,
    body: PartyUpdateBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может редактировать компанию")
    if body.title is not None:
        if not body.title.strip():
            raise HTTPException(status_code=400, detail="Название не может быть пустым")
        party.title = body.title.strip()
    if body.description is not None:
        party.description = body.description.strip() or None
    if body.max_members is not None:
        if body.max_members < 2 or body.max_members > 20:
            raise HTTPException(status_code=400, detail="max_members должно быть от 2 до 20")
        accepted_count = db.query(PartyMember).filter(
            PartyMember.party_id == party_id, PartyMember.status == MemberStatus.accepted,
            PartyMember.user_id != party.creator_id
        ).count()
        if body.max_members < accepted_count + 1:
            raise HTTPException(
                status_code=400,
                detail=f"Нельзя уменьшить: уже принято {accepted_count} участников"
            )
        party.max_members = body.max_members
    db.commit()
    return _build_party_out(party, db)


@router.delete("/parties/{party_id}", status_code=200)
async def delete_party(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может удалить компанию")
    await sio.emit(
        "party_deleted",
        {"party_id": party.id, "party_title": party.title},
        room=f"party_{party.id}",
    )
    db.query(PartyMember).filter(PartyMember.party_id == party_id).delete()
    db.delete(party)
    db.commit()
    return {"ok": True}


@router.post("/parties/{party_id}/join", response_model=PartyOut)
async def join_party(
    party_id: int,
    body: PartyJoinBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if not party.is_open:
        raise HTTPException(status_code=400, detail="Набор закрыт")
    try:
        local_event = db.query(Event).filter(Event.id == int(party.event_id)).first()
        if local_event and local_event.date_time < datetime.utcnow():
            raise HTTPException(status_code=400, detail="Событие уже прошло")
    except (ValueError, TypeError):
        pass
    accepted_count = db.query(PartyMember).filter(
        PartyMember.party_id == party_id, PartyMember.status == MemberStatus.accepted
    ).count()
    if accepted_count + 1 >= party.max_members:
        raise HTTPException(status_code=400, detail="Компания заполнена")
    existing = db.query(PartyMember).filter(
        PartyMember.party_id == party_id, PartyMember.user_id == user.id
    ).first()
    if existing:
        if existing.status == MemberStatus.rejected:
            existing.status = MemberStatus.pending
            existing.message = body.message
            notif = create_notification(
                db, party.creator_id, "new_party_request",
                "Новая заявка в компанию",
                f"{user.username} хочет вступить в компанию «{party.title}»",
                {"party_id": party.id, "user_id": user.id, "username": user.username},
            )
            db.commit()
            await sio.emit(
                "new_party_request",
                {"party_id": party.id, "party_title": party.title,
                 "user_id": user.id, "username": user.username,
                 "notification_id": notif.id},
                room=f"creator_{party.creator_id}",
            )
            return _build_party_out(party, db)
        elif existing.status == MemberStatus.left:
            existing.status = MemberStatus.pending
            existing.message = body.message
            notif = create_notification(
                db, party.creator_id, "new_party_request",
                "Новая заявка в компанию",
                f"{user.username} хочет вступить в компанию «{party.title}»",
                {"party_id": party.id, "user_id": user.id, "username": user.username},
            )
            db.commit()
            await sio.emit(
                "new_party_request",
                {"party_id": party.id, "party_title": party.title,
                 "user_id": user.id, "username": user.username,
                 "notification_id": notif.id},
                room=f"creator_{party.creator_id}",
            )
            return _build_party_out(party, db)
        elif existing.status in [MemberStatus.pending, MemberStatus.accepted]:
            raise HTTPException(status_code=400, detail="Вы уже в этой компании или подали заявку")
    m = PartyMember(party_id=party_id, user_id=user.id, status="pending", message=body.message)
    db.add(m)
    notif = create_notification(
        db, party.creator_id, "new_party_request",
        "Новая заявка в компанию",
        f"{user.username} хочет вступить в компанию «{party.title}»",
        {"party_id": party.id, "user_id": user.id, "username": user.username},
    )
    db.commit()
    await sio.emit(
        "new_party_request",
        {"party_id": party.id, "party_title": party.title,
         "user_id": user.id, "username": user.username,
         "notification_id": notif.id},
        room=f"creator_{party.creator_id}",
    )
    return _build_party_out(party, db)


@router.delete("/parties/{party_id}/leave", status_code=200)
def leave_party(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id == user.id:
        raise HTTPException(status_code=400, detail="Создатель не может покинуть компанию. Закройте её.")
    member = db.query(PartyMember).filter(
        PartyMember.party_id == party_id, PartyMember.user_id == user.id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Вы не состоите в этой компании")
    if member.status == MemberStatus.rejected:
        raise HTTPException(status_code=400, detail="Вы не являетесь участником компании")
    member.status = MemberStatus.left
    db.commit()
    return {"ok": True}


@router.post("/parties/{party_id}/members/{user_id}/kick", response_model=PartyOut)
async def kick_member(
    party_id: int,
    user_id: int,
    body: PartyKickBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может исключать участников")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя исключить самого себя")
    member = db.query(PartyMember).filter(
        PartyMember.party_id == party_id,
        PartyMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Участник не найден в компании")
    if member.status != MemberStatus.accepted:
        raise HTTPException(status_code=400, detail="Можно исключить только принятого участника")
    member.status = MemberStatus.rejected
    if not party.is_open:
        accepted_after = db.query(PartyMember).filter(
            PartyMember.party_id == party_id,
            PartyMember.status == MemberStatus.accepted,
            PartyMember.user_id != user_id,
            PartyMember.user_id != party.creator_id,
        ).count()
        if 1 + accepted_after < party.max_members:
            party.is_open = True
    notif = create_notification(
        db, user_id, "kicked_from_party",
        "Вы исключены из компании",
        f"Вас исключили из компании «{party.title}»",
        {"party_id": party.id},
    )
    db.commit()
    await sio.emit(
        "kicked_from_party",
        {"party_id": party.id, "party_title": party.title,
         "notification_id": notif.id},
        room=f"user_{user_id}",
    )
    return _build_party_out(party, db)


@router.post("/parties/{party_id}/members/{user_id}/accept", response_model=PartyOut)
async def accept_member(
    party_id: int,
    user_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может принимать участников")
    m = db.query(PartyMember).filter(
        PartyMember.party_id == party_id, PartyMember.user_id == user_id
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    m.status = MemberStatus.accepted
    db.flush()
    _check_and_close_party(party, db)
    notif = create_notification(
        db, m.user_id, "request_status_changed",
        "Заявка принята",
        f"Вас приняли в компанию «{party.title}»",
        {"party_id": party.id, "status": "accepted"},
    )
    db.commit()
    await sio.emit(
        "request_status_changed",
        {"status": "accepted", "party_id": party.id, "party_title": party.title,
         "notification_id": notif.id},
        room=f"user_{m.user_id}",
    )
    return _build_party_out(party, db)


@router.post("/parties/{party_id}/members/{user_id}/reject", response_model=PartyOut)
async def reject_member(
    party_id: int,
    user_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может отклонять заявки")
    m = db.query(PartyMember).filter(
        PartyMember.party_id == party_id, PartyMember.user_id == user_id
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    m.status = MemberStatus.rejected
    notif = create_notification(
        db, m.user_id, "request_status_changed",
        "Заявка отклонена",
        f"Заявка в компанию «{party.title}» отклонена",
        {"party_id": party.id, "status": "rejected"},
    )
    db.commit()
    await sio.emit(
        "request_status_changed",
        {"status": "rejected", "party_id": party.id, "party_title": party.title,
         "notification_id": notif.id},
        room=f"user_{m.user_id}",
    )
    return _build_party_out(party, db)


@router.post("/parties/{party_id}/close", response_model=PartyOut)
def close_party(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может закрыть компанию")
    party.is_open = False
    db.commit()
    return _build_party_out(party, db)
