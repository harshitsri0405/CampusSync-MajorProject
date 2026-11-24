import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from .faculty_common import norm, sem_num
from .faculty_uploads import path_of
from .student_common import get_current_student

router = APIRouter(prefix="/api/student/exams", tags=["student-exams"])

E, P, M = models.FacultyExam, models.FacultyExamPaper, models.FacultyExamMark
FOLDER = "exam_papers"


def _class_exams(db: Session, s):
    return (db.query(E).filter(E.course_key == norm(s.course), E.semester == sem_num(s.semester))
            .order_by(E.exam_date.desc().nullslast(), E.created_at.desc()).all())


@router.get("")
def my_exams(student=Depends(get_current_student), db: Session = Depends(get_db)):
    items = []
    for e in _class_exams(db, student):
        paper = db.query(P).filter(P.exam_id == e.id, P.released.is_(True)).first()
        result = None
        if e.results_published:
            m = db.query(M).filter(M.exam_id == e.id, M.student_profile_id == student.id).first()
            avg, hi = db.query(func.avg(M.marks), func.max(M.marks)).filter(M.exam_id == e.id, M.is_absent.is_(False)).one()
            if m:
                pct = None if m.is_absent or m.marks is None else round(m.marks / e.max_marks * 100, 1)
                result = {"absent": m.is_absent, "marks": m.marks, "percent": pct,
                          "passed": None if pct is None else pct >= e.pass_percent, "remarks": m.remarks,
                          "class_average": round(float(avg), 2) if avg is not None else None,
                          "class_highest": hi}
        items.append({"id": str(e.id), "name": e.name, "subject": e.subject, "exam_type": e.exam_type,
                      "exam_date": e.exam_date.isoformat() if e.exam_date else None,
                      "duration_min": e.duration_min, "max_marks": e.max_marks, "pass_percent": e.pass_percent,
                      "instructions": e.instructions,
                      "paper": {"file_name": paper.file_name, "size": paper.size} if paper else None,
                      "result": result})
    return {"items": items}


@router.get("/{exam_id}/paper")
def paper_file(exam_id: str, student=Depends(get_current_student), db: Session = Depends(get_db)):
    try:
        eid = uuid.UUID(exam_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Question paper not found.")
    e = db.query(E).filter(E.id == eid, E.course_key == norm(student.course), E.semester == sem_num(student.semester)).first()
    paper = db.query(P).filter(P.exam_id == eid, P.released.is_(True)).first() if e else None
    if not paper:
        raise HTTPException(status_code=404, detail="Question paper not found.")
    return FileResponse(path_of(FOLDER, paper.stored_name), filename=paper.file_name)