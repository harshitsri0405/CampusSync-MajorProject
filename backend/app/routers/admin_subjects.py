import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .admin_common import log_activity, model_by_table, require_admin

router = APIRouter(prefix="/api/admin/subjects", tags=["admin-subjects"])

# old tables that store the subject as free text: (table, column names to try)
USAGE_TABLES = ("attendance_records", "result_records", "timetable_entries", "assignments")
USAGE_COLUMNS = ("subject", "subject_name")


def _key(s: str) -> str:
    return "".join((s or "").lower().split())


def _uuid(value: str, msg: str):
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _usage(db: Session) -> dict:
    """{subject key: number of old records using that subject name} (best effort, never crashes)."""
    out: dict = {}
    for table in USAGE_TABLES:
        model = model_by_table(table)
        if model is None:
            continue
        col = next((getattr(model, c) for c in USAGE_COLUMNS if hasattr(model, c)), None)
        if col is None:
            continue
        try:
            for (value,) in db.query(col).all():
                if value:
                    out[_key(value)] = out.get(_key(value), 0) + 1
        except Exception:
            db.rollback()
    return out


def _maps(db: Session):
    courses = {c.id: c for c in db.query(models.AdminCourse).all()}
    depts = {d.id: d.name for d in db.query(models.AdminDepartment).all()}
    return courses, depts


def _out(s, courses, depts, usage) -> schemas.SubjectOut:
    c = courses.get(s.course_id)
    return schemas.SubjectOut(
        id=str(s.id), course_id=str(s.course_id), course_name=c.name if c else None,
        department_name=depts.get(c.department_id) if c else None, semester=s.semester, name=s.name,
        code=s.code, credits=s.credits, subject_type=s.subject_type, is_active=bool(s.is_active),
        in_use=usage.get(s.name_key, 0), created_at=s.created_at,
    )


def _get(db: Session, subject_id: str):
    s = db.query(models.AdminSubject).filter(models.AdminSubject.id == _uuid(subject_id, "Subject nahi mila.")).first()
    if not s:
        raise HTTPException(status_code=404, detail="Subject nahi mila.")
    return s


def _validate(db: Session, payload, exclude_id=None):
    course = db.query(models.AdminCourse).filter(
        models.AdminCourse.id == _uuid(payload.course_id, "Course nahi mila.")
    ).first()
    if not course:
        raise HTTPException(status_code=400, detail="Ye course nahi mila.")
    if payload.semester > course.semesters:
        raise HTTPException(status_code=400, detail=f"Is course me sirf {course.semesters} semesters hain.")
    M = models.AdminSubject
    q = db.query(M).filter(M.course_id == course.id, M.semester == payload.semester, M.name_key == _key(payload.name))
    if exclude_id:
        q = q.filter(M.id != exclude_id)
    if q.first():
        raise HTTPException(status_code=400, detail="Is course ke is semester me ye subject pehle se hai.")
    q = db.query(M).filter(M.code_key == _key(payload.code))
    if exclude_id:
        q = q.filter(M.id != exclude_id)
    if q.first():
        raise HTTPException(status_code=400, detail="Is code ka subject pehle se hai.")
    return course


@router.get("", response_model=schemas.SubjectPage)
def list_subjects(
    q: Optional[str] = Query(None, max_length=100),
    course_id: Optional[str] = None,
    semester: Optional[int] = Query(None, ge=1, le=12),
    status: Optional[str] = Query(None, pattern="^(active|inactive)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    M = models.AdminSubject
    query = db.query(M)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(M.name.ilike(like), M.code.ilike(like)))
    if course_id:
        query = query.filter(M.course_id == _uuid(course_id, "Course nahi mila."))
    if semester:
        query = query.filter(M.semester == semester)
    if status:
        query = query.filter(M.is_active == (status == "active"))
    total = query.count()
    rows = query.order_by(M.semester, M.name).offset((page - 1) * page_size).limit(page_size).all()
    courses, depts = _maps(db)
    usage = _usage(db)
    return schemas.SubjectPage(items=[_out(s, courses, depts, usage) for s in rows], total=total, page=page, page_size=page_size)


@router.post("", response_model=schemas.SubjectOut)
def create_subject(payload: schemas.SubjectIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    course = _validate(db, payload)
    if not course.is_active:
        raise HTTPException(status_code=400, detail="Inactive course me naya subject nahi ban sakta.")
    s = models.AdminSubject(
        course_id=course.id, semester=payload.semester, name=payload.name, name_key=_key(payload.name),
        code=payload.code, code_key=_key(payload.code), credits=payload.credits,
        subject_type=payload.subject_type, is_active=True,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    log_activity(db, admin, "subject.create", f"Subject added: {s.name} ({s.code}) - {course.name} sem {s.semester}")
    courses, depts = _maps(db)
    return _out(s, courses, depts, _usage(db))


@router.put("/{subject_id}", response_model=schemas.SubjectOut)
def update_subject(subject_id: str, payload: schemas.SubjectIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    s = _get(db, subject_id)
    course = _validate(db, payload, exclude_id=s.id)
    if course.id != s.course_id and not course.is_active:
        raise HTTPException(status_code=400, detail="Subject inactive course me move nahi ho sakta.")
    old = s.name
    s.course_id, s.semester = course.id, payload.semester
    s.name, s.name_key = payload.name, _key(payload.name)
    s.code, s.code_key = payload.code, _key(payload.code)
    s.credits, s.subject_type = payload.credits, payload.subject_type
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    log_activity(db, admin, "subject.update", f"Subject updated: {old} -> {s.name} ({s.code})")
    courses, depts = _maps(db)
    return _out(s, courses, depts, _usage(db))


@router.post("/{subject_id}/toggle", response_model=schemas.SubjectOut)
def toggle_subject(subject_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    s = _get(db, subject_id)
    s.is_active = not s.is_active
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    log_activity(db, admin, "subject.toggle", f"Subject {'activated' if s.is_active else 'deactivated'}: {s.name}")
    courses, depts = _maps(db)
    return _out(s, courses, depts, _usage(db))


@router.delete("/{subject_id}")
def delete_subject(subject_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    s = _get(db, subject_id)
    n = _usage(db).get(s.name_key, 0)
    if n:
        raise HTTPException(status_code=400, detail=f"Ye subject delete nahi ho sakta: {n} records (attendance/results etc.) isse jude hain. Deactivate kar do.")
    name = s.name
    db.delete(s)
    db.commit()
    log_activity(db, admin, "subject.delete", f"Subject deleted: {name}")
    return {"ok": True}
