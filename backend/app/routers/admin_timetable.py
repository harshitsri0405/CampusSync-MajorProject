import os
import uuid
from datetime import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from .admin_common import log_activity, require_admin

router = APIRouter(prefix="/api/admin/timetable", tags=["admin-timetable"])

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _key(s) -> str:
    return "".join(str(s or "").lower().split())


def _uuid(value, msg):
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _hm(t) -> str:
    return t.strftime("%H:%M")


def _out(e) -> schemas.TimetableOut:
    return schemas.TimetableOut(
        id=str(e.id), course=e.course, semester=str(e.semester), day_of_week=e.day_of_week,
        start_time=_hm(e.start_time), end_time=_hm(e.end_time), subject=e.subject,
        faculty_name=e.faculty_name, room=e.room, kind=e.kind or "lecture",
    )


def _class_query(db: Session, course_name: str, semester: int):
    T = models.TimetableEntry
    return db.query(T).filter(
        func.lower(func.replace(T.course, " ", "")) == _key(course_name),
        func.lower(func.replace(T.semester, " ", "")) == str(semester),
    )


def _course(db: Session, course_id: str):
    c = db.query(models.AdminCourse).filter(models.AdminCourse.id == _uuid(course_id, "Course nahi mila.")).first()
    if not c:
        raise HTTPException(status_code=400, detail="Ye course nahi mila.")
    return c


def _validate(db: Session, payload, exclude_id=None):
    course = _course(db, payload.course_id)
    if payload.semester > course.semesters:
        raise HTTPException(status_code=400, detail=f"Is course me sirf {course.semesters} semesters hain.")
    # subject must be an admin subject of this course + semester
    S = models.AdminSubject
    subject = (
        db.query(S).filter(S.course_id == course.id, S.semester == payload.semester, S.name_key == _key(payload.subject),
                           S.is_active.is_(True)).first()
    )
    if not subject:
        raise HTTPException(status_code=400, detail="Ye subject is course/semester ke Subjects me nahi hai. Pehle Subjects section me banao.")
    faculty_name = None
    if payload.faculty_name:
        P, U = models.FacultyProfile, models.User
        rows = db.query(P, U).join(U, U.id == P.user_id).all()
        match = next(((p, u) for p, u in rows if _key(p.faculty_name) == _key(payload.faculty_name)), None)
        if not match:
            raise HTTPException(status_code=400, detail="Ye faculty nahi mila.")
        if str(match[1].is_active).lower() == "false":
            raise HTTPException(status_code=400, detail="Ye faculty blocked hai.")
        faculty_name = match[0].faculty_name

    # clashes on the same day: same class, same room, same faculty
    T = models.TimetableEntry
    same_day = db.query(T).filter(T.day_of_week == payload.day_of_week)
    if exclude_id:
        same_day = same_day.filter(T.id != exclude_id)
    for e in same_day.all():
        if not (payload.start_time < e.end_time and e.start_time < payload.end_time):
            continue
        when = f"{_hm(e.start_time)}-{_hm(e.end_time)}"
        if _key(e.course) == course.name_key and _key(e.semester) == str(payload.semester):
            raise HTTPException(status_code=400, detail=f"Is class me {when} par pehle se '{e.subject}' hai.")
        if payload.room and e.room and _key(e.room) == _key(payload.room):
            raise HTTPException(status_code=400, detail=f"Room {e.room} {when} par busy hai ({e.course} sem {e.semester}).")
        if faculty_name and e.faculty_name and _key(e.faculty_name) == _key(faculty_name):
            raise HTTPException(status_code=400, detail=f"{faculty_name} {when} par busy hain ({e.course} sem {e.semester}).")
    return course, subject, faculty_name


@router.get("/class")
def class_timetable(
    course_id: str,
    semester: int = Query(..., ge=1, le=12),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    course = _course(db, course_id)
    rows = _class_query(db, course.name, semester).order_by(models.TimetableEntry.day_of_week, models.TimetableEntry.start_time).all()
    return [_out(e).model_dump(mode="json") for e in rows]


@router.get("/summary")
def summary(admin=Depends(require_admin), db: Session = Depends(get_db)):
    T = models.TimetableEntry
    rows = db.query(T.course, T.semester, func.count(T.id)).group_by(T.course, T.semester).order_by(T.course, T.semester).all()
    classes = [{"course": c, "semester": str(s), "slots": n} for c, s, n in rows]
    return {"total": sum(c["slots"] for c in classes), "classes": classes}


@router.post("", response_model=schemas.TimetableOut)
def create_slot(payload: schemas.TimetableIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    course, subject, faculty_name = _validate(db, payload)
    e = models.TimetableEntry(
        course=course.name, semester=str(payload.semester), day_of_week=payload.day_of_week,
        start_time=payload.start_time, end_time=payload.end_time, subject=subject.name,
        faculty_name=faculty_name, room=payload.room, kind=payload.kind,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    log_activity(db, admin, "timetable.create", f"Timetable slot added: {course.name} sem {payload.semester} {DAYS[e.day_of_week]} {_hm(e.start_time)} {e.subject}")
    return _out(e)


@router.put("/{entry_id}", response_model=schemas.TimetableOut)
def update_slot(entry_id: str, payload: schemas.TimetableIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    e = db.query(models.TimetableEntry).filter(models.TimetableEntry.id == _uuid(entry_id, "Slot nahi mila.")).first()
    if not e:
        raise HTTPException(status_code=404, detail="Slot nahi mila.")
    course, subject, faculty_name = _validate(db, payload, exclude_id=e.id)
    e.course, e.semester, e.day_of_week = course.name, str(payload.semester), payload.day_of_week
    e.start_time, e.end_time, e.subject = payload.start_time, payload.end_time, subject.name
    e.faculty_name, e.room, e.kind = faculty_name, payload.room, payload.kind
    db.commit()
    log_activity(db, admin, "timetable.update", f"Timetable slot updated: {course.name} sem {payload.semester} {DAYS[e.day_of_week]} {_hm(e.start_time)} {e.subject}")
    return _out(e)


@router.delete("/{entry_id}")
def delete_slot(entry_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    e = db.query(models.TimetableEntry).filter(models.TimetableEntry.id == _uuid(entry_id, "Slot nahi mila.")).first()
    if not e:
        raise HTTPException(status_code=404, detail="Slot nahi mila.")
    label = f"{e.course} sem {e.semester} {DAYS[e.day_of_week]} {_hm(e.start_time)} {e.subject}"
    db.delete(e)
    db.commit()
    log_activity(db, admin, "timetable.delete", f"Timetable slot deleted: {label}")
    return {"ok": True}


@router.post("/demo-seed")
def demo_seed(admin=Depends(require_admin), db: Session = Depends(get_db)):
    """SAMPLE weekly timetable for the first class that has subjects (testing the screens only)."""
    if os.getenv("ENABLE_DEMO_DATA", "").strip().lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai. backend\\.env me ENABLE_DEMO_DATA=true karke backend restart karo.")
    S = models.AdminSubject
    for course in db.query(models.AdminCourse).filter(models.AdminCourse.is_active.is_(True)).order_by(models.AdminCourse.name).all():
        for sem in range(1, course.semesters + 1):
            subjects = db.query(S).filter(S.course_id == course.id, S.semester == sem, S.is_active.is_(True)).order_by(S.name).limit(4).all()
            if not subjects:
                continue
            if _class_query(db, course.name, sem).first():
                return {"added": 0, "message": f"{course.name} semester {sem} ka timetable pehle se hai."}
            faculty = [p.faculty_name for (p,) in db.query(models.FacultyProfile).join(models.User, models.User.id == models.FacultyProfile.user_id)
                       .filter(models.User.is_active != "false").order_by(models.FacultyProfile.faculty_name).limit(4).all()]
            slots = [(time(9, 0), time(10, 0)), (time(10, 0), time(11, 0)), (time(11, 15), time(12, 15))]
            added = 0
            for day in range(5):  # Monday to Friday
                for i, (s, e) in enumerate(slots):
                    idx = (day + i) % len(subjects)
                    db.add(models.TimetableEntry(
                        course=course.name, semester=str(sem), day_of_week=day, start_time=s, end_time=e,
                        subject=subjects[idx].name, faculty_name=faculty[idx % len(faculty)] if faculty else None,
                        room="Room 101", kind="lecture",
                    ))
                    added += 1
            db.add(models.TimetableEntry(
                course=course.name, semester=str(sem), day_of_week=2, start_time=time(14, 0), end_time=time(16, 0),
                subject=subjects[0].name, faculty_name=faculty[0] if faculty else None, room="Lab 1", kind="practical",
            ))
            added += 1
            db.commit()
            log_activity(db, admin, "timetable.demo", f"Sample timetable added: {course.name} sem {sem} ({added} slots, demo data)")
            return {"added": added, "message": f"{course.name} semester {sem} ka sample timetable bana ({added} slots)."}
    return {"added": 0, "message": "Sample ke liye pehle kisi active course me Subjects banao."}