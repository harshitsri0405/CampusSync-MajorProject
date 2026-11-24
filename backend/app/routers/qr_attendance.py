import base64
import io
import os
import re
import secrets
from datetime import date, datetime, timedelta

import qrcode
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import Boolean, DateTime
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .auth import get_current_user
from .student import _require_student

router = APIRouter(prefix="/api/student/attendance-qr", tags=["student-attendance-qr"])

# ---- Constants ----
QR_PREFIX = "CSQR:"
QR_VALID_MINUTES = 10
MAX_SUBJECT_LEN = 100
MAX_TOKEN_LEN = 200
RECENT_LIMIT = 10


# ---- Helpers ----
def _profile(db: Session, current_user):
    _require_student(current_user)
    profile = (
        db.query(models.StudentProfile)
        .filter(models.StudentProfile.user_id == current_user.id)
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Pehle apna Profile fill karo")
    return profile


def _pf(profile, *names):
    for n in names:
        v = getattr(profile, n, None)
        if v not in (None, ""):
            return str(v)
    return None


def _n(value) -> str:
    return re.sub(r"\s+", "", str(value or "")).lower()


def _same(a, b) -> bool:
    """Case/space-insensitive match. Empty value on the session side means 'any'."""
    if not _n(a):
        return True
    if _n(a) == _n(b):
        return True
    da, db_ = re.findall(r"\d+", str(a)), re.findall(r"\d+", str(b or ""))
    return bool(da) and da == db_ and not re.search(r"[a-z]", re.sub(r"semester|sem", "", _n(a)))


def create_qr_session(db: Session, subject: str, course, semester, created_by=None,
                      minutes: int = QR_VALID_MINUTES) -> models.QrAttendanceSession:
    """Reusable by the future Faculty module to open a QR attendance session."""
    session = models.QrAttendanceSession(
        token=secrets.token_urlsafe(16),
        subject=subject.strip(),
        course=course,
        semester=semester,
        created_by=created_by,
        expires_at=datetime.utcnow() + timedelta(minutes=minutes),
        is_active=True,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def _write_attendance(db: Session, profile, subject: str):
    """Add a Present row to attendance_records. Returns (recorded, note)."""
    model = None
    for mapper in models.Base.registry.mappers:
        if getattr(mapper.class_, "__tablename__", None) == "attendance_records":
            model = mapper.class_
            break
    if model is None:
        return False, "AttendanceRecord model nahi mila"
    cols = model.__table__.columns

    def pick(names):
        for n in names:
            if n in cols:
                return n
        return None

    c_sid = pick(("student_profile_id", "student_id"))
    c_subj = pick(("subject", "subject_name", "course_name"))
    c_date = pick(("date", "attendance_date", "class_date"))
    c_status = pick(("status", "is_present", "present"))
    if not (c_sid and c_subj and c_date and c_status):
        return False, "Attendance table ke columns match nahi hue"

    today = date.today()
    is_dt = isinstance(cols[c_date].type, DateTime)
    day_val = datetime.combine(today, datetime.min.time()) if is_dt else today

    q = db.query(model).filter(
        getattr(model, c_sid) == profile.id,
        getattr(model, c_subj) == subject,
    )
    if is_dt:
        q = q.filter(
            getattr(model, c_date) >= day_val,
            getattr(model, c_date) < day_val + timedelta(days=1),
        )
    else:
        q = q.filter(getattr(model, c_date) == day_val)
    if q.first():
        return False, "Is subject ki aaj ki attendance pehle se recorded hai"

    present_val = True if isinstance(cols[c_status].type, Boolean) else "Present"
    values = {c_sid: profile.id, c_subj: subject, c_date: day_val, c_status: present_val}

    for c in cols:
        if c.name in values or c.primary_key:
            continue
        if not c.nullable and c.default is None and c.server_default is None:
            return False, f"Attendance table ka required column '{c.name}' auto-fill nahi ho sakta"

    with db.begin_nested():
        db.add(model(**values))
    return True, ""


# ---- Endpoints ----
@router.get("/overview", response_model=schemas.QrOverview)
def overview(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    profile = _profile(db, current_user)
    rows = (
        db.query(models.QrAttendanceScan, models.QrAttendanceSession)
        .join(models.QrAttendanceSession, models.QrAttendanceScan.session_id == models.QrAttendanceSession.id)
        .filter(models.QrAttendanceScan.student_id == profile.id)
        .order_by(models.QrAttendanceScan.scanned_at.desc())
        .limit(RECENT_LIMIT)
        .all()
    )
    return schemas.QrOverview(
        valid_minutes=QR_VALID_MINUTES,
        recent=[
            schemas.QrScanItem(
                id=str(scan.id),
                subject=sess.subject,
                scanned_at=scan.scanned_at,
                attendance_recorded=bool(scan.attendance_recorded),
            )
            for scan, sess in rows
        ],
    )


@router.post("/scan", response_model=schemas.QrScanOut)
def scan(
    payload: schemas.QrScanIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    profile = _profile(db, current_user)

    token = (payload.token or "").strip()
    if token.upper().startswith(QR_PREFIX):
        token = token[len(QR_PREFIX):]
    if not token or len(token) > MAX_TOKEN_LEN:
        raise HTTPException(status_code=400, detail="QR code valid nahi hai")

    session = (
        db.query(models.QrAttendanceSession)
        .filter(models.QrAttendanceSession.token == token)
        .first()
    )
    if not session or not session.is_active:
        raise HTTPException(status_code=400, detail="QR code valid nahi hai")
    if datetime.utcnow() > session.expires_at:
        raise HTTPException(status_code=400, detail="QR code expire ho gaya hai")

    if not (_same(session.course, _pf(profile, "course")) and _same(session.semester, _pf(profile, "semester"))):
        raise HTTPException(status_code=403, detail="Ye QR tumhari class ka nahi hai")

    dup = (
        db.query(models.QrAttendanceScan)
        .filter(
            models.QrAttendanceScan.session_id == session.id,
            models.QrAttendanceScan.student_id == profile.id,
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="Is class ki attendance pehle hi lag chuki hai")

    scan_row = models.QrAttendanceScan(session_id=session.id, student_id=profile.id)
    db.add(scan_row)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Is class ki attendance pehle hi lag chuki hai")

    try:
        recorded, note = _write_attendance(db, profile, session.subject)
    except Exception:
        recorded, note = False, "Attendance table me entry nahi ho payi"

    scan_row.attendance_recorded = recorded
    db.commit()

    if recorded:
        msg = f"{session.subject} ki attendance lag gayi"
    else:
        msg = f"Scan save hua, par attendance record nahi hui: {note}"
    return schemas.QrScanOut(
        ok=True,
        message=msg,
        subject=session.subject,
        date=date.today().isoformat(),
        attendance_recorded=recorded,
    )


@router.post("/demo-session", response_model=schemas.QrDemoSessionOut)
def demo_session(
    payload: schemas.QrDemoSessionIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """DEV ONLY: creates a QR session for the student's own class.
    Remove once the Faculty module creates sessions with create_qr_session()."""
    if os.getenv("ENABLE_DEMO_DATA", "false").lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai")
    profile = _profile(db, current_user)

    subject = (payload.subject or "").strip()
    if not subject or len(subject) > MAX_SUBJECT_LEN:
        raise HTTPException(status_code=400, detail=f"Subject 1 se {MAX_SUBJECT_LEN} characters ka hona chahiye")

    session = create_qr_session(
        db,
        subject=subject,
        course=_pf(profile, "course"),
        semester=_pf(profile, "semester"),
        created_by="demo",
    )
    code = f"{QR_PREFIX}{session.token}"
    img = qrcode.make(code)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    data_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    return schemas.QrDemoSessionOut(
        code=code,
        subject=session.subject,
        expires_at=session.expires_at,
        qr_image=data_url,
    )