import os
import uuid
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from .admin_common import admin_name, log_activity, require_admin

router = APIRouter(prefix="/api/admin/notices", tags=["admin-notices"])


def _key(s) -> str:
    return "".join(str(s or "").lower().split())


def _uuid(value, msg):
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _audience(db: Session):
    """(total active students, {department key: active students})"""
    P, U = models.StudentProfile, models.User
    total, by = 0, {}
    for dept, active in db.query(P.department, U.is_active).join(U, U.id == P.user_id).all():
        if str(active).lower() == "false":
            continue
        total += 1
        k = _key(dept)
        by[k] = by.get(k, 0) + 1
    return total, by


def _out(n, total, by, reads) -> dict:
    audience = by.get(_key(n.department), 0) if n.category == "department" else total
    return {
        "id": str(n.id), "category": n.category, "title": n.title, "body": n.body, "department": n.department,
        "posted_by": n.posted_by, "posted_on": n.posted_on.isoformat(), "is_important": bool(n.is_important),
        "event_date": n.event_date.isoformat() if n.event_date else None,
        "event_time": n.event_time.strftime("%H:%M") if n.event_time else None,
        "venue": n.venue, "audience": audience, "reads": min(reads, audience) if audience else reads,
    }


def _check(db: Session, p: schemas.AdminNoticeIn):
    """Cross-field rules. Returns the department name (department notices only)."""
    if p.category == "department":
        if not p.department_id:
            raise HTTPException(status_code=400, detail="Department notice ke liye department chuno.")
        d = db.query(models.AdminDepartment).filter(models.AdminDepartment.id == _uuid(p.department_id, "Department nahi mila.")).first()
        if not d:
            raise HTTPException(status_code=400, detail="Ye department nahi mila.")
        if not d.is_active:
            raise HTTPException(status_code=400, detail="Ye department inactive hai.")
        return d.name
    if p.category == "event" and not p.event_date:
        raise HTTPException(status_code=400, detail="Event ki date zaroori hai.")
    return None


def _apply(n, p: schemas.AdminNoticeIn, dept_name):
    n.category, n.title, n.body, n.is_important = p.category, p.title, p.body, p.is_important
    n.department = dept_name
    if p.category == "event":
        n.event_date, n.event_time, n.venue = p.event_date, p.event_time, p.venue
    else:
        n.event_date = n.event_time = n.venue = None


@router.get("")
def list_notices(
    q: Optional[str] = Query(None, max_length=80),
    category: Optional[str] = Query(None, pattern="^(college|department|event)$"),
    important: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(8, ge=1, le=50),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    N = models.Notice
    query = db.query(N)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(N.title.ilike(like) | N.body.ilike(like))
    if category:
        query = query.filter(N.category == category)
    if important is not None:
        query = query.filter(N.is_important.is_(important))
    total = query.count()
    rows = query.order_by(N.posted_on.desc(), N.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    reads = {}
    if rows:
        R = models.NoticeRead
        reads = dict(db.query(R.notice_id, func.count(R.id)).filter(R.notice_id.in_([n.id for n in rows])).group_by(R.notice_id).all())
    aud_total, by = _audience(db)
    today = date.today()
    stats = {
        "total": db.query(N).count(),
        "important": db.query(N).filter(N.is_important.is_(True)).count(),
        "upcoming_events": db.query(N).filter(N.category == "event", N.event_date >= today).count(),
        "this_month": db.query(N).filter(N.posted_on >= today.replace(day=1)).count(),
        "students": aud_total,
    }
    return {"items": [_out(n, aud_total, by, reads.get(n.id, 0)) for n in rows], "total": total, "page": page, "page_size": page_size, "stats": stats}


@router.post("")
def create_notice(payload: schemas.AdminNoticeIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    dept = _check(db, payload)
    n = models.Notice(posted_by=admin_name(admin), posted_on=date.today())
    _apply(n, payload, dept)
    db.add(n)
    db.commit()
    log_activity(db, admin, "notice.create", f"Notice posted ({n.category}): {n.title}")
    return {"id": str(n.id)}


@router.put("/{notice_id}")
def update_notice(notice_id: str, payload: schemas.AdminNoticeIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    n = db.query(models.Notice).filter(models.Notice.id == _uuid(notice_id, "Notice nahi mila.")).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notice nahi mila.")
    dept = _check(db, payload)
    _apply(n, payload, dept)
    db.commit()
    log_activity(db, admin, "notice.update", f"Notice updated ({n.category}): {n.title}")
    return {"ok": True}


@router.delete("/{notice_id}")
def delete_notice(notice_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    n = db.query(models.Notice).filter(models.Notice.id == _uuid(notice_id, "Notice nahi mila.")).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notice nahi mila.")
    title = n.title
    db.query(models.NoticeRead).filter(models.NoticeRead.notice_id == n.id).delete()
    db.delete(n)
    db.commit()
    log_activity(db, admin, "notice.delete", f"Notice deleted: {title}")
    return {"ok": True}


@router.post("/demo-seed")
def demo_seed(admin=Depends(require_admin), db: Session = Depends(get_db)):
    """SAMPLE notices (posted_by = 'demo'). Runs once."""
    if os.getenv("ENABLE_DEMO_DATA", "").strip().lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai. backend\\.env me ENABLE_DEMO_DATA=true karke backend restart karo.")
    N = models.Notice
    if db.query(N).filter(N.posted_by == "demo", N.title.like("Sample:%")).first():
        return {"added": 0, "message": "Sample notices pehle se bane hain."}
    today = date.today()
    items = [
        N(category="college", title="Sample: Campus Timings Update", body="This is a SAMPLE notice. College timings for this week are 9:00 AM to 4:00 PM.",
          posted_by="demo", posted_on=today, is_important=False),
        N(category="college", title="Sample: Internal Exam Instructions", body="This is a SAMPLE important notice. Carry your ID card to every exam.",
          posted_by="demo", posted_on=today - timedelta(days=1), is_important=True),
        N(category="event", title="Sample: Annual Tech Fest", body="This is a SAMPLE event notice. Register at the student desk.",
          posted_by="demo", posted_on=today, event_date=today + timedelta(days=10), event_time=None, venue="Main Auditorium", is_important=False),
    ]
    dept = db.query(models.AdminDepartment).filter(models.AdminDepartment.is_active.is_(True)).order_by(models.AdminDepartment.name).first()
    if dept:
        items.append(N(category="department", title="Sample: Department Meeting", body="This is a SAMPLE department notice, visible only to this department.",
                       department=dept.name, posted_by="demo", posted_on=today, is_important=False))
    db.add_all(items)
    db.commit()
    log_activity(db, admin, "notice.demo", f"Sample notices added ({len(items)}, demo data)")
    return {"added": len(items), "message": f"{len(items)} sample notices bane."}