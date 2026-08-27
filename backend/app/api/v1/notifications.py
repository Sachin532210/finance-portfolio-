from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, owned_or_404
from app.db.session import get_db
from app.models.insights import Notification
from app.models.user import NotificationPreference, User
from app.schemas.common import DeletedResponse, MessageResponse
from app.schemas.finance import (
    NotificationOut,
    NotificationPreferenceOut,
    NotificationPreferenceUpdate,
)
from app.services.finance.context import build_financial_context
from app.services.finance.rules_engine import evaluate_rules, persist_insights

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=List[NotificationOut])
def list_notifications(
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        query = query.where(Notification.read_at.is_(None))
    rows = db.scalars(query.order_by(Notification.created_at.desc()).limit(limit))
    return [NotificationOut.model_validate(r) for r in rows]


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    count = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.read_at.is_(None))
        .count()
    )
    return {"count": count}


@router.post("/refresh")
def refresh(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Re-runs the rules engine and stores anything newly triggered."""
    ctx = build_financial_context(db, user)
    insights = evaluate_rules(ctx)
    created = persist_insights(db, user.id, insights)
    return {
        "evaluated": len(insights),
        "created": created,
        "message": f"{created} new alert(s)." if created else "Nothing new - you are up to date.",
    }


@router.post("/{notification_id}/read", response_model=MessageResponse)
def mark_read(
    notification_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    notification = owned_or_404(db.get(Notification, notification_id), user, "Notification")
    if notification.read_at is None:
        notification.read_at = datetime.utcnow()
        db.commit()
    return MessageResponse(message="Marked as read.")


@router.post("/read-all", response_model=MessageResponse)
def mark_all_read(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    updated = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.read_at.is_(None))
        .update({Notification.read_at: datetime.utcnow()}, synchronize_session=False)
    )
    db.commit()
    return MessageResponse(message=f"Marked {updated} notification(s) as read.")


@router.delete("/{notification_id}", response_model=DeletedResponse)
def delete_notification(
    notification_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    notification = owned_or_404(db.get(Notification, notification_id), user, "Notification")
    db.delete(notification)
    db.commit()
    return DeletedResponse(id=notification_id)


@router.delete("", response_model=MessageResponse)
def clear_all(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    deleted = db.query(Notification).filter(Notification.user_id == user.id).delete()
    db.commit()
    return MessageResponse(message=f"Cleared {deleted} notification(s).")


@router.get("/preferences", response_model=NotificationPreferenceOut)
def get_preferences(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    prefs = db.scalar(select(NotificationPreference).where(NotificationPreference.user_id == user.id))
    if not prefs:
        prefs = NotificationPreference(user_id=user.id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return NotificationPreferenceOut.model_validate(prefs)


@router.patch("/preferences", response_model=NotificationPreferenceOut)
def update_preferences(
    payload: NotificationPreferenceUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    prefs = db.scalar(select(NotificationPreference).where(NotificationPreference.user_id == user.id))
    if not prefs:
        prefs = NotificationPreference(user_id=user.id)
        db.add(prefs)
        db.flush()
    for key, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(prefs, key, value)
    db.commit()
    db.refresh(prefs)
    return NotificationPreferenceOut.model_validate(prefs)
