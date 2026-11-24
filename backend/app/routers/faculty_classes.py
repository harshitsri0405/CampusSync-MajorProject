import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from .faculty_common import class_key, my_assignment, norm, require_faculty, students_by_class

router = APIRouter(prefix="/api/faculty/classes", tags=["faculty-classes"])


def _out(a, by_class) -> dict:
    g = by_class.get((norm(a.course), a.semester))
    return {"id": str(a.id), "course": a.course, "semester": a.semester, "subject": a.subject,
            "department": a.department, "students": len(g["students"]) if g else 0, "is_sample": bool(a.is_sample)}


@router.get("")
def my_classes(faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    A = models.FacultyAssignment
    rows = db.query(A).filter(A.faculty_profile_id == faculty.id).order_by(A.course, A.semester, A.subject).all()
    by_class = students_by_class(db)
    return {"items": [_out(a, by_class) for a in rows]}


@router.get("/{assignment_id}/students")
def class_students(
    assignment_id: str,
    q: Optional[str] = Query(None, max_length=80),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    faculty=Depends(require_faculty),
    db: Session = Depends(get_db),
):
    a = my_assignment(db, faculty, assignment_id)
    by_class = students_by_class(db)
    g = by_class.get((norm(a.course), a.semester))
    students = g["students"] if g else []
    if q and q.strip():
        s = q.strip().lower()
        students = [p for p in students if s in f"{p.name} {p.college_id}".lower()]
    total = len(students)
    view = students[(page - 1) * page_size: page * page_size]
    items = [{"id": str(p.id), "name": p.name, "college_id": p.college_id, "course": p.course, "semester": p.semester} for p in view]
    return {"class": _out(a, by_class), "items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/demo-seed")
def demo_seed(faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    """DEV ONLY. SAMPLE classes for the logged-in faculty, built from classes that really have students. Runs once.
    Admin will assign real classes later."""
    if os.getenv("ENABLE_DEMO_DATA", "").strip().lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai. backend\\.env me ENABLE_DEMO_DATA=true karke backend restart karo.")
    A = models.FacultyAssignment
    if db.query(A.id).filter(A.faculty_profile_id == faculty.id, A.is_sample.is_(True)).first():
        return {"added": 0, "message": "Sample classes pehle se bani hain."}
    by_class = students_by_class(db)
    if not by_class:
        return {"added": 0, "message": "Pehle kuch students banao (Admin > Students ya sample students), phir ye button dabao."}
    biggest = sorted(by_class.values(), key=lambda g: -len(g["students"]))[:2]
    added = 0
    for g in biggest:
        for n in (1, 2):
            subject = f"Sample Subject {n}"
            key = class_key(g["course"], g["semester"], subject)
            if db.query(A.id).filter(A.faculty_profile_id == faculty.id, A.class_key == key).first():
                continue
            db.add(A(faculty_profile_id=faculty.id, course=g["course"], semester=g["semester"], subject=subject, class_key=key, is_sample=True))
            added += 1
    db.commit()
    return {"added": added, "message": f"{added} sample classes bani (Sample Subject)."}