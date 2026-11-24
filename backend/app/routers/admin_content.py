import re
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.routers.auth import get_current_user
from app.routers.library import EBOOK_DIR, _ebook_out

router = APIRouter(prefix="/api/admin", tags=["admin-content"])

EBOOK_EXT = {".pdf", ".epub"}
MAX_EBOOK_BYTES = 25 * 1024 * 1024


def _require_admin(user: models.User) -> None:
    if user.role != models.RoleEnum.admin:
        raise HTTPException(status_code=403, detail="Admin access only.")


@router.post("/library/ebooks", response_model=schemas.LibraryEbookOut)
def upload_ebook(
    title: str = Form(...),
    author: str = Form(""),
    category: str = Form(""),
    description: str = Form(""),
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user)
    title = title.strip()
    if len(title) < 2:
        raise HTTPException(status_code=400, detail="Write the title of the e-book.")
    original = Path(file.filename or "").name
    ext = Path(original).suffix.lower()
    if ext not in EBOOK_EXT:
        raise HTTPException(status_code=400, detail="Upload a PDF or EPUB file.")
    data = file.file.read(MAX_EBOOK_BYTES + 1)
    if len(data) > MAX_EBOOK_BYTES:
        raise HTTPException(status_code=400, detail="The file is larger than 25 MB.")
    if not data:
        raise HTTPException(status_code=400, detail="The file is empty.")

    EBOOK_DIR.mkdir(parents=True, exist_ok=True)
    stored = f"{uuid.uuid4().hex}{ext}"
    (EBOOK_DIR / stored).write_bytes(data)

    ebook = models.LibraryEbook(
        title=title, author=author.strip() or None, category=category.strip() or None,
        description=description.strip() or None, file_name=original, file_path=stored,
        size_bytes=len(data), uploaded_by=current_user.username,
    )
    db.add(ebook)
    db.commit()
    db.refresh(ebook)
    return _ebook_out(ebook)


@router.get("/library/ebooks", response_model=list[schemas.LibraryEbookOut])
def list_ebooks(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user)
    return [_ebook_out(e) for e in db.query(models.LibraryEbook).order_by(models.LibraryEbook.title).all()]


@router.delete("/library/ebooks/{ebook_id}")
def delete_ebook(
    ebook_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user)
    ebook = db.query(models.LibraryEbook).filter(models.LibraryEbook.id == ebook_id).first()
    if not ebook:
        raise HTTPException(status_code=404, detail="E-book not found.")
    try:
        (EBOOK_DIR / Path(ebook.file_path).name).unlink(missing_ok=True)
    except OSError:
        pass
    db.delete(ebook)
    db.commit()
    return {"ok": True}


def _term_dict(t: models.SemesterTerm) -> dict:
    return {
        "course": t.course, "semester": t.semester, "start_date": t.start_date.isoformat(),
        "end_date": t.end_date.isoformat(), "academic_year": t.academic_year,
    }


@router.put("/semester-terms")
def set_semester_term(
    payload: schemas.SemesterTermIn,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sets (or changes) the start and end date of the semester of one class. The student's timetable is
    shown until the end date."""
    _require_admin(current_user)
    course = payload.course.strip()
    semester = payload.semester.strip()
    if not course or not semester:
        raise HTTPException(status_code=400, detail="Course and semester are required.")
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="The end date must be on or after the start date.")

    term = (
        db.query(models.SemesterTerm)
        .filter(
            func.lower(func.trim(models.SemesterTerm.course)) == course.lower(),
            func.lower(func.trim(models.SemesterTerm.semester)) == semester.lower(),
        )
        .first()
    )
    if term is None:
        term = models.SemesterTerm(course=course, semester=semester, start_date=payload.start_date,
                                   end_date=payload.end_date, academic_year=payload.academic_year)
        db.add(term)
    else:
        term.start_date = payload.start_date
        term.end_date = payload.end_date
        term.academic_year = payload.academic_year
    db.commit()
    db.refresh(term)
    return _term_dict(term)


@router.get("/semester-terms")
def list_semester_terms(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user)
    rows = db.query(models.SemesterTerm).order_by(models.SemesterTerm.course, models.SemesterTerm.semester).all()
    return [_term_dict(t) for t in rows]