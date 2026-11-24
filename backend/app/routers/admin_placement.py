import os
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from .admin_common import log_activity, require_admin

router = APIRouter(prefix="/api/admin/placement", tags=["admin-placement"])

IST = timezone(timedelta(hours=5, minutes=30))
# status -> statuses the admin may move to
NEXT = {
    "applied": ["shortlisted", "rejected"],
    "shortlisted": ["interview", "selected", "rejected"],
    "interview": ["selected", "rejected"],
    "selected": [], "rejected": [], "withdrawn": [],
}


def _key(s) -> str:
    return "".join(str(s or "").lower().split())


def _uuid(value, msg):
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _now():
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=IST)


def _company(db: Session, company_id: str):
    c = db.query(models.PlacementCompany).filter(models.PlacementCompany.id == _uuid(company_id, "Company nahi mili.")).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company nahi mili.")
    return c


def _drive(db: Session, drive_id: str):
    d = db.query(models.PlacementDrive).filter(models.PlacementDrive.id == _uuid(drive_id, "Drive nahi mili.")).first()
    if not d:
        raise HTTPException(status_code=404, detail="Drive nahi mili.")
    return d


@router.get("/summary")
def summary(admin=Depends(require_admin), db: Session = Depends(get_db)):
    D, A, O = models.PlacementDrive, models.PlacementApplication, models.PlacementOffer
    today = date.today()
    return {
        "companies": db.query(models.PlacementCompany).count(),
        "open_drives": db.query(D).filter(D.apply_by >= today).count(),
        "applications": db.query(A).count(),
        "selected": db.query(A).filter(A.status == "selected").count(),
        "offers": db.query(O).count(),
        "highest_package": float(db.query(func.coalesce(func.max(O.package_lpa), 0)).scalar() or 0),
    }


# ---------------------------------- Companies ----------------------------------
def _company_out(c, drives) -> dict:
    return {"id": str(c.id), "name": c.name, "industry": c.industry, "website": c.website, "location": c.location,
            "description": c.description, "drives": drives}


def _name_clash(db, name, exclude_id=None):
    for c in db.query(models.PlacementCompany).all():
        if c.id != exclude_id and _key(c.name) == _key(name):
            raise HTTPException(status_code=400, detail=f"'{c.name}' naam ki company pehle se hai.")


@router.get("/companies")
def list_companies(q: Optional[str] = Query(None, max_length=80), page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100),
                   admin=Depends(require_admin), db: Session = Depends(get_db)):
    C, D = models.PlacementCompany, models.PlacementDrive
    query = db.query(C)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(C.name.ilike(like) | C.industry.ilike(like) | C.location.ilike(like))
    total = query.count()
    rows = query.order_by(C.name).offset((page - 1) * page_size).limit(page_size).all()
    counts = dict(db.query(D.company_id, func.count(D.id)).filter(D.company_id.in_([c.id for c in rows])).group_by(D.company_id).all()) if rows else {}
    return {"items": [_company_out(c, counts.get(c.id, 0)) for c in rows], "total": total, "page": page, "page_size": page_size}


@router.post("/companies")
def create_company(payload: schemas.AdminCompanyIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    _name_clash(db, payload.name)
    c = models.PlacementCompany(**payload.model_dump())
    db.add(c)
    db.commit()
    log_activity(db, admin, "placement.company.create", f"Company added: {c.name}")
    return {"id": str(c.id)}


@router.put("/companies/{company_id}")
def update_company(company_id: str, payload: schemas.AdminCompanyIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    c = _company(db, company_id)
    _name_clash(db, payload.name, exclude_id=c.id)
    for k, v in payload.model_dump().items():
        setattr(c, k, v)
    db.commit()
    log_activity(db, admin, "placement.company.update", f"Company updated: {c.name}")
    return {"ok": True}


@router.delete("/companies/{company_id}")
def delete_company(company_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    c = _company(db, company_id)
    n = db.query(models.PlacementDrive).filter(models.PlacementDrive.company_id == c.id).count()
    if n:
        raise HTTPException(status_code=400, detail=f"Is company ki {n} drives hain, isliye delete nahi ho sakti.")
    name = c.name
    db.delete(c)
    db.commit()
    log_activity(db, admin, "placement.company.delete", f"Company deleted: {name}")
    return {"ok": True}


# ----------------------------------- Drives -----------------------------------
def _drive_out(d, company, apps) -> dict:
    today = date.today()
    return {
        "id": str(d.id), "company_id": str(d.company_id), "company": company, "role_title": d.role_title, "package_lpa": d.package_lpa,
        "job_type": d.job_type, "mode": d.mode, "location": d.location, "drive_date": d.drive_date.isoformat(), "apply_by": d.apply_by.isoformat(),
        "description": d.description, "selection_process": d.selection_process, "skills": d.skills, "min_cgpa": d.min_cgpa,
        "max_backlogs": d.max_backlogs, "courses": [c.strip() for c in (d.courses or "").split(",") if c.strip()],
        "applications": apps, "status": "open" if d.apply_by >= today else ("closed" if d.drive_date >= today else "completed"),
    }


def _course_names(db: Session, names):
    if not names:
        return None
    by_key = {c.name_key: c.name for c in db.query(models.AdminCourse).all()}
    out = []
    for n in names:
        k = _key(n)
        if k not in by_key:
            raise HTTPException(status_code=400, detail=f"Course '{n}' admin ke Courses me nahi hai.")
        if by_key[k] not in out:
            out.append(by_key[k])
    return ", ".join(out)


@router.get("/drives")
def list_drives(
    q: Optional[str] = Query(None, max_length=80),
    status: Optional[str] = Query(None, pattern="^(open|closed)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    D, C, A = models.PlacementDrive, models.PlacementCompany, models.PlacementApplication
    today = date.today()
    query = db.query(D, C).join(C, C.id == D.company_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(D.role_title.ilike(like) | C.name.ilike(like))
    if status == "open":
        query = query.filter(D.apply_by >= today)
    elif status == "closed":
        query = query.filter(D.apply_by < today)
    total = query.count()
    rows = query.order_by(D.drive_date.desc()).offset((page - 1) * page_size).limit(page_size).all()
    counts = dict(db.query(A.drive_id, func.count(A.id)).filter(A.drive_id.in_([d.id for d, _ in rows])).group_by(A.drive_id).all()) if rows else {}
    return {"items": [_drive_out(d, c.name, counts.get(d.id, 0)) for d, c in rows], "total": total, "page": page, "page_size": page_size}


def _fill_drive(d, p: schemas.AdminDriveIn, courses):
    d.role_title, d.package_lpa, d.job_type, d.mode, d.location = p.role_title, p.package_lpa, p.job_type, p.mode, p.location
    d.drive_date, d.apply_by, d.description, d.selection_process = p.drive_date, p.apply_by, p.description, p.selection_process
    d.skills, d.min_cgpa, d.max_backlogs, d.courses = p.skills, p.min_cgpa, p.max_backlogs, courses


@router.post("/drives")
def create_drive(payload: schemas.AdminDriveIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    c = _company(db, payload.company_id)
    d = models.PlacementDrive(company_id=c.id)
    _fill_drive(d, payload, _course_names(db, payload.courses))
    db.add(d)
    db.commit()
    log_activity(db, admin, "placement.drive.create", f"Drive created: {c.name} - {d.role_title} on {d.drive_date}")
    return {"id": str(d.id)}


@router.put("/drives/{drive_id}")
def update_drive(drive_id: str, payload: schemas.AdminDriveIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    d = _drive(db, drive_id)
    c = _company(db, payload.company_id)
    if c.id != d.company_id and db.query(models.PlacementApplication).filter(models.PlacementApplication.drive_id == d.id).first():
        raise HTTPException(status_code=400, detail="Applications aa chuki hain, isliye drive ki company nahi badal sakte.")
    d.company_id = c.id
    _fill_drive(d, payload, _course_names(db, payload.courses))
    db.commit()
    log_activity(db, admin, "placement.drive.update", f"Drive updated: {c.name} - {d.role_title}")
    return {"ok": True}


@router.delete("/drives/{drive_id}")
def delete_drive(drive_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    d = _drive(db, drive_id)
    apps = db.query(models.PlacementApplication).filter(models.PlacementApplication.drive_id == d.id).count()
    offers = db.query(models.PlacementOffer).filter(models.PlacementOffer.drive_id == d.id).count()
    if apps or offers:
        raise HTTPException(status_code=400, detail=f"Is drive par {apps} applications / {offers} offers hain, isliye delete nahi ho sakti.")
    label = f"{d.role_title}"
    db.delete(d)
    db.commit()
    log_activity(db, admin, "placement.drive.delete", f"Drive deleted: {label}")
    return {"ok": True}


# -------------------------------- Applications --------------------------------
@router.get("/drives/{drive_id}/applications")
def applicants(drive_id: str, status: Optional[str] = Query(None, max_length=20), admin=Depends(require_admin), db: Session = Depends(get_db)):
    d = _drive(db, drive_id)
    A, P, I, O = models.PlacementApplication, models.StudentProfile, models.PlacementInterview, models.PlacementOffer
    rows = db.query(A, P).join(P, P.id == A.student_profile_id).filter(A.drive_id == d.id).order_by(A.applied_at).all()
    counts = {}
    for a, _ in rows:
        counts[a.status] = counts.get(a.status, 0) + 1
    ids = [a.id for a, _ in rows]
    ivs = {}
    if ids:
        for i in db.query(I).filter(I.application_id.in_(ids)).order_by(I.scheduled_at).all():
            t = i.scheduled_at.astimezone(IST)
            ivs.setdefault(i.application_id, []).append({
                "id": str(i.id), "round_name": i.round_name, "date": t.strftime("%Y-%m-%d"), "time": t.strftime("%H:%M"),
                "mode": i.mode, "venue": i.venue, "instructions": i.instructions, "status": i.status, "result": i.result})
    offers = {o.student_profile_id: o for o in db.query(O).filter(O.drive_id == d.id).all()}
    items = []
    for a, p in rows:
        if status and a.status != status:
            continue
        o = offers.get(p.id)
        items.append({
            "id": str(a.id), "name": p.name, "college_id": p.college_id, "course": p.course, "semester": p.semester,
            "status": a.status, "applied_on": a.applied_at.astimezone(IST).strftime("%Y-%m-%d"), "next": NEXT.get(a.status, []),
            "interviews": ivs.get(a.id, []), "offer": o.status if o else None,
            "can_schedule": a.status in ("shortlisted", "interview"), "can_offer": a.status == "selected" and o is None,
        })
    return {"drive": {"id": str(d.id), "role_title": d.role_title, "package_lpa": d.package_lpa}, "counts": counts, "items": items}


def _application(db: Session, application_id: str):
    a = db.query(models.PlacementApplication).filter(models.PlacementApplication.id == _uuid(application_id, "Application nahi mili.")).first()
    if not a:
        raise HTTPException(status_code=404, detail="Application nahi mili.")
    p = db.query(models.StudentProfile).filter(models.StudentProfile.id == a.student_profile_id).first()
    d = db.query(models.PlacementDrive).filter(models.PlacementDrive.id == a.drive_id).first()
    return a, p, d


@router.post("/applications/{application_id}/status")
def set_status(application_id: str, payload: schemas.AdminApplicationStatusIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    a, p, d = _application(db, application_id)
    if payload.status not in NEXT.get(a.status, []):
        raise HTTPException(status_code=400, detail=f"'{a.status}' se '{payload.status}' nahi kar sakte.")
    a.status, a.updated_at = payload.status, _now()
    if payload.status == "rejected":
        for i in db.query(models.PlacementInterview).filter(models.PlacementInterview.application_id == a.id, models.PlacementInterview.status == "scheduled").all():
            i.status = "cancelled"
    db.commit()
    log_activity(db, admin, "placement.status", f"{p.name}: {d.role_title} -> {payload.status}")
    return {"status": a.status}


@router.post("/applications/{application_id}/interviews")
def schedule_interview(application_id: str, payload: schemas.AdminInterviewIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    a, p, d = _application(db, application_id)
    if a.status not in ("shortlisted", "interview"):
        raise HTTPException(status_code=400, detail="Round sirf shortlisted ya interview wale student ka schedule hota hai.")
    when = _aware(payload.scheduled_at)
    if when <= _now():
        raise HTTPException(status_code=400, detail="Round ka time aage ka hona chahiye.")
    clash = db.query(models.PlacementInterview).filter(models.PlacementInterview.application_id == a.id,
                                                       models.PlacementInterview.status == "scheduled", models.PlacementInterview.scheduled_at == when).first()
    if clash:
        raise HTTPException(status_code=400, detail="Is student ka isi time par round pehle se hai.")
    db.add(models.PlacementInterview(application_id=a.id, round_name=payload.round_name, scheduled_at=when, mode=payload.mode,
                                     venue=payload.venue, instructions=payload.instructions, status="scheduled", result="pending"))
    if a.status == "shortlisted":
        a.status, a.updated_at = "interview", _now()
    db.commit()
    log_activity(db, admin, "placement.interview", f"Round scheduled: {p.name} - {payload.round_name} ({d.role_title})")
    return {"ok": True}


@router.post("/interviews/{interview_id}/update")
def update_interview(interview_id: str, payload: schemas.AdminInterviewUpdateIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    i = db.query(models.PlacementInterview).filter(models.PlacementInterview.id == _uuid(interview_id, "Round nahi mila.")).first()
    if not i:
        raise HTTPException(status_code=404, detail="Round nahi mila.")
    if i.status != "scheduled":
        raise HTTPException(status_code=400, detail="Ye round pehle hi completed/cancelled hai.")
    if payload.status == "completed" and not payload.result:
        raise HTTPException(status_code=400, detail="Completed round ka result (cleared / not cleared) chuno.")
    i.status = payload.status
    i.result = payload.result if payload.status == "completed" else "pending"
    a, p, d = _application(db, str(i.application_id))
    db.commit()
    log_activity(db, admin, "placement.interview.update", f"Round {payload.status}: {p.name} - {i.round_name}" + (f" ({payload.result})" if payload.result else ""))
    return {"ok": True}


@router.post("/applications/{application_id}/offer")
def make_offer(application_id: str, payload: schemas.AdminOfferIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    a, p, d = _application(db, application_id)
    if a.status != "selected":
        raise HTTPException(status_code=400, detail="Offer sirf selected student ko de sakte ho.")
    O = models.PlacementOffer
    if db.query(O.id).filter(O.student_profile_id == p.id, O.drive_id == d.id).first():
        raise HTTPException(status_code=400, detail="Is drive ka offer is student ko pehle se diya ja chuka hai.")
    if payload.joining_date and payload.joining_date < date.today():
        raise HTTPException(status_code=400, detail="Joining date past me nahi ho sakti.")
    company = db.query(models.PlacementCompany).filter(models.PlacementCompany.id == d.company_id).first()
    db.add(O(student_profile_id=p.id, drive_id=d.id, company_name=company.name, role_title=d.role_title, package_lpa=d.package_lpa,
             offer_date=date.today(), joining_date=payload.joining_date, status="pending"))
    db.commit()
    log_activity(db, admin, "placement.offer", f"Offer made: {p.name} - {company.name} ({d.package_lpa} LPA)")
    return {"ok": True}


# -------------------------------- Statistics --------------------------------
def _stat_out(s) -> dict:
    return {"id": str(s.id), "academic_year": s.academic_year, "total_students": s.total_students, "placed_students": s.placed_students,
            "offers_made": s.offers_made, "companies_visited": s.companies_visited, "highest_package": s.highest_package,
            "average_package": s.average_package, "median_package": s.median_package,
            "placement_pct": round(s.placed_students * 100 / s.total_students, 1) if s.total_students else 0}


@router.get("/statistics")
def list_stats(admin=Depends(require_admin), db: Session = Depends(get_db)):
    S = models.PlacementStatistic
    return {"items": [_stat_out(s) for s in db.query(S).order_by(S.academic_year.desc()).all()]}


@router.put("/statistics")
def save_stat(payload: schemas.AdminPlacementStatIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    if payload.placed_students > payload.total_students:
        raise HTTPException(status_code=400, detail="Placed students total students se zyada nahi ho sakte.")
    if payload.offers_made < payload.placed_students:
        raise HTTPException(status_code=400, detail="Offers kam se kam placed students jitne hone chahiye.")
    if not payload.median_package <= payload.highest_package or not payload.average_package <= payload.highest_package:
        raise HTTPException(status_code=400, detail="Average aur median package highest se zyada nahi ho sakte.")
    S = models.PlacementStatistic
    s = db.query(S).filter(S.academic_year == payload.academic_year).first()
    created = s is None
    if created:
        s = S(academic_year=payload.academic_year)
        db.add(s)
    for k, v in payload.model_dump().items():
        setattr(s, k, v)
    db.commit()
    log_activity(db, admin, "placement.stats", f"Placement statistics {'added' if created else 'updated'}: {s.academic_year}")
    return {"ok": True}


@router.delete("/statistics/{stat_id}")
def delete_stat(stat_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    s = db.query(models.PlacementStatistic).filter(models.PlacementStatistic.id == _uuid(stat_id, "Record nahi mila.")).first()
    if not s:
        raise HTTPException(status_code=404, detail="Record nahi mila.")
    year = s.academic_year
    db.query(models.PlacementRecruiter).filter(models.PlacementRecruiter.academic_year == year).delete()
    db.delete(s)
    db.commit()
    log_activity(db, admin, "placement.stats.delete", f"Placement statistics deleted: {year}")
    return {"ok": True}


@router.get("/recruiters")
def list_recruiters(academic_year: str = Query(..., max_length=10), admin=Depends(require_admin), db: Session = Depends(get_db)):
    R = models.PlacementRecruiter
    rows = db.query(R).filter(R.academic_year == academic_year).order_by(R.offers.desc(), R.company_name).all()
    return {"items": [{"id": str(r.id), "company_name": r.company_name, "offers": r.offers, "highest_package": r.highest_package} for r in rows]}


@router.post("/recruiters")
def add_recruiter(payload: schemas.AdminRecruiterIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    if not db.query(models.PlacementStatistic.id).filter(models.PlacementStatistic.academic_year == payload.academic_year).first():
        raise HTTPException(status_code=400, detail="Pehle is saal ki statistics save karo.")
    R = models.PlacementRecruiter
    for r in db.query(R).filter(R.academic_year == payload.academic_year).all():
        if _key(r.company_name) == _key(payload.company_name):
            raise HTTPException(status_code=400, detail="Ye company is saal me pehle se hai.")
    db.add(R(**payload.model_dump()))
    db.commit()
    log_activity(db, admin, "placement.recruiter", f"Recruiter added: {payload.company_name} ({payload.academic_year})")
    return {"ok": True}


@router.delete("/recruiters/{recruiter_id}")
def delete_recruiter(recruiter_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    r = db.query(models.PlacementRecruiter).filter(models.PlacementRecruiter.id == _uuid(recruiter_id, "Record nahi mila.")).first()
    if not r:
        raise HTTPException(status_code=404, detail="Record nahi mila.")
    db.delete(r)
    db.commit()
    log_activity(db, admin, "placement.recruiter.delete", f"Recruiter removed: {r.company_name} ({r.academic_year})")
    return {"ok": True}


@router.post("/demo-seed")
def demo_seed(admin=Depends(require_admin), db: Session = Depends(get_db)):
    """SAMPLE companies, drives and a few applications. Runs once."""
    if os.getenv("ENABLE_DEMO_DATA", "").strip().lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai. backend\\.env me ENABLE_DEMO_DATA=true karke backend restart karo.")
    C, D, A = models.PlacementCompany, models.PlacementDrive, models.PlacementApplication
    if db.query(C.id).filter(C.name.like("Sample Company %")).first():
        return {"added": 0, "message": "Sample placement data pehle se bana hai."}
    today = date.today()
    comps = [C(name=f"Sample Company {x}", industry="Sample industry", location="Sample city", description="SAMPLE company for testing.") for x in "ABC"]
    db.add_all(comps)
    db.flush()
    plans = [(comps[0], "Sample Software Trainee", 4.5, 20, 12), (comps[1], "Sample Analyst", 6.0, 10, 3), (comps[2], "Sample Support Associate", 3.2, -5, -20)]
    drives = []
    for c, role, pkg, drive_in, apply_in in plans:
        d = D(company_id=c.id, role_title=role, package_lpa=pkg, job_type="Full time", mode="On campus", location="Campus",
              drive_date=today + timedelta(days=drive_in), apply_by=today + timedelta(days=apply_in), description="SAMPLE drive.",
              selection_process="Aptitude test\nTechnical interview\nHR interview", skills="Communication, Problem solving", min_cgpa=6.0, max_backlogs=1)
        db.add(d)
        drives.append(d)
    db.flush()
    P, U = models.StudentProfile, models.User
    studs = [p for p, u in db.query(P, U).join(U, U.id == P.user_id).order_by(P.name).all() if str(u.is_active).lower() != "false"][:4]
    for s, st in zip(studs, ["applied", "shortlisted", "interview", "selected"]):
        a = A(drive_id=drives[0].id, student_profile_id=s.id, status=st)
        db.add(a)
        db.flush()
        if st == "interview":
            db.add(models.PlacementInterview(application_id=a.id, round_name="Sample Technical Round", scheduled_at=_now() + timedelta(days=3),
                                             mode="Online", venue="Sample meeting link", instructions="SAMPLE round.", status="scheduled", result="pending"))
    db.commit()
    log_activity(db, admin, "placement.demo", f"Sample placement data added (3 companies, 3 drives, {len(studs)} applications, demo data)")
    return {"added": 3, "message": f"3 sample companies, 3 drives aur {len(studs)} sample applications bane."}