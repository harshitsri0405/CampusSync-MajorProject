import os
import uuid
from datetime import date, time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from .admin_common import log_activity, require_admin

router = APIRouter(prefix="/api/admin/exams", tags=["admin-exams"])


def _key(s) -> str:
    return "".join(str(s or "").lower().split())


def _uuid(value, msg):
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _hm(t) -> str:
    return t.strftime("%H:%M")


def _status(d: date) -> str:
    today = date.today()
    return "upcoming" if d > today else ("today" if d == today else "completed")


def _out(e) -> schemas.ExamOut:
    return schemas.ExamOut(
        id=str(e.id), course=e.course, semester=str(e.semester), subject=e.subject, exam_type=e.exam_type,
        exam_date=e.exam_date, start_time=_hm(e.start_time), end_time=_hm(e.end_time), venue=e.venue,
        status=_status(e.exam_date),
    )


def _validate(db: Session, payload, exclude_id=None):
    course = db.query(models.AdminCourse).filter(models.AdminCourse.id == _uuid(payload.course_id, "Course nahi mila.")).first()
    if not course:
        raise HTTPException(status_code=400, detail="Ye course nahi mila.")
    if payload.semester > course.semesters:
        raise HTTPException(status_code=400, detail=f"Is course me sirf {course.semesters} semesters hain.")
    S = models.AdminSubject
    subject = db.query(S).filter(S.course_id == course.id, S.semester == payload.semester,
                                 S.name_key == _key(payload.subject), S.is_active.is_(True)).first()
    if not subject:
        raise HTTPException(status_code=400, detail="Ye subject is course/semester ke Subjects me nahi hai.")
    E = models.ExamScheduleEntry
    same_day = db.query(E).filter(E.exam_date == payload.exam_date)
    if exclude_id:
        same_day = same_day.filter(E.id != exclude_id)
    for e in same_day.all():
        if not (payload.start_time < e.end_time and e.start_time < payload.end_time):
            continue
        when = f"{_hm(e.start_time)}-{_hm(e.end_time)}"
        if _key(e.course) == course.name_key and _key(e.semester) == str(payload.semester):
            raise HTTPException(status_code=400, detail=f"Is class ka {when} par pehle se '{e.subject}' ka exam hai.")
        if payload.venue and e.venue and _key(e.venue) == _key(payload.venue):
            raise HTTPException(status_code=400, detail=f"Venue {e.venue} {when} par busy hai ({e.course} sem {e.semester}).")
    return course, subject


@router.get("", response_model=schemas.ExamPage)
def list_exams(
    course_id: Optional[str] = None,
    semester: Optional[int] = Query(None, ge=1, le=12),
    status: Optional[str] = Query(None, pattern="^(upcoming|completed)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    E = models.ExamScheduleEntry
    today = date.today()
    query = db.query(E)
    if course_id:
        c = db.query(models.AdminCourse).filter(models.AdminCourse.id == _uuid(course_id, "Course nahi mila.")).first()
        if not c:
            raise HTTPException(status_code=400, detail="Ye course nahi mila.")
        query = query.filter(func.lower(func.replace(E.course, " ", "")) == c.name_key)
    if semester:
        query = query.filter(func.lower(func.replace(E.semester, " ", "")) == str(semester))
    if status == "upcoming":
        query = query.filter(E.exam_date >= today)
    elif status == "completed":
        query = query.filter(E.exam_date < today)
    total = query.count()
    rows = query.order_by(E.exam_date, E.start_time).offset((page - 1) * page_size).limit(page_size).all()
    allq = db.query(E)
    stats = {
        "total": allq.count(),
        "upcoming": allq.filter(E.exam_date >= today).count(),
        "next_7_days": allq.filter(E.exam_date >= today, E.exam_date <= today + timedelta(days=7)).count(),
        "completed": allq.filter(E.exam_date < today).count(),
    }
    return schemas.ExamPage(items=[_out(e) for e in rows], total=total, page=page, page_size=page_size, stats=stats)


@router.post("", response_model=schemas.ExamOut)
def create_exam(payload: schemas.ExamIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    course, subject = _validate(db, payload)
    e = models.ExamScheduleEntry(
        course=course.name, semester=str(payload.semester), subject=subject.name, exam_type=payload.exam_type,
        exam_date=payload.exam_date, start_time=payload.start_time, end_time=payload.end_time, venue=payload.venue,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    log_activity(db, admin, "exam.create", f"Exam scheduled: {course.name} sem {payload.semester} {e.subject} ({e.exam_type}) on {e.exam_date}")
    return _out(e)


@router.put("/{exam_id}", response_model=schemas.ExamOut)
def update_exam(exam_id: str, payload: schemas.ExamIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    e = db.query(models.ExamScheduleEntry).filter(models.ExamScheduleEntry.id == _uuid(exam_id, "Exam nahi mila.")).first()
    if not e:
        raise HTTPException(status_code=404, detail="Exam nahi mila.")
    course, subject = _validate(db, payload, exclude_id=e.id)
    e.course, e.semester, e.subject, e.exam_type = course.name, str(payload.semester), subject.name, payload.exam_type
    e.exam_date, e.start_time, e.end_time, e.venue = payload.exam_date, payload.start_time, payload.end_time, payload.venue
    db.commit()
    log_activity(db, admin, "exam.update", f"Exam updated: {course.name} sem {payload.semester} {e.subject} ({e.exam_type}) on {e.exam_date}")
    return _out(e)


@router.delete("/{exam_id}")
def delete_exam(exam_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    e = db.query(models.ExamScheduleEntry).filter(models.ExamScheduleEntry.id == _uuid(exam_id, "Exam nahi mila.")).first()
    if not e:
        raise HTTPException(status_code=404, detail="Exam nahi mila.")
    label = f"{e.course} sem {e.semester} {e.subject} ({e.exam_type}) on {e.exam_date}"
    db.delete(e)
    db.commit()
    log_activity(db, admin, "exam.delete", f"Exam deleted: {label}")
    return {"ok": True}


@router.post("/demo-seed")
def demo_seed(admin=Depends(require_admin), db: Session = Depends(get_db)):
    """SAMPLE exam schedule (Internal Test 1) for the first class that has subjects."""
    if os.getenv("ENABLE_DEMO_DATA", "").strip().lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai. backend\\.env me ENABLE_DEMO_DATA=true karke backend restart karo.")
    S, E = models.AdminSubject, models.ExamScheduleEntry
    for course in db.query(models.AdminCourse).filter(models.AdminCourse.is_active.is_(True)).order_by(models.AdminCourse.name).all():
        for sem in range(1, course.semesters + 1):
            subjects = db.query(S).filter(S.course_id == course.id, S.semester == sem, S.is_active.is_(True)).order_by(S.name).limit(4).all()
            if not subjects:
                continue
            exists = db.query(E).filter(func.lower(func.replace(E.course, " ", "")) == course.name_key,
                                        func.lower(func.replace(E.semester, " ", "")) == str(sem)).first()
            if exists:
                return {"added": 0, "message": f"{course.name} semester {sem} ka exam schedule pehle se hai."}
            start = date.today() + timedelta(days=7)
            for i, s in enumerate(subjects):
                d = start + timedelta(days=i)
                if d.weekday() == 6:
                    d += timedelta(days=1)
                db.add(E(course=course.name, semester=str(sem), subject=s.name, exam_type="Internal Test 1", exam_date=d,
                         start_time=time(10, 0), end_time=time(11, 30), venue="Exam Hall A"))
            db.commit()
            log_activity(db, admin, "exam.demo", f"Sample exams added: {course.name} sem {sem} ({len(subjects)} exams, demo data)")
            return {"added": len(subjects), "message": f"{course.name} semester {sem} ke {len(subjects)} sample exams bane."}
    return {"added": 0, "message": "Sample ke liye pehle kisi active course me Subjects banao."}