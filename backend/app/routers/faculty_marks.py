import csv
import io
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.notify import notify
from .faculty_common import my_assignment, norm, require_faculty, students_by_class

router = APIRouter(prefix="/api/faculty/marks", tags=["faculty-marks"])

# Internal marks are entered in these parts; their sum is stored in result_records.internal_marks (out of 40).
COMPONENTS = [("internal_test", "Internal Test", 20), ("practical", "Practical", 10), ("assignment", "Assignment", 5), ("viva", "Viva", 5)]
INTERNAL_MAX = 40
EXTERNAL_MAX = 60
DEFAULT_CREDITS = 4  # used only when the syllabus has no credits for the subject and no result row exists yet
assert sum(c[2] for c in COMPONENTS) == INTERNAL_MAX
MAXES = {k: m for k, _l, m in COMPONENTS}


def _students(db: Session, a):
    g = students_by_class(db).get((norm(a.course), a.semester))
    return g["students"] if g else []


def _records(db: Session, a, ids):
    R = models.ResultRecord
    if not ids:
        return {}
    rows = db.query(R).filter(R.student_profile_id.in_(ids), R.semester == a.semester,
                              func.lower(func.replace(R.subject, " ", "")) == norm(a.subject)).all()
    return {r.student_profile_id: r for r in rows}


def _parts(db: Session, a, ids):
    P = models.FacultyMarkPart
    out = {}
    if ids:
        for p in db.query(P).filter(P.student_profile_id.in_(ids), P.semester == a.semester, P.subject_key == norm(a.subject)).all():
            out.setdefault(p.student_profile_id, {})[p.component] = p
    return out


def _actor(faculty):
    """entered_by may be text or UUID; fill whichever it is."""
    col = models.ResultRecord.__table__.c.entered_by
    try:
        py = col.type.python_type
    except NotImplementedError:
        py = str
    return faculty.id if py is uuid.UUID else faculty.faculty_name


def _credits(db: Session, a) -> int:
    S = getattr(models, "SyllabusSubject", None)  # admin syllabus table; skipped if the model name differs
    if S is not None:
        try:
            for s in db.query(S).filter(S.semester == a.semester).all():
                if norm(s.name) == norm(a.subject) and getattr(s, "credits", None):
                    return int(s.credits)
        except Exception:
            db.rollback()
    return DEFAULT_CREDITS


def _uuid(v):
    try:
        return uuid.UUID(str(v))
    except ValueError:
        raise HTTPException(status_code=400, detail="Student sahi nahi hai. Page refresh karo.")


def _class_out(a) -> dict:
    return {"id": str(a.id), "course": a.course, "semester": a.semester, "subject": a.subject, "is_sample": bool(a.is_sample)}


@router.get("/sheet")
def sheet(assignment_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, assignment_id)
    students = _students(db, a)
    ids = [p.id for p in students]
    recs, parts = _records(db, a, ids), _parts(db, a, ids)
    items = []
    for p in students:
        r, mine = recs.get(p.id), parts.get(p.id, {})
        items.append({
            "id": str(p.id), "name": p.name, "college_id": p.college_id,
            "parts": {k: (mine[k].marks if k in mine else None) for k, _l, _m in COMPONENTS},
            "internal": r.internal_marks if r else None, "external": r.external_marks if r else None,
            "published": bool(r.published) if r else False,
            "legacy": bool(r and r.internal_marks is not None and not mine),  # internal total exists without parts
        })
    return {
        "class": _class_out(a), "components": [{"key": k, "label": l, "max": m} for k, l, m in COMPONENTS],
        "internal_max": INTERNAL_MAX, "external_max": EXTERNAL_MAX, "items": items,
        "summary": {"students": len(items), "entered": sum(1 for i in items if i["internal"] is not None), "published": sum(1 for i in items if i["published"])},
    }


@router.put("/save")
def save(payload: schemas.FacultyMarksSaveIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, payload.assignment_id)
    students = {p.id: p for p in _students(db, a)}
    ids = list(students)
    recs, parts = _records(db, a, ids), _parts(db, a, ids)

    clean = {}
    for row in payload.rows:
        sid = _uuid(row.student_id)
        p = students.get(sid)
        if p is None:
            raise HTTPException(status_code=400, detail="Kuch students is class ke nahi hain. Page refresh karo.")
        if sid in clean:
            raise HTTPException(status_code=400, detail="Ek student do baar aa gaya hai.")
        if recs.get(sid) is not None and recs[sid].published:
            raise HTTPException(status_code=400, detail=f"{p.name} ke marks publish ho chuke hain. Pehle Unpublish karo.")
        entered = {}
        for key, value in row.parts.items():
            if key not in MAXES:
                raise HTTPException(status_code=400, detail=f"'{key}' naam ka koi marks part nahi hai.")
            if value is None:
                continue
            if value < 0 or value > MAXES[key]:
                raise HTTPException(status_code=400, detail=f"{p.name}: {key} ke marks 0 se {MAXES[key]} ke beech hone chahiye.")
            entered[key] = value
        if entered:
            clean[sid] = entered

    if not clean:
        raise HTTPException(status_code=400, detail="Koi marks bhare nahi gaye. Kam se kam ek student ke marks daalo.")

    P, R = models.FacultyMarkPart, models.ResultRecord
    now = datetime.now(timezone.utc)
    credits = None
    saved = 0
    for sid, entered in clean.items():
        mine = parts.setdefault(sid, {})
        for key, value in entered.items():
            if key in mine:
                mine[key].marks, mine[key].entered_by, mine[key].updated_at = value, faculty.id, now
            else:
                part = P(student_profile_id=sid, semester=a.semester, subject_key=norm(a.subject), component=key, marks=value, entered_by=faculty.id)
                db.add(part)
                mine[key] = part
        total = sum(p.marks for p in mine.values())
        r = recs.get(sid)
        if r is None:
            if credits is None:
                credits = _credits(db, a)
            r = R(student_profile_id=sid, semester=a.semester, subject=a.subject, credits=credits,
                  internal_marks=total, external_marks=None, published=False, entered_by=_actor(faculty))
            db.add(r)
        else:
            r.internal_marks = total
            r.entered_by = _actor(faculty)
        saved += 1
    db.commit()
    return {"saved": saved}


@router.post("/publish")
def publish(payload: schemas.FacultyMarksPublishIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, payload.assignment_id)
    students = _students(db, a)
    if not students:
        raise HTTPException(status_code=400, detail="Is class me koi student nahi hai.")
    recs = _records(db, a, [p.id for p in students])
    missing = [p for p in students if recs.get(p.id) is None or recs[p.id].internal_marks is None]
    if missing:
        raise HTTPException(status_code=400, detail=f"{len(missing)} students ke internal marks baaki hain. Pehle saare marks bharo aur Save karo.")
    n = 0
    for p in students:
        r = recs[p.id]
        if not r.published:
            r.published = True
            notify(db, p.id, "results", "Internal marks publish hue", f"{a.subject}: aapke internal marks publish ho gaye hain.", "results")
            n += 1
    db.commit()
    return {"published": n}


@router.post("/unpublish")
def unpublish(payload: schemas.FacultyMarksPublishIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, payload.assignment_id)
    recs = _records(db, a, [p.id for p in _students(db, a)])
    n = 0
    for r in recs.values():
        if r.published:
            r.published = False
            n += 1
    if n == 0:
        raise HTTPException(status_code=400, detail="Is class ke koi marks publish nahi hain.")
    db.commit()
    return {"unpublished": n}


def _safe(v):
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@"):
        return "'" + v  # stops spreadsheet formula injection
    return v


@router.get("/export")
def export(assignment_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, assignment_id)
    students = _students(db, a)
    ids = [p.id for p in students]
    recs, parts = _records(db, a, ids), _parts(db, a, ids)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([f"{a.course} Sem {a.semester} - {a.subject}"])
    w.writerow(["College ID", "Student"] + [f"{l} (/{m})" for _k, l, m in COMPONENTS] + [f"Internal (/{INTERNAL_MAX})", f"External (/{EXTERNAL_MAX})", "Total (/100)", "Status"])
    for p in students:
        r, mine = recs.get(p.id), parts.get(p.id, {})
        internal = r.internal_marks if r else None
        external = r.external_marks if r else None
        total = internal + external if internal is not None and external is not None else None
        w.writerow([_safe(p.college_id), _safe(p.name)] + [mine[k].marks if k in mine else "" for k, _l, _m in COMPONENTS]
                   + ["" if internal is None else internal, "" if external is None else external, "" if total is None else total,
                      "Published" if r and r.published else ("Saved" if internal is not None else "Pending")])
    fname = re.sub(r"[^A-Za-z0-9_-]+", "-", f"marks-{a.subject}").strip("-")
    return Response(content="\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{fname}.csv"'})