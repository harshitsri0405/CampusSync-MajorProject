import os
import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from .admin_common import admin_name, log_activity, require_admin

router = APIRouter(prefix="/api/admin/results", tags=["admin-results"])


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


def _course(db: Session, course_id: str, semester: int):
    c = db.query(models.AdminCourse).filter(models.AdminCourse.id == _uuid(course_id, "Course nahi mila.")).first()
    if not c:
        raise HTTPException(status_code=400, detail="Ye course nahi mila.")
    if not 1 <= semester <= c.semesters:
        raise HTTPException(status_code=400, detail=f"Is course me sirf {c.semesters} semesters hain.")
    return c


def _subject(db: Session, course, semester: int, name: str):
    S = models.AdminSubject
    s = db.query(S).filter(S.course_id == course.id, S.semester == semester, S.name_key == _key(name)).first()
    if not s:
        raise HTTPException(status_code=400, detail="Ye subject is course/semester ka nahi hai.")
    return s


def _students(db: Session, course, semester: int):
    """Active students of the class (course name matched ignoring case/spaces, semester by its number)."""
    P, U = models.StudentProfile, models.User
    rows = db.query(P, U).join(U, U.id == P.user_id).filter(func.lower(func.replace(P.course, " ", "")) == course.name_key).order_by(P.name).all()
    return [p for p, u in rows if _sem_num(p.semester) == semester and str(u.is_active).lower() != "false"]


def _records(db: Session, student_ids, semester: int):
    if not student_ids:
        return []
    R = models.ResultRecord
    return db.query(R).filter(R.student_profile_id.in_(student_ids), R.semester == semester).all()


@router.get("/subjects")
def subjects_overview(course_id: str, semester: int = Query(..., ge=1, le=12), admin=Depends(require_admin), db: Session = Depends(get_db)):
    course = _course(db, course_id, semester)
    students = _students(db, course, semester)
    recs = _records(db, [p.id for p in students], semester)
    S = models.AdminSubject
    subs = db.query(S).filter(S.course_id == course.id, S.semester == semester, S.is_active.is_(True)).order_by(S.name).all()
    out = []
    for s in subs:
        mine = [r for r in recs if _key(r.subject) == s.name_key]
        out.append({
            "subject": s.name, "code": s.code, "credits": s.credits, "students": len(students),
            "entered": sum(1 for r in mine if r.internal_marks is not None or r.external_marks is not None),
            "complete": sum(1 for r in mine if r.internal_marks is not None and r.external_marks is not None),
            "published": sum(1 for r in mine if r.published),
        })
    return {"students": len(students), "subjects": out}


@router.get("/marks")
def marks(course_id: str, semester: int = Query(..., ge=1, le=12), subject: str = Query(..., max_length=150),
          admin=Depends(require_admin), db: Session = Depends(get_db)):
    course = _course(db, course_id, semester)
    sub = _subject(db, course, semester, subject)
    students = _students(db, course, semester)
    by_student = {r.student_profile_id: r for r in _records(db, [p.id for p in students], semester) if _key(r.subject) == sub.name_key}
    rows = []
    for p in students:
        r = by_student.get(p.id)
        rows.append({
            "student_id": str(p.id), "name": p.name, "college_id": p.college_id,
            "internal_marks": r.internal_marks if r else None, "external_marks": r.external_marks if r else None,
            "published": bool(r and r.published),
        })
    return {"subject": sub.name, "credits": sub.credits, "rows": rows}


@router.put("/marks")
def save_marks(payload: schemas.MarksSaveIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    course = _course(db, payload.course_id, payload.semester)
    sub = _subject(db, course, payload.semester, payload.subject)
    students = {str(p.id): p for p in _students(db, course, payload.semester)}
    R = models.ResultRecord
    existing = {r.student_profile_id: r for r in _records(db, [p.id for p in students.values()], payload.semester) if _key(r.subject) == sub.name_key}
    saved = 0
    for row in payload.rows:
        p = students.get(row.student_id)
        if not p:
            raise HTTPException(status_code=400, detail="Kuch students is class ke nahi hain. Page refresh karke dobara try karo.")
        r = existing.get(p.id)
        if r is None:
            if row.internal_marks is None and row.external_marks is None:
                continue
            db.add(R(student_profile_id=p.id, semester=payload.semester, subject=sub.name, credits=sub.credits,
                     internal_marks=row.internal_marks, external_marks=row.external_marks, published=False,
                     entered_by=admin_name(admin)))
            saved += 1
            continue
        if r.internal_marks == row.internal_marks and r.external_marks == row.external_marks:
            continue
        if r.published:
            raise HTTPException(status_code=400, detail=f"{p.name} ka result published hai. Marks badalne ke liye pehle Unpublish karo.")
        r.internal_marks, r.external_marks, r.entered_by = row.internal_marks, row.external_marks, admin_name(admin)
        saved += 1
    db.commit()
    if saved:
        log_activity(db, admin, "result.marks", f"Marks saved: {course.name} sem {payload.semester} {sub.name} ({saved} students)")
    return {"saved": saved}


@router.post("/publish")
def publish(payload: schemas.PublishIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    course = _course(db, payload.course_id, payload.semester)
    students = _students(db, course, payload.semester)
    recs = _records(db, [p.id for p in students], payload.semester)
    label = f"{course.name} sem {payload.semester}"
    if payload.subject:
        sub = _subject(db, course, payload.semester, payload.subject)
        recs = [r for r in recs if _key(r.subject) == sub.name_key]
        label += f" {sub.name}"
    else:
        names = {s.name_key for s in db.query(models.AdminSubject).filter(models.AdminSubject.course_id == course.id,
                                                                          models.AdminSubject.semester == payload.semester).all()}
        recs = [r for r in recs if _key(r.subject) in names]
    changed = skipped = 0
    for r in recs:
        if payload.publish:
            if r.published:
                continue
            if r.internal_marks is None or r.external_marks is None:
                skipped += 1
                continue
            r.published = True
            changed += 1
        elif r.published:
            r.published = False
            changed += 1
    db.commit()
    if changed:
        log_activity(db, admin, "result.publish" if payload.publish else "result.unpublish",
                     f"Results {'published' if payload.publish else 'unpublished'}: {label} ({changed} records)")
    return {"changed": changed, "skipped": skipped}


@router.post("/demo-seed")
def demo_seed(admin=Depends(require_admin), db: Session = Depends(get_db)):
    """SAMPLE (unpublished) marks for the first class that has students and subjects."""
    if os.getenv("ENABLE_DEMO_DATA", "").strip().lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai. backend\\.env me ENABLE_DEMO_DATA=true karke backend restart karo.")
    S, R = models.AdminSubject, models.ResultRecord
    for course in db.query(models.AdminCourse).filter(models.AdminCourse.is_active.is_(True)).order_by(models.AdminCourse.name).all():
        for sem in range(1, course.semesters + 1):
            subs = db.query(S).filter(S.course_id == course.id, S.semester == sem, S.is_active.is_(True)).order_by(S.name).all()
            students = _students(db, course, sem)
            if not subs or not students:
                continue
            existing = {(r.student_profile_id, _key(r.subject)) for r in _records(db, [p.id for p in students], sem)}
            added = 0
            for i, p in enumerate(students):
                for j, s in enumerate(subs):
                    if (p.id, s.name_key) in existing:
                        continue
                    db.add(R(student_profile_id=p.id, semester=sem, subject=s.name, credits=s.credits,
                             internal_marks=float(20 + (i * 7 + j * 3) % 20), external_marks=float(30 + (i * 11 + j * 5) % 30),
                             published=False, entered_by="demo"))
                    added += 1
            db.commit()
            if added:
                log_activity(db, admin, "result.demo", f"Sample marks added: {course.name} sem {sem} ({added} records, unpublished, demo data)")
            return {"added": added, "message": f"{course.name} semester {sem}: {added} sample marks bane (unpublished). Ab Publish karke student side check karo."}
    return {"added": 0, "message": "Sample ke liye kisi class me students (course + semester set) aur subjects dono chahiye."}