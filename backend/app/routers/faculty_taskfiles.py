import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..notify import notify
from .faculty_attendance import _students
from .faculty_common import my_assignment, norm, require_faculty
from .faculty_materials import EXTS
from .faculty_uploads import path_of, read_upload, remove, store

router = APIRouter(prefix="/api/faculty/task-files", tags=["faculty-task-files"])

Task = models.Assignment
L = models.FacultyTaskLink
F = models.FacultyTaskFile
FOLDER = "task_files"
MAX_MB = 10
MAX_FILES = 3


def _iso(v):
    return v.isoformat() if hasattr(v, "isoformat") else (str(v) if v is not None else None)


def file_out(f) -> dict:
    return {"id": str(f.id), "assignment_id": str(f.assignment_id), "file_name": f.file_name, "size": f.size,
            "created_at": _iso(f.created_at)}


def _uuid(v, msg):
    try:
        return uuid.UUID(str(v))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _my_task(db: Session, faculty, task_id: str):
    link = db.query(L).filter(L.assignment_id == _uuid(task_id, "Assignment not found."), L.faculty_profile_id == faculty.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Assignment not found, or it does not belong to you.")
    return link


@router.get("/assignments")
def my_tasks(class_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, class_id)
    tasks = (
        db.query(Task).join(L, L.assignment_id == Task.id)
        .filter(L.class_id == a.id, L.faculty_profile_id == faculty.id)
        .order_by(Task.due_at.desc()).all()
    )
    files = {}
    if tasks:
        for f in db.query(F).filter(F.assignment_id.in_([t.id for t in tasks])).order_by(F.created_at).all():
            files.setdefault(f.assignment_id, []).append(file_out(f))
    return {"items": [{"id": str(t.id), "title": t.title, "due_at": _iso(t.due_at), "files": files.get(t.id, [])} for t in tasks],
            "max_files": MAX_FILES, "max_mb": MAX_MB}


@router.post("")
def upload(assignment_id: str = Form(...), file: UploadFile = File(...),
           faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    link = _my_task(db, faculty, assignment_id)
    a = my_assignment(db, faculty, str(link.class_id))
    task = db.query(Task).filter(Task.id == link.assignment_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    if db.query(F).filter(F.assignment_id == task.id).count() >= MAX_FILES:
        raise HTTPException(status_code=400, detail=f"An assignment can have at most {MAX_FILES} files. Remove one first.")
    data, ext, clean = read_upload(file, EXTS, MAX_MB)
    stored = store(FOLDER, data, ext)
    try:
        f = F(assignment_id=task.id, course_key=norm(a.course), semester=a.semester, file_name=clean, stored_name=stored, size=len(data))
        db.add(f)
        for p in _students(db, a):
            notify(db, p.id, "assignment", f"Assignment file: {task.title}", f"{a.subject}: a new file has been attached.", "assignments")
        db.commit()
    except Exception:
        db.rollback()
        remove(FOLDER, stored)
        raise
    db.refresh(f)
    return file_out(f)


def _own_file(db: Session, faculty, file_id: str):
    f = db.query(F).filter(F.id == _uuid(file_id, "File not found.")).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found.")
    _my_task(db, faculty, str(f.assignment_id))
    return f


@router.delete("/{file_id}")
def delete(file_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    f = _own_file(db, faculty, file_id)
    stored = f.stored_name
    db.delete(f)
    db.commit()
    remove(FOLDER, stored)
    return {"ok": True}


@router.get("/{file_id}/file")
def download(file_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    f = _own_file(db, faculty, file_id)
    return FileResponse(path_of(FOLDER, f.stored_name), filename=f.file_name)