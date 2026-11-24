import re
import uuid
from typing import Optional

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from .auth import get_current_user


def norm(s) -> str:
    return "".join(str(s or "").lower().split())


def sem_num(s) -> Optional[int]:
    m = re.search(r"\d+", str(s or ""))
    return int(m.group()) if m else None


def class_key(course, semester, subject) -> str:
    return f"{norm(course)}|{semester}|{norm(subject)}"


def require_faculty(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)) -> models.FacultyProfile:
    """Every faculty endpoint depends on this: 403 for any other role, returns the faculty profile."""
    if current_user.role != models.RoleEnum.faculty:
        raise HTTPException(status_code=403, detail="Ye section sirf faculty ke liye hai.")
    prof = db.query(models.FacultyProfile).filter(models.FacultyProfile.user_id == current_user.id).first()
    if not prof:
        raise HTTPException(status_code=403, detail="Faculty profile nahi mili.")
    return prof


def my_assignment(db: Session, faculty, assignment_id: str) -> models.FacultyAssignment:
    """Ownership check: the class must belong to the logged-in faculty."""
    try:
        aid = uuid.UUID(str(assignment_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="Class nahi mili.")
    a = db.query(models.FacultyAssignment).filter(models.FacultyAssignment.id == aid).first()
    if not a:
        raise HTTPException(status_code=404, detail="Class nahi mili.")
    if a.faculty_profile_id != faculty.id:
        raise HTTPException(status_code=403, detail="Ye class aapki nahi hai.")
    return a


def students_by_class(db: Session) -> dict:
    """{(course_key, semester): {"course", "semester", "students": [StudentProfile...]}} for ACTIVE students only."""
    P, U = models.StudentProfile, models.User
    out = {}
    for p, u in db.query(P, U).join(U, U.id == P.user_id).order_by(P.name).all():
        if str(u.is_active).lower() == "false":
            continue
        n = sem_num(p.semester)
        if n is None or not norm(p.course):
            continue
        g = out.setdefault((norm(p.course), n), {"course": p.course.strip(), "semester": n, "students": []})
        g["students"].append(p)
    return out


def faculty_info(db: Session, faculty) -> dict:
    """Department / designation / email / phone written by Admin (read only here)."""
    d = db.query(models.AdminFacultyDetail).filter(models.AdminFacultyDetail.faculty_profile_id == faculty.id).first()
    dept = None
    if d and d.department_id:
        dep = db.query(models.AdminDepartment).filter(models.AdminDepartment.id == d.department_id).first()
        dept = dep.name if dep else None
    return {"department": dept, "designation": d.designation if d else None, "email": d.email if d else None, "phone": d.phone if d else None}