from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from .faculty_common import norm, sem_num
from .faculty_materials import CATEGORIES, M, file_path, material_out


from .student_common import get_current_student  # <-- ISE APNE PROJECT KE HISAAB SE BADLO

router = APIRouter(prefix="/api/student/materials", tags=["student-materials"])


def _mine(db: Session, student):
    return db.query(M).filter(
        M.course_key == norm(student.course),
        M.semester == sem_num(student.semester),
        M.is_visible.is_(True),
    )


@router.get("")
def list_materials(
    subject: Optional[str] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
    student=Depends(get_current_student),  # <-- yahan bhi wahi naam
    db: Session = Depends(get_db),
):
    base = _mine(db, student)
    subjects = sorted({s for (s,) in base.with_entities(M.subject).distinct().all()})
    qs = base
    if subject:
        qs = qs.filter(M.subject == subject)
    if category:
        qs = qs.filter(M.category == category)
    if q and q.strip():
        qs = qs.filter(M.title.ilike(f"%{q.strip()}%"))
    rows = qs.order_by(M.created_at.desc()).limit(300).all()
    return {"items": [material_out(m) for m in rows], "subjects": subjects, "categories": CATEGORIES}


@router.get("/{material_id}/file")
def download(material_id: str, student=Depends(get_current_student), db: Session = Depends(get_db)):
    import uuid
    try:
        mid = uuid.UUID(material_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Material nahi mila.")
    m = _mine(db, student).filter(M.id == mid).first()
    if not m:
        raise HTTPException(status_code=404, detail="Material nahi mila.")
    path = file_path(m)
    m.downloads = (m.downloads or 0) + 1
    db.commit()
    return FileResponse(path, filename=m.file_name)