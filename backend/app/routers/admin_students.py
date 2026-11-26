import csv
import io
import os
import re
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import ValidationError
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.security import hash_password
from .admin_common import log_activity, require_admin

router = APIRouter(prefix="/api/admin/students", tags=["admin-students"])

DEMO_PASSWORD = "Demo@1234"
IMPORT_MAX_ROWS = 200
IMPORT_MAX_BYTES = 2 * 1024 * 1024
EXPORT_MAX_ROWS = 5000
CSV_COLUMNS = ["college_id", "name", "course", "semester", "admission_year", "gender", "phone", "parent_contact", "father_name", "password"]
# SAMPLE students for testing only (fake names, dummy phones)
DEMO_STUDENTS = [
    ("DEMOSTU01", "Sample Student One", "Male"), ("DEMOSTU02", "Sample Student Two", "Female"),
    ("DEMOSTU03", "Sample Student Three", "Male"), ("DEMOSTU04", "Sample Student Four", "Female"),
    ("DEMOSTU05", "Sample Student Five", "Male"), ("DEMOSTU06", "Sample Student Six", "Female"),
    ("DEMOSTU07", "Sample Student Seven", "Male"), ("DEMOSTU08", "Sample Student Eight", "Female"),
]


def _key(s) -> str:
    return "".join(str(s or "").lower().split())


def _is_active(user) -> bool:
    return str(user.is_active).lower() != "false"


def _sem_num(s) -> Optional[int]:
    m = re.search(r"\d+", str(s or ""))
    return int(m.group()) if m else None


def _bump(s: str, new_num: int) -> str:
    """Change the number inside '3' / 'Semester 3' / '3rd' but keep the rest of the text."""
    return re.sub(r"\d+", str(new_num), str(s), count=1)


def _csv_safe(v) -> str:
    v = "" if v is None else str(v)
    return "'" + v if v[:1] in ("=", "+", "-", "@") else v


def _out(p, u) -> schemas.StudentOut:
    return schemas.StudentOut(
        id=str(p.id), college_id=p.college_id, name=p.name, course=p.course, department=p.department,
        semester=p.semester, admission_year=p.admission_year, gender=p.gender, phone=p.phone,
        parent_contact=p.parent_contact, father_name=p.father_name, is_active=_is_active(u),
    )


def _uuid(value, msg="Student nahi mila."):
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _load(db: Session, profile_id: str):
    P, U = models.StudentProfile, models.User
    row = db.query(P, U).join(U, U.id == P.user_id).filter(P.id == _uuid(profile_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Student nahi mila.")
    return row


def _load_many(db: Session, ids: List[str]):
    P, U = models.StudentProfile, models.User
    uids = [_uuid(i) for i in ids]
    return db.query(P, U).join(U, U.id == P.user_id).filter(P.id.in_(uids)).all()


def _course_by_id(db: Session, course_id: str):
    c = db.query(models.AdminCourse).filter(models.AdminCourse.id == _uuid(course_id, "Course nahi mila.")).first()
    if not c:
        raise HTTPException(status_code=400, detail="Ye course nahi mila.")
    return c


def _dept_name(db: Session, course) -> Optional[str]:
    d = db.query(models.AdminDepartment).filter(models.AdminDepartment.id == course.department_id).first()
    return d.name if d else None


def _check_semester(course, semester: Optional[str]):
    n = _sem_num(semester)
    if semester and n is None:
        raise HTTPException(status_code=400, detail="Semester me number hona chahiye (jaise 3).")
    if n is not None and not 1 <= n <= course.semesters:
        raise HTTPException(status_code=400, detail=f"Is course me sirf {course.semesters} semesters hain.")


def _filtered(db: Session, q, course, semester, status):
    P, U = models.StudentProfile, models.User
    query = db.query(P, U).join(U, U.id == P.user_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(P.name.ilike(like), P.college_id.ilike(like)))
    if course:
        query = query.filter(func.lower(func.replace(P.course, " ", "")) == _key(course))
    if semester:
        query = query.filter(func.lower(func.replace(P.semester, " ", "")) == _key(semester))
    if status == "suspended":
        query = query.filter(U.is_active == "false")
    elif status == "active":
        query = query.filter(or_(U.is_active.is_(None), U.is_active != "false"))
    return query


def _create_student(db: Session, college_id, name, password, course, semester, year, gender, phone, parent, father):
    user = models.User(role=models.RoleEnum.student, username=college_id, hashed_password=hash_password(password))
    db.add(user)
    db.flush()
    p = models.StudentProfile(
        user_id=user.id, name=name, college_id=college_id, course=course.name if course else None,
        department=_dept_name(db, course) if course else None, semester=semester, admission_year=year,
        gender=gender, phone=phone, parent_contact=parent, father_name=father,
    )
    db.add(p)
    db.flush()
    return p, user


@router.get("", response_model=schemas.StudentPage)
def list_students(
    q: Optional[str] = Query(None, max_length=100),
    course: Optional[str] = Query(None, max_length=120),
    semester: Optional[str] = Query(None, max_length=20),
    status: Optional[str] = Query(None, pattern="^(active|suspended)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    P, U = models.StudentProfile, models.User
    query = _filtered(db, q, course, semester, status)
    total = query.count()
    rows = query.order_by(P.name).offset((page - 1) * page_size).limit(page_size).all()
    all_total = db.query(func.count(P.id)).scalar() or 0
    suspended = db.query(func.count(P.id)).join(U, U.id == P.user_id).filter(U.is_active == "false").scalar() or 0
    no_course = db.query(func.count(P.id)).filter(or_(P.course.is_(None), P.course == "")).scalar() or 0
    return schemas.StudentPage(
        items=[_out(p, u) for p, u in rows], total=total, page=page, page_size=page_size,
        stats={"total": all_total, "active": all_total - suspended, "suspended": suspended, "without_course": no_course},
    )


@router.get("/export")
def export_students(
    q: Optional[str] = None, course: Optional[str] = None, semester: Optional[str] = None,
    status: Optional[str] = Query(None, pattern="^(active|suspended)$"),
    admin=Depends(require_admin), db: Session = Depends(get_db),
):
    rows = _filtered(db, q, course, semester, status).order_by(models.StudentProfile.name).limit(EXPORT_MAX_ROWS).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["college_id", "name", "course", "department", "semester", "admission_year", "gender", "phone", "parent_contact", "father_name", "status"])
    for p, u in rows:
        w.writerow([_csv_safe(x) for x in (p.college_id, p.name, p.course, p.department, p.semester, p.admission_year, p.gender, p.phone, p.parent_contact, p.father_name, "active" if _is_active(u) else "suspended")])
    log_activity(db, admin, "student.export", f"Students exported ({len(rows)} rows)")
    return Response(
        content="\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="students.csv"'},
    )


@router.get("/import-template")
def import_template(admin=Depends(require_admin)):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_COLUMNS)
    w.writerow(["SAMPLE001", "Sample Student A", "", "1", "2025", "Male", "9000000011", "9000000012", "Sample Parent", ""])
    w.writerow(["SAMPLE002", "Sample Student B", "", "1", "2025", "Female", "9000000013", "", "", ""])
    return Response(
        content="\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="students_template.csv"'},
    )


@router.post("/import")
def import_students(
    file: UploadFile = File(...),
    default_password: str = Form(""),
    dry_run: bool = Form(True),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Sirf .csv file upload karo.")
    raw = file.file.read(IMPORT_MAX_BYTES + 1)
    if len(raw) > IMPORT_MAX_BYTES:
        raise HTTPException(status_code=400, detail="File 2 MB se badi hai.")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File UTF-8 CSV honi chahiye (Excel me 'CSV UTF-8' se save karo).")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="The file is empty.")
    reader.fieldnames = [(h or "").strip().lower() for h in reader.fieldnames]
    for need in ("college_id", "name"):
        if need not in reader.fieldnames:
            raise HTTPException(status_code=400, detail=f"CSV me '{need}' column zaroori hai.")
    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=400, detail="File me koi student row nahi hai.")
    if len(rows) > IMPORT_MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Ek file me {IMPORT_MAX_ROWS} se zyada rows nahi ho sakti.")
    if not dry_run and not (8 <= len(default_password or "") <= 64):
        raise HTTPException(status_code=400, detail="Default password 8 se 64 characters ka daalo.")

    courses = {c.name_key: c for c in db.query(models.AdminCourse).filter(models.AdminCourse.is_active.is_(True)).all()}
    ids_in_file = [_key(r.get("college_id")) for r in rows if r.get("college_id")]
    existing = {
        u.lower() for (u,) in db.query(models.User.username).filter(func.lower(models.User.username).in_([i for i in ids_in_file])).all()
    }
    seen, errors, good = set(), [], []
    for n, r in enumerate(rows, start=2):  # row 1 is the header
        def bad(msg):
            errors.append({"row": n, "college_id": (r.get("college_id") or "").strip(), "message": msg})
        cid = (r.get("college_id") or "").strip()
        course_text = (r.get("course") or "").strip()
        course = None
        if course_text:
            course = courses.get(_key(course_text))
            if not course:
                bad(f"Course '{course_text}' admin ke active courses me nahi hai.")
                continue
        try:
            data = schemas.StudentCreate(
                college_id=cid, name=r.get("name"), password=(r.get("password") or default_password or "x" * 8),
                semester=r.get("semester"), admission_year=r.get("admission_year"), gender=r.get("gender"),
                phone=r.get("phone"), parent_contact=r.get("parent_contact"), father_name=r.get("father_name"),
            )
        except ValidationError as e:
            bad(e.errors()[0]["msg"].replace("Value error, ", ""))
            continue
        if _key(data.college_id) in seen:
            bad("Ye College ID file me dobara aayi hai.")
            continue
        if data.college_id.lower() in existing:
            bad("Ye College ID pehle se system me hai.")
            continue
        n_sem = _sem_num(data.semester)
        if course and n_sem is not None and not 1 <= n_sem <= course.semesters:
            bad(f"Is course me sirf {course.semesters} semesters hain.")
            continue
        if data.semester and n_sem is None:
            bad("Semester me number hona chahiye.")
            continue
        seen.add(_key(data.college_id))
        good.append((data, course, (r.get("password") or "").strip()))

    created = 0
    if not dry_run:
        for data, course, own_pw in good:
            pw = own_pw if 8 <= len(own_pw) <= 64 else default_password
            _create_student(db, data.college_id, data.name, pw, course, data.semester, data.admission_year,
                            data.gender, data.phone, data.parent_contact, data.father_name)
            created += 1
        db.commit()
        if created:
            log_activity(db, admin, "student.import", f"Students imported: {created} added, {len(errors)} rows skipped")
    return {"total_rows": len(rows), "valid": len(good), "created": created, "dry_run": dry_run, "errors": errors[:100]}


@router.post("/promote")
def promote_students(payload: schemas.StudentIdsIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    courses = {c.name_key: c for c in db.query(models.AdminCourse).all()}
    promoted, skipped = 0, []
    for p, u in _load_many(db, payload.student_ids):
        n = _sem_num(p.semester)
        course = courses.get(_key(p.course))
        if not _is_active(u):
            skipped.append({"name": p.name, "reason": "Student suspended hai."})
        elif n is None:
            skipped.append({"name": p.name, "reason": "Semester set nahi hai."})
        elif course is None:
            skipped.append({"name": p.name, "reason": "Course admin list me nahi mila."})
        elif n >= course.semesters:
            skipped.append({"name": p.name, "reason": "Last semester me hai."})
        else:
            p.semester = _bump(p.semester, n + 1)
            promoted += 1
    db.commit()
    if promoted:
        log_activity(db, admin, "student.promote", f"Students promoted to next semester: {promoted}")
    return {"promoted": promoted, "skipped": skipped}


@router.post("/transfer")
def transfer_students(payload: schemas.StudentTransferIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    course = _course_by_id(db, payload.course_id)
    if not course.is_active:
        raise HTTPException(status_code=400, detail="Inactive course me transfer nahi ho sakta.")
    _check_semester(course, payload.semester)
    dept = _dept_name(db, course)
    rows = _load_many(db, payload.student_ids)
    for p, u in rows:
        p.course, p.department = course.name, dept
        if payload.semester:
            p.semester = payload.semester
    db.commit()
    log_activity(db, admin, "student.transfer", f"{len(rows)} students transferred to {course.name}")
    return {"transferred": len(rows)}


@router.post("", response_model=schemas.StudentOut)
def create_student(payload: schemas.StudentCreate, admin=Depends(require_admin), db: Session = Depends(get_db)):
    if db.query(models.User).filter(func.lower(models.User.username) == payload.college_id.lower()).first():
        raise HTTPException(status_code=400, detail="Ye College ID pehle se use me hai.")
    course = _course_by_id(db, payload.course_id) if payload.course_id else None
    if course:
        _check_semester(course, payload.semester)
    p, u = _create_student(db, payload.college_id, payload.name, payload.password, course, payload.semester,
                           payload.admission_year, payload.gender, payload.phone, payload.parent_contact, payload.father_name)
    db.commit()
    log_activity(db, admin, "student.create", f"Student added: {p.name} ({p.college_id})")
    return _out(p, u)


@router.put("/{profile_id}", response_model=schemas.StudentOut)
def update_student(profile_id: str, payload: schemas.StudentUpdate, admin=Depends(require_admin), db: Session = Depends(get_db)):
    p, u = _load(db, profile_id)
    if payload.course_id:
        course = _course_by_id(db, payload.course_id)
        _check_semester(course, payload.semester)
        p.course, p.department = course.name, _dept_name(db, course)
    p.name, p.semester, p.admission_year = payload.name, payload.semester, payload.admission_year
    p.gender, p.phone, p.parent_contact, p.father_name = payload.gender, payload.phone, payload.parent_contact, payload.father_name
    db.commit()
    log_activity(db, admin, "student.update", f"Student updated: {p.name} ({p.college_id})")
    return _out(p, u)


@router.post("/{profile_id}/toggle", response_model=schemas.StudentOut)
def toggle_student(profile_id: str, payload: schemas.StudentToggleIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    p, u = _load(db, profile_id)
    u.is_active = "false" if _is_active(u) else "true"
    db.commit()
    state = "reactivated" if _is_active(u) else "suspended"
    extra = f" - reason: {payload.reason}" if payload.reason and not _is_active(u) else ""
    log_activity(db, admin, "student.toggle", f"Student {state}: {p.name} ({p.college_id}){extra}")
    return _out(p, u)


@router.post("/{profile_id}/reset-password")
def reset_password(profile_id: str, payload: schemas.StudentPasswordReset, admin=Depends(require_admin), db: Session = Depends(get_db)):
    p, u = _load(db, profile_id)
    u.hashed_password = hash_password(payload.password)
    db.commit()
    log_activity(db, admin, "student.password", f"Password reset: {p.name} ({p.college_id})")
    return {"ok": True}


@router.post("/demo-seed")
def demo_seed(admin=Depends(require_admin), db: Session = Depends(get_db)):
    if os.getenv("ENABLE_DEMO_DATA", "").strip().lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai. backend\\.env me ENABLE_DEMO_DATA=true karke backend restart karo.")
    courses = db.query(models.AdminCourse).filter(models.AdminCourse.is_active.is_(True)).order_by(models.AdminCourse.name).all()
    added = 0
    for i, (cid, name, gender) in enumerate(DEMO_STUDENTS):
        if db.query(models.User).filter(func.lower(models.User.username) == cid.lower()).first():
            continue
        course = courses[i % len(courses)] if courses else None
        sem = str(1 + (i % min(course.semesters, 4))) if course else None
        _create_student(db, cid, name, DEMO_PASSWORD, course, sem, "2025", gender, f"90000001{i:02d}", None, None)
        added += 1
    db.commit()
    if added:
        log_activity(db, admin, "student.demo", f"{added} sample students added (demo data)")
    return {"added": added, "password": DEMO_PASSWORD}