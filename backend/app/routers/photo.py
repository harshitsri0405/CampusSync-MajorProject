import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.routers.auth import get_current_user
from app.routers.student import _require_student

router = APIRouter(prefix="/api/student/photo", tags=["student-photo"])

# backend/uploads/photos/<student id>/<stored file>
UPLOAD_ROOT = Path(os.getenv("UPLOAD_DIR") or (Path(__file__).resolve().parents[2] / "uploads"))
UPLOAD_DIR = UPLOAD_ROOT / "photos"
MAX_BYTES = 2 * 1024 * 1024
TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}


def _looks_like_image(data: bytes, ext: str) -> bool:
    """Checks the first bytes of the file, so a renamed document is not accepted as a photo."""
    if ext == ".png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if ext in (".jpg", ".jpeg"):
        return data.startswith(b"\xff\xd8\xff")
    if ext == ".webp":
        return data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    return False


def _get(db: Session, profile: models.StudentProfile):
    return db.query(models.StudentPhoto).filter(models.StudentPhoto.student_profile_id == profile.id).first()


@router.get("")
def get_photo(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    row = _get(db, profile)
    if row is None:
        raise HTTPException(status_code=404, detail="No photo uploaded.")
    path = UPLOAD_DIR / str(profile.id) / row.file_path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="No photo uploaded.")
    return FileResponse(path, media_type=row.content_type, headers={"Cache-Control": "private, no-cache"})


@router.post("")
def upload_photo(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    original = Path(file.filename or "").name
    ext = Path(original).suffix.lower()
    if ext not in TYPES:
        raise HTTPException(status_code=400, detail="Upload a PNG, JPG or WEBP picture.")
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="The picture is larger than 2 MB.")
    if not data or not _looks_like_image(data, ext):
        raise HTTPException(status_code=400, detail="This file is not a valid picture.")

    folder = UPLOAD_DIR / str(profile.id)
    folder.mkdir(parents=True, exist_ok=True)
    stored = f"photo_{uuid.uuid4().hex}{ext}"
    (folder / stored).write_bytes(data)

    row = _get(db, profile)
    if row is not None:
        try:
            (folder / row.file_path).unlink(missing_ok=True)
        except OSError:
            pass
        row.file_name = original
        row.file_path = stored
        row.content_type = TYPES[ext]
        row.size_bytes = len(data)
    else:
        db.add(models.StudentPhoto(
            student_profile_id=profile.id, file_name=original, file_path=stored,
            content_type=TYPES[ext], size_bytes=len(data),
        ))
    db.commit()
    return {"ok": True}


@router.delete("")
def delete_photo(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    row = _get(db, profile)
    if row is not None:
        try:
            (UPLOAD_DIR / str(profile.id) / row.file_path).unlink(missing_ok=True)
        except OSError:
            pass
        db.delete(row)
        db.commit()
    return {"ok": True}