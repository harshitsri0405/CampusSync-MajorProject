import uuid
from datetime import date, datetime, time, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.notify import notify
from .faculty_common import faculty_info, my_assignment, norm, require_faculty, students_by_class

router = APIRouter(prefix="/api/faculty/notices", tags=["faculty-notices"])

# If your notice model names differ, change these two lines.
Notice = models.Notice
Read = getattr(models, "NoticeRead", None)

CATEGORIES = ("college", "department", "event")


def _py(col):
    try:
        return col.type.python_type
    except NotImplementedError:
        return str


def _posted_now():
    return datetime.now(timezone.utc) if _py(Notice.__table__.c.posted_on) is datetime else date.today()


def _time_value(v: Optional[str]):
    if not v:
        return None
    if _py(Notice.__table__.c.event_time) is time:
        return time(int(v[:2]), int(v[3:5]))
    return v


def _iso(v):
    return v.isoformat() if hasattr(v, "isoformat") else (str(v) if v is not None else None)


def _uuid(v, msg="Notice nahi mila."):
    try:
        return uuid.UUID(str(v))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _department(db: Session, faculty) -> str:
    dept = faculty_info(db, faculty)["department"]
    if not dept:
        raise HTTPException(status_code=400, detail="Aapka department set nahi hai. Admin se Faculty page me department set karwao.")
    return dept


def _audience(db: Session, dept: str):
    P, U = models.StudentProfile, models.User
    return [p for p, u in db.query(P, U).join(U, U.id == P.user_id).all()
            if str(u.is_active).lower() != "false" and norm(getattr(p, "department", None)) == norm(dept)]


def _out(n, mine: bool, reads) -> dict:
    return {"id": str(n.id), "category": n.category, "title": n.title, "body": n.body, "department": n.department,
            "posted_by": n.posted_by, "posted_on": _iso(n.posted_on), "is_important": bool(n.is_important),
            "event_date": _iso(n.event_date), "event_time": str(n.event_time)[:5] if n.event_time else None, "venue": n.venue,
            "mine": mine, "read_count": reads.get(n.id) if mine else None}


def _my_notice(db: Session, faculty, notice_id: str):
    L = models.FacultyNoticeLink
    nid = _uuid(notice_id)
    link = db.query(L).filter(L.notice_id == nid, L.faculty_profile_id == faculty.id).first()
    n = db.query(Notice).filter(Notice.id == nid).first() if link else None
    if not link or not n:
        raise HTTPException(status_code=404, detail="Notice nahi mila ya wo aapka nahi hai.")
    return n, link


@router.get("/meta")
def meta(faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    return {"department": faculty_info(db, faculty)["department"]}


@router.get("")
def list_notices(
    scope: str = Query("all", pattern="^(all|mine)$"),
    category: Optional[str] = Query(None, max_length=20),
    q: Optional[str] = Query(None, max_length=80),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    faculty=Depends(require_faculty),
    db: Session = Depends(get_db),
):
    L = models.FacultyNoticeLink
    query = db.query(Notice, L.faculty_profile_id).outerjoin(L, L.notice_id == Notice.id)
    if scope == "mine":
        query = query.filter(L.faculty_profile_id == faculty.id)
    if category in CATEGORIES:
        query = query.filter(Notice.category == category)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(Notice.title.ilike(like) | Notice.body.ilike(like))
    total = query.count()
    rows = query.order_by(Notice.posted_on.desc()).offset((page - 1) * page_size).limit(page_size).all()
    reads = {}
    if Read is not None and rows:
        try:
            reads = dict(db.query(Read.notice_id, func.count(Read.id)).filter(Read.notice_id.in_([n.id for n, _o in rows])).group_by(Read.notice_id).all())
        except Exception:
            db.rollback()
            reads = {}
    items = [_out(n, owner == faculty.id, reads) for n, owner in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


def _check_event(p: schemas.FacultyNoticeIn, creating: bool):
    if p.kind == "event":
        if p.event_date is None:
            raise HTTPException(status_code=400, detail="Event ki date daalo.")
        if creating and p.event_date < date.today():
            raise HTTPException(status_code=400, detail="Event ki date beeti hui nahi ho sakti.")


@router.post("")
def create_notice(payload: schemas.FacultyNoticeIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    dept = _department(db, faculty)
    _check_event(payload, True)
    is_event = payload.kind == "event"
    n = Notice(category=payload.kind, title=payload.title, body=payload.body, department=dept, posted_by=faculty.faculty_name,
               posted_on=_posted_now(), is_important=payload.is_important,
               event_date=payload.event_date if is_event else None, event_time=_time_value(payload.event_time) if is_event else None,
               venue=payload.venue if is_event else None)
    db.add(n)
    db.flush()
    db.add(models.FacultyNoticeLink(notice_id=n.id, faculty_profile_id=faculty.id))
    people = _audience(db, dept)
    for p in people:
        notify(db, p.id, "notice", ("Naya event: " if is_event else "Naya notice: ") + n.title, (n.body or "")[:120], "notices")
    db.commit()
    return {"id": str(n.id), "notified": len(people)}


@router.put("/{notice_id}")
def update_notice(notice_id: str, payload: schemas.FacultyNoticeIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    n, _l = _my_notice(db, faculty, notice_id)
    if n.category != payload.kind:
        raise HTTPException(status_code=400, detail="Notice ka type (department/event) badla nahi ja sakta.")
    _check_event(payload, False)
    is_event = payload.kind == "event"
    n.title, n.body, n.is_important = payload.title, payload.body, payload.is_important
    n.event_date = payload.event_date if is_event else None
    n.event_time = _time_value(payload.event_time) if is_event else None
    n.venue = payload.venue if is_event else None
    db.commit()
    return {"ok": True}


@router.delete("/{notice_id}")
def delete_notice(notice_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    n, link = _my_notice(db, faculty, notice_id)
    if Read is not None:
        db.query(Read).filter(Read.notice_id == n.id).delete(synchronize_session=False)
    db.delete(link)
    db.flush()
    db.delete(n)
    db.commit()
    return {"ok": True}


@router.post("/announce")
def announce(payload: schemas.FacultyAnnouncementIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    cls = my_assignment(db, faculty, payload.class_id)
    g = students_by_class(db).get((norm(cls.course), cls.semester))
    students = g["students"] if g else []
    if not students:
        raise HTTPException(status_code=400, detail="Is class me koi student nahi hai.")
    for p in students:
        notify(db, p.id, "notice", f"{cls.subject}: {payload.title}", payload.body, "notices")
    db.add(models.FacultyAnnouncement(faculty_profile_id=faculty.id, class_id=cls.id, title=payload.title, body=payload.body, recipients=len(students)))
    db.commit()
    return {"sent": len(students)}


@router.get("/announcements")
def announcements(page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=50),
                  faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    A, C = models.FacultyAnnouncement, models.FacultyAssignment
    q = db.query(A, C).join(C, C.id == A.class_id).filter(A.faculty_profile_id == faculty.id)
    total = q.count()
    rows = q.order_by(A.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    items = [{"id": str(a.id), "title": a.title, "body": a.body, "recipients": a.recipients, "created_at": a.created_at.isoformat(),
              "class_label": f"{c.course} · Sem {c.semester} · {c.subject}"} for a, c in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}