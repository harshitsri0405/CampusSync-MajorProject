import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from .faculty_common import faculty_info, require_faculty

router = APIRouter(prefix="/api/faculty/profile", tags=["faculty-profile"])

PHOTO_DIR = Path(__file__).resolve().parents[2] / "uploads" / "photos"
MAX_PHOTO_BYTES = 2 * 1024 * 1024  # 2 MB
TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def _sniff(data: bytes):
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _profile(db: Session, faculty) -> dict:
    ex = db.query(models.FacultyExtra).filter(models.FacultyExtra.faculty_profile_id == faculty.id).first()
    ph = db.query(models.FacultyPhoto).filter(models.FacultyPhoto.faculty_profile_id == faculty.id).first()
    return {
        "name": faculty.faculty_name, "employee_id": faculty.faculty_id, **faculty_info(db, faculty),
        "qualification": ex.qualification if ex else None, "experience_years": ex.experience_years if ex else None,
        "about": ex.about if ex else None, "has_photo": ph is not None,
    }


@router.get("")
def get_profile(faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    return _profile(db, faculty)


@router.put("")
def save_profile(payload: schemas.FacultyProfileIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    ex = db.query(models.FacultyExtra).filter(models.FacultyExtra.faculty_profile_id == faculty.id).first()
    if ex is None:
        ex = models.FacultyExtra(faculty_profile_id=faculty.id)
        db.add(ex)
    ex.qualification, ex.experience_years, ex.about = payload.qualification, payload.experience_years, payload.about
    ex.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _profile(db, faculty)


@router.post("/photo")
async def upload_photo(file: UploadFile = File(...), faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    data = await file.read(MAX_PHOTO_BYTES + 1)
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=400, detail="Photo 2 MB se badi hai.")
    ctype = _sniff(data)
    if not ctype:
        raise HTTPException(status_code=400, detail="Sirf JPG, PNG ya WEBP photo chalegi.")
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    name = f"faculty_{faculty.id}.{TYPES[ctype]}"
    row = db.query(models.FacultyPhoto).filter(models.FacultyPhoto.faculty_profile_id == faculty.id).first()
    if row and row.file_name != name:
        (PHOTO_DIR / row.file_name).unlink(missing_ok=True)
    (PHOTO_DIR / name).write_bytes(data)
    if row is None:
        row = models.FacultyPhoto(faculty_profile_id=faculty.id, file_name=name, content_type=ctype)
        db.add(row)
    row.file_name, row.content_type, row.updated_at = name, ctype, datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.get("/photo")
def get_photo(faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    row = db.query(models.FacultyPhoto).filter(models.FacultyPhoto.faculty_profile_id == faculty.id).first()
    path = PHOTO_DIR / row.file_name if row else None
    if not row or not path.exists():
        raise HTTPException(status_code=404, detail="Photo nahi hai.")
    return FileResponse(path, media_type=row.content_type)


@router.delete("/photo")
def delete_photo(faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    row = db.query(models.FacultyPhoto).filter(models.FacultyPhoto.faculty_profile_id == faculty.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Photo nahi hai.")
    (PHOTO_DIR / row.file_name).unlink(missing_ok=True)
    db.delete(row)
    db.commit()
    return {"ok": True}