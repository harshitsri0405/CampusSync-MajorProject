import json
import math
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..schemas import FacultyFaceEnrollIn, FacultyFaceMatchIn
from .faculty_common import my_assignment, require_faculty
from .faculty_attendance import _students

router = APIRouter(prefix="/api/faculty/face", tags=["faculty-face"])

T = models.FaceTemplate
MAX_PHOTOS = 3        # ek student ke max reference photos
MATCH_DIST = 0.5      # isse kam distance = pakka match
UNSURE_DIST = 0.6     # 0.5 se 0.6 = "check karo"
MARGIN = 0.05         # best aur dusre student me itna fark hona chahiye
DUP_DIST = 0.4        # naya photo kisi aur student se itna milta ho to reject


def _dist(a, b) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def _vec(desc: str):
    return json.loads(desc)


def _check_vec(v) -> None:
    if len(v) != 128 or not all(isinstance(x, (int, float)) and math.isfinite(x) for x in v):
        raise HTTPException(status_code=400, detail="Face data sahi nahi hai.")


def _student_in_class(db: Session, a, student_id: str):
    for p in _students(db, a):
        if str(p.id) == str(student_id):
            return p
    raise HTTPException(status_code=403, detail="Ye student aapki class me nahi hai.")


@router.get("/status")
def status(assignment_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, assignment_id)
    students = _students(db, a)
    ids = [p.id for p in students]
    counts = {}
    if ids:
        counts = {sid: int(c) for sid, c in db.query(T.student_profile_id, func.count(T.id)).filter(T.student_profile_id.in_(ids)).group_by(T.student_profile_id).all()}
    items = [{"id": str(p.id), "name": p.name, "college_id": p.college_id, "photos": counts.get(p.id, 0)} for p in students]
    items.sort(key=lambda r: r["name"].lower())
    return {"items": items, "total": len(items), "enrolled": sum(1 for r in items if r["photos"] > 0), "max_photos": MAX_PHOTOS}


@router.post("/enroll")
def enroll(body: FacultyFaceEnrollIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, body.assignment_id)
    if not body.consent:
        raise HTTPException(status_code=400, detail="Student ki sahmati (consent) tick karna zaroori hai.")
    _check_vec(body.descriptor)
    student = _student_in_class(db, a, body.student_id)

    count = db.query(func.count(T.id)).filter(T.student_profile_id == student.id).scalar() or 0
    if count >= MAX_PHOTOS:
        raise HTTPException(status_code=400, detail=f"Is student ke {MAX_PHOTOS} photo pehle se hain. Naya dene ke liye pehle hata do.")

    other_ids = [p.id for p in _students(db, a) if p.id != student.id]
    if other_ids:
        for _sid, desc in db.query(T.student_profile_id, T.descriptor).filter(T.student_profile_id.in_(other_ids)).all():
            if _dist(body.descriptor, _vec(desc)) < DUP_DIST:
                raise HTTPException(status_code=400, detail="Ye chehra class ke kisi aur student se milta hai. Sahi student ki photo chuno.")

    db.add(T(student_profile_id=student.id, descriptor=json.dumps([round(float(x), 6) for x in body.descriptor])))
    db.commit()
    return {"ok": True, "photos": count + 1}


@router.delete("/enroll/{student_id}")
def remove(student_id: str, assignment_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, assignment_id)
    student = _student_in_class(db, a, student_id)
    n = db.query(T).filter(T.student_profile_id == student.id).delete(synchronize_session=False)
    db.commit()
    return {"removed": n}


@router.post("/match")
def match(body: FacultyFaceMatchIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, body.assignment_id)
    ids = [p.id for p in _students(db, a)]
    tmpl = {}
    if ids:
        for sid, desc in db.query(T.student_profile_id, T.descriptor).filter(T.student_profile_id.in_(ids)).all():
            tmpl.setdefault(str(sid), []).append(_vec(desc))
    if not tmpl:
        raise HTTPException(status_code=400, detail="Pehle students ki face photos enrol karo.")
    for d in body.descriptors:
        _check_vec(d)

    cands = []
    for d in body.descriptors:
        scored = sorted(((min(_dist(d, t) for t in ts), sid) for sid, ts in tmpl.items()), key=lambda x: x[0])
        cands.append(scored)

    # sabse pakke match pehle assign hote hain, taaki ek student sirf ek chehre se juda rahe
    order = sorted(range(len(cands)), key=lambda i: cands[i][0][0])
    taken, out = set(), {}
    for i in order:
        scored = cands[i]
        pick = next(((dist, sid) for dist, sid in scored if sid not in taken), None)
        if pick is None or pick[0] > UNSURE_DIST:
            out[i] = {"index": i, "student_id": None, "status": "unknown", "distance": round(scored[0][0], 3)}
            continue
        dist, sid = pick
        first = scored[0][1] == sid
        margin_ok = first and (len(scored) < 2 or scored[1][0] - dist >= MARGIN)
        st = "match" if dist <= MATCH_DIST and margin_ok else "unsure"
        taken.add(sid)
        out[i] = {"index": i, "student_id": sid, "status": st, "distance": round(dist, 3)}

    faces = [out[i] for i in range(len(cands))]
    return {
        "faces": faces,
        "matched": sum(1 for f in faces if f["status"] == "match"),
        "unsure": sum(1 for f in faces if f["status"] == "unsure"),
        "unknown": sum(1 for f in faces if f["status"] == "unknown"),
    }