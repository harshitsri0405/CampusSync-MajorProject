import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..notify import notify
from ..schemas import FacultyExamCopyVisibilityIn
from .faculty_attendance import _students
from .faculty_common import my_assignment, norm, require_faculty
from .faculty_uploads import path_of, read_upload, remove, store

router = APIRouter(prefix="/api/faculty/exam-copies", tags=["faculty-exam-copies"])

C = models.FacultyExamCopy
FOLDER = "exam_copies"
COPY_EXTS = {".pdf", ".png", ".jpg", ".jpeg"}
MAX_MB = 10
EXAMS = ["Internal Test 1", "Internal Test 2", "Mid Semester", "End Semester", "Practical", "Viva"]


def copy_out(c) -> Optional[dict]:
    if c is None:
        return None
    return {"id": str(c.id), "exam_name": c.exam_name, "file_name": c.file_name, "size": c.size,
            "is_visible": c.is_visible, "uploaded_at": c.uploaded_at.isoformat() if c.uploaded_at else None}


def _own(db: Session, faculty, copy_id: str):
    try:
        cid = uuid.UUID(copy_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Copy not found.")
    c = db.query(C).filter(C.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="Copy not found.")
    my_assignment(db, faculty, str(c.assignment_id))
    return c


@router.get("/meta")
def meta(faculty=Depends(require_faculty)):
    return {"exams": EXAMS, "max_mb": MAX_MB}


@router.get("")
def list_copies(assignment_id: str, exam_name: str = Query(..., min_length=1, max_length=60),
                faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, assignment_id)
    by = {r.student_profile_id: r for r in db.query(C).filter(C.assignment_id == a.id, C.exam_name == exam_name.strip()).all()}
    items = [{"id": str(p.id), "name": p.name, "college_id": p.college_id, "copy": copy_out(by.get(p.id))} for p in _students(db, a)]
    items.sort(key=lambda r: r["name"].lower())
    return {"items": items, "uploaded": len(by), "total": len(items)}


@router.post("")
def upload(
    assignment_id: str = Form(...),
    student_id: str = Form(...),
    exam_name: str = Form(...),
    file: UploadFile = File(...),
    faculty=Depends(require_faculty),
    db: Session = Depends(get_db),
):
    a = my_assignment(db, faculty, assignment_id)
    exam_name = exam_name.strip()
    if not exam_name or len(exam_name) > 60:
        raise HTTPException(status_code=400, detail="The exam name must be 1 to 60 characters.")
    student = next((p for p in _students(db, a) if str(p.id) == student_id), None)
    if not student:
        raise HTTPException(status_code=403, detail="This student is not in your class.")
    data, ext, clean = read_upload(file, COPY_EXTS, MAX_MB)
    stored = store(FOLDER, data, ext)
    old = db.query(C).filter(C.assignment_id == a.id, C.student_profile_id == student.id, C.exam_name == exam_name).first()
    old_stored = old.stored_name if old else None
    try:
        if old:
            old.file_name, old.stored_name, old.size = clean, stored, len(data)
            c = old
        else:
            c = C(assignment_id=a.id, student_profile_id=student.id, semester=a.semester, subject=a.subject,
                  exam_name=exam_name, file_name=clean, stored_name=stored, size=len(data))
            db.add(c)
            notify(db, student.id, "result", f"Exam copy: {a.subject}", f"Your evaluated copy for {exam_name} has been uploaded.", "results")
        db.commit()
    except Exception:
        db.rollback()
        remove(FOLDER, stored)
        raise
    if old_stored:
        remove(FOLDER, old_stored)
    db.refresh(c)
    return copy_out(c)


@router.put("/{copy_id}")
def set_visible(copy_id: str, body: FacultyExamCopyVisibilityIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    c = _own(db, faculty, copy_id)
    c.is_visible = body.is_visible
    db.commit()
    return copy_out(c)


@router.delete("/{copy_id}")
def delete(copy_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    c = _own(db, faculty, copy_id)
    stored = c.stored_name
    db.delete(c)
    db.commit()
    remove(FOLDER, stored)
    return {"ok": True}


@router.get("/{copy_id}/file")
def download(copy_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    c = _own(db, faculty, copy_id)
    return FileResponse(path_of(FOLDER, c.stored_name), filename=c.file_name)