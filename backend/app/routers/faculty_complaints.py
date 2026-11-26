import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.notify import notify
from .faculty_common import faculty_info, norm, require_faculty

router = APIRouter(prefix="/api/faculty/complaints", tags=["faculty-complaints"])

IST = timezone(timedelta(hours=5, minutes=30))
# same folder the student module writes to: backend/uploads/complaints/<student id>/<stored file>
UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads" / "complaints"
ORDER = {"pending": 0, "in_progress": 1, "resolved": 2}


def _uuid(value, msg="Complaint nahi mili."):
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _now():
    return datetime.now(timezone.utc)


def _aware(dt):
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _ist(dt) -> Optional[str]:
    return _aware(dt).astimezone(IST).strftime("%Y-%m-%d %H:%M") if dt else None


def _age_days(c) -> int:
    return 0 if c.status == "resolved" or not c.created_at else max((_now() - _aware(c.created_at)).days, 0)


def _matcher(db: Session, faculty):
    """A complaint is this faculty's when assigned_to names the faculty (name or ID) or equals the faculty's department."""
    name = norm(faculty.faculty_name)
    fid = (faculty.faculty_id or "").strip().lower()
    dept = norm(faculty_info(db, faculty)["department"])
    id_re = re.compile(rf"(?<![a-z0-9]){re.escape(fid)}(?![a-z0-9])") if fid else None

    def mine(c) -> bool:
        raw = (c.assigned_to or "").strip().lower()
        if not raw:
            return False
        a = norm(raw)
        return bool((dept and a == dept) or (name and name in a) or (id_re and id_re.search(raw)))

    return mine


def _my_complaint(db: Session, faculty, complaint_id: str):
    C, P = models.Complaint, models.StudentProfile
    row = db.query(C, P).join(P, P.id == C.student_profile_id).filter(C.id == _uuid(complaint_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Complaint nahi mili.")
    if not _matcher(db, faculty)(row[0]):
        raise HTTPException(status_code=403, detail="Ye complaint aapko assign nahi hui hai.")
    return row


def _mine_rows(db: Session, faculty):
    C, P = models.Complaint, models.StudentProfile
    mine = _matcher(db, faculty)
    rows = db.query(C, P).join(P, P.id == C.student_profile_id).filter(C.assigned_to.isnot(None)).all()
    return [(c, p) for c, p in rows if mine(c)]


@router.get("/summary")
def summary(faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    rows = _mine_rows(db, faculty)
    by = {"pending": 0, "in_progress": 0, "resolved": 0}
    for c, _p in rows:
        if c.status in by:
            by[c.status] += 1
    ratings = [c.rating for c, _p in rows if c.rating]
    return {"total": len(rows), **by, "avg_rating": round(sum(ratings) / len(ratings), 1) if ratings else None}


@router.get("")
def list_complaints(
    q: Optional[str] = Query(None, max_length=80),
    status: Optional[str] = Query(None, pattern="^(pending|in_progress|resolved)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    faculty=Depends(require_faculty),
    db: Session = Depends(get_db),
):
    rows = _mine_rows(db, faculty)
    if status:
        rows = [(c, p) for c, p in rows if c.status == status]
    if q and q.strip():
        s = q.strip().lower()
        rows = [(c, p) for c, p in rows if s in f"{c.ticket_no} {c.subject} {p.name} {p.college_id}".lower()]
    rows.sort(key=lambda r: (ORDER.get(r[0].status, 3), -(_aware(r[0].created_at).timestamp() if r[0].created_at else 0)))
    total = len(rows)
    view = rows[(page - 1) * page_size: page * page_size]
    items = [{"id": str(c.id), "ticket_no": c.ticket_no, "student": p.name, "college_id": p.college_id, "category": c.category,
              "subject": c.subject, "status": c.status, "created_at": _ist(c.created_at), "age_days": _age_days(c),
              "rating": c.rating} for c, p in view]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{complaint_id}")
def detail(complaint_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    c, p = _my_complaint(db, faculty, complaint_id)
    E, A = models.ComplaintEvent, models.ComplaintAttachment
    events = db.query(E).filter(E.complaint_id == c.id).order_by(E.created_at).all()
    files = db.query(A).filter(A.complaint_id == c.id).order_by(A.created_at).all()
    return {
        "id": str(c.id), "ticket_no": c.ticket_no, "category": c.category, "subject": c.subject, "description": c.description,
        "status": c.status, "assigned_to": c.assigned_to, "resolution_note": c.resolution_note, "created_at": _ist(c.created_at),
        "resolved_at": _ist(c.resolved_at), "rating": c.rating, "feedback": c.feedback, "age_days": _age_days(c),
        "student": {"name": p.name, "college_id": p.college_id, "course": p.course, "semester": p.semester},
        "events": [{"status": e.status, "message": e.message, "by": e.by_name, "at": _ist(e.created_at)} for e in events],
        "attachments": [{"id": str(a.id), "file_name": a.file_name, "size_bytes": a.size_bytes} for a in files],
    }


@router.post("/{complaint_id}/update")
def update(complaint_id: str, payload: schemas.FacultyComplaintUpdateIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    c, p = _my_complaint(db, faculty, complaint_id)
    if c.status == "resolved":
        raise HTTPException(status_code=400, detail="Resolved complaint ab badal nahi sakte.")
    if not (payload.status or payload.note):
        raise HTTPException(status_code=400, detail="Status ya note me se kuch to bharo.")
    E = models.ComplaintEvent
    now = _now()
    if payload.status:
        if payload.status == c.status:
            raise HTTPException(status_code=400, detail="Complaint pehle se isi status me hai.")
        if payload.status == "in_progress":
            message, title = payload.note or "Your complaint is being looked into.", "Complaint par kaam shuru hua"
        else:
            if not payload.note:
                raise HTTPException(status_code=400, detail="Resolve karne ke liye resolution note likhna zaroori hai.")
            c.resolution_note, c.resolved_at = payload.note, now
            message, title = payload.note, "Complaint resolve ho gayi"
        db.add(E(complaint_id=c.id, status=payload.status, message=message, by_name=faculty.faculty_name, created_at=now))
        c.status = payload.status
    else:
        db.add(E(complaint_id=c.id, status=None, message=payload.note, by_name=faculty.faculty_name, created_at=now))
        message, title = payload.note, "Complaint par naya update"
    c.has_unseen_update = True
    c.updated_at = now
    notify(db, c.student_profile_id, "complaint", title, f"{c.ticket_no}: {message}"[:120], "complaints")
    db.commit()
    return {"status": c.status}


@router.get("/{complaint_id}/attachments/{attachment_id}")
def download(complaint_id: str, attachment_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    c, _p = _my_complaint(db, faculty, complaint_id)
    A = models.ComplaintAttachment
    a = db.query(A).filter(A.id == _uuid(attachment_id, "File not found."), A.complaint_id == c.id).first()
    if not a:
        raise HTTPException(status_code=404, detail="File not found.")
    path = (UPLOAD_ROOT / str(c.student_profile_id) / a.file_path).resolve()
    if UPLOAD_ROOT.resolve() not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found on the server.")
    return FileResponse(str(path), filename=a.file_name)