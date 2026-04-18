from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from deps import get_db, get_current_user_from_token, oauth2_scheme
from schemas import MeetingPlanUpdate, MeetingPlanResponse, MeetingPlanHistoryItem
from sio_instance import sio
from models.user import User
from models.party import EventParty, PartyMember, PartyMeetingPlan, PartyMeetingPlanHistory
from models.chat_message import ChatMessage

router = APIRouter(tags=["party-plan"])


def _check_party_access(party_id: int, user_id: int, db: Session) -> EventParty:
    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    is_member = (
        party.creator_id == user_id or
        db.query(PartyMember).filter(
            PartyMember.party_id == party_id,
            PartyMember.user_id == user_id,
            PartyMember.status == "accepted",
        ).first() is not None
    )
    if not is_member:
        raise HTTPException(status_code=403, detail="Нет доступа к этой компании")
    return party


@router.get("/parties/{party_id}/plan", response_model=MeetingPlanResponse)
def get_party_plan(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    _check_party_access(party_id, current_user.id, db)

    plan = db.query(PartyMeetingPlan).filter(PartyMeetingPlan.party_id == party_id).first()
    if not plan:
        return MeetingPlanResponse()

    updater = db.query(User).filter(User.id == plan.updated_by).first()
    return MeetingPlanResponse(
        meet_time=plan.meet_time,
        meet_location=plan.meet_location,
        note=plan.note,
        meet_lat=plan.meet_lat,
        meet_lon=plan.meet_lon,
        meet_landmark=plan.meet_landmark,
        updated_by_username=updater.username if updater else None,
        updated_at=plan.updated_at,
    )


@router.put("/parties/{party_id}/plan", response_model=MeetingPlanResponse)
async def update_party_plan(
    party_id: int,
    body: MeetingPlanUpdate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)

    party = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    if party.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может редактировать план")
    if not party.is_open:
        raise HTTPException(status_code=400, detail="Нельзя редактировать план завершённой компании")

    if body.note and len(body.note) > 300:
        raise HTTPException(status_code=422, detail="Заметка не должна превышать 300 символов")
    if body.meet_time and body.meet_time.replace(tzinfo=None) < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Время встречи не может быть в прошлом")

    existing = db.query(PartyMeetingPlan).filter(PartyMeetingPlan.party_id == party_id).first()
    if existing:
        history_entry = PartyMeetingPlanHistory(
            party_id=party_id,
            meet_time=existing.meet_time,
            meet_location=existing.meet_location,
            note=existing.note,
            meet_lat=existing.meet_lat,
            meet_lon=existing.meet_lon,
            meet_landmark=existing.meet_landmark,
            changed_by=existing.updated_by,
            changed_at=datetime.utcnow(),
        )
        db.add(history_entry)
        existing.meet_time = body.meet_time
        existing.meet_location = body.meet_location
        existing.note = body.note
        existing.meet_lat = body.meet_lat
        existing.meet_lon = body.meet_lon
        existing.meet_landmark = body.meet_landmark
        existing.updated_by = current_user.id
        existing.updated_at = datetime.utcnow()
        plan = existing
    else:
        plan = PartyMeetingPlan(
            party_id=party_id,
            meet_time=body.meet_time,
            meet_location=body.meet_location,
            note=body.note,
            meet_lat=body.meet_lat,
            meet_lon=body.meet_lon,
            meet_landmark=body.meet_landmark,
            updated_by=current_user.id,
            updated_at=datetime.utcnow(),
        )
        db.add(plan)

    db.commit()
    db.refresh(plan)

    location_part = plan.meet_location or "место не указано"
    time_part = (
        plan.meet_time.strftime("%d.%m.%Y %H:%M") if plan.meet_time else "время не указано"
    )
    landmark_part = f" ({plan.meet_landmark})" if plan.meet_landmark else ""
    system_msg = ChatMessage(
        room=f"party_{party_id}",
        user_id="0",
        username="system",
        message=f"📍 Точка встречи обновлена: {location_part}{landmark_part} в {time_part}",
        is_system=True,
        event_type="plan_updated",
        timestamp=datetime.utcnow(),
    )
    db.add(system_msg)
    db.commit()
    db.refresh(system_msg)

    await sio.emit(
        "plan_updated",
        {
            "party_id": party_id,
            "meet_time": plan.meet_time.isoformat() if plan.meet_time else None,
            "meet_location": plan.meet_location,
            "note": plan.note,
            "meet_lat": plan.meet_lat,
            "meet_lon": plan.meet_lon,
            "meet_landmark": plan.meet_landmark,
            "updated_by": current_user.username,
            "updated_at": plan.updated_at.isoformat(),
        },
        room=f"party_{party_id}",
    )

    await sio.emit(
        "receive_party_message",
        {
            "message": system_msg.message,
            "userId": "0",
            "username": "system",
            "avatarUrl": None,
            "timestamp": system_msg.timestamp.isoformat(),
            "partyId": party_id,
            "isSystem": True,
            "eventType": "plan_updated",
        },
        room=f"party_{party_id}",
    )

    return MeetingPlanResponse(
        meet_time=plan.meet_time,
        meet_location=plan.meet_location,
        note=plan.note,
        meet_lat=plan.meet_lat,
        meet_lon=plan.meet_lon,
        meet_landmark=plan.meet_landmark,
        updated_by_username=current_user.username,
        updated_at=plan.updated_at,
    )


@router.get("/parties/{party_id}/plan/history", response_model=List[MeetingPlanHistoryItem])
def get_party_plan_history(
    party_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    _check_party_access(party_id, current_user.id, db)

    rows = (
        db.query(PartyMeetingPlanHistory)
        .filter(PartyMeetingPlanHistory.party_id == party_id)
        .order_by(PartyMeetingPlanHistory.changed_at.desc())
        .limit(20)
        .all()
    )

    changer_ids = {r.changed_by for r in rows}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(changer_ids)).all()}

    return [
        MeetingPlanHistoryItem(
            meet_time=row.meet_time,
            meet_location=row.meet_location,
            note=row.note,
            meet_lat=row.meet_lat,
            meet_lon=row.meet_lon,
            meet_landmark=row.meet_landmark,
            changed_by_username=users[row.changed_by].username if row.changed_by in users else "unknown",
            changed_at=row.changed_at,
        )
        for row in rows
    ]
