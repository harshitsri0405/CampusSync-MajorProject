import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from .admin_common import log_activity, require_admin

router = APIRouter(prefix="/api/admin/syllabus", tags=["admin-syllabus"])


def _key(s) -> str:
    return "".join(str(s or "").lower().split())


def _uuid(value, msg):
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _course(db: Session, course_id: str, semester: int):
    c = db.query(models.AdminCourse).filter(models.AdminCourse.id == _uuid(course_id, "Course nahi mila.")).first()
    if not c:
        raise HTTPException(status_code=400, detail="Ye course nahi mila.")
    if not 1 <= semester <= c.semesters:
        raise HTTPException(status_code=400, detail=f"Is course me sirf {c.semesters} semesters hain.")
    return c


def _subject(db: Session, subject_id: str):
    sub = db.query(models.AdminSubject).filter(models.AdminSubject.id == _uuid(subject_id, "Subject not found.")).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subject not found.")
    course = db.query(models.AdminCourse).filter(models.AdminCourse.id == sub.course_id).first()
    return sub, course


def _class_rows(db: Session, course, semester: int):
    S = models.SyllabusSubject
    return db.query(S).filter(func.lower(func.replace(S.course, " ", "")) == course.name_key, S.semester == semester).all()


def _find(db: Session, course, sub):
    for r in _class_rows(db, course, sub.semester):
        if _key(r.code) == _key(sub.code):
            return r
    return None


@router.get("/overview")
def overview(course_id: str, semester: int = Query(..., ge=1, le=12), admin=Depends(require_admin), db: Session = Depends(get_db)):
    course = _course(db, course_id, semester)
    S = models.AdminSubject
    subs = db.query(S).filter(S.course_id == course.id, S.semester == semester).order_by(S.is_active.desc(), S.name).all()
    rows = {_key(r.code): r for r in _class_rows(db, course, semester)}
    unit_stats = {}
    if rows:
        U = models.SyllabusUnit
        for sid, cnt, hrs in db.query(U.subject_id, func.count(U.id), func.coalesce(func.sum(U.hours), 0)).filter(
                U.subject_id.in_([r.id for r in rows.values()])).group_by(U.subject_id).all():
            unit_stats[sid] = (cnt, int(hrs or 0))
    items = []
    for s in subs:
        r = rows.get(_key(s.code))
        cnt, hrs = unit_stats.get(r.id, (0, 0)) if r else (0, 0)
        items.append({
            "subject_id": str(s.id), "name": s.name, "code": s.code, "credits": s.credits, "is_active": bool(s.is_active),
            "has_syllabus": bool(r), "subject_type": r.subject_type if r else None, "units": cnt, "hours": hrs,
        })
    active = [i for i in items if i["is_active"]]
    done = sum(1 for i in active if i["has_syllabus"])
    return {
        "items": items,
        "stats": {"subjects": len(active), "with_syllabus": done, "missing": len(active) - done,
                  "coverage": round(done * 100 / len(active)) if active else 0, "units": sum(i["units"] for i in items)},
    }


@router.get("/{subject_id}")
def get_syllabus(subject_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    sub, course = _subject(db, subject_id)
    r = _find(db, course, sub)
    units = []
    if r:
        U = models.SyllabusUnit
        units = [{"title": u.title, "topics": u.topics, "hours": u.hours}
                 for u in db.query(U).filter(U.subject_id == r.id).order_by(U.unit_no).all()]
    return {
        "subject": {"id": str(sub.id), "name": sub.name, "code": sub.code, "credits": sub.credits, "semester": sub.semester, "course": course.name},
        "exists": bool(r),
        "subject_type": r.subject_type if r else "theory",
        "credits": r.credits if r else sub.credits,
        "internal_marks": r.internal_marks if r else None,
        "external_marks": r.external_marks if r else None,
        "overview": (r.overview if r else "") or "",
        "books": (r.books if r else "") or "",
        "units": units,
    }


@router.put("/{subject_id}")
def save_syllabus(subject_id: str, payload: schemas.AdminSyllabusIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    sub, course = _subject(db, subject_id)
    if not sub.is_active:
        raise HTTPException(status_code=400, detail="Inactive subject ka syllabus nahi badal sakte. Pehle subject active karo.")
    r = _find(db, course, sub)
    created = r is None
    if created:
        r = models.SyllabusSubject(course=course.name, semester=sub.semester, code=sub.code)
        db.add(r)
        db.flush()
    r.name = sub.name
    r.subject_type = payload.subject_type
    r.credits = payload.credits
    r.internal_marks, r.external_marks = payload.internal_marks, payload.external_marks
    r.overview, r.books = payload.overview, payload.books
    U = models.SyllabusUnit
    db.query(U).filter(U.subject_id == r.id).delete()
    for i, u in enumerate(payload.units, 1):
        db.add(U(subject_id=r.id, unit_no=i, title=u.title, topics=u.topics, hours=u.hours))
    db.commit()
    log_activity(db, admin, "syllabus.create" if created else "syllabus.update",
                 f"Syllabus {'added' if created else 'updated'}: {course.name} sem {sub.semester} {sub.name} ({len(payload.units)} units)")
    return {"ok": True, "units": len(payload.units)}


@router.delete("/{subject_id}")
def delete_syllabus(subject_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    sub, course = _subject(db, subject_id)
    r = _find(db, course, sub)
    if not r:
        raise HTTPException(status_code=404, detail="Is subject ka syllabus bana hi nahi hai.")
    db.query(models.SyllabusUnit).filter(models.SyllabusUnit.subject_id == r.id).delete()
    db.delete(r)
    db.commit()
    log_activity(db, admin, "syllabus.delete", f"Syllabus deleted: {course.name} sem {sub.semester} {sub.name}")
    return {"ok": True}


@router.post("/demo-seed")
def demo_seed(admin=Depends(require_admin), db: Session = Depends(get_db)):
    """SAMPLE syllabus (3 subjects, 3 units each) for the first class whose active subjects have no syllabus yet."""
    if os.getenv("ENABLE_DEMO_DATA", "").strip().lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai. backend\\.env me ENABLE_DEMO_DATA=true karke backend restart karo.")
    S = models.AdminSubject
    for course in db.query(models.AdminCourse).filter(models.AdminCourse.is_active.is_(True)).order_by(models.AdminCourse.name).all():
        for sem in range(1, course.semesters + 1):
            subs = db.query(S).filter(S.course_id == course.id, S.semester == sem, S.is_active.is_(True)).order_by(S.name).all()
            if not subs:
                continue
            existing = {_key(r.code) for r in _class_rows(db, course, sem)}
            todo = [s for s in subs if _key(s.code) not in existing][:3]
            if not todo:
                continue
            for s in todo:
                r = models.SyllabusSubject(course=course.name, semester=sem, code=s.code, name=s.name, subject_type="theory", credits=s.credits,
                                           internal_marks=40, external_marks=60,
                                           overview=f"SAMPLE syllabus for {s.name}. Replace it with the real syllabus.",
                                           books="Sample Reference Book 1\nSample Reference Book 2")
                db.add(r)
                db.flush()
                for n in range(1, 4):
                    db.add(models.SyllabusUnit(subject_id=r.id, unit_no=n, title=f"Sample Unit {n}", hours=8,
                                               topics=f"Sample topic {n}.1\nSample topic {n}.2\nSample topic {n}.3"))
            db.commit()
            log_activity(db, admin, "syllabus.demo", f"Sample syllabus added: {course.name} sem {sem} ({len(todo)} subjects, demo data)")
            return {"added": len(todo), "message": f"{course.name} semester {sem}: {len(todo)} subjects ka sample syllabus bana."}
    return {"added": 0, "message": "Sample ke liye aisi class chahiye jisme active subjects ho aur unka syllabus abhi na bana ho."}