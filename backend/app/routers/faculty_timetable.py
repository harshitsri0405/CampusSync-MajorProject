import re
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from .faculty_common import norm, require_faculty, sem_num
from .faculty_qr import IST

router = APIRouter(prefix="/api/faculty/timetable", tags=["faculty-timetable"])

T = models.TimetableEntry
E = models.ExamScheduleEntry
A = models.FacultyAssignment

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
TITLES = {"dr", "prof", "professor", "mr", "mrs", "ms", "miss", "shri", "smt", "sir", "madam"}


def _words(s: Optional[str]) -> set:
    return {w for w in re.findall(r"[a-z]+", (s or "").lower()) if w not in TITLES}


def _is_me(entry_name: Optional[str], fac_name: Optional[str], fac_id: Optional[str]):
    """True = naam match, False = kisi aur ka slot, None = slot me faculty ka naam nahi likha."""
    if not (entry_name or "").strip():
        return None
    ew, fw = _words(entry_name), _words(fac_name)
    if ew and fw and (ew <= fw or fw <= ew):
        return True
    if fac_id and re.search(rf"(?<![A-Za-z0-9]){re.escape(str(fac_id))}(?![A-Za-z0-9])", entry_name, re.I):
        return True
    return False


def _classes(db: Session, faculty):
    rows = db.query(A).filter(A.faculty_profile_id == faculty.id).all()
    class_keys = {(norm(r.course), r.semester) for r in rows}
    subj_keys = {(norm(r.course), r.semester, norm(r.subject)) for r in rows}
    return class_keys, subj_keys


def _hm(t) -> str:
    return t.strftime("%H:%M") if t else ""


def _minutes(t) -> int:
    return t.hour * 60 + t.minute


@router.get("/week")
def week(faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    _class_keys, subj_keys = _classes(db, faculty)
    items = []
    for e in db.query(T).order_by(T.day_of_week, T.start_time).all():
        me = _is_me(e.faculty_name, getattr(faculty, "faculty_name", None), getattr(faculty, "faculty_id", None))
        if me is None:
            if (norm(e.course), sem_num(e.semester), norm(e.subject)) not in subj_keys:
                continue
        elif not me:
            continue
        items.append({
            "id": str(e.id), "day": e.day_of_week, "day_name": DAYS[e.day_of_week] if 0 <= e.day_of_week <= 6 else "",
            "start": _hm(e.start_time), "end": _hm(e.end_time), "subject": e.subject, "course": e.course,
            "semester": e.semester, "room": e.room, "kind": e.kind or "lecture", "clash": False,
            "_s": _minutes(e.start_time), "_e": _minutes(e.end_time),
        })

    for i, a in enumerate(items):
        for b in items[i + 1:]:
            if a["day"] == b["day"] and a["_s"] < b["_e"] and b["_s"] < a["_e"]:
                a["clash"] = b["clash"] = True

    hours = sum(max(0, x["_e"] - x["_s"]) for x in items) / 60
    for x in items:
        x.pop("_s")
        x.pop("_e")
    now = datetime.now(IST)
    return {
        "items": items,
        "summary": {
            "slots": len(items),
            "lectures": sum(1 for x in items if x["kind"] != "practical"),
            "practicals": sum(1 for x in items if x["kind"] == "practical"),
            "hours": round(hours, 1),
            "clashes": sum(1 for x in items if x["clash"]),
        },
        "today": {"day": now.weekday(), "time": now.strftime("%H:%M")},
    }


@router.get("/exams")
def exams(
    scope: str = Query("mine", pattern="^(mine|class)$"),
    include_past: bool = False,
    faculty=Depends(require_faculty),
    db: Session = Depends(get_db),
):
    class_keys, subj_keys = _classes(db, faculty)
    today: date = datetime.now(IST).date()
    items = []
    for r in db.query(E).order_by(E.exam_date, E.start_time).all():
        ck = (norm(r.course), sem_num(r.semester))
        if ck not in class_keys:
            continue
        mine = (ck[0], ck[1], norm(r.subject)) in subj_keys
        if scope == "mine" and not mine:
            continue
        if not include_past and r.exam_date < today:
            continue
        items.append({
            "id": str(r.id), "subject": r.subject, "exam_type": r.exam_type, "date": r.exam_date.isoformat(),
            "start": _hm(r.start_time), "end": _hm(r.end_time), "venue": r.venue, "course": r.course,
            "semester": r.semester, "mine": mine, "days_left": (r.exam_date - today).days,
        })
    return {"items": items, "total": len(items), "classes": len(class_keys)}