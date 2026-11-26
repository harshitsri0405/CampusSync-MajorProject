import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from .admin_common import admin_name, log_activity, require_admin

router = APIRouter(prefix="/api/admin/complaints", tags=["admin-complaints"])

IST = timezone(timedelta(hours=5, minutes=30))
# backend/uploads/complaints/<student id>/<stored file>  (same folder the student module writes to)
UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads" / "complaints"


def _uuid(value, msg):
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _now():
    return datetime.now(timezone.utc)


def _ist(dt) -> Optional[str]:
    return dt.astimezone(IST).strftime("%Y-%m-%d %H:%M") if dt else None


def _aware(dt):
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _age_days(c) -> int:
    return 0 if c.status == "resolved" or not c.created_at else max((_now() - _aware(c.created_at)).days, 0)


@router.get("/summary")
def summary(admin=Depends(require_admin), db: Session = Depends(get_db)):
    C = models.Complaint
    by_status = dict(db.query(C.status, func.count(C.id)).group_by(C.status).all())
    cats = db.query(C.category, func.count(C.id)).group_by(C.category).order_by(func.count(C.id).desc()).all()
    avg_rating = db.query(func.avg(C.rating)).filter(C.rating.isnot(None)).scalar()
    hours = [(_aware(c.resolved_at) - _aware(c.created_at)).total_seconds() / 3600
             for c in db.query(C).filter(C.status == "resolved", C.resolved_at.isnot(None), C.created_at.isnot(None)).all()]
    return {
        "total": sum(by_status.values()), "pending": by_status.get("pending", 0), "in_progress": by_status.get("in_progress", 0),
        "resolved": by_status.get("resolved", 0), "avg_rating": round(float(avg_rating), 1) if avg_rating is not None else None,
        "avg_resolution_hours": round(sum(hours) / len(hours), 1) if hours else None,
        "categories": [{"category": k, "count": v} for k, v in cats],
    }


@router.get("")
def list_complaints(
    q: Optional[str] = Query(None, max_length=80),
    status: Optional[str] = Query(None, pattern="^(pending|in_progress|resolved)$"),
    category: Optional[str] = Query(None, max_length=60),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    C, P, A = models.Complaint, models.StudentProfile, models.ComplaintAttachment
    query = db.query(C, P).join(P, P.id == C.student_profile_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(C.ticket_no.ilike(like) | C.subject.ilike(like) | P.name.ilike(like) | P.college_id.ilike(like))
    if status:
        query = query.filter(C.status == status)
    if category:
        query = query.filter(func.lower(C.category) == category.strip().lower())
    total = query.count()
    order = case((C.status == "pending", 0), (C.status == "in_progress", 1), else_=2)
    rows = query.order_by(order, C.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    counts = dict(db.query(A.complaint_id, func.count(A.id)).filter(A.complaint_id.in_([c.id for c, _ in rows])).group_by(A.complaint_id).all()) if rows else {}
    cats = sorted({k for (k,) in db.query(C.category).distinct().all() if k})
    items = [{
        "id": str(c.id), "ticket_no": c.ticket_no, "student": p.name, "college_id": p.college_id, "category": c.category, "subject": c.subject,
        "status": c.status, "assigned_to": c.assigned_to, "created_at": _ist(c.created_at), "age_days": _age_days(c),
        "rating": c.rating, "attachments": counts.get(c.id, 0),
    } for c, p in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size, "categories": cats}


def _get(db: Session, complaint_id: str):
    C, P = models.Complaint, models.StudentProfile
    row = db.query(C, P).join(P, P.id == C.student_profile_id).filter(C.id == _uuid(complaint_id, "Complaint nahi mili.")).first()
    if not row:
        raise HTTPException(status_code=404, detail="Complaint nahi mili.")
    return row


@router.get("/{complaint_id}")
def detail(complaint_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    c, p = _get(db, complaint_id)
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
def update(complaint_id: str, payload: schemas.AdminComplaintUpdateIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    c, p = _get(db, complaint_id)
    if c.status == "resolved":
        raise HTTPException(status_code=400, detail="Resolved complaint ab badal nahi sakte.")
    if not (payload.status or payload.assigned_to or payload.note):
        raise HTTPException(status_code=400, detail="Status, department ya note me se kuch to bharo.")
    me = admin_name(admin)
    E = models.ComplaintEvent
    now = _now()
    done = []

    def event(status, message):
        db.add(E(complaint_id=c.id, status=status, message=message, by_name=me, created_at=now))

    if payload.assigned_to and "".join(payload.assigned_to.lower().split()) != "".join((c.assigned_to or "").lower().split()):
        c.assigned_to = payload.assigned_to
        event(None, f"Forwarded to {payload.assigned_to}.")
        done.append(f"forwarded to {payload.assigned_to}")
    if payload.status:
        if payload.status == c.status:
            raise HTTPException(status_code=400, detail="Complaint pehle se isi status me hai.")
        if payload.status == "in_progress":
            event("in_progress", payload.note or "Your complaint is being looked into.")
        else:
            if not payload.note:
                raise HTTPException(status_code=400, detail="Resolve karne ke liye resolution note likhna zaroori hai.")
            c.resolution_note, c.resolved_at = payload.note, now
            event("resolved", payload.note)
        c.status = payload.status
        done.append(payload.status)
    elif payload.note:
        event(None, payload.note)
        done.append("note added")
    c.has_unseen_update = True
    c.updated_at = now
    db.commit()
    log_activity(db, admin, "complaint.update", f"Complaint {c.ticket_no} ({p.name}): " + ", ".join(done))
    return {"status": c.status}


@router.get("/{complaint_id}/attachments/{attachment_id}")
def download(complaint_id: str, attachment_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    c, p = _get(db, complaint_id)
    a = db.query(models.ComplaintAttachment).filter(models.ComplaintAttachment.id == _uuid(attachment_id, "File not found."),
                                                    models.ComplaintAttachment.complaint_id == c.id).first()
    if not a:
        raise HTTPException(status_code=404, detail="File not found.")
    path = (UPLOAD_ROOT / str(c.student_profile_id) / a.file_path).resolve()
    if UPLOAD_ROOT.resolve() not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found on the server.")
    return FileResponse(str(path), filename=a.file_name)


@router.post("/demo-seed")
def demo_seed(admin=Depends(require_admin), db: Session = Depends(get_db)):
    """SAMPLE complaints (ticket DEMO-xxxx) from the first 3 active students. Runs once."""
    if os.getenv("ENABLE_DEMO_DATA", "").strip().lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai. backend\\.env me ENABLE_DEMO_DATA=true karke backend restart karo.")
    C, E = models.Complaint, models.ComplaintEvent
    if db.query(C.id).filter(C.ticket_no.like("DEMO-%")).first():
        return {"added": 0, "message": "Sample complaints pehle se bani hain."}
    P, U = models.StudentProfile, models.User
    studs = [p for p, u in db.query(P, U).join(U, U.id == P.user_id).order_by(P.name).all() if str(u.is_active).lower() != "false"][:3]
    if not studs:
        return {"added": 0, "message": "Sample ke liye kam se kam ek active student chahiye."}
    now = _now()
    plans = [("pending", "Facilities", "Sample: Classroom projector not working", None),
             ("in_progress", "Academic", "Sample: Timetable clash question", "Academic Office"),
             ("resolved", "Hostel", "Sample: Water cooler repair", "Maintenance")]
    for n, (s, (status, cat, subject, dept)) in enumerate(zip(studs, plans), 1):
        created = now - timedelta(days=n * 3)
        c = C(student_profile_id=s.id, ticket_no=f"DEMO-{n:04d}", category=cat, subject=subject, description="This is a SAMPLE complaint for testing.",
              status=status, assigned_to=dept, has_unseen_update=status != "pending", created_at=created, updated_at=now)
        if status == "resolved":
            c.resolution_note, c.resolved_at, c.rating, c.feedback, c.feedback_at = "SAMPLE: Issue fixed.", now - timedelta(days=1), 4, "Sample feedback.", now
        db.add(c)
        db.flush()
        db.add(E(complaint_id=c.id, status="pending", message="Complaint submitted.", by_name="You", created_at=created))
        if dept:
            db.add(E(complaint_id=c.id, status=None, message=f"Forwarded to {dept}.", by_name="Sample Admin", created_at=created + timedelta(hours=2)))
        if status in ("in_progress", "resolved"):
            db.add(E(complaint_id=c.id, status="in_progress", message="Your complaint is being looked into.", by_name="Sample Admin", created_at=created + timedelta(hours=3)))
        if status == "resolved":
            db.add(E(complaint_id=c.id, status="resolved", message="SAMPLE: Issue fixed.", by_name="Sample Admin", created_at=now - timedelta(days=1)))
    db.commit()
    log_activity(db, admin, "complaint.demo", f"Sample complaints added ({len(studs)}, demo data)")
    return {"added": len(studs), "message": f"{len(studs)} sample complaints bani."}