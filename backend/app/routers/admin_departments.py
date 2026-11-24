
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .admin_common import log_activity, model_by_table, require_admin


router = APIRouter(
    prefix="/api/admin/departments",
    tags=["admin-departments"]
)


def _key(s: str) -> str:
    return "".join((s or "").lower().split())


# ==========================================
# DEPARTMENT USAGE
# ==========================================

def _usage(db: Session) -> dict:
    """
    Get department usage from existing student and faculty profiles
    and AdminFacultyDetail records.
    """

    out: dict = {}

    # Student and faculty counts from profile tables
    for table, field in (
        ("student_profiles", "students"),
        ("faculty_profiles", "faculty")
    ):

        model = model_by_table(table)

        col = (
            getattr(model, "department", None)
            if model is not None
            else None
        )

        if col is None:
            continue

        try:
            for (value,) in db.query(col).all():

                if value:
                    key = _key(value)

                    out.setdefault(
                        key,
                        {"students": 0, "faculty": 0}
                    )[field] += 1

        except Exception:
            db.rollback()

    # Additional faculty count using AdminFacultyDetail
    dept_keys = {
        d.id: d.name_key
        for d in db.query(models.AdminDepartment).all()
    }

    try:
        D = models.AdminFacultyDetail

        for (did,) in db.query(D.department_id).all():

            k = dept_keys.get(did)

            if k:
                out.setdefault(
                    k,
                    {"students": 0, "faculty": 0}
                )["faculty"] += 1

    except Exception:
        db.rollback()

    return out


# ==========================================
# DEPARTMENT RESPONSE
# ==========================================

def _out(d, usage: dict) -> schemas.DepartmentOut:

    u = usage.get(d.name_key, {})

    return schemas.DepartmentOut(
        id=str(d.id),
        name=d.name,
        code=d.code,
        hod_name=d.hod_name,
        description=d.description,
        is_active=bool(d.is_active),
        students=u.get("students", 0),
        faculty=u.get("faculty", 0),
        created_at=d.created_at
    )


# ==========================================
# GET DEPARTMENT
# ==========================================

def _get(db: Session, dept_id: str):

    try:
        uid = uuid.UUID(dept_id)

    except ValueError:
        raise HTTPException(
            status_code=404,
            detail="Department nahi mila."
        )

    d = (
        db.query(models.AdminDepartment)
        .filter(models.AdminDepartment.id == uid)
        .first()
    )

    if not d:
        raise HTTPException(
            status_code=404,
            detail="Department nahi mila."
        )

    return d


# ==========================================
# CHECK DUPLICATES
# ==========================================

def _check_duplicates(db: Session, payload, exclude_id=None):

    M = models.AdminDepartment

    # Check duplicate department name
    q = db.query(M).filter(
        M.name_key == _key(payload.name)
    )

    if exclude_id:
        q = q.filter(M.id != exclude_id)

    if q.first():
        raise HTTPException(
            status_code=400,
            detail="Is naam ka department pehle se hai."
        )

    # Check duplicate department code
    q = db.query(M).filter(
        M.code_key == _key(payload.code)
    )

    if exclude_id:
        q = q.filter(M.id != exclude_id)

    if q.first():
        raise HTTPException(
            status_code=400,
            detail="Is code ka department pehle se hai."
        )


# ==========================================
# 1. LIST DEPARTMENTS
# ==========================================

@router.get("", response_model=schemas.DepartmentPage)
def list_departments(
    q: Optional[str] = Query(None, max_length=100),
    status: Optional[str] = Query(
        None,
        pattern="^(active|inactive)$"
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin=Depends(require_admin),
    db: Session = Depends(get_db)
):

    M = models.AdminDepartment

    query = db.query(M)

    if q and q.strip():

        like = f"%{q.strip()}%"

        query = query.filter(
            or_(
                M.name.ilike(like),
                M.code.ilike(like),
                M.hod_name.ilike(like)
            )
        )

    if status:

        query = query.filter(
            M.is_active == (status == "active")
        )

    total = query.count()

    rows = (
        query
        .order_by(M.name)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    usage = _usage(db)

    return schemas.DepartmentPage(
        items=[_out(d, usage) for d in rows],
        total=total,
        page=page,
        page_size=page_size
    )


# ==========================================
# 2. CREATE DEPARTMENT
# ==========================================

@router.post("", response_model=schemas.DepartmentOut)
def create_department(
    payload: schemas.DepartmentIn,
    admin=Depends(require_admin),
    db: Session = Depends(get_db)
):

    _check_duplicates(db, payload)

    d = models.AdminDepartment(
        name=payload.name,
        name_key=_key(payload.name),
        code=payload.code,
        code_key=_key(payload.code),
        hod_name=payload.hod_name,
        description=payload.description,
        is_active=True
    )

    db.add(d)
    db.commit()
    db.refresh(d)

    log_activity(
        db,
        admin,
        "department.create",
        f"Department added: {d.name} ({d.code})"
    )

    return _out(d, _usage(db))


# ==========================================
# 3. UPDATE DEPARTMENT
# ==========================================

@router.put("/{dept_id}", response_model=schemas.DepartmentOut)
def update_department(
    dept_id: str,
    payload: schemas.DepartmentIn,
    admin=Depends(require_admin),
    db: Session = Depends(get_db)
):

    d = _get(db, dept_id)

    _check_duplicates(
        db,
        payload,
        exclude_id=d.id
    )

    old = d.name

    d.name = payload.name
    d.name_key = _key(payload.name)

    d.code = payload.code
    d.code_key = _key(payload.code)

    d.hod_name = payload.hod_name
    d.description = payload.description

    d.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(d)

    log_activity(
        db,
        admin,
        "department.update",
        f"Department updated: {old} -> {d.name} ({d.code})"
    )

    return _out(d, _usage(db))


# ==========================================
# 4. TOGGLE DEPARTMENT STATUS
# ==========================================

@router.post("/{dept_id}/toggle", response_model=schemas.DepartmentOut)
def toggle_department(
    dept_id: str,
    admin=Depends(require_admin),
    db: Session = Depends(get_db)
):

    d = _get(db, dept_id)

    d.is_active = not d.is_active
    d.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(d)

    log_activity(
        db,
        admin,
        "department.toggle",
        f"Department {'activated' if d.is_active else 'deactivated'}: {d.name}"
    )

    return _out(d, _usage(db))


# ==========================================
# 5. DELETE DEPARTMENT
# ==========================================

@router.delete("/{dept_id}")
def delete_department(
    dept_id: str,
    admin=Depends(require_admin),
    db: Session = Depends(get_db)
):

    d = _get(db, dept_id)

    # Check linked courses before deletion
    if db.query(models.AdminCourse).filter(
        models.AdminCourse.department_id == d.id
    ).first():

        raise HTTPException(
            status_code=400,
            detail=(
                "Is department me courses hain. "
                "Pehle courses hatao ya department deactivate kar do."
            )
        )

    # Check linked students and faculty
    u = _usage(db).get(
        d.name_key,
        {}
    )

    if u.get("students", 0) or u.get("faculty", 0):

        raise HTTPException(
            status_code=400,
            detail=(
                f"Ye department delete nahi ho sakta: "
                f"{u.get('students', 0)} students aur "
                f"{u.get('faculty', 0)} faculty isse jude hain. "
                f"Deactivate kar do."
            )
        )

    name = d.name

    db.delete(d)
    db.commit()

    log_activity(
        db,
        admin,
        "department.delete",
        f"Department deleted: {name}"
    )

    return {
        "ok": True,
        "message": "Department deleted successfully."
    }
