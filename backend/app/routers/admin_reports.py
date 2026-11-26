import csv
import io
import re
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from .admin_common import log_activity, require_admin
from .admin_fees import _paid_map, _totals
from .admin_settings import get_setting

router = APIRouter(prefix="/api/admin/reports", tags=["admin-reports"])

# Pass marks and the default minimum attendance come from Admin > Settings.

CATALOG = {
    "students": {"title": "Student Strength", "description": "Class-wise count of active and blocked students.", "filters": ["course", "semester"]},
    "attendance": {"title": "Low Attendance", "description": "Students whose attendance is below the minimum percentage.", "filters": ["course", "semester", "threshold", "dates"]},
    "fees": {"title": "Fee Collection", "description": "Class-wise fee billed, collected and outstanding.", "filters": ["course", "semester"]},
    "defaulters": {"title": "Fee Defaulters", "description": "Students with an overdue fee balance.", "filters": ["course", "semester"]},
    "results": {"title": "Result Analysis", "description": "Subject-wise average marks and pass percentage.", "filters": ["course", "semester"]},
    "placement": {"title": "Placement Summary", "description": "Company-wise drives, applications, selections and offers.", "filters": []},
    "library": {"title": "Library Usage", "description": "Category-wise books, issues and overdue copies.", "filters": []},
    "complaints": {"title": "Complaints Summary", "description": "Category-wise complaints, status and average rating.", "filters": ["dates"]},
}


def _key(s) -> str:
    return "".join(str(s or "").lower().split())


def _sem_num(s) -> Optional[int]:
    m = re.search(r"\d+", str(s or ""))
    return int(m.group()) if m else None


def _col(key, label, kind="text"):
    return {"key": key, "label": label, "type": kind}


def _sum(label, value, kind="number"):
    return {"label": label, "value": value, "type": kind}


def _pct(a, b):
    return round(a * 100 / b, 1) if b else 0


def _active(u) -> bool:
    return str(u.is_active).lower() != "false"


def _in_scope(f, course_text, sem) -> bool:
    if f.course and _key(course_text) != f.course.name_key:
        return False
    if f.semester and sem != f.semester:
        return False
    return True


# --------------------------------- builders ---------------------------------
def _students(db, f):
    P, U = models.StudentProfile, models.User
    groups = {}
    for p, u in db.query(P, U).join(U, U.id == P.user_id).all():
        n = _sem_num(p.semester)
        if not _in_scope(f, p.course, n):
            continue
        g = groups.setdefault((_key(p.course), n), {"course": p.course or "(not set)", "semester": n if n is not None else "-", "total": 0, "active": 0, "blocked": 0})
        g["total"] += 1
        g["active" if _active(u) else "blocked"] += 1
    rows = sorted(groups.values(), key=lambda r: (r["course"].lower(), r["semester"] if isinstance(r["semester"], int) else 99))
    cols = [_col("course", "Course"), _col("semester", "Semester"), _col("total", "Students", "number"), _col("active", "Active", "number"), _col("blocked", "Blocked", "number")]
    summary = [_sum("Total students", sum(r["total"] for r in rows)), _sum("Active", sum(r["active"] for r in rows)), _sum("Blocked", sum(r["blocked"] for r in rows))]
    return cols, rows, summary


def _attendance(db, f):
    R, P, U = models.AttendanceRecord, models.StudentProfile, models.User
    q = db.query(R.student_profile_id, func.count(R.id), func.coalesce(func.sum(case((R.status == "present", 1), else_=0)), 0)).group_by(R.student_profile_id)
    if f.start:
        q = q.filter(R.date >= f.start)
    if f.end:
        q = q.filter(R.date <= f.end)
    agg = {sid: (int(t), int(pr)) for sid, t, pr in q.all()}
    people = {p.id: (p, u) for p, u in db.query(P, U).join(U, U.id == P.user_id).all()}
    rows, with_data, sum_p, sum_t = [], 0, 0, 0
    for sid, (t, pr) in agg.items():
        if sid not in people:
            continue
        p, u = people[sid]
        n = _sem_num(p.semester)
        if not _active(u) or not _in_scope(f, p.course, n):
            continue
        with_data += 1
        sum_p += pr
        sum_t += t
        pct = _pct(pr, t)
        if pct < f.threshold:
            rows.append({"name": p.name, "college_id": p.college_id, "course": p.course, "semester": n if n is not None else "-", "present": pr, "total": t, "pct": pct})
    rows.sort(key=lambda r: r["pct"])
    cols = [_col("name", "Student"), _col("college_id", "College ID"), _col("course", "Course"), _col("semester", "Semester"),
            _col("present", "Present", "number"), _col("total", "Classes", "number"), _col("pct", "Attendance %", "percent")]
    summary = [_sum("Students with data", with_data), _sum(f"Below {f.threshold}%", len(rows)), _sum("Overall attendance", _pct(sum_p, sum_t), "percent")]
    return cols, rows, summary


def _fee_students(db, f):
    """One dict per (student, class that has fees)."""
    P, U = models.StudentProfile, models.User
    studs = {}
    for p, u in db.query(P, U).join(U, U.id == P.user_id).all():
        n = _sem_num(p.semester)
        if n is not None and _active(u):
            studs.setdefault((_key(p.course), n), []).append(p)
    items = {}
    for it in db.query(models.FeeItem).all():
        n = _sem_num(it.semester)
        if n is not None:
            items.setdefault((_key(it.course), n), []).append(it)
    paid = _paid_map(db)
    today = date.today()
    out = []
    for k, its in items.items():
        if not _in_scope(f, its[0].course, k[1]):
            continue
        for p in studs.get(k, []):
            out.append({"student": p, "course": its[0].course, "semester": k[1], **_totals(p.id, its, paid, today)})
    return out


def _fees(db, f):
    classes = {}
    for r in _fee_students(db, f):
        g = classes.setdefault((r["course"], r["semester"]), {"course": r["course"], "semester": r["semester"], "students": 0, "billed": 0, "collected": 0, "outstanding": 0})
        g["students"] += 1
        g["billed"] += r["total"]
        g["collected"] += r["paid"]
        g["outstanding"] += r["balance"]
    rows = sorted(classes.values(), key=lambda r: (r["course"].lower(), r["semester"]))
    for r in rows:
        r["pct"] = _pct(r["collected"], r["billed"])
    billed, coll = sum(r["billed"] for r in rows), sum(r["collected"] for r in rows)
    cols = [_col("course", "Course"), _col("semester", "Semester"), _col("students", "Students", "number"), _col("billed", "Billed (Rs)", "money"),
            _col("collected", "Collected (Rs)", "money"), _col("outstanding", "Outstanding (Rs)", "money"), _col("pct", "Collected %", "percent")]
    summary = [_sum("Billed", billed, "money"), _sum("Collected", coll, "money"), _sum("Outstanding", billed - coll, "money"), _sum("Collection", _pct(coll, billed), "percent")]
    return cols, rows, summary


def _defaulters(db, f):
    rows = []
    for r in _fee_students(db, f):
        if r["overdue"] > 0:
            p = r["student"]
            rows.append({"name": p.name, "college_id": p.college_id, "course": r["course"], "semester": r["semester"], "overdue": r["overdue"], "balance": r["balance"]})
    rows.sort(key=lambda r: -r["overdue"])
    cols = [_col("name", "Student"), _col("college_id", "College ID"), _col("course", "Course"), _col("semester", "Semester"),
            _col("overdue", "Overdue (Rs)", "money"), _col("balance", "Total balance (Rs)", "money")]
    summary = [_sum("Defaulters", len(rows)), _sum("Overdue amount", sum(r["overdue"] for r in rows), "money")]
    return cols, rows, summary


def _results(db, f):
    R, P = models.ResultRecord, models.StudentProfile
    pass_marks = get_setting(db, "pass_marks")
    groups = {}
    for r, p in db.query(R, P).join(P, P.id == R.student_profile_id).all():
        if r.internal_marks is None or r.external_marks is None or not _in_scope(f, p.course, r.semester):
            continue
        total = r.internal_marks + r.external_marks
        g = groups.setdefault((_key(p.course), r.semester, _key(r.subject)), {"course": p.course or "(not set)", "semester": r.semester, "subject": r.subject, "marks": [], "published": 0})
        g["marks"].append(total)
        g["published"] += 1 if r.published else 0
    rows = []
    for g in groups.values():
        m = g["marks"]
        rows.append({"course": g["course"], "semester": g["semester"], "subject": g["subject"], "students": len(m), "avg": round(sum(m) / len(m), 1),
                     "highest": max(m), "lowest": min(m), "pass_pct": _pct(sum(1 for x in m if x >= pass_marks), len(m)), "published": g["published"]})
    rows.sort(key=lambda r: (r["course"].lower(), r["semester"], r["subject"].lower()))
    cols = [_col("course", "Course"), _col("semester", "Semester"), _col("subject", "Subject"), _col("students", "Students", "number"), _col("avg", "Average", "number"),
            _col("highest", "Highest", "number"), _col("lowest", "Lowest", "number"), _col("pass_pct", "Pass %", "percent"), _col("published", "Published", "number")]
    n = sum(r["students"] for r in rows)
    passed = sum(r["students"] * r["pass_pct"] / 100 for r in rows)
    summary = [_sum("Subjects", len(rows)), _sum("Marks entries", n), _sum(f"Overall pass % (>= {pass_marks}/100)", _pct(passed, n), "percent")]
    return cols, rows, summary


def _placement(db, f):
    C, D, A, O = models.PlacementCompany, models.PlacementDrive, models.PlacementApplication, models.PlacementOffer
    drives = db.query(D).all()
    by_company = {}
    for d in drives:
        by_company.setdefault(d.company_id, []).append(d.id)
    apps = {}
    for did, st, n in db.query(A.drive_id, A.status, func.count(A.id)).group_by(A.drive_id, A.status).all():
        apps.setdefault(did, {})[st] = n
    offers = db.query(O).all()
    rows = []
    for c in db.query(C).order_by(C.name).all():
        ids = by_company.get(c.id, [])
        a = [apps.get(i, {}) for i in ids]
        mine = [o for o in offers if _key(o.company_name) == _key(c.name)]
        rows.append({"company": c.name, "drives": len(ids), "applications": sum(sum(x.values()) for x in a), "selected": sum(x.get("selected", 0) for x in a),
                     "offers": len(mine), "accepted": sum(1 for o in mine if o.status == "accepted"), "highest": max((o.package_lpa for o in mine), default=0)})
    cols = [_col("company", "Company"), _col("drives", "Drives", "number"), _col("applications", "Applications", "number"), _col("selected", "Selected", "number"),
            _col("offers", "Offers", "number"), _col("accepted", "Accepted", "number"), _col("highest", "Highest (LPA)", "number")]
    pk = [o.package_lpa for o in offers]
    summary = [_sum("Companies", len(rows)), _sum("Students with offers", len({o.student_profile_id for o in offers})),
               _sum("Highest package (LPA)", max(pk, default=0)), _sum("Average package (LPA)", round(sum(pk) / len(pk), 2) if pk else 0)]
    return cols, rows, summary


def _library(db, f):
    B, M, I = models.LibraryBook, models.AdminLibraryBookMeta, models.LibraryIssue
    today = date.today()
    cats = {}
    books = {}
    for b, m in db.query(B, M).outerjoin(M, M.book_id == B.id).all():
        name = b.category or "Uncategorised"
        g = cats.setdefault(name, {"category": name, "titles": 0, "copies": 0, "issued": 0, "overdue": 0, "total_issues": 0})
        g["titles"] += 1
        g["copies"] += m.copies if m else 1
        books[b.id] = name
    fines = 0
    for i in db.query(I).all():
        fines += i.fine_paid or 0
        g = cats.get(books.get(i.book_id))
        if not g:
            continue
        g["total_issues"] += 1
        if i.returned_on is None:
            g["issued"] += 1
            if i.due_on < today:
                g["overdue"] += 1
    rows = sorted(cats.values(), key=lambda r: r["category"].lower())
    cols = [_col("category", "Category"), _col("titles", "Titles", "number"), _col("copies", "Copies", "number"), _col("issued", "Issued now", "number"),
            _col("overdue", "Overdue", "number"), _col("total_issues", "Total issues (all time)", "number")]
    summary = [_sum("Titles", sum(r["titles"] for r in rows)), _sum("Issued now", sum(r["issued"] for r in rows)),
               _sum("Overdue", sum(r["overdue"] for r in rows)), _sum("Fines collected", fines, "money")]
    return cols, rows, summary


def _complaints(db, f):
    C = models.Complaint
    cats = {}
    for c in db.query(C).all():
        d = c.created_at.date() if c.created_at else None
        if (f.start and (d is None or d < f.start)) or (f.end and (d is None or d > f.end)):
            continue
        g = cats.setdefault(c.category, {"category": c.category, "total": 0, "pending": 0, "in_progress": 0, "resolved": 0, "ratings": []})
        g["total"] += 1
        if c.status in g:
            g[c.status] += 1
        if c.rating:
            g["ratings"].append(c.rating)
    rows = []
    for g in sorted(cats.values(), key=lambda x: x["category"].lower()):
        r = g.pop("ratings")
        g["rating"] = round(sum(r) / len(r), 1) if r else "-"
        g["resolved_pct"] = _pct(g["resolved"], g["total"])
        rows.append(g)
    cols = [_col("category", "Category"), _col("total", "Total", "number"), _col("pending", "Pending", "number"), _col("in_progress", "In progress", "number"),
            _col("resolved", "Resolved", "number"), _col("resolved_pct", "Resolved %", "percent"), _col("rating", "Avg rating", "number")]
    summary = [_sum("Complaints", sum(r["total"] for r in rows)), _sum("Pending", sum(r["pending"] for r in rows)), _sum("Resolved", sum(r["resolved"] for r in rows))]
    return cols, rows, summary


BUILDERS = {"students": _students, "attendance": _attendance, "fees": _fees, "defaulters": _defaulters, "results": _results,
            "placement": _placement, "library": _library, "complaints": _complaints}


def _run(db: Session, key, course_id, semester, threshold, start, end):
    if key not in BUILDERS:
        raise HTTPException(status_code=404, detail="Ye report maujood nahi hai.")
    if threshold is None:
        threshold = get_setting(db, "min_attendance_pct")
    if start and end and start > end:
        raise HTTPException(status_code=400, detail="The start date must be on or before the end date.")
    course = None
    if course_id:
        try:
            cid = uuid.UUID(course_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Course sahi nahi hai.")
        course = db.query(models.AdminCourse).filter(models.AdminCourse.id == cid).first()
        if not course:
            raise HTTPException(status_code=400, detail="Ye course nahi mila.")
    f = SimpleNamespace(course=course, semester=semester, threshold=threshold, start=start, end=end)
    cols, rows, summary = BUILDERS[key](db, f)
    return {"key": key, "title": CATALOG[key]["title"], "columns": cols, "rows": rows, "summary": summary,
            "generated_on": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}


@router.get("/catalog")
def catalog(admin=Depends(require_admin)):
    return {"items": [{"key": k, **v} for k, v in CATALOG.items()]}


@router.get("/{key}")
def report(key: str, course_id: Optional[str] = None, semester: Optional[int] = Query(None, ge=1, le=12),
           threshold: Optional[int] = Query(None, ge=1, le=100), start: Optional[date] = None, end: Optional[date] = None,
           admin=Depends(require_admin), db: Session = Depends(get_db)):
    return _run(db, key, course_id, semester, threshold, start, end)


def _safe(v):
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@"):
        return "'" + v  # stops spreadsheet formula injection
    return v


@router.get("/{key}/export")
def export(key: str, course_id: Optional[str] = None, semester: Optional[int] = Query(None, ge=1, le=12),
           threshold: Optional[int] = Query(None, ge=1, le=100), start: Optional[date] = None, end: Optional[date] = None,
           admin=Depends(require_admin), db: Session = Depends(get_db)):
    data = _run(db, key, course_id, semester, threshold, start, end)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([c["label"] for c in data["columns"]])
    for r in data["rows"]:
        w.writerow([_safe(r.get(c["key"], "")) for c in data["columns"]])
    log_activity(db, admin, "report.export", f"Report exported: {data['title']} ({len(data['rows'])} rows)")
    return Response(
        content="\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{key}-report-{date.today().isoformat()}.csv"'},
    )