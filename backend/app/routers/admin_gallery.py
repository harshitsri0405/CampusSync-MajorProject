import os
import uuid
from datetime import date
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from .admin_common import log_activity, require_admin

router = APIRouter(prefix="/api/admin/gallery", tags=["admin-gallery"])

# backend/uploads/gallery/<stored file>  (same folder the student gallery reads from)
UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads" / "gallery"
MAX_BYTES = 5 * 1024 * 1024
MAX_FILES_PER_UPLOAD = 20
MAX_PHOTOS_PER_ALBUM = 100
MEDIA = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


def _uuid(value, msg):
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _album(db: Session, album_id: str):
    a = db.query(models.GalleryAlbum).filter(models.GalleryAlbum.id == _uuid(album_id, "Album nahi mila.")).first()
    if not a:
        raise HTTPException(status_code=404, detail="Album nahi mila.")
    return a


def _photo(db: Session, photo_id: str):
    p = db.query(models.GalleryPhoto).filter(models.GalleryPhoto.id == _uuid(photo_id, "Photo nahi mili.")).first()
    if not p:
        raise HTTPException(status_code=404, detail="Photo nahi mili.")
    return p


def _kind(data: bytes) -> Optional[str]:
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def _safe_path(name: str) -> Path:
    path = (UPLOAD_ROOT / name).resolve()
    if UPLOAD_ROOT.resolve() not in path.parents:
        raise HTTPException(status_code=400, detail="Galat file path.")
    return path


def _remove_file(name: Optional[str]):
    if not name:
        return
    try:
        _safe_path(name).unlink(missing_ok=True)
    except HTTPException:
        pass


def _album_out(a, count, cover_id) -> dict:
    return {"id": str(a.id), "category": a.category, "title": a.title, "description": a.description,
            "event_date": a.event_date.isoformat() if a.event_date else None, "photos": count, "cover_photo_id": cover_id}


@router.get("/summary")
def summary(admin=Depends(require_admin), db: Session = Depends(get_db)):
    A, P = models.GalleryAlbum, models.GalleryPhoto
    cats = db.query(A.category, func.count(A.id)).group_by(A.category).all()
    return {"albums": db.query(A).count(), "photos": db.query(P).count(), "categories": {k: v for k, v in cats}}


@router.get("/albums")
def list_albums(
    q: Optional[str] = Query(None, max_length=80),
    category: Optional[str] = Query(None, pattern="^(event|workshop|sports|cultural|achievement)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(9, ge=1, le=50),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    A, P = models.GalleryAlbum, models.GalleryPhoto
    query = db.query(A)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(A.title.ilike(like) | A.description.ilike(like))
    if category:
        query = query.filter(A.category == category)
    total = query.count()
    rows = query.order_by(A.event_date.desc().nullslast(), A.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    counts, covers = {}, {}
    if rows:
        ids = [a.id for a in rows]
        counts = dict(db.query(P.album_id, func.count(P.id)).filter(P.album_id.in_(ids)).group_by(P.album_id).all())
        for p in db.query(P).filter(P.album_id.in_(ids), P.file_path.isnot(None)).order_by(P.sort_order, P.created_at).all():
            covers.setdefault(p.album_id, str(p.id))
    return {"items": [_album_out(a, counts.get(a.id, 0), covers.get(a.id)) for a in rows], "total": total, "page": page, "page_size": page_size}


@router.post("/albums")
def create_album(payload: schemas.AdminAlbumIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    a = models.GalleryAlbum(**payload.model_dump())
    db.add(a)
    db.commit()
    log_activity(db, admin, "gallery.album.create", f"Album created ({a.category}): {a.title}")
    return {"id": str(a.id)}


@router.get("/albums/{album_id}")
def get_album(album_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    a = _album(db, album_id)
    P = models.GalleryPhoto
    photos = db.query(P).filter(P.album_id == a.id).order_by(P.sort_order, P.created_at).all()
    out = _album_out(a, len(photos), next((str(p.id) for p in photos if p.file_path), None))
    out["items"] = [{"id": str(p.id), "caption": p.caption, "has_file": bool(p.file_path), "sort_order": p.sort_order} for p in photos]
    return out


@router.put("/albums/{album_id}")
def update_album(album_id: str, payload: schemas.AdminAlbumIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    a = _album(db, album_id)
    for k, v in payload.model_dump().items():
        setattr(a, k, v)
    db.commit()
    log_activity(db, admin, "gallery.album.update", f"Album updated: {a.title}")
    return {"ok": True}


@router.delete("/albums/{album_id}")
def delete_album(album_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    a = _album(db, album_id)
    P = models.GalleryPhoto
    photos = db.query(P).filter(P.album_id == a.id).all()
    files = [p.file_path for p in photos]
    title = a.title
    for p in photos:
        db.delete(p)
    db.delete(a)
    db.commit()
    for f in files:
        _remove_file(f)
    log_activity(db, admin, "gallery.album.delete", f"Album deleted: {title} ({len(photos)} photos)")
    return {"ok": True, "photos": len(photos)}


@router.post("/albums/{album_id}/photos")
def upload_photos(album_id: str, files: List[UploadFile] = File(...), caption: Optional[str] = Form(None),
                  admin=Depends(require_admin), db: Session = Depends(get_db)):
    a = _album(db, album_id)
    P = models.GalleryPhoto
    if not files:
        raise HTTPException(status_code=400, detail="Kam se kam ek photo chuno.")
    if len(files) > MAX_FILES_PER_UPLOAD:
        raise HTTPException(status_code=400, detail=f"Ek baar me {MAX_FILES_PER_UPLOAD} se zyada photos nahi.")
    have = db.query(P).filter(P.album_id == a.id).count()
    if have + len(files) > MAX_PHOTOS_PER_ALBUM:
        raise HTTPException(status_code=400, detail=f"Ek album me max {MAX_PHOTOS_PER_ALBUM} photos. Abhi {have} hain.")
    cap = schemas.AdminPhotoIn(caption=caption).caption
    # validate everything first, then write
    staged = []
    for f in files:
        data = f.file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise HTTPException(status_code=400, detail=f"'{f.filename}' 5 MB se badi hai.")
        kind = _kind(data)
        if not kind:
            raise HTTPException(status_code=400, detail=f"'{f.filename}' sahi image nahi hai. Sirf JPG, PNG ya WEBP chalega.")
        staged.append((data, kind))
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    order = int(db.query(func.coalesce(func.max(P.sort_order), 0)).filter(P.album_id == a.id).scalar() or 0)
    written = []
    try:
        for data, kind in staged:
            name = f"{uuid.uuid4().hex}.{kind}"
            (UPLOAD_ROOT / name).write_bytes(data)
            written.append(name)
            order += 1
            db.add(P(album_id=a.id, caption=cap, file_path=name, sort_order=order))
        db.commit()
    except Exception:
        db.rollback()
        for n in written:
            _remove_file(n)
        raise HTTPException(status_code=500, detail="Photos save nahi ho paayin. Dobara try karo.")
    log_activity(db, admin, "gallery.photo.upload", f"{len(written)} photos uploaded to album: {a.title}")
    return {"added": len(written)}


@router.put("/photos/{photo_id}")
def update_photo(photo_id: str, payload: schemas.AdminPhotoIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    p = _photo(db, photo_id)
    p.caption = payload.caption
    db.commit()
    return {"ok": True}


@router.post("/photos/{photo_id}/move")
def move_photo(photo_id: str, direction: str = Query(..., pattern="^(up|down)$"), admin=Depends(require_admin), db: Session = Depends(get_db)):
    p = _photo(db, photo_id)
    P = models.GalleryPhoto
    rows = db.query(P).filter(P.album_id == p.album_id).order_by(P.sort_order, P.created_at).all()
    # renumber so swaps always work, even when old rows share the same sort_order
    for i, r in enumerate(rows, 1):
        r.sort_order = i
    idx = next(i for i, r in enumerate(rows) if r.id == p.id)
    j = idx - 1 if direction == "up" else idx + 1
    if 0 <= j < len(rows):
        rows[idx].sort_order, rows[j].sort_order = rows[j].sort_order, rows[idx].sort_order
    db.commit()
    return {"ok": True}


@router.delete("/photos/{photo_id}")
def delete_photo(photo_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    p = _photo(db, photo_id)
    album = db.query(models.GalleryAlbum).filter(models.GalleryAlbum.id == p.album_id).first()
    name = p.file_path
    db.delete(p)
    db.commit()
    _remove_file(name)
    log_activity(db, admin, "gallery.photo.delete", f"Photo deleted from album: {album.title if album else '-'}")
    return {"ok": True}


@router.get("/photos/{photo_id}/file")
def photo_file(photo_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    p = _photo(db, photo_id)
    if not p.file_path:
        raise HTTPException(status_code=404, detail="Is photo ki file nahi hai (sample photo).")
    path = _safe_path(p.file_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Photo ki file server par nahi mili.")
    return FileResponse(str(path), media_type=MEDIA.get(path.suffix.lstrip(".").lower(), "application/octet-stream"))


@router.post("/demo-seed")
def demo_seed(admin=Depends(require_admin), db: Session = Depends(get_db)):
    """SAMPLE albums (title 'Sample: ...') with generated pictures marked SAMPLE. Runs once."""
    if os.getenv("ENABLE_DEMO_DATA", "").strip().lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai. backend\\.env me ENABLE_DEMO_DATA=true karke backend restart karo.")
    A, P = models.GalleryAlbum, models.GalleryPhoto
    if db.query(A.id).filter(A.title.like("Sample:%")).first():
        return {"added": 0, "message": "Sample albums pehle se bane hain."}
    try:
        from PIL import Image, ImageDraw  # Pillow comes with qrcode[pil]
    except Exception:
        Image = ImageDraw = None
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    plans = [("event", "Sample: Annual Day", [(37, 99, 235), (124, 58, 237), (14, 165, 233)]),
             ("sports", "Sample: Sports Meet", [(22, 163, 74), (217, 119, 6), (220, 38, 38)])]
    albums = photos = 0
    for cat, title, colors in plans:
        a = A(category=cat, title=title, description="SAMPLE album for testing.", event_date=date.today())
        db.add(a)
        db.flush()
        albums += 1
        for n, color in enumerate(colors, 1):
            name = None
            if Image:
                img = Image.new("RGB", (640, 400), color)
                ImageDraw.Draw(img).text((24, 24), f"SAMPLE PHOTO {n}", fill=(255, 255, 255))
                name = f"{uuid.uuid4().hex}.png"
                img.save(UPLOAD_ROOT / name, "PNG")
            db.add(P(album_id=a.id, caption=f"Sample photo {n}", file_path=name, sort_order=n))
            photos += 1
    db.commit()
    log_activity(db, admin, "gallery.demo", f"Sample gallery added ({albums} albums, {photos} photos, demo data)")
    return {"added": albums, "message": f"{albums} sample albums aur {photos} sample photos bane."}