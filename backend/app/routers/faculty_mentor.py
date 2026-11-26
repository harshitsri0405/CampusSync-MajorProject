import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.notify import notify
from .faculty_common import require_faculty

router = APIRouter(prefix="/api/faculty/mentor", tags=["faculty-mentor"])

# If your student-side mentor model names differ, change these lines.
Assign = models.MentorAssignment
Msg = models.MentorMessage
Att = getattr(models, "MentorAttachment", None)
Meet = models.MentorMeeting
Note = models.MentorNote

UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads"
STATUS_FOR = {"approve": "approved", "reject": "rejected", "complete": "completed"}
ALLOWED_FROM = {"approve": ("pending",), "reject": ("pending",), "complete": ("approved",)}
HIDE = {"id", "student_profile_id", "status", "mentor_response"}


def _aware(dt):
    if dt is None:
        return None
    return dt if getattr(dt, "tzinfo", None) or not isinstance(dt, datetime) else dt.replace(tzinfo=timezone.utc)


def _iso(v):
    v = _aware(v)
    return v.isoformat() if hasattr(v, "isoformat") else (str(v) if v is not None else None)


def _uuid(v, msg):
    try:
        return uuid.UUID(str(v))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _py(col):
    try:
        return col.type.python_type
    except NotImplementedError:
        return str


def _now_for(col):
    py = _py(col)
    if py is datetime:
        return datetime.now(timezone.utc)
    if py is date:
        return date.today()
    return datetime.now(timezone.utc).date().isoformat()


def _mentee(db: Session, faculty, student_id: str):
    """Ownership: the student must be assigned to this faculty as a mentee."""
    sid = _uuid(student_id, "Student nahi mila.")
    P = models.StudentProfile
    p = db.query(P).filter(P.id == sid).first()
    a = db.query(Assign).filter(Assign.student_profile_id == sid).first()
    if not p or not a:
        raise HTTPException(status_code=404, detail="Student nahi mila.")
    if a.faculty_id != faculty.faculty_id:
        raise HTTPException(status_code=403, detail="Ye student aapka mentee nahi hai.")
    return p


def _file_path(a):
    raw = Path(getattr(a, "file_path", None) or getattr(a, "path", None) or "")
    candidates = [raw] if raw.is_absolute() else [UPLOAD_ROOT.parent / raw, UPLOAD_ROOT / raw]
    root = UPLOAD_ROOT.resolve()
    for c in candidates:
        try:
            r = c.resolve()
        except OSError:
            continue
        if r.is_file() and root in r.parents:
            return r
    return None


def _att_name(a) -> str:
    return getattr(a, "file_name", None) or getattr(a, "filename", None) or getattr(a, "name", None) or "attachment"


@router.get("/mentees")
def mentees(q: Optional[str] = Query(None, max_length=80), faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    P, U = models.StudentProfile, models.User
    rows = (db.query(Assign, P, U).join(P, P.id == Assign.student_profile_id).join(U, U.id == P.user_id)
            .filter(Assign.faculty_id == faculty.faculty_id).order_by(P.name).all())
    rows = [(a, p) for a, p, u in rows if str(u.is_active).lower() != "false"]
    if q and q.strip():
        s = q.strip().lower()
        rows = [(a, p) for a, p in rows if s in f"{p.name} {p.college_id}".lower()]
    ids = [p.id for _a, p in rows]
    unread, last, pending = {}, {}, {}
    if ids:
        unread = dict(db.query(Msg.student_profile_id, func.count(Msg.id)).filter(Msg.student_profile_id.in_(ids), Msg.sender == "student", Msg.is_read.is_(False)).group_by(Msg.student_profile_id).all())
        last = dict(db.query(Msg.student_profile_id, func.max(Msg.created_at)).filter(Msg.student_profile_id.in_(ids)).group_by(Msg.student_profile_id).all())
        pending = dict(db.query(Meet.student_profile_id, func.count(Meet.id)).filter(Meet.student_profile_id.in_(ids), Meet.status == "pending").group_by(Meet.student_profile_id).all())
    items = [{"id": str(p.id), "name": p.name, "college_id": p.college_id, "course": p.course, "semester": p.semester,
              "unread": unread.get(p.id, 0), "pending_meetings": pending.get(p.id, 0), "last_message_at": _iso(last.get(p.id))} for _a, p in rows]
    items.sort(key=lambda r: (r["last_message_at"] or ""), reverse=True)
    return {"items": items, "total": len(items)}


@router.get("/students/{student_id}/messages")
def messages(student_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    p = _mentee(db, faculty, student_id)
    rows = db.query(Msg).filter(Msg.student_profile_id == p.id).order_by(Msg.created_at.desc()).limit(100).all()[::-1]
    atts = {}
    if Att is not None and rows:
        try:
            for a in db.query(Att).filter(Att.message_id.in_([m.id for m in rows])).all():
                atts.setdefault(a.message_id, []).append({"id": str(a.id), "name": _att_name(a)})
        except Exception:
            db.rollback()
            atts = {}
    changed = False
    for m in rows:
        if m.sender == "student" and not m.is_read:
            m.is_read = True
            changed = True
    if changed:
        db.commit()
    items = [{"id": str(m.id), "sender": m.sender, "body": m.body, "created_at": _iso(m.created_at), "attachments": atts.get(m.id, [])} for m in rows]
    return {"student": {"id": str(p.id), "name": p.name, "college_id": p.college_id}, "items": items}


@router.post("/students/{student_id}/messages")
def send_message(student_id: str, payload: schemas.FacultyMentorMessageIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    p = _mentee(db, faculty, student_id)
    m = Msg(student_profile_id=p.id, sender="mentor", body=payload.body, is_read=False)
    db.add(m)
    notify(db, p.id, "mentor", "Mentor ka naya message", payload.body[:120], "mentor")
    db.commit()
    return {"id": str(m.id)}


@router.get("/attachments/{attachment_id}")
def attachment(attachment_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    if Att is None:
        raise HTTPException(status_code=404, detail="Attachment nahi mila.")
    a = db.query(Att).filter(Att.id == _uuid(attachment_id, "Attachment nahi mila.")).first()
    m = db.query(Msg).filter(Msg.id == a.message_id).first() if a else None
    if not a or not m:
        raise HTTPException(status_code=404, detail="Attachment nahi mila.")
    _mentee(db, faculty, str(m.student_profile_id))
    path = _file_path(a)
    if path is None:
        raise HTTPException(status_code=404, detail="File not found on the server.")
    return FileResponse(path, filename=_att_name(a))


# ---------------------------------- Meetings ----------------------------------
def _serialize(row) -> dict:
    out = {}
    for c in row.__table__.columns:
        if c.name in HIDE:
            continue
        v = getattr(row, c.name, None)
        if v is not None:
            out[c.name] = _iso(v)
    return out


@router.get("/meetings")
def meetings(
    status: str = Query("pending", pattern="^(all|pending|approved|rejected|completed|cancelled)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    faculty=Depends(require_faculty),
    db: Session = Depends(get_db),
):
    P = models.StudentProfile
    query = (db.query(Meet, P).join(P, P.id == Meet.student_profile_id)
             .join(Assign, Assign.student_profile_id == P.id).filter(Assign.faculty_id == faculty.faculty_id))
    if status != "all":
        query = query.filter(Meet.status == status)
    total = query.count()
    rows = query.order_by(Meet.status == "pending", Meet.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    items = [{"id": str(m.id), "student_id": str(p.id), "student_name": p.name, "college_id": p.college_id, "status": m.status,
              "mentor_response": m.mentor_response, "fields": _serialize(m)} for m, p in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/meetings/{meeting_id}/respond")
def respond(meeting_id: str, payload: schemas.FacultyMeetingRespondIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    m = db.query(Meet).filter(Meet.id == _uuid(meeting_id, "Meeting nahi mili.")).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting nahi mili.")
    _mentee(db, faculty, str(m.student_profile_id))
    if m.status not in ALLOWED_FROM[payload.action]:
        raise HTTPException(status_code=400, detail=f"Ye meeting abhi '{m.status}' hai, isliye ye action nahi ho sakta.")
    if payload.action == "reject" and not payload.response:
        raise HTTPException(status_code=400, detail="Reject karne ki wajah likho.")
    new = STATUS_FOR[payload.action]
    m.status = new
    if payload.response is not None or payload.action != "complete":
        m.mentor_response = payload.response
    notify(db, m.student_profile_id, "mentor", f"Meeting {new}", (payload.response or "Details Mentor page par dekho.")[:120], "mentor")
    db.commit()
    return {"status": new}


# ------------------------------------ Notes ------------------------------------
def _note_out(n) -> dict:
    return {"id": str(n.id), "note_type": n.note_type, "title": n.title, "body": n.body,
            "action_points": [x for x in (n.action_points or "").split("\n") if x.strip()],
            "created_by": n.created_by, "created_on": _iso(n.created_on)}


@router.get("/students/{student_id}/notes")
def notes(student_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    p = _mentee(db, faculty, student_id)
    rows = db.query(Note).filter(Note.student_profile_id == p.id).order_by(Note.created_on.desc()).all()
    return {"items": [_note_out(n) for n in rows]}


@router.post("/students/{student_id}/notes")
def add_note(student_id: str, payload: schemas.FacultyMentorNoteIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    p = _mentee(db, faculty, student_id)
    points = "\n".join(x.strip() for x in (payload.action_points or "").splitlines() if x.strip()) or None
    n = Note(student_profile_id=p.id, note_type=payload.note_type, title=payload.title, body=payload.body, action_points=points,
             created_by=faculty.faculty_name, created_on=_now_for(Note.__table__.c.created_on))
    db.add(n)
    notify(db, p.id, "mentor", "Mentor ne naya note joda", payload.title[:120], "mentor")
    db.commit()
    return {"id": str(n.id)}


@router.delete("/notes/{note_id}")
def delete_note(note_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    n = db.query(Note).filter(Note.id == _uuid(note_id, "Note nahi mila.")).first()
    if not n:
        raise HTTPException(status_code=404, detail="Note nahi mila.")
    _mentee(db, faculty, str(n.student_profile_id))
    if n.created_by != faculty.faculty_name:
        raise HTTPException(status_code=403, detail="Aap sirf apne likhe notes delete kar sakte ho.")
    db.delete(n)
    db.commit()
    return {"ok": True}