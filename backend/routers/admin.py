"""Админ-роутер: инбокс жалоб, контент-модерация, санкции, аудит."""
from datetime import datetime, timedelta
from typing import Any, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from deps import get_db, require_moderator, require_admin
from models.user import User
from models.report import Report, ALLOWED_RESOLUTIONS
from models.audit_log import AuditLog
from models.chat_message import ChatMessage
from models.party import EventParty
from models.review import PartyReview
from models.feature_flag import FeatureFlag
from models.banned_word import BannedWord
from models.notification import Notification
from models.appeal import Appeal
from services.audit import log_action
from services.feature_flags import ensure_known_flags, KNOWN_FLAGS

router = APIRouter(prefix="/admin", tags=["admin"])


def _get_user_or_404(db: Session, user_id: int) -> User:
    """Возвращает User по id или бросает 404 'Пользователь не найден'."""
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return u



class ReportOut(BaseModel):
    id: int
    reporter_id: int
    target_type: str
    target_id: str
    reason: str
    comment: Optional[str]
    status: str
    resolution: Optional[str]
    resolved_by_id: Optional[int]
    resolved_at: Optional[str]
    resolution_reason: Optional[str]
    created_at: str


class ResolvePayload(BaseModel):
    resolution: str
    reason: Optional[str] = Field(default=None, max_length=500)
    # опциональные параметры для ban-резолюции
    ban_duration_hours: Optional[int] = None


class RejectPayload(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


class HidePayload(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=200)


class WarnPayload(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


class MutePayload(BaseModel):
    duration_hours: int = Field(..., ge=1, le=24 * 30)
    reason: Optional[str] = Field(default=None, max_length=500)


class BanPayload(BaseModel):
    duration_hours: Optional[int] = Field(default=None, ge=1, le=24 * 365)
    reason: Optional[str] = Field(default=None, max_length=500)


class RolePayload(BaseModel):
    role: str


class AuditOut(BaseModel):
    id: int
    actor_id: Optional[int]
    actor_role: str
    action: str
    target_type: str
    target_id: str
    extra: Optional[Any]
    created_at: str


def _report_to_out(r: Report) -> dict:
    return {
        "id": r.id,
        "reporter_id": r.reporter_id,
        "target_type": r.target_type,
        "target_id": r.target_id,
        "reason": r.reason,
        "comment": r.comment,
        "status": r.status,
        "resolution": r.resolution,
        "resolved_by_id": r.resolved_by_id,
        "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
        "resolution_reason": r.resolution_reason,
        "created_at": r.created_at.isoformat() if r.created_at else "",
    }



@router.get("/reports")
def list_reports(
    status: Optional[str] = Query(default=None),
    target_type: Optional[str] = Query(default=None),
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(require_moderator),
) -> list[dict]:
    q = db.query(Report)
    if status:
        q = q.filter(Report.status == status)
    if target_type:
        q = q.filter(Report.target_type == target_type)
    rows = q.order_by(Report.created_at.desc()).limit(limit).all()
    return [_report_to_out(r) for r in rows]


@router.get("/reports/{report_id}")
def get_report_detail(
    report_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_moderator),
):
    r = db.query(Report).filter(Report.id == report_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Жалоба не найдена")

    out = _report_to_out(r)
    # контекст target (минимальный)
    context: dict[str, Any] = {}
    try:
        tid = int(r.target_id)
    except ValueError:
        tid = None
    if tid is not None:
        if r.target_type == "chat_message":
            m = db.query(ChatMessage).filter(ChatMessage.id == tid).first()
            if m:
                context = {
                    "room": m.room,
                    "user_id": m.user_id,
                    "username": m.username,
                    "message": m.message,
                    "is_deleted": m.is_deleted,
                    "timestamp": m.timestamp.isoformat() if m.timestamp else None,
                }
        elif r.target_type == "party":
            p = db.query(EventParty).filter(EventParty.id == tid).first()
            if p:
                context = {
                    "title": p.title,
                    "description": p.description,
                    "creator_id": p.creator_id,
                    "is_hidden": p.is_hidden,
                    "is_open": p.is_open,
                }
        elif r.target_type == "user":
            u = db.query(User).filter(User.id == tid).first()
            if u:
                context = {
                    "username": u.username,
                    "email": u.email,
                    "bio": u.bio,
                    "is_banned": u.is_banned,
                }
        elif r.target_type == "review":
            rv = db.query(PartyReview).filter(PartyReview.id == tid).first()
            if rv:
                context = {
                    "rating": rv.rating,
                    "text": rv.text,
                    "reviewer_id": rv.reviewer_id,
                    "reviewed_id": rv.reviewed_id,
                    "is_hidden": rv.is_hidden,
                }
    out["context"] = context
    return out


def _apply_resolution(db: Session, actor: User, report: Report, payload: ResolvePayload) -> None:
    """Применяет действие к target, пишет AuditLog."""
    resolution = payload.resolution
    try:
        tid = int(report.target_id)
    except ValueError:
        tid = None

    if resolution == "hide":
        if report.target_type == "chat_message" and tid is not None:
            m = db.query(ChatMessage).filter(ChatMessage.id == tid).first()
            if m and not m.is_deleted:
                m.is_deleted = True
                m.deleted_by_id = actor.id
                m.deleted_at = datetime.utcnow()
                m.delete_reason = payload.reason
                log_action(db, actor=actor, action="hide_chat_message",
                           target_type="chat_message", target_id=tid,
                           extra={"reason": payload.reason, "report_id": report.id})
        elif report.target_type == "review" and tid is not None:
            rv = db.query(PartyReview).filter(PartyReview.id == tid).first()
            if rv:
                rv.is_hidden = True
                log_action(db, actor=actor, action="hide_review",
                           target_type="review", target_id=tid,
                           extra={"reason": payload.reason, "report_id": report.id})
        elif report.target_type == "party" and tid is not None:
            p = db.query(EventParty).filter(EventParty.id == tid).first()
            if p:
                p.is_hidden = True
                p.hidden_reason = payload.reason
                log_action(db, actor=actor, action="hide_party",
                           target_type="party", target_id=tid,
                           extra={"reason": payload.reason, "report_id": report.id})
    elif resolution == "ban":
        if report.target_type == "user" and tid is not None:
            target = db.query(User).filter(User.id == tid).first()
            if target and target.role not in ("admin", "moderator"):
                hrs = payload.ban_duration_hours or 24
                target.is_banned = True
                target.banned_until = datetime.utcnow() + timedelta(hours=hrs)
                target.ban_reason = payload.reason
                log_action(db, actor=actor, action="ban_user",
                           target_type="user", target_id=tid,
                           extra={"duration_hours": hrs, "reason": payload.reason,
                                  "report_id": report.id})
    elif resolution == "warn":
        # Определяем target-user: для user-жалобы — сам target, иначе автор объекта
        warn_uid: Optional[int] = None
        if report.target_type == "user" and tid is not None:
            warn_uid = tid
        elif report.target_type == "chat_message" and tid is not None:
            m = db.query(ChatMessage).filter(ChatMessage.id == tid).first()
            if m:
                try:
                    warn_uid = int(m.user_id)
                except (TypeError, ValueError):
                    warn_uid = None
        elif report.target_type == "review" and tid is not None:
            rv = db.query(PartyReview).filter(PartyReview.id == tid).first()
            if rv:
                warn_uid = rv.reviewer_id
        if warn_uid:
            u = db.query(User).filter(User.id == warn_uid).first()
            if u:
                u.warnings_count = (u.warnings_count or 0) + 1
                log_action(db, actor=actor, action="warn_user",
                           target_type="user", target_id=warn_uid,
                           extra={"reason": payload.reason, "report_id": report.id})
    elif resolution == "delete":
        if report.target_type == "chat_message" and tid is not None:
            m = db.query(ChatMessage).filter(ChatMessage.id == tid).first()
            if m:
                m.is_deleted = True
                m.deleted_by_id = actor.id
                m.deleted_at = datetime.utcnow()
                m.delete_reason = payload.reason
                log_action(db, actor=actor, action="hide_chat_message",
                           target_type="chat_message", target_id=tid,
                           extra={"reason": payload.reason, "report_id": report.id})


@router.post("/reports/{report_id}/resolve")
def resolve_report(
    report_id: int,
    payload: ResolvePayload,
    db: Session = Depends(get_db),
    me: User = Depends(require_moderator),
):
    if payload.resolution not in ALLOWED_RESOLUTIONS:
        raise HTTPException(status_code=400, detail="Недопустимая резолюция")
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Жалоба не найдена")
    if report.status != "open":
        raise HTTPException(status_code=409, detail="Жалоба уже обработана")

    _apply_resolution(db, me, report, payload)

    report.status = "resolved"
    report.resolution = payload.resolution
    report.resolved_by_id = me.id
    report.resolved_at = datetime.utcnow()
    report.resolution_reason = payload.reason
    log_action(db, actor=me, action="resolve_report",
               target_type="report", target_id=report.id,
               extra={"resolution": payload.resolution, "reason": payload.reason})
    db.commit()
    db.refresh(report)
    return _report_to_out(report)


@router.post("/reports/{report_id}/reject")
def reject_report(
    report_id: int,
    payload: RejectPayload,
    db: Session = Depends(get_db),
    me: User = Depends(require_moderator),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Жалоба не найдена")
    if report.status != "open":
        raise HTTPException(status_code=409, detail="Жалоба уже обработана")
    report.status = "rejected"
    report.resolved_by_id = me.id
    report.resolved_at = datetime.utcnow()
    report.resolution_reason = payload.reason
    log_action(db, actor=me, action="reject_report",
               target_type="report", target_id=report.id,
               extra={"reason": payload.reason})
    db.commit()
    return _report_to_out(report)



@router.post("/chat-messages/{msg_id}/hide")
def hide_chat_message(
    msg_id: int,
    payload: HidePayload,
    db: Session = Depends(get_db),
    me: User = Depends(require_moderator),
):
    m = db.query(ChatMessage).filter(ChatMessage.id == msg_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    m.is_deleted = True
    m.deleted_by_id = me.id
    m.deleted_at = datetime.utcnow()
    m.delete_reason = payload.reason
    log_action(db, actor=me, action="hide_chat_message",
               target_type="chat_message", target_id=msg_id,
               extra={"reason": payload.reason})
    db.commit()
    return {"ok": True, "is_deleted": True}


@router.post("/chat-messages/{msg_id}/unhide")
def unhide_chat_message(
    msg_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(require_moderator),
):
    m = db.query(ChatMessage).filter(ChatMessage.id == msg_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    m.is_deleted = False
    m.deleted_by_id = None
    m.deleted_at = None
    m.delete_reason = None
    log_action(db, actor=me, action="unhide_chat_message",
               target_type="chat_message", target_id=msg_id)
    db.commit()
    return {"ok": True, "is_deleted": False}


@router.post("/parties/{party_id}/hide")
def hide_party(
    party_id: int,
    payload: HidePayload,
    db: Session = Depends(get_db),
    me: User = Depends(require_moderator),
):
    p = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Пати не найдена")
    p.is_hidden = True
    p.hidden_reason = payload.reason
    log_action(db, actor=me, action="hide_party",
               target_type="party", target_id=party_id,
               extra={"reason": payload.reason})
    db.commit()
    return {"ok": True, "is_hidden": True}


@router.post("/parties/{party_id}/unhide")
def unhide_party(
    party_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(require_moderator),
):
    p = db.query(EventParty).filter(EventParty.id == party_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Пати не найдена")
    p.is_hidden = False
    p.hidden_reason = None
    log_action(db, actor=me, action="unhide_party",
               target_type="party", target_id=party_id)
    db.commit()
    return {"ok": True, "is_hidden": False}



def _ensure_can_sanction(actor: User, target: User) -> None:
    """Нельзя санкционировать admin/moderator (кроме как admin → moderator)."""
    if target.role == "admin":
        raise HTTPException(status_code=403, detail="Нельзя санкционировать администратора")
    if target.role == "moderator" and actor.role != "admin":
        raise HTTPException(status_code=403, detail="Только admin может санкционировать модератора")


@router.post("/users/{user_id}/warn")
def warn_user(
    user_id: int,
    payload: WarnPayload,
    db: Session = Depends(get_db),
    me: User = Depends(require_moderator),
):
    u = _get_user_or_404(db, user_id)
    _ensure_can_sanction(me, u)
    u.warnings_count = (u.warnings_count or 0) + 1
    log_action(db, actor=me, action="warn_user",
               target_type="user", target_id=user_id,
               extra={"reason": payload.reason})
    db.commit()
    return {"ok": True, "warnings_count": u.warnings_count}


@router.post("/users/{user_id}/mute")
def mute_user(
    user_id: int,
    payload: MutePayload,
    db: Session = Depends(get_db),
    me: User = Depends(require_moderator),
):
    u = _get_user_or_404(db, user_id)
    _ensure_can_sanction(me, u)
    u.muted_until = datetime.utcnow() + timedelta(hours=payload.duration_hours)
    log_action(db, actor=me, action="mute_user",
               target_type="user", target_id=user_id,
               extra={"duration_hours": payload.duration_hours, "reason": payload.reason})
    db.commit()
    return {"ok": True, "muted_until": u.muted_until.isoformat()}


@router.post("/users/{user_id}/ban")
def ban_user(
    user_id: int,
    payload: BanPayload,
    db: Session = Depends(get_db),
    me: User = Depends(require_moderator),
):
    u = _get_user_or_404(db, user_id)
    _ensure_can_sanction(me, u)
    # Permanent ban — только admin
    if payload.duration_hours is None and me.role != "admin":
        raise HTTPException(status_code=403, detail="Permanent ban может выдавать только admin")
    u.is_banned = True
    u.banned_until = (
        datetime.utcnow() + timedelta(hours=payload.duration_hours)
        if payload.duration_hours is not None
        else None
    )
    u.ban_reason = payload.reason
    log_action(db, actor=me, action="ban_user",
               target_type="user", target_id=user_id,
               extra={"duration_hours": payload.duration_hours, "reason": payload.reason})
    db.commit()
    return {"ok": True, "is_banned": True,
            "banned_until": u.banned_until.isoformat() if u.banned_until else None}


@router.post("/users/{user_id}/unban")
def unban_user(
    user_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(require_moderator),
):
    u = _get_user_or_404(db, user_id)
    # Permanent-бан (banned_until is NULL) может снять только админ:
    # чтобы модератор не отменял решения админов.
    if u.is_banned and u.banned_until is None and me.role != "admin":
        raise HTTPException(status_code=403, detail="Постоянный бан может снять только администратор")
    u.is_banned = False
    u.banned_until = None
    u.ban_reason = None
    log_action(db, actor=me, action="unban_user",
               target_type="user", target_id=user_id)
    db.commit()
    return {"ok": True, "is_banned": False}


@router.post("/users/{user_id}/unmute")
def unmute_user(
    user_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(require_moderator),
):
    u = _get_user_or_404(db, user_id)
    u.muted_until = None
    log_action(db, actor=me, action="unmute_user",
               target_type="user", target_id=user_id)
    db.commit()
    return {"ok": True, "muted_until": None}



_ANONYMOUS_USERNAME = "[удалён]"


@router.delete("/users/{user_id}")
def admin_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(require_admin),
):
    u = _get_user_or_404(db, user_id)
    if u.id == me.id:
        admin_count = db.query(User).filter(User.role == "admin").count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Нельзя удалить последнего админа")

    # Анонимизируем контент, который нельзя каскадно удалить без потери истории
    db.query(ChatMessage).filter(ChatMessage.user_id == str(user_id)).update(
        {"username": _ANONYMOUS_USERNAME, "user_id": "0"},
        synchronize_session=False,
    )
    log_action(db, actor=me, action="delete_user",
               target_type="user", target_id=user_id,
               extra={"email": u.email, "username": u.username})
    db.delete(u)
    db.commit()
    return {"ok": True, "deleted_user_id": user_id}



class BulkPayload(BaseModel):
    # Ограничиваем батч 50 (раньше было 200) — снижаем blast radius
    # скомпрометированного модер-аккаунта и phish-CSRF через social-engineering.
    user_ids: list[int] = Field(..., min_length=1, max_length=50)
    action: str = Field(..., pattern=r"^(warn|mute|ban)$")
    duration_hours: Optional[int] = None
    reason: Optional[str] = Field(default=None, max_length=500)
    # Чтобы случайный POST без подтверждения не прошёл (phish/CSRF protection).
    confirm: bool = False


@router.post("/users/bulk")
def bulk_user_action(
    payload: BulkPayload,
    db: Session = Depends(get_db),
    me: User = Depends(require_moderator),
):
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="confirm=true обязателен для bulk-операций")
    if payload.action not in ("warn", "mute", "ban"):
        raise HTTPException(status_code=400, detail="Недопустимое действие")
    if payload.action == "ban" and payload.duration_hours is None and me.role != "admin":
        raise HTTPException(status_code=403, detail="Permanent ban — только admin")
    # Батчи >20 требуют admin: даже если модер действует с confirm, массовые
    # действия всё равно нуждаются в повышенных правах.
    if len(payload.user_ids) > 20 and me.role != "admin":
        raise HTTPException(status_code=403, detail="Батчи >20 пользователей — только admin")

    succeeded = 0
    skipped = 0
    skipped_reasons: list[dict] = []
    targets = db.query(User).filter(User.id.in_(payload.user_ids)).all()
    for t in targets:
        # Правила санкций — admin не трогаем, moderator'а может только admin
        if t.role == "admin":
            skipped += 1
            skipped_reasons.append({"id": t.id, "reason": "admin"})
            continue
        if t.role == "moderator" and me.role != "admin":
            skipped += 1
            skipped_reasons.append({"id": t.id, "reason": "requires_admin"})
            continue

        try:
            if payload.action == "warn":
                t.warnings_count = (t.warnings_count or 0) + 1
                log_action(db, actor=me, action="warn_user", target_type="user",
                           target_id=t.id, extra={"reason": payload.reason, "bulk": True})
            elif payload.action == "mute":
                hrs = payload.duration_hours or 24
                t.muted_until = datetime.utcnow() + timedelta(hours=hrs)
                log_action(db, actor=me, action="mute_user", target_type="user",
                           target_id=t.id,
                           extra={"duration_hours": hrs, "reason": payload.reason, "bulk": True})
            elif payload.action == "ban":
                t.is_banned = True
                t.banned_until = (
                    datetime.utcnow() + timedelta(hours=payload.duration_hours)
                    if payload.duration_hours is not None else None
                )
                t.ban_reason = payload.reason
                log_action(db, actor=me, action="ban_user", target_type="user",
                           target_id=t.id,
                           extra={"duration_hours": payload.duration_hours,
                                  "reason": payload.reason, "bulk": True})
            succeeded += 1
        except Exception:
            skipped += 1
            skipped_reasons.append({"id": t.id, "reason": "internal_error"})

    db.commit()
    return {"succeeded": succeeded, "skipped": skipped, "skipped_details": skipped_reasons}



class AppealResolvePayload(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


def _appeal_out(a: Appeal, include_user: Optional[User] = None) -> dict:
    return {
        "id": a.id,
        "user_id": a.user_id,
        "username": include_user.username if include_user else None,
        "email": include_user.email if include_user else None,
        "message": a.message,
        "status": a.status,
        "reviewer_id": a.reviewer_id,
        "review_reason": a.review_reason,
        "reviewed_at": a.reviewed_at.isoformat() if a.reviewed_at else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


@router.get("/appeals")
def list_appeals(
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(require_moderator),
):
    q = db.query(Appeal)
    if status:
        q = q.filter(Appeal.status == status)
    rows = q.order_by(Appeal.created_at.desc()).limit(limit).all()
    user_ids = {a.user_id for a in rows}
    users_map = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    return [_appeal_out(a, users_map.get(a.user_id)) for a in rows]


@router.post("/appeals/{appeal_id}/approve")
def approve_appeal(
    appeal_id: int,
    payload: AppealResolvePayload,
    db: Session = Depends(get_db),
    me: User = Depends(require_admin),
):
    a = db.query(Appeal).filter(Appeal.id == appeal_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Апелляция не найдена")
    if a.status != "open":
        raise HTTPException(status_code=409, detail="Апелляция уже обработана")

    user = db.query(User).filter(User.id == a.user_id).first()
    if user:
        user.is_banned = False
        user.banned_until = None
        user.ban_reason = None
    a.status = "approved"
    a.reviewer_id = me.id
    a.review_reason = payload.reason
    a.reviewed_at = datetime.utcnow()
    log_action(db, actor=me, action="approve_appeal", target_type="appeal",
               target_id=a.id, extra={"user_id": a.user_id, "reason": payload.reason})
    db.commit()
    return _appeal_out(a, user)


@router.post("/appeals/{appeal_id}/reject")
def reject_appeal(
    appeal_id: int,
    payload: AppealResolvePayload,
    db: Session = Depends(get_db),
    me: User = Depends(require_admin),
):
    a = db.query(Appeal).filter(Appeal.id == appeal_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Апелляция не найдена")
    if a.status != "open":
        raise HTTPException(status_code=409, detail="Апелляция уже обработана")
    a.status = "rejected"
    a.reviewer_id = me.id
    a.review_reason = payload.reason
    a.reviewed_at = datetime.utcnow()
    log_action(db, actor=me, action="reject_appeal", target_type="appeal",
               target_id=a.id, extra={"user_id": a.user_id, "reason": payload.reason})
    db.commit()
    user = db.query(User).filter(User.id == a.user_id).first()
    return _appeal_out(a, user)


@router.post("/users/{user_id}/role")
def set_user_role(
    user_id: int,
    payload: RolePayload,
    db: Session = Depends(get_db),
    me: User = Depends(require_admin),
):
    if payload.role not in ("user", "moderator", "admin"):
        raise HTTPException(status_code=400, detail="Недопустимая роль")
    u = _get_user_or_404(db, user_id)
    # Защита от self-demotion последнего admin
    if u.id == me.id and payload.role != "admin":
        admin_count = db.query(User).filter(User.role == "admin").count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Нельзя понизить последнего админа")
    old_role = u.role
    u.role = payload.role
    log_action(db, actor=me, action="change_role",
               target_type="user", target_id=user_id,
               extra={"old_role": old_role, "new_role": payload.role})
    db.commit()
    return {"ok": True, "role": u.role}



@router.get("/users")
def admin_list_users(
    q: Optional[str] = Query(default=None),
    role: Optional[str] = Query(default=None),
    banned: Optional[bool] = Query(default=None),
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_moderator),
):
    query = db.query(User)
    if q:
        like = f"%{q}%"
        query = query.filter((User.username.ilike(like)) | (User.email.ilike(like)))
    if role:
        query = query.filter(User.role == role)
    if banned is not None:
        query = query.filter(User.is_banned == banned)
    rows = query.order_by(User.id.desc()).limit(limit).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "role": u.role,
            "is_banned": u.is_banned,
            "banned_until": u.banned_until.isoformat() if u.banned_until else None,
            "muted_until": u.muted_until.isoformat() if u.muted_until else None,
            "warnings_count": u.warnings_count or 0,
            "trust_score": u.trust_score,
        }
        for u in rows
    ]


@router.get("/users/{user_id}")
def admin_user_detail(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_moderator),
):
    u = _get_user_or_404(db, user_id)
    against = db.query(Report).filter(
        Report.target_type == "user",
        Report.target_id == str(user_id),
    ).order_by(Report.created_at.desc()).limit(50).all()
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "bio": u.bio,
        "role": u.role,
        "is_banned": u.is_banned,
        "banned_until": u.banned_until.isoformat() if u.banned_until else None,
        "ban_reason": u.ban_reason,
        "muted_until": u.muted_until.isoformat() if u.muted_until else None,
        "warnings_count": u.warnings_count or 0,
        "trust_score": u.trust_score,
        "avatar_url": u.avatar_url,
        "reports_against": [
            {
                "id": r.id, "reporter_id": r.reporter_id, "reason": r.reason,
                "status": r.status, "created_at": r.created_at.isoformat() if r.created_at else "",
            }
            for r in against
        ],
    }



@router.get("/audit")
def get_audit_log(
    actor_id: Optional[int] = Query(default=None),
    action: Optional[str] = Query(default=None),
    limit: int = Query(default=200, le=1000),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = db.query(AuditLog)
    if actor_id is not None:
        q = q.filter(AuditLog.actor_id == actor_id)
    if action:
        q = q.filter(AuditLog.action == action)
    rows = q.order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id": e.id,
            "actor_id": e.actor_id,
            "actor_role": e.actor_role,
            "action": e.action,
            "target_type": e.target_type,
            "target_id": e.target_id,
            "extra": e.extra,
            "created_at": e.created_at.isoformat() if e.created_at else "",
        }
        for e in rows
    ]



class FlagToggle(BaseModel):
    enabled: bool


@router.get("/flags")
def list_flags(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    ensure_known_flags(db)
    rows = db.query(FeatureFlag).order_by(FeatureFlag.key).all()
    return [
        {"key": r.key, "enabled": r.enabled, "description": r.description,
         "updated_at": r.updated_at.isoformat() if r.updated_at else None}
        for r in rows
    ]


@router.post("/flags/{key}")
def toggle_flag(
    key: str,
    payload: FlagToggle,
    db: Session = Depends(get_db),
    me: User = Depends(require_admin),
):
    if key not in KNOWN_FLAGS:
        raise HTTPException(status_code=404, detail="Неизвестный флаг")
    ensure_known_flags(db)
    row = db.query(FeatureFlag).filter(FeatureFlag.key == key).first()
    if not row:
        raise HTTPException(status_code=404, detail="Флаг не найден")
    old = row.enabled
    row.enabled = bool(payload.enabled)
    row.updated_by_id = me.id
    log_action(db, actor=me, action="toggle_flag", target_type="flag", target_id=key,
               extra={"old": old, "new": row.enabled})
    db.commit()
    return {"key": row.key, "enabled": row.enabled}



class BannedWordPayload(BaseModel):
    pattern: str = Field(..., max_length=200)
    is_regex: bool = False


@router.get("/banned-words")
def list_banned_words(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    rows = db.query(BannedWord).order_by(BannedWord.id.desc()).all()
    return [
        {"id": w.id, "pattern": w.pattern, "is_regex": w.is_regex,
         "created_by_id": w.created_by_id,
         "created_at": w.created_at.isoformat() if w.created_at else None}
        for w in rows
    ]


@router.post("/banned-words", status_code=201)
def add_banned_word(
    payload: BannedWordPayload,
    db: Session = Depends(get_db),
    me: User = Depends(require_admin),
):
    pattern = payload.pattern.strip()
    if not pattern:
        raise HTTPException(status_code=400, detail="pattern не может быть пустым")
    if payload.is_regex:
        import re as _re
        try:
            _re.compile(pattern)
        except _re.error as e:
            raise HTTPException(status_code=400, detail=f"Невалидный regex: {e}")
    existing = db.query(BannedWord).filter(BannedWord.pattern == pattern).first()
    if existing:
        raise HTTPException(status_code=409, detail="Такой паттерн уже есть")
    w = BannedWord(pattern=pattern, is_regex=payload.is_regex, created_by_id=me.id)
    db.add(w)
    log_action(db, actor=me, action="add_banned_word", target_type="banned_word", target_id="new",
               extra={"pattern": pattern, "is_regex": payload.is_regex})
    db.commit()
    db.refresh(w)
    return {"id": w.id, "pattern": w.pattern, "is_regex": w.is_regex}


@router.delete("/banned-words/{word_id}", status_code=204)
def delete_banned_word(
    word_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(require_admin),
):
    w = db.query(BannedWord).filter(BannedWord.id == word_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Не найдено")
    pattern = w.pattern
    db.delete(w)
    log_action(db, actor=me, action="remove_banned_word", target_type="banned_word",
               target_id=word_id, extra={"pattern": pattern})
    db.commit()



class BroadcastPayload(BaseModel):
    title: str = Field(..., max_length=120)
    message: str = Field(..., max_length=1000)


@router.post("/broadcast")
def broadcast_notification(
    payload: BroadcastPayload,
    db: Session = Depends(get_db),
    me: User = Depends(require_admin),
):
    users = db.query(User).filter(User.is_active == True).all()  # noqa: E712
    sent = 0
    for u in users:
        db.add(Notification(
            user_id=u.id,
            type="system_broadcast",
            title=payload.title,
            body=payload.message,
        ))
        sent += 1
    log_action(db, actor=me, action="broadcast", target_type="broadcast",
               target_id="all",
               extra={"title": payload.title, "recipients": sent})
    db.commit()
    return {"sent": sent}


@router.get("/metrics/timeseries")
def metrics_timeseries(
    days: int = Query(default=7, ge=1, le=90),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from sqlalchemy import func
    # Buckets: последние N дней, день = YYYY-MM-DD (UTC).
    today = datetime.utcnow().date()
    buckets = [today - timedelta(days=(days - 1 - i)) for i in range(days)]

    def _zeroed() -> list[dict]:
        return [{"date": d.isoformat(), "count": 0} for d in buckets]

    def _fill(series: list[dict], rows: list[tuple]) -> list[dict]:
        by_date = {str(date): int(n) for date, n in rows}
        for s in series:
            if s["date"] in by_date:
                s["count"] = by_date[s["date"]]
        return series

    start = datetime.combine(buckets[0], datetime.min.time())

    user_rows = (
        db.query(func.date(User.created_at), func.count(User.id))
        .filter(User.created_at.isnot(None), User.created_at >= start)
        .group_by(func.date(User.created_at))
        .all()
    )
    new_users = _fill(_zeroed(), user_rows)

    rep_rows = (
        db.query(func.date(Report.created_at), func.count(Report.id))
        .filter(Report.created_at >= start)
        .group_by(func.date(Report.created_at))
        .all()
    )
    new_reports = _fill(_zeroed(), rep_rows)

    audit_rows = (
        db.query(func.date(AuditLog.created_at), func.count(AuditLog.id))
        .filter(AuditLog.created_at >= start)
        .group_by(func.date(AuditLog.created_at))
        .all()
    )
    mod_actions = _fill(_zeroed(), audit_rows)

    return {
        "days": days,
        "new_users": new_users,
        "new_reports": new_reports,
        "mod_actions": mod_actions,
    }


@router.get("/metrics/overview")
def metrics_overview(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from sqlalchemy import func
    total_users = db.query(func.count(User.id)).scalar() or 0
    banned_users = db.query(func.count(User.id)).filter(User.is_banned == True).scalar() or 0  # noqa: E712
    open_reports = db.query(func.count(Report.id)).filter(Report.status == "open").scalar() or 0
    total_parties = db.query(func.count(EventParty.id)).scalar() or 0
    hidden_parties = db.query(func.count(EventParty.id)).filter(EventParty.is_hidden == True).scalar() or 0  # noqa: E712
    audit_today = 0
    try:
        day_ago = datetime.utcnow() - timedelta(days=1)
        audit_today = db.query(func.count(AuditLog.id)).filter(AuditLog.created_at >= day_ago).scalar() or 0
    except Exception:
        pass
    return {
        "total_users": int(total_users),
        "banned_users": int(banned_users),
        "open_reports": int(open_reports),
        "total_parties": int(total_parties),
        "hidden_parties": int(hidden_parties),
        "mod_actions_24h": int(audit_today),
    }
