import csv
import hashlib
import io
import re
import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..schemas import FacultyPlanLinkIn, FacultyPlanTopicsIn, FacultyPlanUnitIn
from .faculty_attendance import _class_out, _safe
from .faculty_common import my_assignment, norm, require_faculty
from .faculty_qr import IST

router = APIRouter(prefix="/api/faculty/planner", tags=["faculty-planner"])

S = models.SyllabusSubject
U = models.SyllabusUnit
PL = models.FacultyPlanLink
PU = models.FacultyPlanUnit
PT = models.FacultyPlanTopic


def _today() -> date:
    return datetime.now(IST).date()


def _key(text: str) -> str:
    return hashlib.sha1(text.strip().encode("utf-8")).hexdigest()[:12]


def _topics(u) -> list:
    """[(key, text)] - syllabus unit ke topics (har line ek topic), duplicate hata kar."""
    seen, out = set(), []
    for line in (u.topics or "").splitlines():
        t = line.strip()
        if not t:
            continue
        k = _key(t)
        if k not in seen:
            seen.add(k)
            out.append((k, t))
    return out


def _uuid(v, msg="Nahi mila."):
    try:
        return uuid.UUID(str(v))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _iso(v):
    return v.isoformat() if v else None


def _subject_for(db: Session, a):
    link = db.query(PL).filter(PL.assignment_id == a.id).first()
    if link:
        s = db.query(S).filter(S.id == link.subject_id).first()
        if s:
            return s, "manual"
    ck, sk = norm(a.course), norm(a.subject)
    for s in db.query(S).filter(S.semester == a.semester).all():
        if norm(s.course) == ck and sk in (norm(s.name), norm(s.code)):
            return s, "auto"
    return None, None


def _available(db: Session, a) -> list:
    ck = norm(a.course)
    return [{"id": str(s.id), "code": s.code, "name": s.name}
            for s in db.query(S).filter(S.semester == a.semester).order_by(S.code).all() if norm(s.course) == ck]


def _build(db: Session, a) -> Optional[dict]:
    s, how = _subject_for(db, a)
    if not s:
        return None
    units = db.query(U).filter(U.subject_id == s.id).order_by(U.unit_no).all()
    done = {(r.unit_id, r.topic_key): r for r in db.query(PT).filter(PT.assignment_id == a.id).all()}
    plans = {p.unit_id: p for p in db.query(PU).filter(PU.assignment_id == a.id).all()}
    today = _today()

    out, t_total, t_done, units_done, expected = [], 0, 0, 0, 0
    h_total, h_done, has_plan, behind = 0.0, 0.0, False, []
    for u in units:
        tops = _topics(u)
        marks = [done.get((u.id, k)) for k, _t in tops]
        n_done, total = sum(1 for m in marks if m), len(tops)
        p = plans.get(u.id)
        ps, pe = (p.planned_start, p.planned_end) if p else (None, None)
        has_plan = has_plan or bool(ps or pe)
        status = "done" if total and n_done == total else ("in_progress" if n_done else "pending")
        if status != "done" and pe and pe < today:
            status = "behind"
            behind.append(u.unit_no)
        if status == "done":
            units_done += 1
        if pe and pe <= today:
            expected += total
        t_total += total
        t_done += n_done
        hrs = u.hours or 0
        h_total += hrs
        if total:
            h_done += hrs * n_done / total
        out.append({
            "id": str(u.id), "unit_no": u.unit_no, "title": u.title, "hours": u.hours,
            "planned_start": _iso(ps), "planned_end": _iso(pe), "status": status, "done": n_done, "total": total,
            "topics": [{"key": k, "text": t, "done": bool(m), "done_on": _iso(m.done_on) if m else None} for (k, t), m in zip(tops, marks)],
        })
    return {
        "matched": True, "how": how, "class": _class_out(a),
        "subject": {"id": str(s.id), "code": s.code, "name": s.name},
        "units": out,
        "summary": {
            "topics_total": t_total, "topics_done": t_done,
            "pct": round(t_done * 100 / t_total, 1) if t_total else 0,
            "hours_total": round(h_total, 1), "hours_done": round(h_done, 1),
            "units_total": len(units), "units_done": units_done, "behind": behind,
            "expected_pct": round(expected * 100 / t_total, 1) if has_plan and t_total else None,
        },
    }


def completion(db: Session, a) -> Optional[dict]:
    """Dusre modules (jaise Faculty Performance) ke liye: syllabus completion summary ya None."""
    d = _build(db, a)
    return d["summary"] if d else None


def _unit(db: Session, s, unit_id: str):
    u = db.query(U).filter(U.id == _uuid(unit_id, "Unit nahi mili."), U.subject_id == s.id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Unit nahi mili.")
    return u


def _need_subject(db: Session, a):
    s, _how = _subject_for(db, a)
    if not s:
        raise HTTPException(status_code=400, detail="Is class ko pehle syllabus subject se jodo.")
    return s


@router.get("")
def planner(assignment_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, assignment_id)
    d = _build(db, a)
    if d is None:
        return {"matched": False, "class": _class_out(a), "available": _available(db, a)}
    return d


@router.post("/link")
def link(body: FacultyPlanLinkIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, body.assignment_id)
    s = db.query(S).filter(S.id == _uuid(body.subject_id, "Subject nahi mila.")).first()
    if not s or norm(s.course) != norm(a.course) or s.semester != a.semester:
        raise HTTPException(status_code=400, detail="Ye subject is class ke course/semester ka nahi hai.")
    row = db.query(PL).filter(PL.assignment_id == a.id).first()
    if row:
        row.subject_id = s.id
    else:
        db.add(PL(assignment_id=a.id, subject_id=s.id))
    db.commit()
    return {"ok": True}


@router.delete("/link")
def unlink(assignment_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, assignment_id)
    db.query(PL).filter(PL.assignment_id == a.id).delete(synchronize_session=False)
    db.commit()
    return {"ok": True}


@router.put("/unit-plan")
def unit_plan(body: FacultyPlanUnitIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, body.assignment_id)
    u = _unit(db, _need_subject(db, a), body.unit_id)
    if body.planned_start and body.planned_end and body.planned_start > body.planned_end:
        raise HTTPException(status_code=400, detail="Start date end date se pehle honi chahiye.")
    row = db.query(PU).filter(PU.assignment_id == a.id, PU.unit_id == u.id).first()
    if not row:
        row = PU(assignment_id=a.id, unit_id=u.id)
        db.add(row)
    row.planned_start, row.planned_end = body.planned_start, body.planned_end
    db.commit()
    return {"ok": True}


@router.post("/topics")
def set_topics(body: FacultyPlanTopicsIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, body.assignment_id)
    u = _unit(db, _need_subject(db, a), body.unit_id)
    text = dict(_topics(u))
    keys = list(dict.fromkeys(body.keys))
    if any(k not in text for k in keys):
        raise HTTPException(status_code=400, detail="Topic syllabus se match nahi karta (syllabus badal gaya hoga). Page refresh karo.")
    when = body.done_on or _today()
    if when > _today():
        raise HTTPException(status_code=400, detail="Aage ki date nahi chun sakte.")
    existing = {r.topic_key: r for r in db.query(PT).filter(PT.assignment_id == a.id, PT.unit_id == u.id, PT.topic_key.in_(keys)).all()}
    if body.done:
        for k in keys:
            if k not in existing:
                db.add(PT(assignment_id=a.id, unit_id=u.id, topic_key=k, topic=text[k][:500], done_on=when))
    else:
        for r in existing.values():
            db.delete(r)
    db.commit()
    return {"ok": True}


@router.get("/export")
def export(assignment_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, assignment_id)
    d = _build(db, a)
    if d is None:
        raise HTTPException(status_code=400, detail="Is class ko pehle syllabus subject se jodo.")
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([f"Course planner - {a.course} Sem {a.semester} - {d['subject']['name']} ({d['subject']['code']})"])
    w.writerow(["Syllabus complete %", d["summary"]["pct"]])
    w.writerow([])
    w.writerow(["Unit", "Unit title", "Planned start", "Planned end", "Topic", "Status", "Done on"])
    for u in d["units"]:
        for t in u["topics"]:
            w.writerow([u["unit_no"], _safe(u["title"]), u["planned_start"] or "", u["planned_end"] or "", _safe(t["text"]),
                        "Done" if t["done"] else "Baaki", t["done_on"] or ""])
    fname = re.sub(r"[^A-Za-z0-9_-]+", "-", f"planner-{d['subject']['code']}").strip("-")
    return Response(content="\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{fname}.csv"'})