import os
import re
import uuid
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from .admin_common import log_activity, require_admin

router = APIRouter(prefix="/api/admin/attendance", tags=["admin-attendance"])


def _key(s) -> str:
    return "".join(str(s or "").lower().split())


def _sem_num(s) -> Optional[int]:
    m = re.search(r"\d+", str(s or ""))
    return int(m.group()) if m else None


def _uuid(value, msg):
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _pct(p, t):
    return round(p * 100 / t, 1) if t else None


def _course(db: Session, course_id: str, semester: int):
    c = db.query(models.AdminCourse).filter(models.AdminCourse.id == _uuid(course_id, "Course nahi mila.")).first()
    if not c:
        raise HTTPException(status_code=400, detail="Ye course nahi mila.")
    if not 1 <= semester <= c.semesters:
        raise HTTPException(status_code=400, detail=f"Is course me sirf {c.semesters} semesters hain.")
    return c


def _students(db: Session, course, semester: int):
    P, U = models.StudentProfile, models.User
    rows = db.query(P, U).join(U, U.id == P.user_id).filter(func.lower(func.replace(P.course, " ", "")) == course.name_key).order_by(P.name).all()
    return [p for p, u in rows if _sem_num(p.semester) == semester and str(u.is_active).lower() != "false"]


def _records(db: Session, ids, start, end):
    if not ids:
        return []
    R = models.AttendanceRecord
    q = db.query(R.student_profile_id, R.subject, R.status, R.date).filter(R.student_profile_id.in_(ids))
    if start:
        q = q.filter(R.date >= start)
    if end:
        q = q.filter(R.date <= end)
    return q.all()


def _check_range(start, end):
    if start and end and start > end:
        raise HTTPException(status_code=400, detail="Start date end date se pehle honi chahiye.")


@router.get("/overview")
def overview(
    course_id: str,
    semester: int = Query(..., ge=1, le=12),
    threshold: int = Query(75, ge=1, le=100),
    start: Optional[date] = None,
    end: Optional[date] = None,
    search: Optional[str] = Query(None, max_length=80),
    status: Optional[str] = Query(None, pattern="^(low|ok|no_data)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    _check_range(start, end)
    course = _course(db, course_id, semester)
    students = _students(db, course, semester)
    recs = _records(db, [p.id for p in students], start, end)

    per = {p.id: {"p": 0, "t": 0, "sub": {}} for p in students}
    names, class_sub, daily = {}, {}, {}
    for sid, subject, st, d in recs:
        k = _key(subject)
        names.setdefault(k, subject)
        pr = 1 if st == "present" else 0
        s = per[sid]
        s["p"] += pr
        s["t"] += 1
        sp = s["sub"].setdefault(k, [0, 0])
        sp[0] += pr
        sp[1] += 1
        cs = class_sub.setdefault(k, [0, 0])
        cs[0] += pr
        cs[1] += 1
        dd = daily.setdefault(d, [0, 0])
        dd[0] += pr
        dd[1] += 1

    rows = []
    for p in students:
        s = per[p.id]
        pct = _pct(s["p"], s["t"])
        low_sub = None
        for k, (a, b) in s["sub"].items():
            sp = _pct(a, b)
            if low_sub is None or sp < low_sub[1]:
                low_sub = (names[k], sp)
        rows.append({
            "student_id": str(p.id), "name": p.name, "college_id": p.college_id, "present": s["p"], "total": s["t"], "pct": pct,
            "status": "no_data" if pct is None else ("low" if pct < threshold else "ok"),
            "lowest_subject": {"subject": low_sub[0], "pct": low_sub[1]} if low_sub else None,
        })

    subjects = []
    for k, (a, b) in sorted(class_sub.items(), key=lambda x: names[x[0]]):
        below = sum(1 for p in students if per[p.id]["sub"].get(k) and _pct(*per[p.id]["sub"][k]) < threshold)
        subjects.append({"subject": names[k], "pct": _pct(a, b), "records": b, "below": below})

    tp = sum(v["p"] for v in per.values())
    tt = sum(v["t"] for v in per.values())
    stats = {
        "students": len(students), "with_data": sum(1 for r in rows if r["total"]), "avg_pct": _pct(tp, tt),
        "below": sum(1 for r in rows if r["status"] == "low"), "subjects": len(subjects), "threshold": threshold,
    }
    trend = [{"date": d.isoformat(), "pct": _pct(*v), "records": v[1]} for d, v in sorted(daily.items())][-14:]

    if search:
        q = search.strip().lower()
        rows = [r for r in rows if q in (r["name"] or "").lower() or q in (r["college_id"] or "").lower()]
    if status:
        rows = [r for r in rows if r["status"] == status]
    rows.sort(key=lambda r: (r["pct"] is None, r["pct"] if r["pct"] is not None else 0))
    total = len(rows)
    rows = rows[(page - 1) * page_size: page * page_size]
    return {"stats": stats, "subjects": subjects, "trend": trend, "items": rows, "total": total, "page": page, "page_size": page_size}


@router.get("/student/{student_id}")
def student_detail(student_id: str, start: Optional[date] = None, end: Optional[date] = None,
                   admin=Depends(require_admin), db: Session = Depends(get_db)):
    _check_range(start, end)
    p = db.query(models.StudentProfile).filter(models.StudentProfile.id == _uuid(student_id, "Student nahi mila.")).first()
    if not p:
        raise HTTPException(status_code=404, detail="Student nahi mila.")
    recs = _records(db, [p.id], start, end)
    names, sub = {}, {}
    present = 0
    for _, subject, st, d in recs:
        k = _key(subject)
        names.setdefault(k, subject)
        s = sub.setdefault(k, [0, 0])
        s[1] += 1
        if st == "present":
            s[0] += 1
            present += 1
    recent = sorted(recs, key=lambda r: (r[3], r[1]), reverse=True)[:25]
    return {
        "student": {"id": str(p.id), "name": p.name, "college_id": p.college_id, "course": p.course, "semester": p.semester},
        "present": present, "total": len(recs), "pct": _pct(present, len(recs)),
        "subjects": [{"subject": names[k], "present": a, "total": b, "pct": _pct(a, b)} for k, (a, b) in sorted(sub.items(), key=lambda x: names[x[0]])],
        "recent": [{"date": d.isoformat(), "subject": s, "status": st} for _, s, st, d in recent],
    }


@router.post("/demo-seed")
def demo_seed(admin=Depends(require_admin), db: Session = Depends(get_db)):
    """SAMPLE attendance (last ~20 weekdays) for the first class with students + subjects and no attendance yet."""
    if os.getenv("ENABLE_DEMO_DATA", "").strip().lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai. backend\\.env me ENABLE_DEMO_DATA=true karke backend restart karo.")
    S, R = models.AdminSubject, models.AttendanceRecord
    for course in db.query(models.AdminCourse).filter(models.AdminCourse.is_active.is_(True)).order_by(models.AdminCourse.name).all():
        for sem in range(1, course.semesters + 1):
            students = _students(db, course, sem)[:40]
            subs = db.query(S).filter(S.course_id == course.id, S.semester == sem, S.is_active.is_(True)).order_by(S.name).limit(6).all()
            if not students or not subs or _records(db, [p.id for p in students], None, None):
                continue
            days, d = [], date.today() - timedelta(days=1)
            while len(days) < 20:
                if d.weekday() != 6:
                    days.append(d)
                d -= timedelta(days=1)
            rows = []
            for i, p in enumerate(students):
                mod = 3 if i % 4 == 0 else (7 if i % 4 == 1 else 11)
                for j, s in enumerate(subs):
                    for k, day in enumerate(days):
                        rows.append(R(student_profile_id=p.id, date=day, subject=s.name,
                                      status="absent" if (k + j) % mod == 0 else "present", marked_by="demo"))
            db.add_all(rows)
            db.commit()
            log_activity(db, admin, "attendance.demo", f"Sample attendance added: {course.name} sem {sem} ({len(rows)} records, demo data)")
            return {"added": len(rows), "message": f"{course.name} semester {sem}: {len(rows)} sample attendance records bane."}
    return {"added": 0, "message": "Sample ke liye aisi class chahiye jisme active students aur subjects ho, aur abhi attendance na ho."}