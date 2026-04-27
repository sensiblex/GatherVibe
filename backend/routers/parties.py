from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session
from typing import Literal, Optional, List
from datetime import datetime
from enum import Enum

import asyncio
import uuid
import kudago_api_async
from pydantic import BaseModel, Field, field_validator
from deps import get_db, get_current_user_from_token, oauth2_scheme
from utils.sanitize import sanitize_text
from schemas import PartySearchItem, PartySearchResponse
from sio_instance import sio
from models.user import User
from models.event import Event
from models.party import EventParty, PartyMember
from notification_helpers import create_notification
import push_helpers


def _san(cls, v):
    return sanitize_text(v)


router = APIRouter(tags=["parties"])


def _require_creator(party: EventParty, current_user: User, action: str) -> None:
    """403 если current_user — не создатель party. detail: 'Только создатель может {action}'."""
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail=f"Только создатель может {action}")


def _get_party_or_404(db: Session, party_id: int) -> EventParty:
    """Возвращает EventParty по id или бросает 404 'Компания не найдена'."""
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    return party




class MemberStatus(str, Enum):
    pending  = "pending"
    accepted = "accepted"
    rejected = "rejected"
    left     = "left"
    invited  = "invited"
    declined = "declined"


class PartyCreateBody(BaseModel):
    title: str = Field(..., min_length=1, max_length=60)
    description: Optional[str] = Field(None, max_length=500)
    max_members: int = Field(4, ge=2, le=50)

    _san = field_validator("title", "description", mode="before")(_san)


class PartyUpdateBody(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=60)
    description: Optional[str] = Field(None, max_length=500)
    max_members: Optional[int] = Field(None, ge=2, le=50)

    _san = field_validator("title", "description", mode="before")(_san)


class PartyKickBody(BaseModel):
    reason: Optional[str] = None

    _san = field_validator("reason", mode="before")(_san)


class PartyJoinBody(BaseModel):
    message: Optional[str] = Field(None, max_length=100)

    _san = field_validator("message", mode="before")(_san)


class PartyInviteBody(BaseModel):
    user_id: int
    message: Optional[str] = Field(None, max_length=200)

    _san = field_validator("message", mode="before")(_san)


class PartyInviteOut(BaseModel):
    id: int
    party_id: int
    party_title: str
    party_event_id: str
    event_date_ts: Optional[int] = None
    event_image_url: Optional[str] = None
    creator_id: int
    creator_username: str
    invite_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PendingRequestOut(BaseModel):
    id: int
    user_id: int
    username: str
    party_id: int
    party_title: Optional[str] = None  # название компании (party.title)
    event_title: Optional[str] = None  # название события (party.event_title, из KudaGo или локального Event)
    created_at: datetime
    message: Optional[str] = None

    class Config:
        from_attributes = True


class PartyMemberOut(BaseModel):
    id: int
    user_id: int
    username: str
    city: Optional[str]
    interests: Optional[str]
    status: MemberStatus
    joined_at: datetime
    message: Optional[str] = None
    invited_by_user_id: Optional[int] = None
    invite_message: Optional[str] = None

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
    event_title: Optional[str] = None
    event_date_ts: Optional[int] = None
    event_image_url: Optional[str] = None
    invite_token: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PartyInvitePreviewOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    max_members: int
    member_count: int
    creator_username: str
    event_title: Optional[str] = None
    event_date_ts: Optional[int] = None
    event_image_url: Optional[str] = None
    is_open: bool




def _ensure_invite_token(party: EventParty, db: Session) -> str:
    """Lazy-fill missing invite_token for legacy parties."""
    token = getattr(party, "invite_token", None)
    if not token:
        token = uuid.uuid4().hex
        party.invite_token = token
        db.commit()
    return token


def _build_party_out(party: EventParty, db: Session, viewer_id: Optional[int] = None) -> PartyOut:
    # Делегируем на bulk-версию (2 запроса вместо 2× на party). Так исключаем
    # дивёргенцию между одиночной и списковой формами и получаем то же самое
    # bulk-оптимизированное поведение для любого callera.
    result = _build_parties_out_bulk([party], db, viewer_id=viewer_id)
    return result[0]


def _build_parties_out_bulk(
    parties: List[EventParty],
    db: Session,
    viewer_id: Optional[int] = None,
) -> List[PartyOut]:
    """Batch-версия _build_party_out: 2 запроса на весь список вместо 2×N.

    - Одним запросом подтягивает всех creator'ов.
    - Одним запросом — всех members (с join на User) по списку party_id.
    """
    if not parties:
        return []
    # creators: один IN-запрос
    creator_ids = {p.creator_id for p in parties}
    creators = {u.id: u for u in db.query(User).filter(User.id.in_(creator_ids)).all()}

    # members всех party одним запросом
    party_ids = [p.id for p in parties]
    member_rows = (
        db.query(PartyMember, User)
        .join(User, PartyMember.user_id == User.id)
        .filter(PartyMember.party_id.in_(party_ids))
        .all()
    )
    members_by_party: dict[int, list] = {pid: [] for pid in party_ids}
    for m, u in member_rows:
        members_by_party[m.party_id].append((m, u))

    result: List[PartyOut] = []
    for party in parties:
        _ensure_invite_token(party, db)
        is_privileged = (viewer_id is not None and viewer_id == party.creator_id)
        visible_statuses = (
            {MemberStatus.pending, MemberStatus.accepted, MemberStatus.invited}
            if is_privileged
            else {MemberStatus.accepted, MemberStatus.invited}
        )
        members = [
            PartyMemberOut(
                id=m.id, user_id=u.id, username=u.username, city=u.city,
                interests=u.interests, status=m.status, joined_at=m.joined_at,
                message=m.message, invited_by_user_id=m.invited_by_user_id,
                invite_message=m.invite_message,
            )
            for (m, u) in members_by_party.get(party.id, [])
            if m.user_id != party.creator_id and m.status in visible_statuses
        ]
        creator = creators.get(party.creator_id)
        result.append(PartyOut(
            id=party.id, event_id=party.event_id, title=party.title,
            description=party.description, max_members=party.max_members,
            creator_id=party.creator_id,
            creator_username=creator.username if creator else "?",
            is_open=party.is_open, members=members,
            event_title=party.event_title, event_date_ts=party.event_date_ts,
            event_image_url=party.event_image_url,
            invite_token=party.invite_token if is_privileged else None,
            created_at=party.created_at,
        ))
    return result


def _check_and_close_party(party: EventParty, db: Session) -> bool:
    """Checks party capacity. Must be called AFTER db.flush() with member already accepted.
    Returns True if the party was just closed."""
    accepted_total = (
        db.query(PartyMember).filter(
            PartyMember.party_id == party.id,
            PartyMember.status == MemberStatus.accepted,
        ).count()
        + 1
    )

    if accepted_total > party.max_members:
        raise HTTPException(status_code=400, detail="Компания уже заполнена")

    if accepted_total >= party.max_members:
        party.is_open = False
        return True
    return False


async def _notify_party_closed(party: EventParty, db: Session, exclude_user_ids: set) -> None:
    """Sends party_closed notifications to all accepted members, excluding specified user IDs."""
    members = db.query(PartyMember).filter(
        PartyMember.party_id == party.id,
        PartyMember.status == MemberStatus.accepted,
    ).all()
    pending_notifs = []
    for m in members:
        if m.user_id in exclude_user_ids:
            continue
        notif = create_notification(
            db, m.user_id, "party_closed",
            "Компания закрыта",
            f"Компания «{party.title}» набрала участников и больше не принимает заявки",
            {"party_id": party.id},
        )
        pending_notifs.append((m.user_id, notif))
    db.commit()
    for user_id, notif in pending_notifs:
        await sio.emit("new_notification", {
            "id": notif.id,
            "type": notif.type,
            "title": notif.title,
            "body": notif.body,
            "data": notif.data,
            "is_read": False,
            "created_at": notif.created_at.isoformat(),
        }, room=f"user_{user_id}")




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
    return _build_parties_out_bulk(all_parties, db, viewer_id=user.id)


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
            party_title=party.title,
            event_title=party.event_title,
            created_at=member.joined_at,
            message=member.message,
        ))
    return result




@router.get("/parties/search", response_model=PartySearchResponse)
def search_parties(
    q: Optional[str] = Query(default=None, max_length=200),
    city: Optional[str] = Query(default=None, max_length=100),
    date_from: Optional[datetime] = Query(default=None),
    date_to: Optional[datetime] = Query(default=None),
    min_members: Optional[int] = Query(default=None, ge=1),
    max_members: Optional[int] = Query(default=None, ge=1),
    sort_by: Literal["date", "popular", "new"] = Query(default="new"),
    is_open: Optional[bool] = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    get_current_user_from_token(token, db)

    member_count_sq = (
        db.query(
            PartyMember.party_id,
            sa_func.count(PartyMember.id).label("member_count"),
        )
        .filter(PartyMember.status == MemberStatus.accepted)
        .group_by(PartyMember.party_id)
        .subquery()
    )

    base_q = (
        db.query(
            EventParty,
            User,
            sa_func.coalesce(member_count_sq.c.member_count, 0).label("member_count"),
        )
        .join(User, EventParty.creator_id == User.id)
        .outerjoin(member_count_sq, EventParty.id == member_count_sq.c.party_id)
        .filter(EventParty.is_hidden == False)  # noqa: E712 — исключаем скрытые модератором
    )

    if q and q.strip():
        pattern = f"%{q.strip()}%"
        base_q = base_q.filter(
            EventParty.title.ilike(pattern) | EventParty.description.ilike(pattern)
        )

    if city and city.strip():
        base_q = base_q.filter(EventParty.city.ilike(f"%{city.strip()}%"))

    if date_from is not None:
        base_q = base_q.filter(EventParty.created_at >= date_from)

    if date_to is not None:
        base_q = base_q.filter(EventParty.created_at <= date_to)

    if min_members is not None:
        base_q = base_q.filter(EventParty.max_members >= min_members)

    if max_members is not None:
        base_q = base_q.filter(EventParty.max_members <= max_members)

    if is_open is not None:
        base_q = base_q.filter(EventParty.is_open == is_open)

    # Count на отдельном лёгком запросе — без JOIN'ов на User/member_count_sq.
    # `base_q.count()` обёртывает всё в `SELECT count(*) FROM (... JOINs ...)` —
    # у нас для count нужны только фильтры по EventParty.
    count_q = db.query(sa_func.count(EventParty.id)).filter(
        EventParty.is_hidden == False  # noqa: E712
    )
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        count_q = count_q.filter(
            EventParty.title.ilike(pattern) | EventParty.description.ilike(pattern)
        )
    if city and city.strip():
        count_q = count_q.filter(EventParty.city.ilike(f"%{city.strip()}%"))
    if date_from is not None:
        count_q = count_q.filter(EventParty.created_at >= date_from)
    if date_to is not None:
        count_q = count_q.filter(EventParty.created_at <= date_to)
    if min_members is not None:
        count_q = count_q.filter(EventParty.max_members >= min_members)
    if max_members is not None:
        count_q = count_q.filter(EventParty.max_members <= max_members)
    if is_open is not None:
        count_q = count_q.filter(EventParty.is_open == is_open)
    total = count_q.scalar() or 0

    if sort_by == "popular":
        base_q = base_q.order_by(sa_func.coalesce(member_count_sq.c.member_count, 0).desc())
    elif sort_by == "date":
        base_q = base_q.order_by(EventParty.created_at.asc())
    else:
        base_q = base_q.order_by(EventParty.created_at.desc())

    offset = (page - 1) * per_page
    rows = base_q.offset(offset).limit(per_page).all()

    items = [
        PartySearchItem(
            id=party.id,
            event_id=party.event_id,
            title=party.title,
            description=party.description,
            max_members=party.max_members,
            creator_id=party.creator_id,
            creator_username=creator.username,
            is_open=party.is_open,
            city=party.city,
            member_count=int(count),
            event_title=party.event_title,
            event_date_ts=party.event_date_ts,
            event_image_url=party.event_image_url,
            created_at=party.created_at,
        )
        for party, creator, count in rows
    ]

    return PartySearchResponse.build(items=items, total=total, page=page, per_page=per_page)


@router.get("/parties/by-id/{party_id}", response_model=PartyOut)
def get_party_detail(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    party = _get_party_or_404(db, party_id)
    return _build_party_out(party, db, viewer_id=current_user.id)


@router.get("/parties/detail/{party_id}", response_model=PartyOut)
def get_party_detail_public(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    party = _get_party_or_404(db, party_id)
    return _build_party_out(party, db, viewer_id=current_user.id)


@router.get("/parties/by-token/{invite_token}", response_model=PartyInvitePreviewOut)
def get_party_by_invite_token(
    invite_token: str,
    db: Session = Depends(get_db),
):
    """Public preview — no auth. Lets unregistered users see the party before joining."""
    party = db.query(EventParty).filter(EventParty.invite_token == invite_token).first()
    if not party:
        raise HTTPException(status_code=404, detail="Приглашение не найдено")
    creator = db.query(User).filter(User.id == party.creator_id).first()
    member_count = 1 + db.query(PartyMember).filter(
        PartyMember.party_id == party.id,
        PartyMember.status == MemberStatus.accepted,
    ).count()
    return PartyInvitePreviewOut(
        id=party.id,
        title=party.title,
        description=party.description,
        max_members=party.max_members,
        member_count=member_count,
        creator_username=creator.username if creator else "?",
        event_title=party.event_title,
        event_date_ts=party.event_date_ts,
        event_image_url=party.event_image_url,
        is_open=party.is_open,
    )


@router.post("/parties/by-token/{invite_token}/join", response_model=PartyOut)
async def join_party_by_invite_token(
    invite_token: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Auth-required join via shareable link. Adds the user as accepted directly."""
    user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.invite_token == invite_token).first()
    if not party:
        raise HTTPException(status_code=404, detail="Приглашение не найдено")

    if party.creator_id == user.id:
        return _build_party_out(party, db)

    if not party.is_open:
        raise HTTPException(status_code=400, detail="Набор закрыт")

    existing = db.query(PartyMember).filter(
        PartyMember.party_id == party.id,
        PartyMember.user_id == user.id,
    ).first()

    if existing and existing.status == MemberStatus.accepted:
        return _build_party_out(party, db)

    accepted_count = db.query(PartyMember).filter(
        PartyMember.party_id == party.id,
        PartyMember.status == MemberStatus.accepted,
    ).count()
    if accepted_count > party.max_members:
        raise HTTPException(status_code=400, detail="Компания заполнена")

    if existing:
        existing.status = MemberStatus.accepted
        existing.invited_by_user_id = party.creator_id
    else:
        db.add(PartyMember(
            party_id=party.id,
            user_id=user.id,
            status=MemberStatus.accepted,
            invited_by_user_id=party.creator_id,
            invite_message="Присоединился по ссылке-приглашению",
        ))
    db.flush()
    party_closed = _check_and_close_party(party, db)

    notif = create_notification(
        db, party.creator_id, "party_invite_response",
        "Кто-то присоединился по ссылке",
        f"{user.username} вступил в компанию «{party.title}» по ссылке-приглашению",
        {"party_id": party.id, "status": "accepted", "via": "invite_token"},
    )
    db.commit()
    push_helpers.send_push_to_user(
        db, party.creator_id,
        "Кто-то присоединился",
        f"{user.username} вступил в «{party.title}» по ссылке",
        {"party_id": party.id, "type": "party_invite_response", "status": "accepted"},
    )
    db.commit()
    await sio.emit("new_notification", {
        "id": notif.id,
        "type": notif.type,
        "title": notif.title,
        "body": notif.body,
        "data": notif.data,
        "is_read": False,
        "created_at": notif.created_at.isoformat(),
    }, room=f"user_{party.creator_id}")
    if party_closed:
        await _notify_party_closed(party, db, exclude_user_ids={party.creator_id, user.id})
    return _build_party_out(party, db)


@router.get("/parties/{event_id}", response_model=List[PartyOut])
def get_parties(
    event_id: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    try:
        local_event = db.query(Event).filter(Event.id == int(event_id)).first()
        if local_event and local_event.date_time < datetime.utcnow():
            return []
    except (ValueError, TypeError):
        pass

    parties = db.query(EventParty).filter(EventParty.event_id == event_id).order_by(
        EventParty.created_at.desc()
    ).all()
    # viewer_id нужен чтобы creator видел invite_token своих party
    return _build_parties_out_bulk(parties, db, viewer_id=current_user.id)


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
    party = _get_party_or_404(db, member.party_id)
    _require_creator(party, current_user, "принимать участников")
    member.status = MemberStatus.accepted
    db.flush()
    party_closed = _check_and_close_party(party, db)
    notif = create_notification(
        db, member.user_id, "request_status_changed",
        "Заявка принята",
        f"Вас приняли в компанию «{party.title}»",
        {"party_id": party.id, "status": "accepted"},
    )
    db.commit()
    push_helpers.send_push_to_user(
        db, member.user_id,
        "Заявка принята",
        f"Вас приняли в компанию «{party.title}»",
        {"party_id": party.id, "type": "request_status_changed"},
    )
    db.commit()
    await sio.emit("new_notification", {
        "id": notif.id,
        "type": notif.type,
        "title": notif.title,
        "body": notif.body,
        "data": notif.data,
        "is_read": False,
        "created_at": notif.created_at.isoformat(),
    }, room=f"user_{member.user_id}")
    await sio.emit(
        "request_status_changed",
        {"status": "accepted", "party_id": party.id, "party_title": party.title,
         "notification_id": notif.id},
        room=f"user_{member.user_id}",
    )
    if party_closed:
        await _notify_party_closed(party, db, exclude_user_ids={party.creator_id, member.user_id})
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
    party = _get_party_or_404(db, member.party_id)
    _require_creator(party, current_user, "отклонять заявки")
    member.status = MemberStatus.rejected
    notif = create_notification(
        db, member.user_id, "request_status_changed",
        "Заявка отклонена",
        f"Заявка в компанию «{party.title}» отклонена",
        {"party_id": party.id, "status": "rejected"},
    )
    db.commit()
    push_helpers.send_push_to_user(
        db, member.user_id,
        "Заявка отклонена",
        f"Заявка в компанию «{party.title}» отклонена",
        {"party_id": party.id, "type": "request_status_changed"},
    )
    db.commit()
    await sio.emit("new_notification", {
        "id": notif.id,
        "type": notif.type,
        "title": notif.title,
        "body": notif.body,
        "data": notif.data,
        "is_read": False,
        "created_at": notif.created_at.isoformat(),
    }, room=f"user_{member.user_id}")
    await sio.emit(
        "request_status_changed",
        {"status": "rejected", "party_id": party.id, "party_title": party.title,
         "notification_id": notif.id},
        room=f"user_{member.user_id}",
    )
    return _build_party_out(party, db)


@router.post("/parties/event/{event_id}", response_model=PartyOut)
async def create_party(
    event_id: str,
    body: PartyCreateBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    from services.feature_flags import is_flag_enabled
    if not is_flag_enabled(db, "party_creation_enabled"):
        raise HTTPException(status_code=403, detail="Создание компаний временно отключено")
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

    event_title: Optional[str] = None
    event_date_ts: Optional[int] = None
    event_image_url: Optional[str] = None

    from models.kudago_event import KudaGoEvent as KE
    try:
        eid_int = int(event_id)
    except (TypeError, ValueError):
        eid_int = None

    cached = (
        db.query(KE).filter(KE.kudago_id == eid_int).first() if eid_int else None
    )
    if cached:
        event_title = cached.title
        event_date_ts = cached.start_ts
        event_image_url = cached.cover_url
    elif eid_int is not None:
        try:
            raw = await asyncio.wait_for(
                kudago_api_async.get_event_by_id(eid_int), timeout=3.0
            )
            event_title = raw.get("title")
            for d in (raw.get("dates") or []):
                ts = d.get("start")
                if ts:
                    event_date_ts = int(ts)
                    break
            images = raw.get("images") or []
            event_image_url = images[0].get("image") if images else None
        except (asyncio.TimeoutError, Exception):
            pass

    party = EventParty(
        event_id=event_id,
        title=body.title.strip(),
        description=body.description,
        max_members=body.max_members,
        creator_id=user.id,
        is_open=True,
        event_title=event_title,
        event_date_ts=event_date_ts,
        event_image_url=event_image_url,
        invite_token=uuid.uuid4().hex,
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
    party = _get_party_or_404(db, party_id)
    _require_creator(party, current_user, "редактировать компанию")
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
    party = _get_party_or_404(db, party_id)
    _require_creator(party, current_user, "удалить компанию")

    affected = db.query(PartyMember).filter(
        PartyMember.party_id == party_id,
        PartyMember.status.in_([
            MemberStatus.invited, MemberStatus.pending, MemberStatus.accepted,
        ]),
        PartyMember.user_id != party.creator_id,
    ).all()

    deleted_party_id = party.id
    deleted_party_title = party.title

    notified = []
    for m in affected:
        notif = create_notification(
            db, m.user_id, "party_deleted_for_user",
            "Компания удалена",
            f"Компания «{deleted_party_title}» удалена создателем",
            {"party_id": deleted_party_id, "previous_status": str(m.status)},
        )
        db.flush()
        notified.append((m.user_id, notif))

    db.query(PartyMember).filter(PartyMember.party_id == party_id).delete()
    db.delete(party)
    db.commit()

    await sio.emit(
        "party_deleted",
        {"party_id": deleted_party_id, "party_title": deleted_party_title},
        room=f"party_{deleted_party_id}",
    )
    for uid, notif in notified:
        await sio.emit("new_notification", {
            "id": notif.id,
            "type": notif.type,
            "title": notif.title,
            "body": notif.body,
            "data": notif.data,
            "is_read": False,
            "created_at": notif.created_at.isoformat(),
        }, room=f"user_{uid}")
        await sio.emit(
            "party_deleted_user",
            {"party_id": deleted_party_id, "party_title": deleted_party_title, "notification_id": notif.id},
            room=f"user_{uid}",
        )

    return {"ok": True}


@router.post("/parties/{party_id}/join", response_model=PartyOut)
async def join_party(
    party_id: int,
    body: PartyJoinBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    party = db.query(EventParty).filter(EventParty.id == party_id).with_for_update().first()
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
    if accepted_count > party.max_members:
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
            await sio.emit("new_notification", {
                "id": notif.id,
                "type": notif.type,
                "title": notif.title,
                "body": notif.body,
                "data": notif.data,
                "is_read": False,
                "created_at": notif.created_at.isoformat(),
            }, room=f"user_{party.creator_id}")
            await sio.emit(
                "new_party_request",
                {"party_id": party.id, "party_title": party.title,
                 "user_id": user.id, "username": user.username,
                 "notification_id": notif.id},
                room=f"user_{party.creator_id}",
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
            await sio.emit("new_notification", {
                "id": notif.id,
                "type": notif.type,
                "title": notif.title,
                "body": notif.body,
                "data": notif.data,
                "is_read": False,
                "created_at": notif.created_at.isoformat(),
            }, room=f"user_{party.creator_id}")
            await sio.emit(
                "new_party_request",
                {"party_id": party.id, "party_title": party.title,
                 "user_id": user.id, "username": user.username,
                 "notification_id": notif.id},
                room=f"user_{party.creator_id}",
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
    await sio.emit("new_notification", {
        "id": notif.id,
        "type": notif.type,
        "title": notif.title,
        "body": notif.body,
        "data": notif.data,
        "is_read": False,
        "created_at": notif.created_at.isoformat(),
    }, room=f"user_{party.creator_id}")
    await sio.emit(
        "new_party_request",
        {"party_id": party.id, "party_title": party.title,
         "user_id": user.id, "username": user.username,
         "notification_id": notif.id},
        room=f"user_{party.creator_id}",
    )
    return _build_party_out(party, db)


@router.delete("/parties/{party_id}/leave", status_code=200)
def leave_party(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    party = _get_party_or_404(db, party_id)
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
    party = _get_party_or_404(db, party_id)
    _require_creator(party, current_user, "исключать участников")
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
    push_helpers.send_push_to_user(
        db, user_id,
        "Вы исключены из компании",
        f"Вас исключили из компании «{party.title}»",
        {"party_id": party.id, "type": "kicked_from_party"},
    )
    db.commit()
    await sio.emit("new_notification", {
        "id": notif.id,
        "type": notif.type,
        "title": notif.title,
        "body": notif.body,
        "data": notif.data,
        "is_read": False,
        "created_at": notif.created_at.isoformat(),
    }, room=f"user_{user_id}")
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
    party = _get_party_or_404(db, party_id)
    _require_creator(party, current_user, "принимать участников")
    m = db.query(PartyMember).filter(
        PartyMember.party_id == party_id, PartyMember.user_id == user_id
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    m.status = MemberStatus.accepted
    db.flush()
    party_closed = _check_and_close_party(party, db)
    notif = create_notification(
        db, m.user_id, "request_status_changed",
        "Заявка принята",
        f"Вас приняли в компанию «{party.title}»",
        {"party_id": party.id, "status": "accepted"},
    )
    db.commit()
    await sio.emit("new_notification", {
        "id": notif.id,
        "type": notif.type,
        "title": notif.title,
        "body": notif.body,
        "data": notif.data,
        "is_read": False,
        "created_at": notif.created_at.isoformat(),
    }, room=f"user_{m.user_id}")
    await sio.emit(
        "request_status_changed",
        {"status": "accepted", "party_id": party.id, "party_title": party.title,
         "notification_id": notif.id},
        room=f"user_{m.user_id}",
    )
    if party_closed:
        await _notify_party_closed(party, db, exclude_user_ids={party.creator_id, m.user_id})
    return _build_party_out(party, db)


@router.post("/parties/{party_id}/members/{user_id}/reject", response_model=PartyOut)
async def reject_member(
    party_id: int,
    user_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    party = _get_party_or_404(db, party_id)
    _require_creator(party, current_user, "отклонять заявки")
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
    await sio.emit("new_notification", {
        "id": notif.id,
        "type": notif.type,
        "title": notif.title,
        "body": notif.body,
        "data": notif.data,
        "is_read": False,
        "created_at": notif.created_at.isoformat(),
    }, room=f"user_{m.user_id}")
    await sio.emit(
        "request_status_changed",
        {"status": "rejected", "party_id": party.id, "party_title": party.title,
         "notification_id": notif.id},
        room=f"user_{m.user_id}",
    )
    return _build_party_out(party, db)


@router.post("/parties/{party_id}/close", response_model=PartyOut)
async def close_party(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    party = _get_party_or_404(db, party_id)
    _require_creator(party, current_user, "закрыть компанию")
    if not party.is_open:
        return _build_party_out(party, db)
    party.is_open = False
    db.commit()
    await _notify_party_closed(party, db, exclude_user_ids={party.creator_id})
    return _build_party_out(party, db)




@router.get("/users/me/party-invites", response_model=List[PartyInviteOut])
def list_my_party_invites(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    rows = (
        db.query(PartyMember, EventParty, User)
        .join(EventParty, PartyMember.party_id == EventParty.id)
        .join(User, EventParty.creator_id == User.id)
        .filter(
            PartyMember.user_id == user.id,
            PartyMember.status == MemberStatus.invited,
        )
        .order_by(PartyMember.joined_at.desc())
        .all()
    )
    return [
        PartyInviteOut(
            id=m.id,
            party_id=p.id,
            party_title=p.title,
            party_event_id=p.event_id,
            event_date_ts=p.event_date_ts,
            event_image_url=p.event_image_url,
            creator_id=p.creator_id,
            creator_username=creator.username,
            invite_message=m.invite_message,
            created_at=m.joined_at,
        )
        for m, p, creator in rows
    ]


@router.post("/parties/{party_id}/invite", response_model=PartyOut)
async def invite_to_party(
    party_id: int,
    body: PartyInviteBody,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    party = _get_party_or_404(db, party_id)
    _require_creator(party, current_user, "приглашать")
    if not party.is_open:
        raise HTTPException(status_code=400, detail="Набор закрыт")
    if body.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя пригласить самого себя")

    target = db.query(User).filter(User.id == body.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if not target.is_discoverable_on_events:
        raise HTTPException(status_code=403, detail="Пользователь скрыл себя от поиска по событиям")

    used_slots = 1 + db.query(PartyMember).filter(
        PartyMember.party_id == party_id,
        PartyMember.status.in_([MemberStatus.accepted, MemberStatus.invited]),
    ).count()
    if used_slots >= party.max_members:
        raise HTTPException(status_code=400, detail="Все слоты в компании заняты")

    existing = db.query(PartyMember).filter(
        PartyMember.party_id == party_id,
        PartyMember.user_id == body.user_id,
    ).first()
    if existing and existing.status in [MemberStatus.pending, MemberStatus.accepted, MemberStatus.invited]:
        raise HTTPException(status_code=400, detail="Этот пользователь уже в компании или приглашён")

    if existing:
        existing.status = MemberStatus.invited
        existing.invited_by_user_id = current_user.id
        existing.invite_message = body.message
        member = existing
    else:
        member = PartyMember(
            party_id=party_id,
            user_id=body.user_id,
            status=MemberStatus.invited,
            invited_by_user_id=current_user.id,
            invite_message=body.message,
        )
        db.add(member)
    db.flush()

    notif = create_notification(
        db, body.user_id, "party_invite_received",
        "Вас приглашают в компанию",
        f"{current_user.username} приглашает вас в «{party.title}»",
        {"party_id": party.id, "invite_id": member.id},
    )
    db.commit()
    push_helpers.send_push_to_user(
        db, body.user_id,
        "Вас приглашают в компанию",
        f"{current_user.username} приглашает вас в «{party.title}»",
        {"party_id": party.id, "invite_id": member.id, "type": "party_invite_received"},
    )
    db.commit()
    await sio.emit("new_notification", {
        "id": notif.id,
        "type": notif.type,
        "title": notif.title,
        "body": notif.body,
        "data": notif.data,
        "is_read": False,
        "created_at": notif.created_at.isoformat(),
    }, room=f"user_{body.user_id}")
    await sio.emit(
        "party_invite_received",
        {"party_id": party.id, "party_title": party.title,
         "invite_id": member.id,
         "creator_username": current_user.username,
         "invite_message": body.message,
         "notification_id": notif.id},
        room=f"user_{body.user_id}",
    )
    return _build_party_out(party, db)


@router.post("/parties/{party_id}/invites/{invite_id}/accept", response_model=PartyOut)
async def accept_party_invite(
    party_id: int,
    invite_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    member = db.query(PartyMember).filter(
        PartyMember.id == invite_id,
        PartyMember.party_id == party_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Приглашение не найдено")
    if member.user_id != user.id:
        raise HTTPException(status_code=403, detail="Это не ваше приглашение")
    if member.status != MemberStatus.invited:
        raise HTTPException(status_code=400, detail="Приглашение уже обработано")

    party = _get_party_or_404(db, party_id)

    member.status = MemberStatus.accepted
    db.flush()
    party_closed = _check_and_close_party(party, db)

    notif = create_notification(
        db, party.creator_id, "party_invite_response",
        "Приглашение принято",
        f"{user.username} принял приглашение в компанию «{party.title}»",
        {"party_id": party.id, "status": "accepted", "invite_id": member.id},
    )
    db.commit()
    push_helpers.send_push_to_user(
        db, party.creator_id,
        "Приглашение принято",
        f"{user.username} принял приглашение в «{party.title}»",
        {"party_id": party.id, "type": "party_invite_response", "status": "accepted"},
    )
    db.commit()
    await sio.emit("new_notification", {
        "id": notif.id,
        "type": notif.type,
        "title": notif.title,
        "body": notif.body,
        "data": notif.data,
        "is_read": False,
        "created_at": notif.created_at.isoformat(),
    }, room=f"user_{party.creator_id}")
    await sio.emit(
        "party_invite_response",
        {"status": "accepted", "party_id": party.id, "party_title": party.title,
         "invite_id": member.id, "user_id": user.id, "username": user.username,
         "notification_id": notif.id},
        room=f"user_{party.creator_id}",
    )
    if party_closed:
        await _notify_party_closed(party, db, exclude_user_ids={party.creator_id, user.id})
    return _build_party_out(party, db)


@router.post("/parties/{party_id}/invites/{invite_id}/decline", response_model=PartyOut)
async def decline_party_invite(
    party_id: int,
    invite_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = get_current_user_from_token(token, db)
    member = db.query(PartyMember).filter(
        PartyMember.id == invite_id,
        PartyMember.party_id == party_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Приглашение не найдено")
    if member.user_id != user.id:
        raise HTTPException(status_code=403, detail="Это не ваше приглашение")
    if member.status != MemberStatus.invited:
        raise HTTPException(status_code=400, detail="Приглашение уже обработано")

    party = _get_party_or_404(db, party_id)

    member.status = MemberStatus.declined

    notif = create_notification(
        db, party.creator_id, "party_invite_response",
        "Приглашение отклонено",
        f"{user.username} отклонил приглашение в компанию «{party.title}»",
        {"party_id": party.id, "status": "declined", "invite_id": member.id},
    )
    db.commit()
    push_helpers.send_push_to_user(
        db, party.creator_id,
        "Приглашение отклонено",
        f"{user.username} отклонил приглашение в «{party.title}»",
        {"party_id": party.id, "type": "party_invite_response", "status": "declined"},
    )
    db.commit()
    await sio.emit("new_notification", {
        "id": notif.id,
        "type": notif.type,
        "title": notif.title,
        "body": notif.body,
        "data": notif.data,
        "is_read": False,
        "created_at": notif.created_at.isoformat(),
    }, room=f"user_{party.creator_id}")
    await sio.emit(
        "party_invite_response",
        {"status": "declined", "party_id": party.id, "party_title": party.title,
         "invite_id": member.id, "user_id": user.id, "username": user.username,
         "notification_id": notif.id},
        room=f"user_{party.creator_id}",
    )
    return _build_party_out(party, db)


@router.delete("/parties/{party_id}/invites/{invite_id}", status_code=200)
async def cancel_party_invite(
    party_id: int,
    invite_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    party = _get_party_or_404(db, party_id)
    _require_creator(party, current_user, "отменить приглашение")
    member = db.query(PartyMember).filter(
        PartyMember.id == invite_id,
        PartyMember.party_id == party_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Приглашение не найдено")
    if member.status != MemberStatus.invited:
        raise HTTPException(status_code=400, detail="Это не активное приглашение")

    invitee_id = member.user_id
    db.delete(member)
    db.commit()

    await sio.emit(
        "party_invite_cancelled",
        {"party_id": party.id, "invite_id": invite_id},
        room=f"user_{invitee_id}",
    )
    return {"ok": True}


def expire_pending_invites(db: Session) -> list[int]:
    """Mark invited rows as declined when the event is within 24h. Returns expired row IDs.

    Caller commits. Used by the background expiry loop and tests.
    """
    import time as _time
    cutoff = int(_time.time()) + 24 * 3600
    rows = (
        db.query(PartyMember)
        .join(EventParty, PartyMember.party_id == EventParty.id)
        .filter(
            PartyMember.status == MemberStatus.invited,
            EventParty.event_date_ts.isnot(None),
            EventParty.event_date_ts <= cutoff,
        )
        .all()
    )
    expired: list[int] = []
    for m in rows:
        m.status = MemberStatus.declined
        expired.append(m.id)
    return expired
