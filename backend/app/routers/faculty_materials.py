import re
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..notify import notify
from ..schemas import FacultyMaterialUpdateIn
from .faculty_attendance import _students
from .faculty_common import my_assignment, norm, require_faculty

router = APIRouter(prefix="/api/faculty/materials", tags=["faculty-materials"])

M = models.StudyMaterial
ROOT = Path("uploads") / "materials"
MAX_MB = 20
MAX_BYTES = MAX_MB * 1024 * 1024
CATEGORIES = ["Notes", "Presentation", "Previous Year Paper", "Assignment Sheet", "Reference Book", "Other"]
EXTS = {".pdf", ".ppt", ".pptx", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".png", ".jpg", ".jpeg"}


def _sig_ok(ext: str, head: bytes) -> bool:
    if ext == ".pdf":
        return head.startswith(b"%PDF")
    if ext in (".docx", ".pptx", ".xlsx"):
        return head.startswith(b"PK\x03\x04")
    if ext in (".doc", ".ppt", ".xls"):
        return head.startswith(b"\xd0\xcf\x11\xe0")
    if ext == ".png":
        return head.startswith(b"\x89PNG")
    if ext in (".jpg", ".jpeg"):
        return head.startswith(b"\xff\xd8")
    if ext == ".txt":
        return b"\x00" not in head
    return False


def material_out(m) -> dict:
    return {
        "id": str(m.id), "assignment_id": str(m.assignment_id), "subject": m.subject, "semester": m.semester,
        "title": m.title, "description": m.description or "", "category": m.category,
        "file_name": m.file_name, "ext": Path(m.file_name).suffix.lower().lstrip("."), "size": m.size,
        "is_visible": m.is_visible, "downloads": m.downloads,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def file_path(m) -> Path:
    p = ROOT / m.stored_name
    if not p.is_file():
        raise HTTPException(status_code=404, detail="File not found on the server.")
    return p


def _own(db: Session, faculty, material_id: str):
    try:
        mid = uuid.UUID(material_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Material not found.")
    m = db.query(M).filter(M.id == mid).first()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found.")
    my_assignment(db, faculty, str(m.assignment_id))  # galat faculty ho to 403/404
    return m


@router.get("/meta")
def meta(faculty=Depends(require_faculty)):
    return {"categories": CATEGORIES, "max_mb": MAX_MB, "extensions": sorted(e.lstrip(".") for e in EXTS)}


@router.get("")
def list_materials(
    assignment_id: str,
    category: Optional[str] = None,
    q: Optional[str] = None,
    faculty=Depends(require_faculty),
    db: Session = Depends(get_db),
):
    a = my_assignment(db, faculty, assignment_id)
    qs = db.query(M).filter(M.assignment_id == a.id)
    if category:
        qs = qs.filter(M.category == category)
    if q and q.strip():
        qs = qs.filter(M.title.ilike(f"%{q.strip()}%"))
    rows = qs.order_by(M.created_at.desc()).limit(300).all()
    return {"items": [material_out(m) for m in rows], "total": len(rows)}


@router.post("")
def upload(
    assignment_id: str = Form(...),
    title: str = Form(...),
    category: str = Form("Notes"),
    description: str = Form(""),
    file: UploadFile = File(...),
    faculty=Depends(require_faculty),
    db: Session = Depends(get_db),
):
    a = my_assignment(db, faculty, assignment_id)
    title = title.strip()
    if not title or len(title) > 200:
        raise HTTPException(status_code=400, detail="The title must be 1 to 200 characters.")
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category.")
    if len(description) > 2000:
        raise HTTPException(status_code=400, detail="The description is too long.")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in EXTS:
        raise HTTPException(status_code=400, detail="This file type is not allowed. Please use PDF, PPT, DOC, XLS, TXT or an image.")
    data = file.file.read(MAX_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="The file is empty.")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"The file is larger than {MAX_MB} MB.")
    if not _sig_ok(ext, data[:8]):
        raise HTTPException(status_code=400, detail="The file content does not match its type.")

    ROOT.mkdir(parents=True, exist_ok=True)
    stored = f"{uuid.uuid4().hex}{ext}"
    path = ROOT / stored
    path.write_bytes(data)
    clean = re.sub(r"[^A-Za-z0-9._ -]+", "_", Path(file.filename).name)[:150] or f"material{ext}"
    try:
        m = M(
            assignment_id=a.id, faculty_profile_id=a.faculty_profile_id, course_key=norm(a.course), semester=a.semester,
            subject=a.subject, title=title, description=description.strip(), category=category,
            file_name=clean, stored_name=stored, size=len(data),
        )
        db.add(m)
        for p in _students(db, a):
            notify(db, p.id, "material", "New study material", f"{a.subject}: {title}", "materials")
        db.commit()
    except Exception:
        db.rollback()
        path.unlink(missing_ok=True)
        raise
    db.refresh(m)
    return material_out(m)


@router.put("/{material_id}")
def update(material_id: str, body: FacultyMaterialUpdateIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    m = _own(db, faculty, material_id)
    if body.title is not None:
        t = body.title.strip()
        if not t or len(t) > 200:
            raise HTTPException(status_code=400, detail="The title must be 1 to 200 characters.")
        m.title = t
    if body.description is not None:
        if len(body.description) > 2000:
            raise HTTPException(status_code=400, detail="The description is too long.")
        m.description = body.description.strip()
    if body.category is not None:
        if body.category not in CATEGORIES:
            raise HTTPException(status_code=400, detail="Invalid category.")
        m.category = body.category
    if body.is_visible is not None:
        m.is_visible = body.is_visible
    db.commit()
    return material_out(m)


@router.delete("/{material_id}")
def delete(material_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    m = _own(db, faculty, material_id)
    stored = m.stored_name
    db.delete(m)
    db.commit()
    (ROOT / stored).unlink(missing_ok=True)
    return {"ok": True}


@router.get("/{material_id}/file")
def download(material_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    m = _own(db, faculty, material_id)
    return FileResponse(file_path(m), filename=m.file_name)