import re
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from .faculty_materials import EXTS, _sig_ok  # noqa: F401  (EXTS dusre files bhi use karti hain)

UPLOAD_ROOT = Path("uploads")


def read_upload(file: UploadFile, allowed: set, max_mb: int):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Ye file type allowed nahi hai. Allowed: " + ", ".join(sorted(e.lstrip(".") for e in allowed)))
    data = file.file.read(max_mb * 1024 * 1024 + 1)
    if not data:
        raise HTTPException(status_code=400, detail="File khali hai.")
    if len(data) > max_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File {max_mb} MB se badi hai.")
    if not _sig_ok(ext, data[:8]):
        raise HTTPException(status_code=400, detail="File ka content uske type se match nahi karta.")
    clean = re.sub(r"[^A-Za-z0-9._ -]+", "_", Path(file.filename).name)[:150] or f"file{ext}"
    return data, ext, clean


def store(folder: str, data: bytes, ext: str) -> str:
    root = UPLOAD_ROOT / folder
    root.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    (root / name).write_bytes(data)
    return name


def path_of(folder: str, stored: str) -> Path:
    p = UPLOAD_ROOT / folder / stored
    if not p.is_file():
        raise HTTPException(status_code=404, detail="File server par nahi mili.")
    return p


def remove(folder: str, stored: str) -> None:
    (UPLOAD_ROOT / folder / stored).unlink(missing_ok=True)