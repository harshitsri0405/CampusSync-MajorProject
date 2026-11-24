import calendar
import os
import random
from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.routers.auth import get_current_user
from app.routers.student import _require_student

router = APIRouter(prefix="/api/student/attendance", tags=["student-attendance"])

REQUIRED_PERCENTAGE = 75.0
DEMO_SUBJECTS = ["Mathematics", "Physics", "Data Structures", "Database Systems", "English"]


def _pct(present: int, total: int) -> float:
    return round(present * 100 / total, 1) if total else 0.0


@router.get("/summary", response_model=schemas.AttendanceSummary)
def summary(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    rows = (
        db.query(
            models.AttendanceRecord.subject,
            models.AttendanceRecord.status,
            func.count(models.AttendanceRecord.id),
        )
        .filter(models.AttendanceRecord.student_profile_id == profile.id)
        .group_by(models.AttendanceRecord.subject, models.AttendanceRecord.status)
        .all()
    )
    per_subject = defaultdict(lambda: {"present": 0, "total": 0})
    for subject, status, count in rows:
        per_subject[subject]["total"] += count
        if status == "present":
            per_subject[subject]["present"] += count

    subjects = [
        schemas.SubjectAttendance(
            subject=name, present=v["present"], total=v["total"], percentage=_pct(v["present"], v["total"])
        )
        for name, v in sorted(per_subject.items())
    ]
    total = sum(v["total"] for v in per_subject.values())
    present = sum(v["present"] for v in per_subject.values())
    percentage = _pct(present, total)
    return schemas.AttendanceSummary(
        total_classes=total,
        present=present,
        absent=total - present,
        percentage=percentage,
        required_percentage=REQUIRED_PERCENTAGE,
        at_risk=total > 0 and percentage < REQUIRED_PERCENTAGE,
        subjects=subjects,
    )


@router.get("/monthly", response_model=schemas.AttendanceMonth)
def monthly(
    year: int = Query(default_factory=lambda: date.today().year, ge=2000, le=2100),
    month: int = Query(default_factory=lambda: date.today().month, ge=1, le=12),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    first = date(year, month, 1)
    last = date(year, month, calendar.monthrange(year, month)[1])
    records = (
        db.query(models.AttendanceRecord)
        .filter(
            models.AttendanceRecord.student_profile_id == profile.id,
            models.AttendanceRecord.date >= first,
            models.AttendanceRecord.date <= last,
        )
        .all()
    )
    by_day = defaultdict(lambda: {"present": 0, "absent": 0, "classes": []})
    for r in records:
        status = r.status if r.status in ("present", "absent") else "absent"
        by_day[r.date][status] += 1
        by_day[r.date]["classes"].append(schemas.AttendanceClass(subject=r.subject, status=status))

    days = []
    for d in sorted(by_day):
        p, a = by_day[d]["present"], by_day[d]["absent"]
        status = "present" if a == 0 else "absent" if p == 0 else "mixed"
        classes = sorted(by_day[d]["classes"], key=lambda c: c.subject)
        days.append(schemas.AttendanceDay(date=d, present=p, absent=a, status=status, classes=classes))

    total = len(records)
    present = sum(1 for r in records if r.status == "present")
    return schemas.AttendanceMonth(
        year=year, month=month, total_classes=total, present=present, percentage=_pct(present, total), days=days
    )


@router.get("/history", response_model=schemas.AttendanceHistory)
def history(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    base = db.query(models.AttendanceRecord).filter(models.AttendanceRecord.student_profile_id == profile.id)
    total = base.count()
    items = (
        base.order_by(models.AttendanceRecord.date.desc(), models.AttendanceRecord.subject)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return schemas.AttendanceHistory(
        items=[schemas.AttendanceRecordOut(date=i.date, subject=i.subject, status=i.status) for i in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/demo-seed")
def demo_seed(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """DEV ONLY. Creates ~45 days of sample attendance so the screen can be tested
    before the Faculty module exists. Set ENABLE_DEMO_DATA=false in .env to switch it off."""
    if os.getenv("ENABLE_DEMO_DATA", "true").lower() != "true":
        raise HTTPException(status_code=404, detail="Not available.")
    profile = _require_student(current_user)
    exists = (
        db.query(models.AttendanceRecord.id)
        .filter(models.AttendanceRecord.student_profile_id == profile.id)
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="Attendance data already exists for this student.")

    rng = random.Random(profile.college_id)
    today = date.today()
    created = 0
    for offset in range(45):
        d = today - timedelta(days=offset)
        if d.weekday() >= 5:  # skip Saturday and Sunday
            continue
        for subject in rng.sample(DEMO_SUBJECTS, 3):
            status = "present" if rng.random() < 0.82 else "absent"
            db.add(models.AttendanceRecord(student_profile_id=profile.id, date=d, subject=subject,
                                           status=status, marked_by="demo"))
            created += 1
    db.commit()
    return {"created": created}

@router.get("/range", response_model=schemas.AttendanceRange)
def date_range(
    start: date = Query(...),
    end: date = Query(...),
    subject: str | None = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if end < start:
        raise HTTPException(status_code=400, detail="End date must be on or after the start date.")
    profile = _require_student(current_user)

    wanted = (subject or "").strip()
    filters = [
        models.AttendanceRecord.student_profile_id == profile.id,
        models.AttendanceRecord.date >= start,
        models.AttendanceRecord.date <= end,
    ]
    if wanted:
        filters.append(func.lower(func.trim(models.AttendanceRecord.subject)) == wanted.lower())

    rows = (
        db.query(
            models.AttendanceRecord.subject,
            models.AttendanceRecord.status,
            func.count(models.AttendanceRecord.id),
        )
        .filter(*filters)
        .group_by(models.AttendanceRecord.subject, models.AttendanceRecord.status)
        .all()
    )
    per_subject = defaultdict(lambda: {"present": 0, "total": 0})
    for subj, status, count in rows:
        per_subject[subj]["total"] += count
        if status == "present":
            per_subject[subj]["present"] += count

    subjects = [
        schemas.SubjectAttendance(
            subject=name, present=v["present"], total=v["total"], percentage=_pct(v["present"], v["total"])
        )
        for name, v in sorted(per_subject.items())
    ]
    total = sum(v["total"] for v in per_subject.values())
    present = sum(v["present"] for v in per_subject.values())

    # date-wise list, only when one subject was asked for
    records = []
    if wanted:
        recs = (
            db.query(models.AttendanceRecord)
            .filter(*filters)
            .order_by(models.AttendanceRecord.date)
            .all()
        )
        records = [schemas.AttendanceRecordOut(date=r.date, subject=r.subject, status=r.status) for r in recs]

    return schemas.AttendanceRange(
        start=start,
        end=end,
        subject=subjects[0].subject if (wanted and subjects) else (wanted or None),
        total_classes=total,
        present=present,
        absent=total - present,
        percentage=_pct(present, total),
        subjects=subjects,
        records=records,
    )