import math
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, case
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timezone

from deps import get_db, get_current_user_from_token, oauth2_scheme
from schemas import (
    ReviewCreate,
    ReviewOut,
    ReviewReport,
    ReviewSummary,
    ReviewUpdate,
    ReviewableUser,
    ALLOWED_REVIEW_TAGS,
    POSITIVE_REVIEW_TAGS,
    NEGATIVE_REVIEW_TAGS,
)
from models.user import User
from models.attendee import EventAttendee
from models.party import EventParty, PartyMember
from models.review import PartyReview, ReviewReport as ReviewReportModel
import asyncio
import kudago_api_async

_POSITIVE_SET = set(POSITIVE_REVIEW_TAGS)
_NEGATIVE_SET = set(NEGATIVE_REVIEW_TAGS)

router = APIRouter(tags=["reviews"])

REVIEW_WINDOW_DAYS = 30


def _recalc_trust_score(user_id: int, db: Session) -> None:
    try:
        rows = db.query(PartyReview).filter(
            PartyReview.reviewed_id == user_id,
            PartyReview.is_hidden == False,  # noqa: E712
            PartyReview.is_deleted == False,  # noqa: E712
        ).all()
        avg = round(sum(r.rating for r in rows) / len(rows), 2) if rows else None
        user = db.query(User).filter(User.id == user_id).first()
        if user and hasattr(user, 'trust_score'):
            user.trust_score = avg
            db.commit()
    except Exception:
        db.rollback()


@router.post("/reviews", response_model=ReviewOut)
async def create_review(
    payload: ReviewCreate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)

    if payload.reviewed_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя оценивать самого себя")

    tags = payload.tags or []
    if len(tags) > 3:
        raise HTTPException(status_code=400, detail="Максимум 3 тега")
    invalid = [t for t in tags if t not in ALLOWED_REVIEW_TAGS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Недопустимые теги: {invalid}")

    party = db.query(EventParty).filter(EventParty.id == payload.party_id).first()
    if not party:
        raise HTTPException(status_code=404, detail="Пати не найдена")

    event_ts = party.event_date_ts
    if event_ts and event_ts > datetime.now(timezone.utc).timestamp():
        raise HTTPException(status_code=400, detail="Событие ещё не прошло")
        #     raise HTTPException(status_code=400, detail="Окно для отзыва (30 дней) истекло")

    def _is_party_participant(user_id: int) -> bool:
        if party.creator_id == user_id:
            return True
        return db.query(PartyMember).filter(
            PartyMember.party_id == payload.party_id,
            PartyMember.user_id == user_id,
            PartyMember.status == "accepted",
        ).first() is not None

    if not _is_party_participant(current_user.id):
        raise HTTPException(status_code=403, detail="Вы не являетесь участником этой пати")
    if not _is_party_participant(payload.reviewed_id):
        raise HTTPException(status_code=400, detail="Оцениваемый не является участником этой пати")

    if not (1 <= payload.rating <= 5):
        raise HTTPException(status_code=400, detail="Рейтинг должен быть от 1 до 5")

    existing_any = db.query(PartyReview).filter(
        PartyReview.reviewer_id == current_user.id,
        PartyReview.reviewed_id == payload.reviewed_id,
        PartyReview.party_id == payload.party_id,
    ).first()
    if existing_any and not getattr(existing_any, "is_deleted", False):
        raise HTTPException(status_code=409, detail="Вы уже оценили этого участника")

    if existing_any and getattr(existing_any, "is_deleted", False):
        review = existing_any
        review.is_deleted = False
        review.is_hidden = False
        review.report_count = 0
        review.rating = payload.rating
        review.text = payload.text
        review.tags = tags or None
        review.updated_at = datetime.utcnow()
    else:
        review = PartyReview(
            reviewer_id=current_user.id,
            reviewed_id=payload.reviewed_id,
            party_id=payload.party_id,
            rating=payload.rating,
            text=payload.text,
            tags=tags or None,
        )
        db.add(review)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Вы уже оценили этого участника")

    db.refresh(review)
    _recalc_trust_score(payload.reviewed_id, db)

    reviewer = db.query(User).filter(User.id == current_user.id).first()
    return ReviewOut(
        id=review.id,
        reviewer_id=review.reviewer_id,
        reviewer_username=reviewer.username,
        reviewer_avatar_url=reviewer.avatar_url,
        rating=review.rating,
        text=review.text,
        tags=review.tags,
        created_at=review.created_at,
    )


@router.post("/reviews/{review_id}/report", status_code=204)
def report_review(
    review_id: int,
    payload: ReviewReport,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    review = db.query(PartyReview).filter(PartyReview.id == review_id).first()
    if not review or getattr(review, "is_deleted", False):
        raise HTTPException(status_code=404, detail="Отзыв не найден")
    already_reported = db.query(ReviewReportModel).filter(
        ReviewReportModel.review_id == review_id,
        ReviewReportModel.reporter_id == current_user.id,
    ).first()
    if already_reported:
        raise HTTPException(status_code=409, detail="Вы уже жаловались на этот отзыв")
    db.add(ReviewReportModel(review_id=review_id, reporter_id=current_user.id))
    review.report_count = (review.report_count or 0) + 1
    if review.report_count >= 3:
        review.is_hidden = True
    db.commit()


@router.get("/reviews/my", response_model=ReviewOut)
def get_my_review(
    party_id: int,
    reviewed_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    review = db.query(PartyReview).filter(
        PartyReview.reviewer_id == current_user.id,
        PartyReview.party_id == party_id,
        PartyReview.reviewed_id == reviewed_id,
        PartyReview.is_deleted == False,  # noqa: E712
    ).first()
    if not review:
        raise HTTPException(status_code=404, detail="Отзыв не найден")
    reviewer = db.query(User).filter(User.id == current_user.id).first()
    return ReviewOut(
        id=review.id,
        reviewer_id=review.reviewer_id,
        reviewer_username=reviewer.username if reviewer else "Аноним",
        reviewer_avatar_url=reviewer.avatar_url if reviewer else None,
        rating=review.rating,
        text=review.text,
        tags=review.tags,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


@router.put("/reviews/{review_id}", response_model=ReviewOut)
def update_review(
    review_id: int,
    payload: ReviewUpdate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    review = db.query(PartyReview).filter(PartyReview.id == review_id).first()
    if not review or review.is_deleted:
        raise HTTPException(status_code=404, detail="Отзыв не найден")
    if review.reviewer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет доступа")

    if payload.rating is not None:
        if not (1 <= payload.rating <= 5):
            raise HTTPException(status_code=400, detail="Рейтинг должен быть от 1 до 5")
        review.rating = payload.rating

    if payload.text is not None:
        review.text = payload.text

    if payload.tags is not None:
        if len(payload.tags) > 3:
            raise HTTPException(status_code=400, detail="Максимум 3 тега")
        invalid = [t for t in payload.tags if t not in ALLOWED_REVIEW_TAGS]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Недопустимые теги: {invalid}")
        review.tags = payload.tags or None

    review.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(review)
    _recalc_trust_score(review.reviewed_id, db)

    reviewer = db.query(User).filter(User.id == current_user.id).first()
    return ReviewOut(
        id=review.id,
        reviewer_id=review.reviewer_id,
        reviewer_username=reviewer.username if reviewer else "Аноним",
        reviewer_avatar_url=reviewer.avatar_url if reviewer else None,
        rating=review.rating,
        text=review.text,
        tags=review.tags,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


@router.delete("/reviews/{review_id}", status_code=204)
def delete_review(
    review_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    review = db.query(PartyReview).filter(PartyReview.id == review_id).first()
    if not review or review.is_deleted:
        raise HTTPException(status_code=404, detail="Отзыв не найден")
    if review.reviewer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет доступа")

    reviewed_id = review.reviewed_id
    review.is_deleted = True
    review.updated_at = datetime.utcnow()
    db.commit()
    _recalc_trust_score(reviewed_id, db)


@router.get("/users/{user_id}/reviews", response_model=ReviewSummary)
def get_user_reviews(
    user_id: int,
    page: int = 1,
    per_page: int = 10,
    db: Session = Depends(get_db),
):
    per_page = min(per_page, 50)
    page = max(page, 1)

    visible = (
        (PartyReview.reviewed_id == user_id)
        & (PartyReview.is_hidden == False)  # noqa: E712
        & (PartyReview.is_deleted == False)  # noqa: E712
    )

    agg = db.query(
        func.count(PartyReview.id),
        func.avg(PartyReview.rating),
    ).filter(visible).one()
    total = int(agg[0] or 0)
    avg = round(float(agg[1]), 2) if total > 0 and agg[1] is not None else None

    dist: dict[int, int] = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    if total > 0:
        dist_rows = (
            db.query(PartyReview.rating, func.count(PartyReview.id))
            .filter(visible)
            .group_by(PartyReview.rating)
            .all()
        )
        for rating, cnt in dist_rows:
            if rating in dist:
                dist[rating] = int(cnt)

    total_pages = math.ceil(total / per_page) if total > 0 else 1

    offset = (page - 1) * per_page
    page_rows = (
        db.query(PartyReview)
        .filter(visible)
        .order_by(PartyReview.created_at.desc(), PartyReview.id.desc())
        .offset(offset)
        .limit(per_page)
        .all()
    )

    top_tags: list[str] = []
    top_positive_tags: list[str] = []
    top_negative_tags: list[str] = []
    if total > 0:
        tag_rows = db.query(PartyReview.tags).filter(visible).all()
        counter: Counter[str] = Counter()
        for (tags_val,) in tag_rows:
            if tags_val:
                counter.update(tags_val)
        top_tags = [t for t, _ in counter.most_common(5)]
        top_positive_tags = [
            t for t, _ in counter.most_common() if t in _POSITIVE_SET
        ][:5]
        top_negative_tags = [
            t for t, _ in counter.most_common() if t in _NEGATIVE_SET
        ][:5]

    reviewer_ids = {r.reviewer_id for r in page_rows}
    reviewers = (
        {u.id: u for u in db.query(User).filter(User.id.in_(reviewer_ids)).all()}
        if reviewer_ids
        else {}
    )

    page_reviews = [
        ReviewOut(
            id=r.id,
            reviewer_id=r.reviewer_id,
            reviewer_username=reviewers[r.reviewer_id].username if r.reviewer_id in reviewers else "Аноним",
            reviewer_avatar_url=reviewers[r.reviewer_id].avatar_url if r.reviewer_id in reviewers else None,
            rating=r.rating,
            text=r.text,
            tags=r.tags,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in page_rows
    ]
    return ReviewSummary(
        avg_rating=avg,
        total_reviews=total,
        reviews=page_reviews,
        stars_distribution=dist,
        top_tags=top_tags,
        top_positive_tags=top_positive_tags,
        top_negative_tags=top_negative_tags,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )


@router.get("/users/me/reviewable", response_model=List[ReviewableUser])
async def get_reviewable_users(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    current_user = get_current_user_from_token(token, db)
    now_ts = int(datetime.utcnow().timestamp())

    member_party_ids = [
        pm.party_id
        for pm in db.query(PartyMember).filter(
            PartyMember.user_id == current_user.id,
            PartyMember.status == "accepted",
        ).all()
    ]
    creator_party_ids = [
        ep.id
        for ep in db.query(EventParty).filter(
            EventParty.creator_id == current_user.id,
        ).all()
    ]
    my_party_ids = list(set(member_party_ids) | set(creator_party_ids))
    if not my_party_ids:
        return []

    # Batch-load все party одним запросом вместо N.
    parties_by_id = {
        p.id: p
        for p in db.query(EventParty).filter(EventParty.id.in_(my_party_ids)).all()
    }

    # Сперва используем party.event_date_ts (DB-значение, без сети).
    past_party_ids: list = []
    parties_needing_kudago: list = []
    for party_id in my_party_ids:
        party = parties_by_id.get(party_id)
        if not party:
            continue
        if party.event_date_ts:
            if party.event_date_ts < now_ts:
                past_party_ids.append(party_id)
            continue
        parties_needing_kudago.append(party)

    # Для оставшихся — параллельный KudaGo fetch через asyncio.gather,
    # чтобы N запросов уходили конкурентно, а не последовательно.
    if parties_needing_kudago:
        async def _fetch_ts(p):
            try:
                raw = await asyncio.wait_for(
                    kudago_api_async.get_event_by_id(int(p.event_id)), timeout=3.0
                )
                for d in raw.get("dates") or []:
                    ts = d.get("start")
                    if ts:
                        return (p.id, int(ts))
            except Exception:
                return (p.id, None)
            return (p.id, None)

        results = await asyncio.gather(*[_fetch_ts(p) for p in parties_needing_kudago])
        for pid, ts in results:
            if ts is not None and ts < now_ts:
                past_party_ids.append(pid)

    if not past_party_ids:
        return []

    already_reviewed = {
        (r.reviewed_id, r.party_id)
        for r in db.query(PartyReview).filter(
            PartyReview.reviewer_id == current_user.id,
            PartyReview.party_id.in_(past_party_ids),
            PartyReview.is_deleted == False,  # noqa: E712
        ).all()
    }

    parties_map = {
        ep.id: ep
        for ep in db.query(EventParty).filter(EventParty.id.in_(past_party_ids)).all()
    }

    result: list[ReviewableUser] = []
    seen_pairs: set[tuple[int, int]] = set()

    members = db.query(PartyMember).filter(
        PartyMember.party_id.in_(past_party_ids),
        PartyMember.status == "accepted",
        PartyMember.user_id != current_user.id,
    ).all()

    creators = db.query(EventParty).filter(
        EventParty.id.in_(past_party_ids),
        EventParty.creator_id != current_user.id,
    ).all()

    candidate_ids = {m.user_id for m in members} | {ep.creator_id for ep in creators}
    users_map = {u.id: u for u in db.query(User).filter(User.id.in_(candidate_ids)).all()}

    for member in members:
        pair = (member.user_id, member.party_id)
        if pair in already_reviewed or pair in seen_pairs:
            continue
        u = users_map.get(member.user_id)
        party = parties_map.get(member.party_id)
        if not u or not party:
            continue
        seen_pairs.add(pair)
        result.append(ReviewableUser(
            user_id=u.id,
            username=u.username,
            avatar_url=u.avatar_url,
            party_id=member.party_id,
            event_id=party.event_id,
        ))

    for ep in creators:
        pair = (ep.creator_id, ep.id)
        if pair in already_reviewed or pair in seen_pairs:
            continue
        u = users_map.get(ep.creator_id)
        if not u:
            continue
        seen_pairs.add(pair)
        result.append(ReviewableUser(
            user_id=u.id,
            username=u.username,
            avatar_url=u.avatar_url,
            party_id=ep.id,
            event_id=ep.event_id,
        ))

    return result
