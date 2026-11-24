import csv
import io
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.notify import notify
from .faculty_common import my_assignment, norm, require_faculty, students_by_class

router = APIRouter(prefix="/api/faculty/assignments", tags=["faculty-assignments"])

# If your student-side model names differ, change these two lines.
Task = models.Assignment
Sub = models.AssignmentSubmission

UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads"
IST = timezone(timedelta(hours=5, minutes=30))


def _aware(dt):
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _iso(dt):
    dt = _aware(dt)
    return dt.isoformat() if dt else None


def _uuid(v, msg="Assignment nahi mili."):
    try:
        return uuid.UUID(str(v))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _my_task(db: Session, faculty, task_id: str):
    """Ownership: the assignment must have been created by this faculty (via faculty_task_links)."""
    L = models.FacultyTaskLink
    tid = _uuid(task_id)
    link = db.query(L).filter(L.assignment_id == tid, L.faculty_profile_id == faculty.id).first()
    task = db.query(Task).filter(Task.id == tid).first() if link else None
    cls = db.query(models.FacultyAssignment).filter(models.FacultyAssignment.id == link.class_id).first() if link else None
    if not link or not task or not cls:
        raise HTTPException(status_code=404, detail="Assignment nahi mili.")
    return task, link, cls


def _class_students(db: Session, cls):
    g = students_by_class(db).get((norm(cls.course), cls.semester))
    return g["students"] if g else []


def _file_path(sub):
    raw = Path(sub.file_path or "")
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


def _task_out(t, cls) -> dict:
    due = _aware(t.due_at)
    return {"id": str(t.id), "title": t.title, "description": t.description, "subject": t.subject, "course": cls.course,
            "semester": cls.semester, "max_marks": t.max_marks, "due_at": _iso(t.due_at),
            "closed": bool(due and due < datetime.now(timezone.utc)), "class_id": str(cls.id)}


def pending_grading(db: Session, faculty) -> int:
    """Submissions waiting for marks, across this faculty's assignments (used by the dashboard)."""
    L = models.FacultyTaskLink
    ids = [i for (i,) in db.query(L.assignment_id).filter(L.faculty_profile_id == faculty.id).all()]
    if not ids:
        return 0
    return db.query(Sub).filter(Sub.assignment_id.in_(ids), Sub.marks.is_(None)).count()


@router.get("")
def list_tasks(class_id: Optional[str] = None, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    L, C = models.FacultyTaskLink, models.FacultyAssignment
    q = db.query(L, C).join(C, C.id == L.class_id).filter(L.faculty_profile_id == faculty.id)
    if class_id:
        q = q.filter(L.class_id == my_assignment(db, faculty, class_id).id)
    pairs = q.all()
    ids = [l.assignment_id for l, _c in pairs]
    tasks = {t.id: t for t in db.query(Task).filter(Task.id.in_(ids)).all()} if ids else {}
    counts = {}
    if ids:
        for aid, n, graded in db.query(Sub.assignment_id, func.count(Sub.id), func.count(Sub.marks)).filter(Sub.assignment_id.in_(ids)).group_by(Sub.assignment_id).all():
            counts[aid] = (n, graded)
    by_class = students_by_class(db)
    items = []
    for l, c in pairs:
        t = tasks.get(l.assignment_id)
        if t is None:
            continue
        g = by_class.get((norm(c.course), c.semester))
        submitted, graded = counts.get(t.id, (0, 0))
        items.append({**_task_out(t, c), "students": len(g["students"]) if g else 0, "submitted": submitted, "graded": graded,
                      "is_sample": bool(c.is_sample)})
    items.sort(key=lambda r: r["due_at"] or "", reverse=True)
    return {"items": items}


@router.post("")
def create_task(payload: schemas.FacultyTaskIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    cls = my_assignment(db, faculty, payload.class_id)
    due = _aware(payload.due_at)
    if due <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Deadline aane wale samay ki honi chahiye.")
    students = _class_students(db, cls)
    if not students:
        raise HTTPException(status_code=400, detail="Is class me koi student nahi hai.")
    t = Task(course=cls.course, semester=str(cls.semester), subject=cls.subject, title=payload.title, description=payload.description,
             faculty_name=faculty.faculty_name, max_marks=payload.max_marks, due_at=due)
    db.add(t)
    db.flush()
    db.add(models.FacultyTaskLink(assignment_id=t.id, faculty_profile_id=faculty.id, class_id=cls.id))
    for p in students:
        notify(db, p.id, "assignments", "Nayi assignment", f"{cls.subject}: {t.title}", "assignments")
    db.commit()
    return {"id": str(t.id), "notified": len(students)}


@router.put("/{task_id}")
def update_task(task_id: str, payload: schemas.FacultyTaskUpdateIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    t, _l, _c = _my_task(db, faculty, task_id)
    top = db.query(func.max(Sub.marks)).filter(Sub.assignment_id == t.id).scalar()
    if top is not None and payload.max_marks < top:
        raise HTTPException(status_code=400, detail=f"Kisi student ko {top} marks mil chuke hain, max marks isse kam nahi ho sakte.")
    t.title, t.description, t.max_marks, t.due_at = payload.title, payload.description, payload.max_marks, _aware(payload.due_at)
    db.commit()
    return {"ok": True}


@router.delete("/{task_id}")
def delete_task(task_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    t, link, _c = _my_task(db, faculty, task_id)
    n = db.query(Sub).filter(Sub.assignment_id == t.id).count()
    if n:
        raise HTTPException(status_code=400, detail=f"Is assignment ki {n} submissions aa chuki hain, delete nahi ho sakti.")
    db.delete(link)
    db.flush()
    db.delete(t)
    db.commit()
    return {"ok": True}


@router.get("/{task_id}")
def task_detail(task_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    t, _l, cls = _my_task(db, faculty, task_id)
    students = _class_students(db, cls)
    subs = {s.student_profile_id: s for s in db.query(Sub).filter(Sub.assignment_id == t.id).all()}
    now = datetime.now(timezone.utc)
    due = _aware(t.due_at)
    rows = []
    for p in students:
        s = subs.get(p.id)
        status = "pending"
        if s is not None:
            status = "graded" if s.marks is not None else "submitted"
        elif due and due < now:
            status = "overdue"
        rows.append({
            "student_id": str(p.id), "name": p.name, "college_id": p.college_id, "status": status,
            "submitted_at": _iso(s.submitted_at) if s else None, "is_late": bool(s.is_late) if s else False,
            "file_name": s.file_name if s else None, "note": s.note if s else None,
            "marks": s.marks if s else None, "feedback": s.feedback if s else None, "graded_at": _iso(s.graded_at) if s else None,
        })
    return {
        "task": _task_out(t, cls), "items": rows,
        "summary": {"students": len(rows), "submitted": sum(1 for r in rows if r["status"] in ("submitted", "graded")),
                    "graded": sum(1 for r in rows if r["status"] == "graded"), "late": sum(1 for r in rows if r["is_late"]),
                    "pending": sum(1 for r in rows if r["status"] in ("pending", "overdue"))},
    }


@router.get("/{task_id}/file/{student_id}")
def submission_file(task_id: str, student_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    t, _l, _c = _my_task(db, faculty, task_id)
    s = db.query(Sub).filter(Sub.assignment_id == t.id, Sub.student_profile_id == _uuid(student_id, "Submission nahi mili.")).first()
    if not s:
        raise HTTPException(status_code=404, detail="Submission nahi mili.")
    path = _file_path(s)
    if path is None:
        raise HTTPException(status_code=404, detail="File server par nahi mili.")
    return FileResponse(path, filename=s.file_name or path.name)


@router.put("/{task_id}/grade")
def grade(task_id: str, payload: schemas.FacultyGradeIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    t, _l, cls = _my_task(db, faculty, task_id)
    if payload.marks > t.max_marks:
        raise HTTPException(status_code=400, detail=f"Marks 0 se {t.max_marks} ke beech hone chahiye.")
    sid = _uuid(payload.student_id, "Submission nahi mili.")
    s = db.query(Sub).filter(Sub.assignment_id == t.id, Sub.student_profile_id == sid).first()
    if not s:
        raise HTTPException(status_code=400, detail="Is student ne abhi submit nahi kiya.")
    first = s.marks is None
    s.marks, s.feedback, s.graded_at = payload.marks, payload.feedback, datetime.now(timezone.utc)
    notify(db, sid, "assignments", "Assignment check ho gayi" if first else "Assignment ke marks update hue",
           f"{cls.subject}: {t.title} - {payload.marks}/{t.max_marks}", "assignments")
    db.commit()
    return {"ok": True}


def _safe(v):
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@"):
        return "'" + v  # stops spreadsheet formula injection
    return v


@router.get("/{task_id}/export")
def export(task_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    d = task_detail(task_id, faculty, db)
    t = d["task"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([f"{t['course']} Sem {t['semester']} - {t['subject']} - {t['title']} (max {t['max_marks']})"])
    w.writerow(["College ID", "Student", "Status", "Submitted at (IST)", "Late", f"Marks (/{t['max_marks']})", "Feedback"])
    for r in d["items"]:
        sub_at = datetime.fromisoformat(r["submitted_at"]).astimezone(IST).strftime("%Y-%m-%d %H:%M") if r["submitted_at"] else ""
        w.writerow([_safe(r["college_id"]), _safe(r["name"]), r["status"], sub_at, "Yes" if r["is_late"] else "",
                    "" if r["marks"] is None else r["marks"], _safe(r["feedback"] or "")])
    fname = re.sub(r"[^A-Za-z0-9_-]+", "-", f"assignment-{t['title']}").strip("-")
    return Response(content="\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{fname}.csv"'})