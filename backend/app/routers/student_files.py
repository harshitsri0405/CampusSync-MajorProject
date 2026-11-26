import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from .faculty_common import norm, sem_num
from .faculty_examcopies import C as ExamCopy, FOLDER as COPY_FOLDER
from .faculty_taskfiles import F as TaskFile, FOLDER as TASK_FOLDER
from .faculty_uploads import path_of
from .student_common import get_current_student

router = APIRouter(prefix="/api/student/files", tags=["student-files"])


def _uuid(v):
    try:
        return uuid.UUID(v)
    except ValueError:
        raise HTTPException(status_code=404, detail="File not found.")


def _iso(v):
    return v.isoformat() if v is not None else None


@router.get("/exam-copies")
def exam_copies(student=Depends(get_current_student), db: Session = Depends(get_db)):
    rows = db.query(ExamCopy).filter(ExamCopy.student_profile_id == student.id, ExamCopy.is_visible.is_(True)).order_by(ExamCopy.uploaded_at.desc()).all()
    return {"items": [{"id": str(c.id), "semester": c.semester, "subject": c.subject, "exam_name": c.exam_name,
                       "file_name": c.file_name, "size": c.size, "uploaded_at": _iso(c.uploaded_at)} for c in rows]}


@router.get("/exam-copies/{copy_id}/file")
def exam_copy_file(copy_id: str, student=Depends(get_current_student), db: Session = Depends(get_db)):
    c = db.query(ExamCopy).filter(ExamCopy.id == _uuid(copy_id), ExamCopy.student_profile_id == student.id, ExamCopy.is_visible.is_(True)).first()
    if not c:
        raise HTTPException(status_code=404, detail="Copy not found.")
    return FileResponse(path_of(COPY_FOLDER, c.stored_name), filename=c.file_name)


def _mine_tasks(db: Session, student):
    return db.query(TaskFile).filter(TaskFile.course_key == norm(student.course), TaskFile.semester == sem_num(student.semester))


@router.get("/assignment-files")
def assignment_files(student=Depends(get_current_student), db: Session = Depends(get_db)):
    rows = _mine_tasks(db, student).order_by(TaskFile.created_at).all()
    return {"items": [{"id": str(f.id), "assignment_id": str(f.assignment_id), "file_name": f.file_name,
                       "size": f.size} for f in rows]}


@router.get("/assignment-files/{file_id}/file")
def assignment_file(file_id: str, student=Depends(get_current_student), db: Session = Depends(get_db)):
    f = _mine_tasks(db, student).filter(TaskFile.id == _uuid(file_id)).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(path_of(TASK_FOLDER, f.stored_name), filename=f.file_name)