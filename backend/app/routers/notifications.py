import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.notify import notify
from app.routers.auth import get_current_user
from app.routers.student import _require_student

router = APIRouter(prefix="/api/student/notifications", tags=["student-notifications"])
LIMIT = 30


def _out(n: models.Notification) -> schemas.NotificationOut:
    return schemas.NotificationOut(
        id=str(n.id), kind=n.kind, title=n.title, body=n.body, view=n.view_key, is_read=n.is_read,
        created_at=n.created_at,
    )


@router.get("", response_model=schemas.NotificationsOut)
def list_notifications(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    items = (
        db.query(models.Notification)
        .filter(models.Notification.student_profile_id == profile.id)
        .order_by(models.Notification.created_at.desc())
        .limit(LIMIT)
        .all()
    )
    unread = (
        db.query(func.count(models.Notification.id))
        .filter(models.Notification.student_profile_id == profile.id, models.Notification.is_read.is_(False))
        .scalar()
    )
    return schemas.NotificationsOut(unread=unread or 0, items=[_out(n) for n in items])


@router.post("/read-all")
def read_all(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    db.query(models.Notification).filter(
        models.Notification.student_profile_id == profile.id,
        models.Notification.is_read.is_(False),
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"ok": True}


@router.post("/{notification_id}/read")
def read_one(
    notification_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    n = (
        db.query(models.Notification)
        .filter(models.Notification.id == notification_id, models.Notification.student_profile_id == profile.id)
        .first()
    )
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found.")
    if not n.is_read:
        n.is_read = True
        db.commit()
    return {"ok": True}


@router.post("/demo-seed")
def demo_seed(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """DEV ONLY. Creates three sample notifications so the bell can be tried before the Faculty / Admin modules
    exist. Set ENABLE_DEMO_DATA=false in .env to switch it off."""
    import os

    if os.getenv("ENABLE_DEMO_DATA", "true").lower() != "true":
        raise HTTPException(status_code=404, detail="Not available.")
    profile = _require_student(current_user)
    if db.query(models.Notification.id).filter(models.Notification.student_profile_id == profile.id).first():
        raise HTTPException(status_code=400, detail="You already have notifications.")

    notify(db, profile.id, "mentor", "New message from your mentor",
           "Your mentor shared a revision plan for the end semester exams.", "mentor")
    notify(db, profile.id, "complaint", "Update on your complaint",
           "Your Wi-Fi complaint is now in progress.", "complaints")
    notify(db, profile.id, "complaint", "Your complaint was resolved",
           "The water cooler complaint is resolved. Please rate the resolution.", "complaints")

    # make them look like they arrived a little while ago
    now = datetime.now(timezone.utc)
    rows = (
        db.query(models.Notification)
        .filter(models.Notification.student_profile_id == profile.id)
        .order_by(models.Notification.created_at)
        .all()
    )
    for i, n in enumerate(rows):
        n.created_at = now - timedelta(hours=(len(rows) - i) * 3)
    db.commit()
    return {"notifications": len(rows)}