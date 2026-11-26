import csv
import io
import re
import uuid
from calendar import monthrange
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from .admin_settings import get_setting
from .faculty_common import my_assignment, norm, require_faculty, students_by_class

router = APIRouter(prefix="/api/faculty/attendance", tags=["faculty-attendance"])

EDIT_DAYS = 7  # attendance can be marked / edited for today and this many past days


def _subject_is(subject: str):
    R = models.AttendanceRecord
    return func.lower(func.replace(R.subject, " ", "")) == norm(subject)


def _marker(faculty):
    """marked_by may be a text (faculty id) or a UUID column; fill whichever it is."""
    col = models.AttendanceRecord.__table__.c.marked_by
    try:
        py = col.type.python_type
    except NotImplementedError:
        py = str
    return faculty.id if py is uuid.UUID else faculty.faculty_id


def _students(db: Session, a):
    g = students_by_class(db).get((norm(a.course), a.semester))
    return g["students"] if g else []


def _class_out(a) -> dict:
    return {"id": str(a.id), "course": a.course, "semester": a.semester, "subject": a.subject, "is_sample": bool(a.is_sample)}


def _editable(day: date) -> bool:
    today = date.today()
    return today - timedelta(days=EDIT_DAYS) <= day <= today


def _uuid(v):
    try:
        return uuid.UUID(str(v))
    except ValueError:
        raise HTTPException(status_code=400, detail="Student sahi nahi hai. Page refresh karo.")


def pending_today(db: Session, assignments, by_class) -> int:
    """How many of the faculty's classes have no attendance marked today (used by the dashboard)."""
    R = models.AttendanceRecord
    today = date.today()
    n = 0
    for a in assignments:
        g = by_class.get((norm(a.course), a.semester))
        if not g or not g["students"]:
            continue
        ids = [p.id for p in g["students"]]
        if not db.query(R.id).filter(R.student_profile_id.in_(ids), R.date == today, _subject_is(a.subject)).first():
            n += 1
    return n


@router.get("/sheet")
def sheet(assignment_id: str, day: date, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, assignment_id)
    if day > date.today():
        raise HTTPException(status_code=400, detail="Aane wali date ki attendance nahi lag sakti.")
    R = models.AttendanceRecord
    students = _students(db, a)
    ids = [p.id for p in students]
    existing = {}
    if ids:
        existing = {r.student_profile_id: r.status for r in db.query(R).filter(R.student_profile_id.in_(ids), R.date == day, _subject_is(a.subject)).all()}
    items = [{"id": str(p.id), "name": p.name, "college_id": p.college_id, "status": existing.get(p.id)} for p in students]
    return {"class": _class_out(a), "day": day.isoformat(), "items": items, "marked": any(i["status"] for i in items),
            "editable": _editable(day), "edit_days": EDIT_DAYS}


@router.post("/mark")
def mark(payload: schemas.FacultyAttendanceMarkIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, payload.assignment_id)
    today = date.today()
    if payload.day > today:
        raise HTTPException(status_code=400, detail="Aane wali date ki attendance nahi lag sakti.")
    if payload.day < today - timedelta(days=EDIT_DAYS):
        raise HTTPException(status_code=400, detail=f"{EDIT_DAYS} din se purani attendance edit nahi ho sakti.")
    students = _students(db, a)
    allowed = {p.id for p in students}
    wanted = {}
    for r in payload.records:
        sid = _uuid(r.student_id)
        if sid not in allowed:
            raise HTTPException(status_code=400, detail="Kuch students is class ke nahi hain. Page refresh karo.")
        if sid in wanted:
            raise HTTPException(status_code=400, detail="Ek student do baar aa gaya hai.")
        wanted[sid] = r.status
    if set(wanted) != allowed:
        raise HTTPException(status_code=400, detail="Class ke saare students ki attendance bhejo. Page refresh karke dobara try karo.")

    R = models.AttendanceRecord
    existing = {r.student_profile_id: r for r in db.query(R).filter(R.student_profile_id.in_(list(wanted)), R.date == payload.day, _subject_is(a.subject)).all()}
    marker = _marker(faculty)
    created = updated = 0
    for sid, status in wanted.items():
        row = existing.get(sid)
        if row is None:
            db.add(R(student_profile_id=sid, date=payload.day, subject=a.subject, status=status, marked_by=marker))
            created += 1
        elif row.status != status:
            row.status, row.marked_by = status, marker
            updated += 1
    db.commit()
    present = sum(1 for s in wanted.values() if s == "present")
    return {"created": created, "updated": updated, "present": present, "absent": len(wanted) - present}


@router.get("/history")
def history(assignment_id: str, page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100),
            faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, assignment_id)
    R = models.AttendanceRecord
    ids = [p.id for p in _students(db, a)]
    days = {}
    if ids:
        for d, st, n in db.query(R.date, R.status, func.count(R.id)).filter(R.student_profile_id.in_(ids), _subject_is(a.subject)).group_by(R.date, R.status).all():
            g = days.setdefault(d, {"day": d.isoformat(), "present": 0, "absent": 0})
            if st in g:
                g[st] += n
    rows = sorted(days.values(), key=lambda r: r["day"], reverse=True)
    for r in rows:
        r["total"] = r["present"] + r["absent"]
        r["editable"] = _editable(date.fromisoformat(r["day"]))
    total = len(rows)
    return {"class": _class_out(a), "items": rows[(page - 1) * page_size: page * page_size], "total": total, "page": page, "page_size": page_size}


def _report(db: Session, a, month: str) -> dict:
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month or ""):
        raise HTTPException(status_code=400, detail="Month sahi nahi hai (YYYY-MM).")
    y, m = int(month[:4]), int(month[5:])
    start, end = date(y, m, 1), date(y, m, monthrange(y, m)[1])
    R = models.AttendanceRecord
    students = _students(db, a)
    ids = [p.id for p in students]
    recs = []
    if ids:
        recs = db.query(R).filter(R.student_profile_id.in_(ids), R.date >= start, R.date <= end, _subject_is(a.subject)).all()
    days = sorted({r.date for r in recs})
    by_student = {}
    for r in recs:
        by_student.setdefault(r.student_profile_id, {})[r.date.isoformat()] = "P" if r.status == "present" else "A"
    threshold = get_setting(db, "min_attendance_pct")
    rows = []
    for p in students:
        marks = by_student.get(p.id, {})
        present = sum(1 for v in marks.values() if v == "P")
        total = len(marks)
        pct = round(present * 100 / total, 1) if total else None
        rows.append({"id": str(p.id), "name": p.name, "college_id": p.college_id, "present": present, "absent": total - present,
                     "total": total, "pct": pct, "low": pct is not None and pct < threshold, "marks": marks})
    with_pct = [r["pct"] for r in rows if r["pct"] is not None]
    return {
        "class": _class_out(a), "month": month, "days": [d.isoformat() for d in days], "rows": rows,
        "summary": {"classes_held": len(days), "students": len(rows), "avg_pct": round(sum(with_pct) / len(with_pct), 1) if with_pct else 0,
                    "below_threshold": sum(1 for r in rows if r["low"]), "threshold": threshold},
    }


@router.get("/report")
def report(assignment_id: str, month: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    return _report(db, my_assignment(db, faculty, assignment_id), month)


def _safe(v):
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@"):
        return "'" + v  # stops spreadsheet formula injection
    return v


@router.get("/report/export")
def export(assignment_id: str, month: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, assignment_id)
    data = _report(db, a, month)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([f"{a.course} Sem {a.semester} - {a.subject} - {month}"])
    w.writerow(["College ID", "Student"] + [d[8:] for d in data["days"]] + ["Present", "Absent", "Total", "Attendance %"])
    for r in data["rows"]:
        w.writerow([_safe(r["college_id"]), _safe(r["name"])] + [r["marks"].get(d, "") for d in data["days"]]
                   + [r["present"], r["absent"], r["total"], "" if r["pct"] is None else r["pct"]])
    fname = re.sub(r"[^A-Za-z0-9_-]+", "-", f"attendance-{a.subject}-{month}").strip("-")
    return Response(content="\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{fname}.csv"'})

def _board(db: Session, a, scope: str, start: Optional[date], end: Optional[date]) -> dict:
    if start and end and start > end:
        raise HTTPException(status_code=400, detail="The start date must be on or before the end date.")
    R = models.AttendanceRecord
    students = _students(db, a)
    ids = [p.id for p in students]
    agg = {}
    if ids:
        q = db.query(R.student_profile_id, func.count(R.id), func.coalesce(func.sum(case((R.status == "present", 1), else_=0)), 0)).filter(R.student_profile_id.in_(ids))
        if scope == "subject":
            q = q.filter(_subject_is(a.subject))
        if start:
            q = q.filter(R.date >= start)
        if end:
            q = q.filter(R.date <= end)
        agg = {sid: (int(t), int(pr)) for sid, t, pr in q.group_by(R.student_profile_id).all()}
    threshold = get_setting(db, "min_attendance_pct")

    rows = []
    for p in students:
        t, pr = agg.get(p.id, (0, 0))
        pct = round(pr * 100 / t, 1) if t else None
        rows.append({"id": str(p.id), "name": p.name, "college_id": p.college_id, "present": pr, "absent": t - pr, "total": t,
                     "pct": pct, "low": pct is not None and pct < threshold})
    ranked = sorted([r for r in rows if r["total"] > 0], key=lambda r: (-r["pct"], -r["present"], r["name"].lower()))
    rank, prev = 0, None
    for i, r in enumerate(ranked, 1):
        if r["pct"] != prev:
            rank, prev = i, r["pct"]
        r["rank"] = rank
    unranked = sorted([r for r in rows if r["total"] == 0], key=lambda r: r["name"].lower())
    for r in unranked:
        r["rank"] = None
    pcts = [r["pct"] for r in ranked]
    return {
        "class": _class_out(a), "scope": scope, "start": start.isoformat() if start else None, "end": end.isoformat() if end else None,
        "items": ranked + unranked,
        "summary": {
            "students": len(rows), "with_data": len(ranked), "avg_pct": round(sum(pcts) / len(pcts), 1) if pcts else 0,
            "highest": ranked[0] if ranked else None, "lowest": ranked[-1] if ranked else None,
            "below_threshold": sum(1 for r in ranked if r["low"]), "threshold": threshold,
        },
    }


@router.get("/leaderboard")
def leaderboard(
    assignment_id: str,
    scope: str = Query("subject", pattern="^(subject|class)$"),
    start: Optional[date] = None,
    end: Optional[date] = None,
    faculty=Depends(require_faculty),
    db: Session = Depends(get_db),
):
    return _board(db, my_assignment(db, faculty, assignment_id), scope, start, end)


@router.get("/leaderboard/export")
def leaderboard_export(
    assignment_id: str,
    scope: str = Query("subject", pattern="^(subject|class)$"),
    start: Optional[date] = None,
    end: Optional[date] = None,
    faculty=Depends(require_faculty),
    db: Session = Depends(get_db),
):
    a = my_assignment(db, faculty, assignment_id)
    data = _board(db, a, scope, start, end)
    buf = io.StringIO()
    w = csv.writer(buf)
    label = "Poori class" if scope == "class" else a.subject
    w.writerow([f"Attendance leaderboard - {a.course} Sem {a.semester} - {label}" + (f" ({data['start'] or 'start'} to {data['end'] or 'today'})" if data["start"] or data["end"] else "")])
    w.writerow(["Rank", "College ID", "Student", "Present", "Absent", "Total", "Attendance %", "Status"])
    for r in data["items"]:
        status = "No data" if r["total"] == 0 else ("Low" if r["low"] else "OK")
        w.writerow(["" if r["rank"] is None else r["rank"], _safe(r["college_id"]), _safe(r["name"]), r["present"], r["absent"], r["total"],
                    "" if r["pct"] is None else r["pct"], status])
    fname = re.sub(r"[^A-Za-z0-9_-]+", "-", f"leaderboard-{label}").strip("-")
    return Response(content="\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{fname}.csv"'})