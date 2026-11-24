import os
import textwrap
import uuid
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/student/gallery", tags=["student-gallery"])

# backend/uploads/gallery/<stored file>
UPLOAD_ROOT = Path(os.getenv("UPLOAD_DIR") or (Path(__file__).resolve().parents[2] / "uploads"))
UPLOAD_DIR = UPLOAD_ROOT / "gallery"
CACHE = {"Cache-Control": "public, max-age=3600"}

# gradient colours of the generated sample pictures, per category
PALETTE = {
    "event": ("#7C3AED", "#312E81"),
    "workshop": ("#2563EB", "#0F172A"),
    "sports": ("#16A34A", "#064E3B"),
    "cultural": ("#EA580C", "#9D174D"),
    "achievement": ("#D97706", "#7C2D12"),
}

# (category, title, description, days ago, number of photos)
DEMO_ALBUMS = [
    ("event", "Annual Day 2026", "Performances, awards and the chief guest's address at the annual day function.", 40, 6),
    ("event", "Freshers' Welcome", "The new batch was welcomed with music, games and a talent show.", 62, 5),
    ("workshop", "AI and Machine Learning Workshop", "A two-day hands-on workshop on building and testing simple ML models.", 20, 4),
    ("workshop", "Web Development Bootcamp", "Students built and deployed their first full-stack web application.", 52, 4),
    ("sports", "Inter-department Cricket Tournament", "Eight departments played a knockout tournament over one week.", 30, 5),
    ("sports", "Annual Sports Meet", "Track and field events, relay races and the prize distribution.", 78, 6),
    ("cultural", "Music and Dance Night", "An evening of solo and group performances by students.", 35, 5),
    ("cultural", "Traditional Day", "Students and faculty came dressed in traditional clothes.", 95, 4),
    ("achievement", "National Hackathon Winners", "Our team won first place at a 36-hour national hackathon.", 15, 3),
    ("achievement", "University Rank Holders", "Students who secured top ranks in the university examinations.", 46, 3),
    ("achievement", "Best Project Award", "The final year project selected as the best in the state level competition.", 104, 3),
]

DEMO_CAPTIONS = {
    "event": [
        "Opening ceremony", "Chief guest addressing the students", "Cultural performance on stage",
        "Students and faculty together", "Prize distribution", "Group photo at the end",
    ],
    "workshop": [
        "Resource person explaining the concepts", "Hands-on session in the computer lab",
        "Participants working in teams", "Question and answer round", "Certificate distribution",
    ],
    "sports": [
        "Teams getting ready before the match", "Opening ceremony and oath", "A close contest in progress",
        "The winning moment", "Trophy presentation", "Team photo",
    ],
    "cultural": [
        "Rehearsals backstage", "Dance performance", "Live music on stage",
        "The audience enjoying the show", "Final bow by the performers",
    ],
    "achievement": [
        "The winning team with the trophy", "Felicitation by the principal", "Certificates and medals",
    ],
}


def _placeholder_svg(category: str, title: str, caption: str | None, seed: int) -> str:
    """A simple coloured picture used until a real photo is uploaded."""
    c1, c2 = PALETTE.get(category, ("#64748B", "#0F172A"))

    circles = []
    for i in range(3):
        cx = 100 + (seed >> (i * 8)) % 600
        cy = 80 + (seed >> (i * 8 + 4)) % 440
        r = 80 + (seed >> (i * 5)) % 140
        circles.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#FFFFFF" fill-opacity="0.08"/>')

    title_lines = textwrap.wrap(title, 24)[:2] or [""]
    caption_lines = textwrap.wrap(caption or "", 38)[:2]
    parts = []
    y = 270 if len(title_lines) == 1 else 245
    for line in title_lines:
        parts.append(
            f'<text x="400" y="{y}" text-anchor="middle" font-size="40" font-weight="700" fill="#FFFFFF">'
            f"{escape(line)}</text>"
        )
        y += 50
    y += 20
    for line in caption_lines:
        parts.append(
            f'<text x="400" y="{y}" text-anchor="middle" font-size="24" fill="#FFFFFF" fill-opacity="0.85">'
            f"{escape(line)}</text>"
        )
        y += 32

    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600" '
        'font-family="Arial, Helvetica, sans-serif">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient></defs>'
        '<rect width="800" height="600" fill="url(#g)"/>'
        + "".join(circles)
        + '<text x="28" y="48" font-size="16" fill="#FFFFFF" fill-opacity="0.7">Sample image</text>'
        + "".join(parts)
        + "</svg>"
    )


@router.get("/overview", response_model=schemas.GalleryOverview)
def overview(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    albums = (
        db.query(models.GalleryAlbum)
        .order_by(models.GalleryAlbum.event_date.desc().nullslast(), models.GalleryAlbum.created_at.desc())
        .all()
    )
    photos_by_album = defaultdict(list)
    if albums:
        rows = (
            db.query(models.GalleryPhoto)
            .filter(models.GalleryPhoto.album_id.in_([a.id for a in albums]))
            .order_by(models.GalleryPhoto.sort_order, models.GalleryPhoto.created_at)
            .all()
        )
        for p in rows:
            photos_by_album[p.album_id].append(schemas.GalleryPhotoOut(id=str(p.id), caption=p.caption))

    return schemas.GalleryOverview(
        albums=[
            schemas.GalleryAlbumOut(
                id=str(a.id), category=a.category, title=a.title, description=a.description,
                event_date=a.event_date, photos=photos_by_album.get(a.id, []),
            )
            for a in albums
        ]
    )


@router.get("/photos/{photo_id}/image")
def photo_image(photo_id: uuid.UUID, db: Session = Depends(get_db)):
    """Public on purpose: an <img> tag cannot send the login token, and gallery pictures are public content."""
    row = (
        db.query(models.GalleryPhoto, models.GalleryAlbum)
        .join(models.GalleryAlbum, models.GalleryAlbum.id == models.GalleryPhoto.album_id)
        .filter(models.GalleryPhoto.id == photo_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Photo not found.")
    photo, album = row

    if photo.file_path:
        path = UPLOAD_DIR / Path(photo.file_path).name  # .name keeps the lookup inside the gallery folder
        if path.is_file():
            return FileResponse(path, headers=CACHE)

    seed = int(photo.id.hex[:12], 16)
    svg = _placeholder_svg(album.category, album.title, photo.caption, seed)
    return Response(content=svg, media_type="image/svg+xml", headers=CACHE)


@router.post("/demo-seed")
def demo_seed(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """DEV ONLY. Creates sample albums with generated sample pictures so the screen can be tried before
    the Admin module can upload real photos. Set ENABLE_DEMO_DATA=false in .env to switch it off."""
    if os.getenv("ENABLE_DEMO_DATA", "true").lower() != "true":
        raise HTTPException(status_code=404, detail="Not available.")
    if db.query(models.GalleryAlbum.id).first():
        raise HTTPException(status_code=400, detail="The gallery already has albums.")

    today = date.today()
    photos = 0
    for category, title, description, days_ago, count in DEMO_ALBUMS:
        album = models.GalleryAlbum(
            category=category, title=title, description=description, event_date=today - timedelta(days=days_ago)
        )
        db.add(album)
        db.flush()
        captions = DEMO_CAPTIONS[category]
        for i in range(count):
            db.add(models.GalleryPhoto(album_id=album.id, caption=captions[i % len(captions)], sort_order=i))
            photos += 1

    db.commit()
    return {"albums": len(DEMO_ALBUMS), "photos": photos}