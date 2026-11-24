import html
import json
import os
import re
import uuid
import zipfile
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.routers.auth import get_current_user
from app.routers.student import _require_student
from app.routers.timetable import _norm
from app.routers.results import grade_for, PASS_MARKS

router = APIRouter(prefix="/api/student/placement", tags=["student-placement"])

# backend/uploads/resumes/<student id>/<stored file>
UPLOAD_ROOT = Path(os.getenv("UPLOAD_DIR") or (Path(__file__).resolve().parents[2] / "uploads"))
UPLOAD_DIR = UPLOAD_ROOT / "resumes"
MAX_RESUME_BYTES = 3 * 1024 * 1024
RESUME_EXT = {".pdf", ".docx", ".txt"}
MIN_RESUME_WORDS = 30
IST = timezone(timedelta(hours=5, minutes=30))

ACTION_VERBS = [
    "developed", "built", "designed", "implemented", "created", "led", "managed", "optimized", "optimised",
    "analyzed", "analysed", "deployed", "automated", "improved", "organized", "organised", "coordinated",
    "tested", "delivered", "launched", "reduced", "increased", "trained", "presented", "collaborated",
    "engineered", "integrated", "maintained", "researched",
]
SKILL_KEYWORDS = [
    ("python", "Python"), ("java", "Java"), ("c++", "C++"), ("javascript", "JavaScript"),
    ("typescript", "TypeScript"), ("react", "React"), ("node.js", "Node.js"), ("html", "HTML"),
    ("css", "CSS"), ("sql", "SQL"), ("mysql", "MySQL"), ("postgresql", "PostgreSQL"),
    ("mongodb", "MongoDB"), ("django", "Django"), ("flask", "Flask"), ("fastapi", "FastAPI"),
    ("spring", "Spring"), ("machine learning", "Machine Learning"), ("data structures", "Data Structures"),
    ("algorithms", "Algorithms"), ("git", "Git"), ("docker", "Docker"), ("aws", "AWS"), ("linux", "Linux"),
    ("excel", "Excel"), ("power bi", "Power BI"), ("tableau", "Tableau"), ("pandas", "Pandas"),
    ("numpy", "NumPy"),
]

# ------------------------------------------------------------------ demo data (all companies are made up)
DEMO_DRIVES = [
    dict(company="Nimbus Technologies", industry="Cloud and software", location="Bengaluru",
         role="Software Engineer", package=8.5, job_type="Full time", mode="On campus", drive_in=9, apply_in=5,
         min_cgpa=7.0, max_backlogs=0, courses="B.Tech CSE, B.Tech IT, MCA",
         skills="Data structures, Java or Python, SQL",
         process="Online aptitude test\nTechnical interview\nHR interview",
         description="Build and maintain cloud services used by enterprise customers. Freshers join a six month training programme."),
    dict(company="BlueOrbit Systems", industry="IT services", location="Pune",
         role="Associate Software Developer", package=5.0, job_type="Full time", mode="On campus", drive_in=14,
         apply_in=10, min_cgpa=6.0, max_backlogs=1, courses="",
         skills="Programming basics, problem solving, communication",
         process="Aptitude and coding test\nTechnical interview\nHR interview",
         description="Work in a project team on web and mobile applications for clients across industries."),
    dict(company="Vertex Analytics", industry="Data and analytics", location="Hyderabad",
         role="Data Analyst", package=6.5, job_type="Full time", mode="Virtual", drive_in=20, apply_in=16,
         min_cgpa=7.5, max_backlogs=0, courses="B.Tech CSE, B.Tech IT, MCA, MBA",
         skills="SQL, Excel, Python or R, statistics",
         process="Online assessment\nCase study round\nPanel interview",
         description="Analyse business data, build dashboards and present findings to clients."),
    dict(company="Orchid Fintech", industry="Financial technology", location="Mumbai",
         role="Business Analyst Intern", package=3.6, job_type="Internship + PPO", mode="On campus", drive_in=6,
         apply_in=2, min_cgpa=6.5, max_backlogs=None, courses="",
         skills="Excel, communication, logical thinking",
         process="Group discussion\nPersonal interview",
         description="Six month internship with a pre-placement offer for good performers."),
    dict(company="Kiran Infra Solutions", industry="Infrastructure", location="Nagpur",
         role="Graduate Engineer Trainee", package=4.2, job_type="Full time", mode="Off campus", drive_in=4,
         apply_in=-1, min_cgpa=6.0, max_backlogs=2, courses="",
         skills="Core engineering basics, teamwork",
         process="Written test\nTechnical interview",
         description="Site and design roles for fresh engineers. Applications for this drive are already closed."),
    dict(company="Helio Software Labs", industry="Software products", location="Noida",
         role="Software Engineer", package=7.2, job_type="Full time", mode="On campus", drive_in=-20,
         apply_in=-28, min_cgpa=7.0, max_backlogs=0, courses="B.Tech CSE, B.Tech IT, MCA",
         skills="Data structures, OOP, databases",
         process="Online aptitude test\nTechnical interview\nHR interview",
         description="Product engineering roles. This drive is over."),
    dict(company="Zenith Consulting", industry="Consulting", location="Gurugram",
         role="Analyst", package=6.0, job_type="Full time", mode="On campus", drive_in=-35, apply_in=-42,
         min_cgpa=6.5, max_backlogs=1, courses="",
         skills="Aptitude, communication, Excel",
         process="Group discussion\nCase interview\nHR interview",
         description="Business consulting analyst role. This drive is over."),
]

DEMO_RECRUITERS = [
    ("Nimbus Technologies", 14, 12.0), ("BlueOrbit Systems", 11, 6.0), ("Vertex Analytics", 9, 9.5),
    ("Helio Software Labs", 8, 10.0), ("Orchid Fintech", 7, 5.5), ("Zenith Consulting", 6, 7.5),
]


# ------------------------------------------------------------------ helpers
def _csv(text) -> list[str]:
    return [p.strip() for p in (text or "").replace("\n", ",").split(",") if p.strip()]


def _lines(text) -> list[str]:
    return [p.strip() for p in (text or "").splitlines() if p.strip()]


def _academic(db: Session, profile: models.StudentProfile) -> tuple[float | None, int]:
    """(CGPA, number of failed subjects) from the student's published results of fully declared semesters."""
    rows = (
        db.query(models.ResultRecord)
        .filter(models.ResultRecord.student_profile_id == profile.id, models.ResultRecord.published.is_(True))
        .all()
    )
    by_semester = defaultdict(list)
    for r in rows:
        by_semester[r.semester].append(r)
    points = 0
    credits = 0
    backlogs = 0
    for items in by_semester.values():
        if any(r.internal_marks is None or r.external_marks is None for r in items):
            continue
        for r in items:
            total = round(r.internal_marks + r.external_marks, 1)
            _grade, grade_points = grade_for(total)
            points += grade_points * r.credits
            credits += r.credits
            if total < PASS_MARKS:
                backlogs += 1
    return (round(points / credits, 2) if credits else None), backlogs


def _reasons(drive: models.PlacementDrive, profile: models.StudentProfile, cgpa, backlogs: int) -> list[str]:
    reasons = []
    if drive.min_cgpa is not None:
        if cgpa is None:
            reasons.append(f"Your CGPA is not available yet (needs {drive.min_cgpa:g} or more). Results must be published first.")
        elif cgpa < drive.min_cgpa:
            reasons.append(f"Your CGPA {cgpa} is below the required {drive.min_cgpa:g}.")
    if drive.max_backlogs is not None and backlogs > drive.max_backlogs:
        allowed = "no backlogs" if drive.max_backlogs == 0 else f"at most {drive.max_backlogs} backlog(s)"
        reasons.append(f"You have {backlogs} backlog(s); this drive allows {allowed}.")
    courses = _csv(drive.courses)
    if courses and _norm(profile.course) not in [c.lower() for c in courses]:
        if not _norm(profile.course):
            reasons.append("Fill your Course in Student Profile. This drive is for: " + ", ".join(courses) + ".")
        else:
            reasons.append("This drive is only for: " + ", ".join(courses) + ".")
    return reasons


def _get_resume(db: Session, profile: models.StudentProfile):
    return db.query(models.PlacementResume).filter(models.PlacementResume.student_profile_id == profile.id).first()


def _label(score):
    if score is None:
        return None
    if score >= 85:
        return "Excellent"
    if score >= 70:
        return "Good"
    if score >= 50:
        return "Fair"
    return "Needs work"


def _resume_out(row) -> schemas.ResumeOut:
    if row is None:
        return schemas.ResumeOut(has_resume=False)
    analysis = {}
    if row.analysis:
        try:
            analysis = json.loads(row.analysis)
        except ValueError:
            analysis = {}
    return schemas.ResumeOut(
        has_resume=True,
        file_name=row.file_name,
        size_bytes=row.size_bytes,
        uploaded_at=row.uploaded_at,
        score=row.score,
        label=_label(row.score),
        checks=[schemas.ResumeCheckOut(**c) for c in analysis.get("checks", [])],
        skills_found=analysis.get("skills_found", []),
        word_count=analysis.get("word_count"),
        message=analysis.get("message"),
    )


def _extract_text(path: Path, ext: str) -> tuple[str, str | None]:
    """(text, problem). The problem is a message for the student when the text could not be read."""
    try:
        if ext == ".txt":
            return path.read_text(encoding="utf-8", errors="ignore"), None
        if ext == ".docx":
            with zipfile.ZipFile(path) as archive:
                xml = archive.read("word/document.xml").decode("utf-8", errors="ignore")
            xml = xml.replace("</w:p>", "\n").replace("<w:tab/>", " ")
            return html.unescape(re.sub(r"<[^>]+>", "", xml)), None
        if ext == ".pdf":
            try:
                from pypdf import PdfReader
            except ImportError:
                return "", ("Reading PDF files needs the 'pypdf' package on the server. "
                            "Run: pip install pypdf (or upload a DOCX or TXT resume).")
            reader = PdfReader(str(path))
            return "\n".join((page.extract_text() or "") for page in reader.pages), None
    except Exception:
        return "", "We could not read this file. Try another PDF, DOCX or TXT version of your resume."
    return "", None


def _skill_pattern(keyword: str) -> str:
    return r"(?<![a-z0-9+#])" + re.escape(keyword) + r"(?![a-z0-9+#])"


def _analyze(text: str) -> dict:
    """Simple rule-based resume check, 100 points in total. This is not a machine learning model."""
    low = text.lower()
    word_count = len(text.split())
    checks = []

    def add(name, got, maximum, good_tip, missing_tip):
        status = "good" if got >= maximum else ("partial" if got > 0 else "missing")
        checks.append({
            "name": name, "points": got, "max_points": maximum, "status": status,
            "tip": good_tip if status == "good" else missing_tip,
        })

    def has_any(words):
        return any(w in low for w in words)

    has_email = bool(re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", text))
    has_phone = any(len(re.sub(r"\D", "", m)) >= 10 for m in re.findall(r"\+?\d[\d\s\-()]{8,}\d", text))
    add("Email address", 5 if has_email else 0, 5, "Email found.", "Add a professional email address at the top.")
    add("Phone number", 5 if has_phone else 0, 5, "Phone number found.", "Add a phone number recruiters can call.")
    add("Summary or objective", 5 if has_any(["summary", "objective", "profile summary", "about me"]) else 0, 5,
        "A short summary is present.", "Add a 2 to 3 line summary or career objective.")
    add("Education", 10 if has_any(["education", "qualification", "academic", "cgpa", "b.tech", "bachelor"]) else 0, 10,
        "Education section found.", "Add your education with degree, college, year and CGPA.")
    add("Skills", 10 if has_any(["skills", "technologies", "technical skills", "tools"]) else 0, 10,
        "Skills section found.", "Add a skills section listing languages, tools and technologies.")
    add("Projects", 15 if "project" in low else 0, 15,
        "Projects found.", "Add 2 or 3 projects with what you built and the technologies used.")
    add("Experience or internship",
        10 if has_any(["experience", "internship", "intern ", "training", "work history"]) else 0, 10,
        "Experience or internship found.", "Add internships, training or any work experience, even small ones.")
    add("Achievements and certifications",
        5 if has_any(["achievement", "certification", "certificate", "award", "hackathon", "extracurricular"]) else 0, 5,
        "Achievements or certificates found.", "Add certificates, awards or hackathons.")

    if 200 <= word_count <= 700:
        length_points = 10
    elif 120 <= word_count < 200 or 700 < word_count <= 900:
        length_points = 5
    else:
        length_points = 0
    add("Length", length_points, 10, f"{word_count} words is a good length.",
        f"Your resume has {word_count} words. Aim for about 200 to 700 words (one page for freshers).")

    verbs = sum(1 for v in ACTION_VERBS if re.search(rf"\b{v}\b", low))
    add("Action verbs", 10 if verbs >= 5 else (5 if verbs >= 2 else 0), 10,
        "You describe your work with strong action verbs.",
        "Start your points with verbs like developed, built, designed, implemented or led.")

    metrics = len(re.findall(r"\d+(?:\.\d+)?\s*%", text)) + len(
        re.findall(r"\b\d{2,}\+?\s+(?:users|students|clients|customers|records|members|teams|requests|lines|hours|projects|participants)\b", low)
    )
    add("Measurable results", 10 if metrics >= 2 else (5 if metrics == 1 else 0), 10,
        "You include numbers that show results.",
        "Add numbers, for example 'improved speed by 30%' or 'used by 200 students'.")

    add("Profile links", 5 if ("linkedin.com" in low or "github.com" in low) else 0, 5,
        "LinkedIn or GitHub link found.", "Add your LinkedIn or GitHub link.")

    skills = [display for keyword, display in SKILL_KEYWORDS if re.search(_skill_pattern(keyword), low)]
    return {
        "score": sum(c["points"] for c in checks),
        "checks": checks,
        "skills_found": skills,
        "word_count": word_count,
        "message": None,
    }


def _interview_out(iv: models.PlacementInterview, company: str, role: str) -> schemas.PlacementInterviewOut:
    return schemas.PlacementInterviewOut(
        id=str(iv.id), application_id=str(iv.application_id), company=company, role_title=role,
        round_name=iv.round_name, scheduled_at=iv.scheduled_at, mode=iv.mode, venue=iv.venue,
        instructions=iv.instructions, status=iv.status, result=iv.result,
    )


def _application_out(a, d, c, interviews, today: date) -> schemas.PlacementApplicationOut:
    return schemas.PlacementApplicationOut(
        id=str(a.id), drive_id=str(d.id), company=c.name, role_title=d.role_title, package_lpa=d.package_lpa,
        applied_at=a.applied_at, status=a.status,
        can_withdraw=(a.status == "applied" and d.drive_date >= today), interviews=interviews,
    )


def _drive_with_company(db: Session, drive_id: uuid.UUID):
    row = (
        db.query(models.PlacementDrive, models.PlacementCompany)
        .join(models.PlacementCompany, models.PlacementCompany.id == models.PlacementDrive.company_id)
        .filter(models.PlacementDrive.id == drive_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Drive not found.")
    return row


# ------------------------------------------------------------------ endpoints
@router.get("/overview", response_model=schemas.PlacementOverview)
def overview(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    cgpa, backlogs = _academic(db, profile)
    today = date.today()

    applications = (
        db.query(models.PlacementApplication)
        .filter(models.PlacementApplication.student_profile_id == profile.id)
        .all()
    )
    app_by_drive = {a.drive_id: a for a in applications}

    drive_rows = (
        db.query(models.PlacementDrive, models.PlacementCompany)
        .join(models.PlacementCompany, models.PlacementCompany.id == models.PlacementDrive.company_id)
        .order_by(models.PlacementDrive.drive_date)
        .all()
    )
    drive_map = {d.id: (d, c) for d, c in drive_rows}

    drives_out = []
    for d, c in drive_rows:
        reasons = _reasons(d, profile, cgpa, backlogs)
        if d.drive_date < today:
            phase = "over"
        elif today > d.apply_by:
            phase = "closed"
        else:
            phase = "open"
        app = app_by_drive.get(d.id)
        drives_out.append(schemas.PlacementDriveOut(
            id=str(d.id), company=c.name, industry=c.industry, website=c.website,
            location=d.location or c.location, role_title=d.role_title, package_lpa=d.package_lpa,
            job_type=d.job_type, mode=d.mode, drive_date=d.drive_date, apply_by=d.apply_by,
            description=d.description, selection_process=_lines(d.selection_process), skills=_csv(d.skills),
            min_cgpa=d.min_cgpa, max_backlogs=d.max_backlogs, courses=_csv(d.courses), phase=phase,
            days_left=(d.apply_by - today).days, eligible=not reasons, reasons=reasons,
            application_status=app.status if app else None,
        ))

    interviews_by_app = defaultdict(list)
    if applications:
        rows = (
            db.query(models.PlacementInterview)
            .filter(models.PlacementInterview.application_id.in_([a.id for a in applications]))
            .order_by(models.PlacementInterview.scheduled_at)
            .all()
        )
        for iv in rows:
            interviews_by_app[iv.application_id].append(iv)

    applications_out = []
    interviews_out = []
    for a in sorted(applications, key=lambda x: x.applied_at, reverse=True):
        pair = drive_map.get(a.drive_id)
        if not pair:
            continue
        d, c = pair
        ivs = [_interview_out(iv, c.name, d.role_title) for iv in interviews_by_app.get(a.id, [])]
        applications_out.append(_application_out(a, d, c, ivs, today))
        interviews_out.extend(ivs)
    interviews_out.sort(key=lambda x: x.scheduled_at)

    offers = (
        db.query(models.PlacementOffer)
        .filter(models.PlacementOffer.student_profile_id == profile.id)
        .order_by(models.PlacementOffer.offer_date.desc())
        .all()
    )

    recruiters = defaultdict(list)
    for r in db.query(models.PlacementRecruiter).order_by(models.PlacementRecruiter.offers.desc()).all():
        recruiters[r.academic_year].append(
            schemas.PlacementRecruiterOut(company_name=r.company_name, offers=r.offers, highest_package=r.highest_package)
        )
    stats = (
        db.query(models.PlacementStatistic)
        .order_by(models.PlacementStatistic.academic_year.desc())
        .all()
    )

    return schemas.PlacementOverview(
        student=schemas.PlacementStudentOut(
            cgpa=cgpa, backlogs=backlogs, course=profile.course, department=profile.department
        ),
        resume=_resume_out(_get_resume(db, profile)),
        drives=drives_out,
        applications=applications_out,
        interviews=interviews_out,
        offers=[
            schemas.PlacementOfferOut(
                company_name=o.company_name, role_title=o.role_title, package_lpa=o.package_lpa,
                offer_date=o.offer_date, joining_date=o.joining_date, status=o.status,
            )
            for o in offers
        ],
        statistics=[
            schemas.PlacementStatisticOut(
                academic_year=s.academic_year, total_students=s.total_students, placed_students=s.placed_students,
                offers_made=s.offers_made, companies_visited=s.companies_visited,
                highest_package=s.highest_package, average_package=s.average_package,
                median_package=s.median_package, recruiters=recruiters.get(s.academic_year, []),
            )
            for s in stats
        ],
    )


@router.post("/drives/{drive_id}/apply", response_model=schemas.PlacementApplicationOut)
def apply_to_drive(
    drive_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    drive, company = _drive_with_company(db, drive_id)
    today = date.today()

    if drive.drive_date < today or today > drive.apply_by:
        raise HTTPException(status_code=400, detail="Applications for this drive are closed.")
    if _get_resume(db, profile) is None:
        raise HTTPException(status_code=400, detail="Upload your resume in the Resume tab before applying.")

    cgpa, backlogs = _academic(db, profile)
    reasons = _reasons(drive, profile, cgpa, backlogs)
    if reasons:
        raise HTTPException(status_code=400, detail="You are not eligible for this drive. " + " ".join(reasons))

    now = datetime.now(timezone.utc)
    existing = (
        db.query(models.PlacementApplication)
        .filter(
            models.PlacementApplication.drive_id == drive.id,
            models.PlacementApplication.student_profile_id == profile.id,
        )
        .first()
    )
    if existing is not None:
        if existing.status != "withdrawn":
            raise HTTPException(status_code=400, detail="You have already applied to this drive.")
        existing.status = "applied"  # applying again after a withdrawal
        existing.applied_at = now
        existing.updated_at = now
        application = existing
    else:
        application = models.PlacementApplication(
            drive_id=drive.id, student_profile_id=profile.id, status="applied", applied_at=now, updated_at=now
        )
        db.add(application)

    db.commit()
    db.refresh(application)
    return _application_out(application, drive, company, [], today)


@router.post("/applications/{application_id}/withdraw", response_model=schemas.PlacementApplicationOut)
def withdraw(
    application_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    application = (
        db.query(models.PlacementApplication)
        .filter(
            models.PlacementApplication.id == application_id,
            models.PlacementApplication.student_profile_id == profile.id,
        )
        .first()
    )
    if not application:
        raise HTTPException(status_code=404, detail="Application not found.")
    drive, company = _drive_with_company(db, application.drive_id)
    if application.status != "applied":
        raise HTTPException(
            status_code=400, detail="Only an application that has not been processed yet can be withdrawn."
        )
    application.status = "withdrawn"
    application.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(application)
    return _application_out(application, drive, company, [], date.today())


@router.post("/resume", response_model=schemas.ResumeOut)
def upload_resume(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    original = Path(file.filename or "").name
    ext = Path(original).suffix.lower()
    if ext not in RESUME_EXT:
        raise HTTPException(status_code=400, detail="Upload your resume as a PDF, DOCX or TXT file.")
    data = file.file.read(MAX_RESUME_BYTES + 1)
    if len(data) > MAX_RESUME_BYTES:
        raise HTTPException(status_code=400, detail="The file is larger than 3 MB.")
    if not data:
        raise HTTPException(status_code=400, detail="The file is empty.")

    folder = UPLOAD_DIR / str(profile.id)
    folder.mkdir(parents=True, exist_ok=True)
    stored = f"resume_{uuid.uuid4().hex}{ext}"
    path = folder / stored
    path.write_bytes(data)

    text, problem = _extract_text(path, ext)
    score = None
    if len(text.split()) >= MIN_RESUME_WORDS:
        analysis = _analyze(text)
        score = analysis.pop("score")
    else:
        analysis = {
            "checks": [], "skills_found": [], "word_count": len(text.split()),
            "message": problem or "We could not find enough text in this file to check it. "
                                  "Upload a text-based PDF (not a scanned image), a DOCX or a TXT file.",
        }

    existing = _get_resume(db, profile)
    now = datetime.now(timezone.utc)
    if existing is not None:
        try:
            (folder / existing.file_path).unlink(missing_ok=True)
        except OSError:
            pass
        existing.file_name = original
        existing.file_path = stored
        existing.size_bytes = len(data)
        existing.uploaded_at = now
        existing.score = score
        existing.analysis = json.dumps(analysis)
        row = existing
    else:
        row = models.PlacementResume(
            student_profile_id=profile.id, file_name=original, file_path=stored, size_bytes=len(data),
            uploaded_at=now, score=score, analysis=json.dumps(analysis),
        )
        db.add(row)

    db.commit()
    db.refresh(row)
    return _resume_out(row)


@router.get("/resume/file")
def download_resume(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    row = _get_resume(db, profile)
    if row is None:
        raise HTTPException(status_code=404, detail="You have not uploaded a resume yet.")
    path = UPLOAD_DIR / str(profile.id) / row.file_path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="The file is missing on the server.")
    return FileResponse(path, filename=row.file_name)


def _ensure_catalogue(db: Session) -> dict:
    """Creates the sample companies and drives once (for everyone) and returns {company name: drive}."""
    if db.query(models.PlacementDrive.id).first() is None:
        today = date.today()
        for spec in DEMO_DRIVES:
            company = db.query(models.PlacementCompany).filter(models.PlacementCompany.name == spec["company"]).first()
            if company is None:
                company = models.PlacementCompany(
                    name=spec["company"], industry=spec["industry"], location=spec["location"]
                )
                db.add(company)
                db.flush()
            db.add(models.PlacementDrive(
                company_id=company.id, role_title=spec["role"], package_lpa=spec["package"],
                job_type=spec["job_type"], mode=spec["mode"], location=spec["location"],
                drive_date=today + timedelta(days=spec["drive_in"]),
                apply_by=today + timedelta(days=spec["apply_in"]),
                description=spec["description"], selection_process=spec["process"], skills=spec["skills"],
                min_cgpa=spec["min_cgpa"], max_backlogs=spec["max_backlogs"], courses=spec["courses"] or None,
            ))
        db.flush()
    rows = (
        db.query(models.PlacementDrive, models.PlacementCompany)
        .join(models.PlacementCompany, models.PlacementCompany.id == models.PlacementDrive.company_id)
        .all()
    )
    return {c.name: d for d, c in rows}


@router.post("/demo-seed")
def demo_seed(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """DEV ONLY. Creates sample (made-up) companies and drives, a few sample applications with interviews and an
    offer for this student, and sample placement statistics, so the screen can be tried before the Admin module
    exists. Set ENABLE_DEMO_DATA=false in .env to switch it off."""
    if os.getenv("ENABLE_DEMO_DATA", "true").lower() != "true":
        raise HTTPException(status_code=404, detail="Not available.")
    profile = _require_student(current_user)
    if db.query(models.PlacementApplication.id).filter(
        models.PlacementApplication.student_profile_id == profile.id
    ).first():
        raise HTTPException(status_code=400, detail="You already have placement applications.")

    catalogue = _ensure_catalogue(db)
    now = datetime.now(timezone.utc)
    today = date.today()

    def when(day_offset, hour, minute):
        return datetime.combine(today + timedelta(days=day_offset), time(hour, minute), tzinfo=IST)

    def add_application(company, status, days_ago):
        drive = catalogue.get(company)
        if drive is None:
            return None, None
        app = models.PlacementApplication(
            drive_id=drive.id, student_profile_id=profile.id, status=status,
            applied_at=now - timedelta(days=days_ago), updated_at=now - timedelta(days=days_ago),
        )
        db.add(app)
        db.flush()
        return app, drive

    def add_interview(app, round_name, day_offset, hour, minute, mode, venue, instructions, status, result):
        if app is None:
            return
        db.add(models.PlacementInterview(
            application_id=app.id, round_name=round_name, scheduled_at=when(day_offset, hour, minute), mode=mode,
            venue=venue, instructions=instructions, status=status, result=result,
        ))

    created = 0

    app, drive = add_application("Helio Software Labs", "selected", 30)
    if app is not None:
        created += 1
        add_interview(app, "Online aptitude test", -22, 10, 0, "Online", "Test link was sent by email",
                      "Keep your college ID card ready.", "completed", "cleared")
        add_interview(app, "Technical interview", -20, 11, 30, "In person", "Placement Cell, Block A",
                      "Carry two copies of your resume.", "completed", "cleared")
        add_interview(app, "HR interview", -19, 14, 0, "In person", "Placement Cell, Block A",
                      "Formal dress code.", "completed", "cleared")
        db.add(models.PlacementOffer(
            student_profile_id=profile.id, drive_id=drive.id, company_name="Helio Software Labs",
            role_title="Software Engineer", package_lpa=7.2, offer_date=today - timedelta(days=15),
            joining_date=today + timedelta(days=120), status="accepted",
        ))

    app, _drive = add_application("Zenith Consulting", "rejected", 44)
    if app is not None:
        created += 1
        add_interview(app, "Group discussion", -33, 10, 0, "In person", "Seminar Hall",
                      "Topic is given on the spot.", "completed", "not_cleared")

    app, _drive = add_application("BlueOrbit Systems", "interview", 4)
    if app is not None:
        created += 1
        add_interview(app, "Online coding test", -1, 16, 0, "Online", "Test link was sent by email",
                      "Two coding questions in 60 minutes.", "completed", "cleared")
        add_interview(app, "Technical interview", 3, 10, 30, "Online", "Meeting link will be shared by email",
                      "Revise data structures and your project. Keep your camera on.", "scheduled", "pending")

    app, _drive = add_application("Orchid Fintech", "applied", 1)
    if app is not None:
        created += 1

    if db.query(models.PlacementStatistic.id).first() is None:
        start_year = today.year if today.month >= 7 else today.year - 1
        figures = [
            (start_year - 1, 180, 132, 148, 34, 24.0, 6.8, 5.6),
            (start_year - 2, 175, 121, 135, 31, 21.5, 6.4, 5.2),
            (start_year - 3, 168, 109, 120, 27, 18.0, 5.9, 4.8),
        ]
        for index, (year, total, placed, offers, companies, highest, average, median) in enumerate(figures):
            label = f"{year}-{str(year + 1)[2:]}"
            db.add(models.PlacementStatistic(
                academic_year=label, total_students=total, placed_students=placed, offers_made=offers,
                companies_visited=companies, highest_package=highest, average_package=average,
                median_package=median,
            ))
            for name, count, top in DEMO_RECRUITERS:
                db.add(models.PlacementRecruiter(
                    academic_year=label, company_name=name, offers=max(count - index * 2, 1), highest_package=top
                ))

    db.commit()
    return {"applications": created}