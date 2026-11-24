import os
import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from .admin_common import log_activity, require_admin
from .admin_settings import get_setting

router = APIRouter(prefix="/api/admin/mentor", tags=["admin-mentor"])

# Max students per mentor now comes from Admin > Settings ("max_mentees").


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


def _faculty(db: Session, faculty_id: str):
    F, U = models.FacultyProfile, models.User
    row = db.query(F, U).join(U, U.id == F.user_id).filter(F.id == _uuid(faculty_id, "Faculty nahi mila.")).first()
    if not row:
        raise HTTPException(status_code=404, detail="Faculty nahi mila.")
    return row


def _mentor_info(db: Session, f) -> dict:
    d = db.query(models.AdminFacultyDetail).filter(models.AdminFacultyDetail.faculty_profile_id == f.id).first()
    dept = None
    if d and d.department_id:
        dep = db.query(models.AdminDepartment).filter(models.AdminDepartment.id == d.department_id).first()
        dept = dep.name if dep else None
    return {"mentor_name": f.faculty_name, "designation": d.designation if d else None, "department": dept,
            "email": d.email if d else None, "phone": d.phone if d else None, "faculty_id": f.faculty_id}


def _load_map(db: Session):
    M = models.MentorAssignment
    return dict(db.query(M.faculty_id, func.count(M.id)).group_by(M.faculty_id).all())


def _active_students(db: Session, ids):
    P, U = models.StudentProfile, models.User
    uuids = [_uuid(i, "Student nahi mila.") for i in ids]
    rows = db.query(P, U).join(U, U.id == P.user_id).filter(P.id.in_(uuids)).all()
    found = {p.id: (p, u) for p, u in rows}
    out = []
    for i in uuids:
        if i not in found:
            raise HTTPException(status_code=404, detail="Kuch students nahi mile. Page refresh karke dobara try karo.")
        p, u = found[i]
        if str(u.is_active).lower() == "false":
            raise HTTPException(status_code=400, detail=f"{p.name} blocked hai, mentor assign nahi ho sakta.")
        out.append(p)
    return out


def _assign(db: Session, f, fu, students, cabin, availability):
    if str(fu.is_active).lower() == "false":
        raise HTTPException(status_code=400, detail="Ye faculty blocked hai, naye students assign nahi ho sakte.")
    M = models.MentorAssignment
    info = _mentor_info(db, f)
    mine = {m.student_profile_id: m for m in db.query(M).filter(M.faculty_id == f.faculty_id).all()}
    new_count = sum(1 for s in students if s.id not in mine)
    max_mentees = get_setting(db, "max_mentees")
    if len(mine) + new_count > max_mentees:
        room = max(max_mentees - len(mine), 0)
        raise HTTPException(status_code=400, detail=f"Ek mentor ke max {max_mentees} students ho sakte hain. Abhi {len(mine)} hain, {room} aur jud sakte hain.")
    if cabin is None and availability is None and mine:
        any_row = next(iter(mine.values()))
        cabin, availability = any_row.cabin, any_row.availability
    added = moved = 0
    existing = {m.student_profile_id: m for m in db.query(M).filter(M.student_profile_id.in_([s.id for s in students])).all()}
    for s in students:
        m = existing.get(s.id)
        if m is None:
            m = M(student_profile_id=s.id)
            db.add(m)
            added += 1
        elif m.faculty_id == f.faculty_id:
            continue
        else:
            moved += 1
        for k, v in info.items():
            setattr(m, k, v)
        m.cabin, m.availability = cabin, availability
    db.commit()
    return added, moved


@router.get("/summary")
def summary(admin=Depends(require_admin), db: Session = Depends(get_db)):
    P, U, M = models.StudentProfile, models.User, models.MentorAssignment
    active_ids = [p.id for p, u in db.query(P, U).join(U, U.id == P.user_id).all() if str(u.is_active).lower() != "false"]
    assigned = db.query(M).filter(M.student_profile_id.in_(active_ids)).count() if active_ids else 0
    load = _load_map(db)
    max_mentees = get_setting(db, "max_mentees")
    return {
        "students": len(active_ids), "assigned": assigned, "unassigned": len(active_ids) - assigned, "mentors": len(load),
        "avg_load": round(sum(load.values()) / len(load), 1) if load else 0,
        "full": sum(1 for v in load.values() if v >= max_mentees), "max_mentees": max_mentees,
    }


@router.get("/mentors")
def list_mentors(q: Optional[str] = Query(None, max_length=80), only_active: bool = False,
                 admin=Depends(require_admin), db: Session = Depends(get_db)):
    F, U, D = models.FacultyProfile, models.User, models.AdminFacultyDetail
    rows = db.query(F, U).join(U, U.id == F.user_id).order_by(F.faculty_name).all()
    details = {d.faculty_profile_id: d for d in db.query(D).all()}
    depts = {d.id: d.name for d in db.query(models.AdminDepartment).all()}
    load = _load_map(db)
    max_mentees = get_setting(db, "max_mentees")
    cabins = {}
    for m in db.query(models.MentorAssignment).all():
        cabins.setdefault(m.faculty_id, (m.cabin, m.availability))
    items = []
    for f, u in rows:
        active = str(u.is_active).lower() != "false"
        if only_active and not active:
            continue
        if q and q.strip().lower() not in f"{f.faculty_name} {f.faculty_id}".lower():
            continue
        d = details.get(f.id)
        cab = cabins.get(f.faculty_id, (None, None))
        items.append({
            "id": str(f.id), "name": f.faculty_name, "faculty_id": f.faculty_id, "is_active": active,
            "designation": d.designation if d else None, "department": depts.get(d.department_id) if d and d.department_id else None,
            "mentees": load.get(f.faculty_id, 0), "capacity": max_mentees, "cabin": cab[0], "availability": cab[1],
        })
    return {"items": items, "total": len(items)}


@router.get("/mentees")
def list_mentees(
    mentor_id: Optional[str] = None,
    status: Optional[str] = Query(None, pattern="^(assigned|unassigned)$"),
    course_id: Optional[str] = None,
    semester: Optional[int] = Query(None, ge=1, le=12),
    q: Optional[str] = Query(None, max_length=80),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    P, U, M = models.StudentProfile, models.User, models.MentorAssignment
    query = db.query(P, U, M).join(U, U.id == P.user_id).outerjoin(M, M.student_profile_id == P.id)
    if mentor_id:
        f, _u = _faculty(db, mentor_id)
        query = query.filter(M.faculty_id == f.faculty_id)
    if status == "assigned":
        query = query.filter(M.id.isnot(None))
    elif status == "unassigned":
        query = query.filter(M.id.is_(None))
    if course_id:
        c = db.query(models.AdminCourse).filter(models.AdminCourse.id == _uuid(course_id, "Course nahi mila.")).first()
        if not c:
            raise HTTPException(status_code=400, detail="Ye course nahi mila.")
        query = query.filter(func.lower(func.replace(P.course, " ", "")) == c.name_key)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(P.name.ilike(like) | P.college_id.ilike(like))
    rows = [(p, m) for p, u, m in query.order_by(P.name).all() if str(u.is_active).lower() != "false"]
    if semester:
        rows = [(p, m) for p, m in rows if _sem_num(p.semester) == semester]
    total = len(rows)
    rows = rows[(page - 1) * page_size: page * page_size]
    items = [{"student_id": str(p.id), "name": p.name, "college_id": p.college_id, "course": p.course, "semester": p.semester,
              "mentor": m.mentor_name if m else None, "mentor_faculty_id": m.faculty_id if m else None, "cabin": m.cabin if m else None} for p, m in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/assign")
def assign(payload: schemas.AdminMentorAssignIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    f, fu = _faculty(db, payload.faculty_id)
    students = _active_students(db, payload.student_ids)
    added, moved = _assign(db, f, fu, students, payload.cabin, payload.availability)
    log_activity(db, admin, "mentor.assign", f"Mentor {f.faculty_name}: {added} students assigned, {moved} moved from another mentor")
    return {"added": added, "moved": moved}


@router.post("/assign-class")
def assign_class(payload: schemas.AdminMentorClassIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    f, fu = _faculty(db, payload.faculty_id)
    c = db.query(models.AdminCourse).filter(models.AdminCourse.id == _uuid(payload.course_id, "Course nahi mila.")).first()
    if not c:
        raise HTTPException(status_code=400, detail="Ye course nahi mila.")
    if payload.semester > c.semesters:
        raise HTTPException(status_code=400, detail=f"Is course me sirf {c.semesters} semesters hain.")
    P, U, M = models.StudentProfile, models.User, models.MentorAssignment
    rows = db.query(P, U).join(U, U.id == P.user_id).filter(func.lower(func.replace(P.course, " ", "")) == c.name_key).order_by(P.name).all()
    students = [p for p, u in rows if _sem_num(p.semester) == payload.semester and str(u.is_active).lower() != "false"]
    if payload.only_unassigned and students:
        taken = {m.student_profile_id for m in db.query(M).filter(M.student_profile_id.in_([s.id for s in students])).all()}
        students = [s for s in students if s.id not in taken]
    if not students:
        raise HTTPException(status_code=400, detail="Is class me assign karne layak koi student nahi mila.")
    added, moved = _assign(db, f, fu, students, None, None)
    log_activity(db, admin, "mentor.assign", f"Mentor {f.faculty_name}: {c.name} sem {payload.semester} class assigned ({added} new, {moved} moved)")
    return {"added": added, "moved": moved}


@router.post("/unassign")
def unassign(payload: schemas.AdminMentorUnassignIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    ids = [_uuid(i, "Student nahi mila.") for i in payload.student_ids]
    M = models.MentorAssignment
    rows = db.query(M).filter(M.student_profile_id.in_(ids)).all()
    if not rows:
        raise HTTPException(status_code=400, detail="Chune hue students ka koi mentor assign nahi tha.")
    n = len(rows)
    for r in rows:
        db.delete(r)
    db.commit()
    log_activity(db, admin, "mentor.unassign", f"Mentor removed from {n} students")
    return {"removed": n}


@router.put("/mentors/{faculty_id}/details")
def save_details(faculty_id: str, payload: schemas.AdminMentorDetailsIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    """Sets cabin / availability for all mentees of this mentor and refreshes name, designation, department, email, phone from Faculty."""
    f, _u = _faculty(db, faculty_id)
    M = models.MentorAssignment
    rows = db.query(M).filter(M.faculty_id == f.faculty_id).all()
    if not rows:
        raise HTTPException(status_code=400, detail="Is mentor ka abhi koi student nahi hai.")
    info = _mentor_info(db, f)
    for m in rows:
        for k, v in info.items():
            setattr(m, k, v)
        m.cabin, m.availability = payload.cabin, payload.availability
    db.commit()
    log_activity(db, admin, "mentor.details", f"Mentor details updated: {f.faculty_name} ({len(rows)} students)")
    return {"updated": len(rows)}


@router.post("/demo-seed")
def demo_seed(admin=Depends(require_admin), db: Session = Depends(get_db)):
    """SAMPLE: assigns up to 6 unassigned students to the first active faculty (cabin 'SAMPLE-CABIN')."""
    if os.getenv("ENABLE_DEMO_DATA", "").strip().lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai. backend\\.env me ENABLE_DEMO_DATA=true karke backend restart karo.")
    F, U, P, M = models.FacultyProfile, models.User, models.StudentProfile, models.MentorAssignment
    fac = [(f, u) for f, u in db.query(F, U).join(U, U.id == F.user_id).order_by(F.faculty_name).all() if str(u.is_active).lower() != "false"]
    if not fac:
        return {"added": 0, "message": "Sample ke liye pehle kam se kam ek active faculty banao (Faculty section)."}
    taken = {sid for (sid,) in db.query(M.student_profile_id).all()}
    studs = [p for p, u in db.query(P, U).join(U, U.id == P.user_id).order_by(P.name).all() if str(u.is_active).lower() != "false" and p.id not in taken][:6]
    if not studs:
        return {"added": 0, "message": "Sample ke liye koi unassigned active student nahi mila."}
    f, fu = fac[0]
    added, _ = _assign(db, f, fu, studs, "SAMPLE-CABIN", "Sample: Mon-Fri 2-4 PM")
    log_activity(db, admin, "mentor.demo", f"Sample mentor assignment: {f.faculty_name} with {added} students (demo data)")
    return {"added": added, "message": f"{f.faculty_name} ko {added} students sample me assign hue."}