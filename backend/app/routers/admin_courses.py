
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
    prefix="/api/admin/courses",
    tags=["admin-courses"]
)


# ==========================================
# HELPER FUNCTIONS
# ==========================================

def _key(s: str) -> str:
    return "".join((s or "").lower().split())


def _uuid(value: str, msg: str):
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(
            status_code=404,
            detail=msg
        )


def _student_usage(db: Session) -> dict:
    """
    Get student counts using the old free-text course column.
    """

    out: dict = {}

    model = model_by_table("student_profiles")

    col = (
        getattr(model, "course", None)
        if model is not None
        else None
    )

    if col is None:
        return out

    try:
        for (value,) in db.query(col).all():

            if value:
                key = _key(value)
                out[key] = out.get(key, 0) + 1

    except Exception:
        db.rollback()

    return out


def _out(c, dept_names: dict, usage: dict) -> schemas.CourseOut:

    return schemas.CourseOut(
        id=str(c.id),
        name=c.name,
        code=c.code,
        department_id=str(c.department_id),
        department_name=dept_names.get(c.department_id),
        duration_years=c.duration_years,
        semesters=c.semesters,
        description=c.description,
        is_active=bool(c.is_active),
        students=usage.get(c.name_key, 0),
        created_at=c.created_at
    )


def _dept_names(db: Session) -> dict:

    return {
        d.id: d.name
        for d in db.query(models.AdminDepartment).all()
    }


def _get(db: Session, course_id: str):

    course_uuid = _uuid(
        course_id,
        "Course nahi mila."
    )

    c = (
        db.query(models.AdminCourse)
        .filter(models.AdminCourse.id == course_uuid)
        .first()
    )

    if not c:
        raise HTTPException(
            status_code=404,
            detail="Course nahi mila."
        )

    return c


def _validate(db: Session, payload, exclude_id=None):

    department_uuid = _uuid(
        payload.department_id,
        "Department nahi mila."
    )

    dept = (
        db.query(models.AdminDepartment)
        .filter(models.AdminDepartment.id == department_uuid)
        .first()
    )

    if not dept:
        raise HTTPException(
            status_code=400,
            detail="Ye department nahi mila."
        )

    M = models.AdminCourse

    # Check duplicate course name in same department
    q = db.query(M).filter(
        M.department_id == dept.id,
        M.name_key == _key(payload.name)
    )

    if exclude_id:
        q = q.filter(M.id != exclude_id)

    if q.first():
        raise HTTPException(
            status_code=400,
            detail="Is department me is naam ka course pehle se hai."
        )

    # Check duplicate course code
    q = db.query(M).filter(
        M.code_key == _key(payload.code)
    )

    if exclude_id:
        q = q.filter(M.id != exclude_id)

    if q.first():
        raise HTTPException(
            status_code=400,
            detail="Is code ka course pehle se hai."
        )

    return dept


# ==========================================
# 1. LIST COURSES
# ==========================================

@router.get("", response_model=schemas.CoursePage)
def list_courses(
    q: Optional[str] = Query(None, max_length=100),
    department_id: Optional[str] = None,
    status: Optional[str] = Query(
        None,
        pattern="^(active|inactive)$"
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin=Depends(require_admin),
    db: Session = Depends(get_db)
):

    M = models.AdminCourse

    query = db.query(M)

    # Search by course name or code
    if q and q.strip():

        like = f"%{q.strip()}%"

        query = query.filter(
            or_(
                M.name.ilike(like),
                M.code.ilike(like)
            )
        )

    # Filter by department
    if department_id:

        dept_uuid = _uuid(
            department_id,
            "Department nahi mila."
        )

        query = query.filter(
            M.department_id == dept_uuid
        )

    # Filter by status
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

    names = _dept_names(db)
    usage = _student_usage(db)

    return schemas.CoursePage(
        items=[
            _out(c, names, usage)
            for c in rows
        ],
        total=total,
        page=page,
        page_size=page_size
    )


# ==========================================
# 2. CREATE COURSE
# ==========================================

@router.post("", response_model=schemas.CourseOut)
def create_course(
    payload: schemas.CourseIn,
    admin=Depends(require_admin),
    db: Session = Depends(get_db)
):

    dept = _validate(db, payload)

    if not dept.is_active:
        raise HTTPException(
            status_code=400,
            detail="Inactive department me naya course nahi ban sakta."
        )

    c = models.AdminCourse(
        department_id=dept.id,
        name=payload.name,
        name_key=_key(payload.name),
        code=payload.code,
        code_key=_key(payload.code),
        duration_years=payload.duration_years,
        semesters=payload.semesters,
        description=payload.description,
        is_active=True
    )

    db.add(c)
    db.commit()
    db.refresh(c)

    log_activity(
        db,
        admin,
        "course.create",
        f"Course added: {c.name} ({c.code}) in {dept.name}"
    )

    return _out(
        c,
        _dept_names(db),
        _student_usage(db)
    )


# ==========================================
# 3. UPDATE COURSE
# ==========================================

@router.put("/{course_id}", response_model=schemas.CourseOut)
def update_course(
    course_id: str,
    payload: schemas.CourseIn,
    admin=Depends(require_admin),
    db: Session = Depends(get_db)
):

    c = _get(db, course_id)

    dept = _validate(
        db,
        payload,
        exclude_id=c.id
    )

    if dept.id != c.department_id and not dept.is_active:
        raise HTTPException(
            status_code=400,
            detail="Course inactive department me move nahi ho sakta."
        )

    old = c.name

    c.department_id = dept.id

    c.name = payload.name
    c.name_key = _key(payload.name)

    c.code = payload.code
    c.code_key = _key(payload.code)

    c.duration_years = payload.duration_years
    c.semesters = payload.semesters
    c.description = payload.description

    c.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(c)

    log_activity(
        db,
        admin,
        "course.update",
        f"Course updated: {old} -> {c.name} ({c.code})"
    )

    return _out(
        c,
        _dept_names(db),
        _student_usage(db)
    )


# ==========================================
# 4. TOGGLE COURSE STATUS
# ==========================================

@router.post("/{course_id}/toggle", response_model=schemas.CourseOut)
def toggle_course(
    course_id: str,
    admin=Depends(require_admin),
    db: Session = Depends(get_db)
):

    c = _get(db, course_id)

    c.is_active = not c.is_active
    c.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(c)

    log_activity(
        db,
        admin,
        "course.toggle",
        f"Course {'activated' if c.is_active else 'deactivated'}: {c.name}"
    )

    return _out(
        c,
        _dept_names(db),
        _student_usage(db)
    )


# ==========================================
# 5. DELETE COURSE
# ==========================================

@router.delete("/{course_id}")
def delete_course(
    course_id: str,
    admin=Depends(require_admin),
    db: Session = Depends(get_db)
):

    c = _get(db, course_id)

    # Check whether subjects are linked to this course
    if db.query(models.AdminSubject).filter(
        models.AdminSubject.course_id == c.id
    ).first():

        raise HTTPException(
            status_code=400,
            detail=(
                "Is course me subjects hain. "
                "Pehle subjects hatao ya course deactivate kar do."
            )
        )

    # Check linked students
    n = _student_usage(db).get(c.name_key, 0)

    if n:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Ye course delete nahi ho sakta: "
                f"{n} students isse jude hain. "
                f"Deactivate kar do."
            )
        )

    name = c.name

    db.delete(c)
    db.commit()

    log_activity(
        db,
        admin,
        "course.delete",
        f"Course deleted: {name}"
    )

    return {
        "ok": True,
        "message": "Course deleted successfully."
    }
