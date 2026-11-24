import os
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from .admin_common import log_activity, require_admin

router = APIRouter(prefix="/api/admin/academic", tags=["admin-academic"])


def _key(s) -> str:
    return "".join(str(s or "").lower().split())


def _status(start: date, end: date) -> str:
    today = date.today()
    if start > today:
        return "upcoming"
    if end < today:
        return "ended"
    return "running"


def _progress(start: date, end: date) -> int:
    total = (end - start).days
    if total <= 0:
        return 0
    return max(0, min(100, round((date.today() - start).days * 100 / total)))


def _uuid(value, msg):
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _year_terms(db: Session, name: str):
    T = models.SemesterTerm
    return db.query(T).filter(func.lower(func.replace(T.academic_year, " ", "")) == _key(name))


def _year_out(db: Session, y) -> schemas.AcademicYearOut:
    return schemas.AcademicYearOut(
        id=str(y.id), name=y.name, start_date=y.start_date, end_date=y.end_date,
        is_current=bool(y.is_current), status=_status(y.start_date, y.end_date), terms=_year_terms(db, y.name).count(),
    )


def _term_out(t) -> schemas.SemesterTermOut:
    return schemas.SemesterTermOut(
        id=str(t.id), course=t.course, semester=str(t.semester), start_date=t.start_date, end_date=t.end_date,
        academic_year=t.academic_year, status=_status(t.start_date, t.end_date), progress=_progress(t.start_date, t.end_date),
    )


def _get_year(db: Session, year_id: str):
    y = db.query(models.AdminAcademicYear).filter(models.AdminAcademicYear.id == _uuid(year_id, "Academic year nahi mila.")).first()
    if not y:
        raise HTTPException(status_code=404, detail="Academic year nahi mila.")
    return y


def _check_year_overlap(db: Session, payload, exclude_id=None):
    M = models.AdminAcademicYear
    q = db.query(M).filter(M.start_date <= payload.end_date, M.end_date >= payload.start_date)
    if exclude_id:
        q = q.filter(M.id != exclude_id)
    other = q.first()
    if other:
        raise HTTPException(status_code=400, detail=f"Ye dates {other.name} se overlap karti hain.")


# ------------------------------ academic years ------------------------------
@router.get("/years")
def list_years(admin=Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.query(models.AdminAcademicYear).order_by(models.AdminAcademicYear.start_date.desc()).all()
    return [_year_out(db, y).model_dump(mode="json") for y in rows]


@router.post("/years", response_model=schemas.AcademicYearOut)
def create_year(payload: schemas.AcademicYearIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    M = models.AdminAcademicYear
    if db.query(M).filter(M.name_key == _key(payload.name)).first():
        raise HTTPException(status_code=400, detail="Ye academic year pehle se hai.")
    _check_year_overlap(db, payload)
    first = db.query(func.count(M.id)).scalar() == 0
    y = M(name=payload.name, name_key=_key(payload.name), start_date=payload.start_date, end_date=payload.end_date, is_current=first)
    db.add(y)
    db.commit()
    db.refresh(y)
    log_activity(db, admin, "academic.year.create", f"Academic year added: {y.name}")
    return _year_out(db, y)


@router.put("/years/{year_id}", response_model=schemas.AcademicYearOut)
def update_year(year_id: str, payload: schemas.AcademicYearIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    M = models.AdminAcademicYear
    y = _get_year(db, year_id)
    if db.query(M).filter(M.name_key == _key(payload.name), M.id != y.id).first():
        raise HTTPException(status_code=400, detail="Ye academic year pehle se hai.")
    _check_year_overlap(db, payload, exclude_id=y.id)
    for t in _year_terms(db, y.name).all():
        if t.start_date < payload.start_date or t.end_date > payload.end_date:
            raise HTTPException(status_code=400, detail=f"{t.course} semester {t.semester} ki dates nayi range se bahar hain. Pehle wo term badlo.")
    old = y.name
    for t in _year_terms(db, old).all():
        t.academic_year = payload.name
    y.name, y.name_key, y.start_date, y.end_date = payload.name, _key(payload.name), payload.start_date, payload.end_date
    db.commit()
    log_activity(db, admin, "academic.year.update", f"Academic year updated: {old} -> {y.name}")
    return _year_out(db, y)


@router.post("/years/{year_id}/set-current", response_model=schemas.AcademicYearOut)
def set_current(year_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    M = models.AdminAcademicYear
    y = _get_year(db, year_id)
    db.query(M).update({M.is_current: False})
    y.is_current = True
    db.commit()
    log_activity(db, admin, "academic.year.current", f"Current academic year set: {y.name}")
    return _year_out(db, y)


@router.delete("/years/{year_id}")
def delete_year(year_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    y = _get_year(db, year_id)
    if y.is_current:
        raise HTTPException(status_code=400, detail="Current academic year delete nahi ho sakta. Pehle dusra year current banao.")
    n = _year_terms(db, y.name).count()
    if n:
        raise HTTPException(status_code=400, detail=f"Is year me {n} semester terms hain. Pehle unhe hatao.")
    name = y.name
    db.delete(y)
    db.commit()
    log_activity(db, admin, "academic.year.delete", f"Academic year deleted: {name}")
    return {"ok": True}


# ------------------------------ semester terms ------------------------------
@router.get("/terms", response_model=schemas.SemesterTermPage)
def list_terms(
    course: Optional[str] = Query(None, max_length=120),
    academic_year: Optional[str] = Query(None, max_length=20),
    status: Optional[str] = Query(None, pattern="^(upcoming|running|ended)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    T = models.SemesterTerm
    today = date.today()
    query = db.query(T)
    if course:
        query = query.filter(func.lower(func.replace(T.course, " ", "")) == _key(course))
    if academic_year:
        query = query.filter(func.lower(func.replace(T.academic_year, " ", "")) == _key(academic_year))
    if status == "upcoming":
        query = query.filter(T.start_date > today)
    elif status == "ended":
        query = query.filter(T.end_date < today)
    elif status == "running":
        query = query.filter(T.start_date <= today, T.end_date >= today)
    total = query.count()
    rows = query.order_by(T.start_date.desc(), T.course).offset((page - 1) * page_size).limit(page_size).all()
    allq = db.query(T)
    stats = {
        "total": allq.count(),
        "running": allq.filter(T.start_date <= today, T.end_date >= today).count(),
        "upcoming": allq.filter(T.start_date > today).count(),
        "ended": allq.filter(T.end_date < today).count(),
    }
    return schemas.SemesterTermPage(items=[_term_out(t) for t in rows], total=total, page=page, page_size=page_size, stats=stats)


@router.put("/terms", response_model=schemas.SemesterTermOut)
def save_term(payload: schemas.SemesterTermIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    course = db.query(models.AdminCourse).filter(models.AdminCourse.id == _uuid(payload.course_id, "Course nahi mila.")).first()
    if not course:
        raise HTTPException(status_code=400, detail="Ye course nahi mila.")
    if payload.semester > course.semesters:
        raise HTTPException(status_code=400, detail=f"Is course me sirf {course.semesters} semesters hain.")
    year = db.query(models.AdminAcademicYear).filter(models.AdminAcademicYear.name_key == _key(payload.academic_year)).first()
    if not year:
        raise HTTPException(status_code=400, detail="Ye academic year nahi mila.")
    if payload.start_date < year.start_date or payload.end_date > year.end_date:
        raise HTTPException(status_code=400, detail=f"Dates {year.name} ({year.start_date} se {year.end_date}) ke andar honi chahiye.")

    T = models.SemesterTerm
    t = (
        db.query(T)
        .filter(func.lower(func.replace(T.course, " ", "")) == course.name_key,
                func.lower(func.replace(T.semester, " ", "")) == _key(payload.semester))
        .first()
    )
    is_new = t is None
    if is_new:
        t = T(course=course.name, semester=str(payload.semester))
        db.add(t)
    t.start_date, t.end_date, t.academic_year = payload.start_date, payload.end_date, year.name
    db.commit()
    db.refresh(t)
    log_activity(db, admin, "academic.term.save", f"Semester term {'added' if is_new else 'updated'}: {t.course} sem {t.semester} ({t.start_date} to {t.end_date})")
    return _term_out(t)


@router.delete("/terms/{term_id}")
def delete_term(term_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    t = db.query(models.SemesterTerm).filter(models.SemesterTerm.id == _uuid(term_id, "Term nahi mila.")).first()
    if not t:
        raise HTTPException(status_code=404, detail="Term nahi mila.")
    label = f"{t.course} sem {t.semester}"
    db.delete(t)
    db.commit()
    log_activity(db, admin, "academic.term.delete", f"Semester term deleted: {label}")
    return {"ok": True}


@router.post("/demo-seed")
def demo_seed(admin=Depends(require_admin), db: Session = Depends(get_db)):
    """SAMPLE academic years and terms (for testing the screens only)."""
    if os.getenv("ENABLE_DEMO_DATA", "").strip().lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai. backend\\.env me ENABLE_DEMO_DATA=true karke backend restart karo.")
    M = models.AdminAcademicYear
    added_years = added_terms = 0
    plan = [("2025-26", date(2025, 6, 1), date(2026, 5, 31), False), ("2026-27", date(2026, 6, 1), date(2027, 5, 31), True)]
    has_current = db.query(M).filter(M.is_current.is_(True)).first() is not None
    for name, s, e, cur in plan:
        if db.query(M).filter(M.name_key == _key(name)).first():
            continue
        overlap = db.query(M).filter(M.start_date <= e, M.end_date >= s).first()
        if overlap:
            continue
        db.add(M(name=name, name_key=_key(name), start_date=s, end_date=e, is_current=cur and not has_current))
        added_years += 1
    db.flush()
    year = db.query(M).filter(M.name_key == _key("2026-27")).first()
    courses = db.query(models.AdminCourse).filter(models.AdminCourse.is_active.is_(True)).order_by(models.AdminCourse.name).limit(3).all()
    T = models.SemesterTerm
    if year:
        for c in courses:
            for sem, s, e in ((1, date(2026, 7, 15), date(2026, 12, 20)), (2, date(2027, 1, 5), date(2027, 5, 15))):
                if sem > c.semesters:
                    continue
                exists = db.query(T).filter(func.lower(func.replace(T.course, " ", "")) == c.name_key,
                                            func.lower(func.replace(T.semester, " ", "")) == str(sem)).first()
                if exists:
                    continue
                db.add(T(course=c.name, semester=str(sem), start_date=s, end_date=e, academic_year=year.name))
                added_terms += 1
    db.commit()
    if added_years or added_terms:
        log_activity(db, admin, "academic.demo", f"Sample data added: {added_years} years, {added_terms} terms (demo data)")
    return {"years": added_years, "terms": added_terms}