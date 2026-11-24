import csv
import io
import re
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from .admin_settings import get_setting
from .faculty_attendance import _class_out, _safe, _students, _subject_is
from .faculty_common import my_assignment, require_faculty
from .faculty_qr import IST

router = APIRouter(prefix="/api/faculty/analytics", tags=["faculty-analytics"])

AR = models.AttendanceRecord
RR = models.ResultRecord
Task = models.Assignment
Sub = models.AssignmentSubmission
L = models.FacultyTaskLink
FA = models.FacultyAssignment

INTERNAL_MAX = 40.0
WEIGHTS = {"attendance": 0.3, "internal": 0.5, "assignment": 0.2}
MONTH_COL = func.to_char(AR.date, "YYYY-MM")


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _avg(vals) -> Optional[float]:
    vals = [v for v in vals if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


def _months_back(today: date, n: int) -> list:
    out, y, m = [], today.year, today.month
    for i in range(n - 1, -1, -1):
        mm, yy = m - i, y
        while mm <= 0:
            mm += 12
            yy -= 1
        out.append(f"{yy:04d}-{mm:02d}")
    return out


def _buckets(values, edges, labels) -> list:
    counts = [0] * len(labels)
    for v in values:
        if v is not None:
            counts[sum(1 for e in edges if v >= e)] += 1
    return [{"label": lb, "count": c} for lb, c in zip(labels, counts)]


def _trend(db: Session, a, ids, student_id=None) -> list:
    today = datetime.now(IST).date()
    months = _months_back(today, 6)
    start = date(int(months[0][:4]), int(months[0][5:]), 1)
    q = db.query(MONTH_COL, func.count(AR.id), func.coalesce(func.sum(case((AR.status == "present", 1), else_=0)), 0)).filter(
        _subject_is(a.subject), AR.date >= start)
    q = q.filter(AR.student_profile_id == student_id) if student_id else q.filter(AR.student_profile_id.in_(ids or [uuid.uuid4()]))
    got = {m: (int(t), int(p)) for m, t, p in q.group_by(MONTH_COL).all()}
    return [{"month": m, "total": got.get(m, (0, 0))[0], "pct": round(got[m][1] * 100 / got[m][0], 1) if m in got and got[m][0] else None} for m in months]


def _analyze(db: Session, a):
    students = _students(db, a)
    ids = [p.id for p in students]
    threshold = get_setting(db, "min_attendance_pct")
    pass_pct = get_setting(db, "pass_marks")
    now = datetime.now(timezone.utc)

    att = {}
    internal = {}
    if ids:
        q = db.query(AR.student_profile_id, func.count(AR.id), func.coalesce(func.sum(case((AR.status == "present", 1), else_=0)), 0)).filter(
            AR.student_profile_id.in_(ids), _subject_is(a.subject)).group_by(AR.student_profile_id)
        att = {sid: (int(t), int(p)) for sid, t, p in q.all()}
        for r in db.query(RR).filter(RR.student_profile_id.in_(ids), RR.semester == a.semester,
                                     func.lower(func.trim(RR.subject)) == a.subject.strip().lower()).all():
            internal[r.student_profile_id] = r.internal_marks

    tasks = db.query(Task).join(L, L.assignment_id == Task.id).filter(L.class_id == a.id).order_by(Task.due_at).all()
    expected = [t for t in tasks if _aware(t.due_at) <= now]
    subs = {}
    if tasks and ids:
        for s in db.query(Sub).filter(Sub.assignment_id.in_([t.id for t in tasks]), Sub.student_profile_id.in_(ids)).all():
            subs[(s.student_profile_id, s.assignment_id)] = s

    rows = []
    for p in students:
        t, pr = att.get(p.id, (0, 0))
        att_pct = round(pr * 100 / t, 1) if t else None
        im = internal.get(p.id)
        int_pct = round(im * 100 / INTERNAL_MAX, 1) if im is not None else None

        scores, submitted = [], 0
        for tk in expected:
            s = subs.get((p.id, tk.id))
            if s:
                submitted += 1
                if s.marks is not None and tk.max_marks:
                    scores.append(s.marks * 100 / tk.max_marks)
            else:
                scores.append(0.0)
        asg_score = round(sum(scores) / len(scores), 1) if scores else None
        rate = round(submitted * 100 / len(expected), 1) if expected else None

        comps = {"attendance": att_pct, "internal": int_pct, "assignment": asg_score}
        avail = {k: v for k, v in comps.items() if v is not None}
        score = round(sum(v * WEIGHTS[k] for k, v in avail.items()) / sum(WEIGHTS[k] for k in avail), 1) if avail else None

        flags = []
        if att_pct is not None and att_pct < threshold:
            flags.append(f"Attendance of {att_pct}% is below the {threshold}% minimum")
        if int_pct is not None and int_pct < pass_pct:
            flags.append(f"Internal marks of {im:g}/{INTERNAL_MAX:g} are below the pass level")
        if (asg_score is not None and asg_score < pass_pct) or (rate is not None and rate < 50):
            flags.append("Low assignment scores or missing submissions")
        if not avail:
            level = "no_data"
        elif len(flags) >= 2 or (score is not None and score < pass_pct):
            level = "high"
        elif flags:
            level = "medium"
        else:
            level = "low"

        rows.append({
            "id": str(p.id), "name": p.name, "college_id": p.college_id,
            "attendance": {"pct": att_pct, "present": pr, "total": t},
            "internal": {"marks": im, "pct": int_pct},
            "assignment": {"score": asg_score, "rate": rate, "submitted": submitted, "expected": len(expected)},
            "score": score, "level": level, "flags": flags,
        })
    rows.sort(key=lambda r: r["name"].lower())

    summary = {
        "students": len(rows), "with_data": sum(1 for r in rows if r["score"] is not None),
        "avg_attendance": _avg([r["attendance"]["pct"] for r in rows]),
        "avg_internal": _avg([r["internal"]["pct"] for r in rows]),
        "avg_assignment": _avg([r["assignment"]["score"] for r in rows]),
        "avg_score": _avg([r["score"] for r in rows]),
        "high_risk": sum(1 for r in rows if r["level"] == "high"),
        "attention": sum(1 for r in rows if r["level"] == "medium"),
        "assignments_total": len(tasks), "assignments_due": len(expected),
    }
    data = {
        "class": _class_out(a),
        "settings": {"min_attendance_pct": threshold, "pass_pct": pass_pct, "internal_max": INTERNAL_MAX},
        "students": rows, "summary": summary,
        "distribution": {
            "attendance": _buckets([r["attendance"]["pct"] for r in rows], [50, 65, 75, 90], ["Below 50%", "50-64%", "65-74%", "75-89%", "90-100%"]),
            "internal": _buckets([r["internal"]["pct"] for r in rows], [40, 60, 75, 90], ["Below 40%", "40-59%", "60-74%", "75-89%", "90-100%"]),
        },
        "trend": _trend(db, a, ids),
    }
    return data, {"students": students, "tasks": tasks, "subs": subs, "now": now}


@router.get("/class")
def class_analytics(assignment_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, assignment_id)
    data, _ctx = _analyze(db, a)
    return data


@router.get("/subjects")
def subjects(faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    items = []
    for a in db.query(FA).filter(FA.faculty_profile_id == faculty.id).order_by(FA.course, FA.semester, FA.subject).all():
        data, _ctx = _analyze(db, a)
        items.append({"id": str(a.id), "label": f"{a.course} - Sem {a.semester}", "subject": a.subject, **data["summary"]})
    return {"items": items}


@router.get("/student")
def student_detail(assignment_id: str, student_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, assignment_id)
    data, ctx = _analyze(db, a)
    row = next((r for r in data["students"] if r["id"] == student_id), None)
    if not row:
        raise HTTPException(status_code=403, detail="This student is not in your class.")
    sid = next(p.id for p in ctx["students"] if str(p.id) == student_id)
    tasks = []
    for t in ctx["tasks"]:
        s = ctx["subs"].get((sid, t.id))
        if s:
            status = "graded" if s.marks is not None else "submitted"
        else:
            status = "missing" if _aware(t.due_at) <= ctx["now"] else "pending"
        tasks.append({"id": str(t.id), "title": t.title, "max_marks": t.max_marks, "due_at": t.due_at.isoformat(),
                      "status": status, "marks": s.marks if s else None, "late": bool(s and s.is_late)})
    return {"student": row, "attendance_trend": _trend(db, a, [sid], sid), "assignments": tasks, "settings": data["settings"]}


@router.get("/export")
def export(assignment_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, assignment_id)
    data, _ctx = _analyze(db, a)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([f"Student performance - {a.course} Sem {a.semester} - {a.subject}"])
    w.writerow(["College ID", "Student", "Attendance %", "Classes attended", "Classes held", f"Internal marks (/{INTERNAL_MAX:g})",
                "Assignment score %", "Submission rate %", "Overall score", "Status", "Notes"])
    labels = {"high": "High risk", "medium": "Needs attention", "low": "On track", "no_data": "No data"}
    for r in data["students"]:
        w.writerow([_safe(r["college_id"]), _safe(r["name"]), r["attendance"]["pct"] if r["attendance"]["pct"] is not None else "",
                    r["attendance"]["present"], r["attendance"]["total"], r["internal"]["marks"] if r["internal"]["marks"] is not None else "",
                    r["assignment"]["score"] if r["assignment"]["score"] is not None else "",
                    r["assignment"]["rate"] if r["assignment"]["rate"] is not None else "",
                    r["score"] if r["score"] is not None else "", labels[r["level"]], _safe("; ".join(r["flags"]))])
    fname = re.sub(r"[^A-Za-z0-9_-]+", "-", f"performance-{a.subject}").strip("-")
    return Response(content="\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{fname}.csv"'})