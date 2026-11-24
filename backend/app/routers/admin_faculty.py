import os
import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.security import hash_password
from .admin_common import log_activity, require_admin

router = APIRouter(prefix="/api/admin/faculty", tags=["admin-faculty"])

DEMO_PASSWORD = "Demo@1234"
# SAMPLE people for testing only (fake names, example.com emails, dummy phones)
DEMO_FACULTY = [
    ("DEMO-FAC-01", "Sample Faculty One", "Professor", "M.Tech, Ph.D", "demo.fac01@example.com", "9000000001"),
    ("DEMO-FAC-02", "Sample Faculty Two", "Associate Professor", "M.Tech", "demo.fac02@example.com", "9000000002"),
    ("DEMO-FAC-03", "Sample Faculty Three", "Assistant Professor", "M.Sc", "demo.fac03@example.com", "9000000003"),
    ("DEMO-FAC-04", "Sample Faculty Four", "Assistant Professor", "MBA", "demo.fac04@example.com", "9000000004"),
    ("DEMO-FAC-05", "Sample Faculty Five", "Lecturer", "M.A", "demo.fac05@example.com", "9000000005"),
    ("DEMO-FAC-06", "Sample Faculty Six", "Lecturer", "M.Com", "demo.fac06@example.com", "9000000006"),
]


def _is_active(user) -> bool:
    return str(user.is_active).lower() != "false"


def _dept_names(db: Session) -> dict:
    return {d.id: d.name for d in db.query(models.AdminDepartment).all()}


def _out(p, u, d, names) -> schemas.FacultyOut:
    return schemas.FacultyOut(
        id=str(p.id), faculty_id=p.faculty_id, faculty_name=p.faculty_name,
        department_id=str(d.department_id) if d and d.department_id else None,
        department_name=names.get(d.department_id) if d and d.department_id else None,
        designation=d.designation if d else None, email=d.email if d else None,
        phone=d.phone if d else None, qualification=d.qualification if d else None,
        joining_date=d.joining_date if d else None, is_active=_is_active(u), created_at=u.created_at,
    )


def _load(db: Session, profile_id: str):
    try:
        pid = uuid.UUID(profile_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Faculty nahi mila.")
    P, U, D = models.FacultyProfile, models.User, models.AdminFacultyDetail
    row = (
        db.query(P, U, D).join(U, U.id == P.user_id)
        .outerjoin(D, D.faculty_profile_id == P.id).filter(P.id == pid).first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Faculty nahi mila.")
    return row


def _check_department(db: Session, department_id: Optional[str], current=None):
    """Department must exist; a NEW assignment must also be active."""
    if not department_id:
        return None
    try:
        did = uuid.UUID(department_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Ye department nahi mila.")
    dept = db.query(models.AdminDepartment).filter(models.AdminDepartment.id == did).first()
    if not dept:
        raise HTTPException(status_code=400, detail="Ye department nahi mila.")
    if not dept.is_active and dept.id != current:
        raise HTTPException(status_code=400, detail="Inactive department me faculty assign nahi ho sakta.")
    return dept.id


def _create(db: Session, faculty_id: str, name: str, password: str, dept_id, designation, email, phone, qualification, joining):
    user = models.User(role=models.RoleEnum.faculty, username=faculty_id, hashed_password=hash_password(password))
    db.add(user)
    db.flush()
    profile = models.FacultyProfile(user_id=user.id, faculty_name=name, faculty_id=faculty_id)
    db.add(profile)
    db.flush()
    detail = models.AdminFacultyDetail(
        faculty_profile_id=profile.id, department_id=dept_id, designation=designation,
        email=email, phone=phone, qualification=qualification, joining_date=joining,
    )
    db.add(detail)
    return profile, user, detail


@router.get("", response_model=schemas.FacultyPage)
def list_faculty(
    q: Optional[str] = Query(None, max_length=100),
    department_id: Optional[str] = None,
    status: Optional[str] = Query(None, pattern="^(active|blocked)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    P, U, D = models.FacultyProfile, models.User, models.AdminFacultyDetail
    query = db.query(P, U, D).join(U, U.id == P.user_id).outerjoin(D, D.faculty_profile_id == P.id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(P.faculty_name.ilike(like), P.faculty_id.ilike(like), D.email.ilike(like)))
    if department_id:
        try:
            query = query.filter(D.department_id == uuid.UUID(department_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="Department sahi nahi hai.")
    if status == "blocked":
        query = query.filter(U.is_active == "false")
    elif status == "active":
        query = query.filter(or_(U.is_active.is_(None), U.is_active != "false"))
    total = query.count()
    rows = query.order_by(P.faculty_name).offset((page - 1) * page_size).limit(page_size).all()

    all_total = db.query(func.count(P.id)).scalar() or 0
    blocked = db.query(func.count(P.id)).join(U, U.id == P.user_id).filter(U.is_active == "false").scalar() or 0
    with_dept = db.query(func.count(D.id)).filter(D.department_id.isnot(None)).scalar() or 0
    names = _dept_names(db)
    return schemas.FacultyPage(
        items=[_out(p, u, d, names) for p, u, d in rows], total=total, page=page, page_size=page_size,
        stats={"total": all_total, "active": all_total - blocked, "blocked": blocked, "with_department": with_dept},
    )


@router.post("", response_model=schemas.FacultyOut)
def create_faculty(payload: schemas.FacultyCreate, admin=Depends(require_admin), db: Session = Depends(get_db)):
    if db.query(models.User).filter(func.lower(models.User.username) == payload.faculty_id.lower()).first():
        raise HTTPException(status_code=400, detail="Ye Faculty ID pehle se use me hai.")
    dept_id = _check_department(db, payload.department_id)
    p, u, d = _create(
        db, payload.faculty_id, payload.faculty_name, payload.password, dept_id, payload.designation,
        payload.email, payload.phone, payload.qualification, payload.joining_date,
    )
    db.commit()
    log_activity(db, admin, "faculty.create", f"Faculty added: {p.faculty_name} ({p.faculty_id})")
    return _out(p, u, d, _dept_names(db))


@router.put("/{profile_id}", response_model=schemas.FacultyOut)
def update_faculty(profile_id: str, payload: schemas.FacultyUpdate, admin=Depends(require_admin), db: Session = Depends(get_db)):
    p, u, d = _load(db, profile_id)
    dept_id = _check_department(db, payload.department_id, current=d.department_id if d else None)
    if d is None:
        d = models.AdminFacultyDetail(faculty_profile_id=p.id)
        db.add(d)
    p.faculty_name = payload.faculty_name
    d.department_id, d.designation, d.email = dept_id, payload.designation, payload.email
    d.phone, d.qualification, d.joining_date = payload.phone, payload.qualification, payload.joining_date
    d.updated_at = datetime.utcnow()
    db.commit()
    log_activity(db, admin, "faculty.update", f"Faculty updated: {p.faculty_name} ({p.faculty_id})")
    return _out(p, u, d, _dept_names(db))


@router.post("/{profile_id}/toggle", response_model=schemas.FacultyOut)
def toggle_faculty(profile_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    p, u, d = _load(db, profile_id)
    u.is_active = "false" if _is_active(u) else "true"
    db.commit()
    log_activity(db, admin, "faculty.toggle", f"Faculty {'activated' if _is_active(u) else 'blocked'}: {p.faculty_name} ({p.faculty_id})")
    return _out(p, u, d, _dept_names(db))


@router.post("/{profile_id}/reset-password")
def reset_password(profile_id: str, payload: schemas.FacultyPasswordReset, admin=Depends(require_admin), db: Session = Depends(get_db)):
    p, u, d = _load(db, profile_id)
    u.hashed_password = hash_password(payload.password)
    db.commit()
    log_activity(db, admin, "faculty.password", f"Password reset: {p.faculty_name} ({p.faculty_id})")
    return {"ok": True}


@router.post("/demo-seed")
def demo_seed(admin=Depends(require_admin), db: Session = Depends(get_db)):
    if os.getenv("ENABLE_DEMO_DATA", "").strip().lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai. backend\\.env me ENABLE_DEMO_DATA=true karke backend restart karo.")
    depts = db.query(models.AdminDepartment).filter(models.AdminDepartment.is_active.is_(True)).order_by(models.AdminDepartment.name).all()
    added = 0
    for i, (fid, name, desig, qual, mail, phone) in enumerate(DEMO_FACULTY):
        if db.query(models.User).filter(func.lower(models.User.username) == fid.lower()).first():
            continue
        dept_id = depts[i % len(depts)].id if depts else None
        _create(db, fid, name, DEMO_PASSWORD, dept_id, desig, mail, phone, qual, date(2020, 7, 1))
        added += 1
    db.commit()
    if added:
        log_activity(db, admin, "faculty.demo", f"{added} sample faculty added (demo data)")
    return {"added": added, "password": DEMO_PASSWORD}