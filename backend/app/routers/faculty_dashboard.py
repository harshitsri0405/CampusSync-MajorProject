from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from .faculty_common import faculty_info, norm, require_faculty, students_by_class
from .faculty_attendance import pending_today
from .faculty_assignments import pending_grading
router = APIRouter(prefix="/api/faculty/dashboard", tags=["faculty-dashboard"])


@router.get("/overview")
def overview(faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    A = models.FacultyAssignment
    rows = db.query(A).filter(A.faculty_profile_id == faculty.id).all()
    classes = {(norm(a.course), a.semester) for a in rows}
    subjects = {norm(a.subject) for a in rows}
    by_class = students_by_class(db)
    student_ids = set()
    for k in classes:
        for p in by_class.get(k, {}).get("students", []):
            student_ids.add(p.id)

    notices = []
    Notice = getattr(models, "Notice", None)  # student-side notices table; skipped if the model name differs
    if Notice is not None:
        try:
            for n in db.query(Notice).order_by(Notice.posted_on.desc()).limit(5).all():
                notices.append({"id": str(n.id), "title": n.title, "category": n.category,
                                "posted_on": n.posted_on.isoformat() if n.posted_on else None, "is_important": bool(n.is_important)})
        except Exception:
            db.rollback()
            notices = []

    info = faculty_info(db, faculty)
    return {
        "name": faculty.faculty_name, "faculty_id": faculty.faculty_id, **info,
        "counts": {"classes": len(classes), "subjects": len(subjects), "students": len(student_ids),
                 "counts": {"classes": len(classes), "subjects": len(subjects), "students": len(student_ids),
                   "pending_attendance": pending_today(db, rows, by_class), "pending_grading": pending_grading(db, faculty)},
                   "recent_notices": notices,
    }}