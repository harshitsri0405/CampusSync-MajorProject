import hashlib
import hmac
import math
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..schemas import FacultyQrStartIn
from .faculty_attendance import _students
from .faculty_common import my_assignment, norm, require_faculty

router = APIRouter(prefix="/api/faculty/qr", tags=["faculty-qr"])

Q = models.FacultyQrSession
S = models.FacultyQrScan
IST = timezone(timedelta(hours=5, minutes=30))
WINDOW = 20           # QR har 20 second me badalta hai
GRACE = 2             # pichhle 2 window (40 sec) tak purana QR chalta hai
MAX_FACULTY_ACC = 200


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _token(secret: str, sid, w: int) -> str:
    return hmac.new(secret.encode(), f"{sid}:{w}".encode(), hashlib.sha256).hexdigest()[:16]


def make_code(s) -> str:
    return f"CS1:{s.id}:{_token(s.secret, s.id, int(time.time() // WINDOW))}"


def code_ok(s, token: str) -> bool:
    w = int(time.time() // WINDOW)
    return any(hmac.compare_digest(token, _token(s.secret, s.id, x)) for x in range(w - GRACE, w + 1))


def dist_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def is_active(s, now=None) -> bool:
    now = now or now_utc()
    return s.closed_at is None and s.expires_at > now


def sess_out(s) -> dict:
    return {
        "id": str(s.id), "assignment_id": str(s.assignment_id), "subject": s.subject, "day": s.day.isoformat(),
        "lat": s.lat, "lng": s.lng, "accuracy": round(s.accuracy or 0), "radius_m": s.radius_m,
        "starts_at": s.starts_at.isoformat(), "expires_at": s.expires_at.isoformat(),
        "closed_at": s.closed_at.isoformat() if s.closed_at else None,
        "finalized": s.finalized, "active": is_active(s),
    }


def _own(db: Session, faculty, session_id: str):
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Session not found.")
    s = db.query(Q).filter(Q.id == sid).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found.")
    a = my_assignment(db, faculty, str(s.assignment_id))
    return s, a


@router.post("/start")
def start(body: FacultyQrStartIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, body.assignment_id)
    if body.accuracy > MAX_FACULTY_ACC:
        raise HTTPException(status_code=400, detail=f"Your location accuracy is low (±{int(body.accuracy)} m). Move to an open area or turn on Wi-Fi/GPS and try again.")
    now = now_utc()
    db.query(Q).filter(Q.assignment_id == a.id, Q.closed_at.is_(None), Q.expires_at > now).update({"closed_at": now}, synchronize_session=False)
    s = Q(
        assignment_id=a.id, faculty_profile_id=a.faculty_profile_id, course_key=norm(a.course), semester=a.semester,
        subject=a.subject, day=datetime.now(IST).date(), secret=secrets.token_hex(16),
        lat=body.lat, lng=body.lng, accuracy=body.accuracy, radius_m=body.radius_m,
        starts_at=now, expires_at=now + timedelta(minutes=body.minutes),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return sess_out(s)


@router.get("/current")
def current(assignment_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, assignment_id)
    s = (
        db.query(Q)
        .filter(Q.assignment_id == a.id, Q.finalized.is_(False), Q.starts_at > now_utc() - timedelta(hours=24))
        .order_by(Q.starts_at.desc())
        .first()
    )
    return {"session": sess_out(s) if s else None}


@router.get("/history")
def history(assignment_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, assignment_id)
    rows = db.query(Q).filter(Q.assignment_id == a.id).order_by(Q.starts_at.desc()).limit(15).all()
    counts = {}
    if rows:
        counts = {sid: int(c) for sid, c in db.query(S.session_id, func.count(S.id)).filter(S.session_id.in_([r.id for r in rows])).group_by(S.session_id).all()}
    total = len(_students(db, a))
    return {"items": [{**sess_out(r), "scanned": counts.get(r.id, 0), "total": total} for r in rows]}


@router.get("/{session_id}/code")
def code(session_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    s, _a = _own(db, faculty, session_id)
    if not is_active(s):
        raise HTTPException(status_code=400, detail="This session has ended.")
    return {"code": make_code(s), "rotates_in": WINDOW - int(time.time()) % WINDOW}


@router.get("/{session_id}/scans")
def scans(session_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    s, a = _own(db, faculty, session_id)
    got = {r.student_profile_id: r for r in db.query(S).filter(S.session_id == s.id).all()}
    items = []
    for p in _students(db, a):
        r = got.get(p.id)
        items.append({
            "id": str(p.id), "name": p.name, "college_id": p.college_id,
            "scanned_at": r.scanned_at.isoformat() if r else None,
            "distance_m": round(r.distance_m) if r else None,
        })
    items.sort(key=lambda x: (x["scanned_at"] is None, x["scanned_at"] or "", x["name"].lower()))
    return {"session": sess_out(s), "items": items, "scanned": len(got), "total": len(items)}


@router.post("/{session_id}/close")
def close(session_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    s, _a = _own(db, faculty, session_id)
    if s.closed_at is None:
        s.closed_at = now_utc()
        db.commit()
    return sess_out(s)


@router.post("/{session_id}/finalize")
def finalize(session_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    s, _a = _own(db, faculty, session_id)
    if s.closed_at is None:
        s.closed_at = now_utc()
    s.finalized = True
    db.commit()
    return sess_out(s)