import os
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .auth import get_current_user
from .student import _require_student

router = APIRouter(prefix="/api/student/leave", tags=["student-leave"])

# ---- Constants ----
MAX_DAYS = 15
MAX_PAST_DAYS = 7
MAX_FUTURE_DAYS = 180
MIN_REASON_LEN = 10
MAX_REASON_LEN = 500
MAX_FILE_BYTES = 5 * 1024 * 1024
ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png"}
REQUIRED_PCT = 75.0
PRESENT_WORDS = {"present", "p", "late", "od", "on duty", "true", "1"}

# excused = counted as attended for attendance purposes once approved
LEAVE_TYPES = {
    "medical": {"label": "Medical Leave", "excused": True, "attach_after_days": 3},
    "od": {"label": "On Duty (Sports / Event)", "excused": True, "attach_after_days": None},
    "personal": {"label": "Personal Leave", "excused": False, "attach_after_days": None},
    "family": {"label": "Family Function", "excused": False, "attach_after_days": None},
    "other": {"label": "Other", "excused": False, "attach_after_days": None},
}

UPLOAD_ROOT = Path(
    os.getenv("UPLOAD_DIR") or (Path(__file__).resolve().parents[2] / "uploads")
) / "leave"


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


def _model_by_table(table_name: str):
    for mapper in models.Base.registry.mappers:
        cls = mapper.class_
        if getattr(cls, "__tablename__", None) == table_name:
            return cls
    return None


def _is_present(v) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v > 0
    return str(v).strip().lower() in PRESENT_WORDS


def _working_days(start: date, end: date) -> int:
    """Calendar days between start and end (inclusive), Sundays excluded."""
    n, d = 0, start
    while d <= end:
        if d.weekday() != 6:
            n += 1
        d += timedelta(days=1)
    return n


def _days_value(start: date, end: date, half: bool) -> float:
    wd = _working_days(start, end)
    if wd == 0:
        return 0
    return 0.5 if half else float(wd)


def _parse_date(value: str, label: str) -> date:
    try:
        return date.fromisoformat((value or "").strip())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{label} sahi date nahi hai")


def _attendance_snapshot(db: Session, profile):
    """Returns (total, present, avg_classes_per_day)."""
    model = _model_by_table("attendance_records")
    if model is None:
        return 0, 0, 0.0
    col = getattr(model, "student_profile_id", None)
    if col is None:
        return 0, 0, 0.0
    rows = db.query(model).filter(col == profile.id).all()
    total, present, days = 0, 0, set()
    for r in rows:
        status = getattr(r, "status", None)
        d = getattr(r, "date", None)
        if status is None or d is None:
            continue
        total += 1
        if _is_present(status):
            present += 1
        days.add(d.date() if isinstance(d, datetime) else d)
    avg = (total / len(days)) if days else 0.0
    return total, present, avg


def review_leave(db: Session, leave: "models.LeaveRequest", status: str, remarks: Optional[str] = None,
                 reviewer: Optional[str] = None):
    """Reusable by the future Faculty / Admin module to approve or reject a leave."""
    if status not in ("approved", "rejected"):
        raise ValueError("status must be approved or rejected")
    leave.status = status
    leave.reviewer_remarks = remarks
    leave.reviewed_by = reviewer
    leave.reviewed_at = datetime.utcnow()
    leave.has_unseen_update = True
    db.add(models.LeaveEvent(leave_id=leave.id, event=status, note=remarks, actor=reviewer))
    db.commit()


def _to_out(leave, events) -> schemas.LeaveRequestOut:
    meta = LEAVE_TYPES.get(leave.leave_type, {"label": leave.leave_type, "excused": False})
    return schemas.LeaveRequestOut(
        id=str(leave.id),
        leave_type=leave.leave_type,
        type_label=meta["label"],
        excused=bool(meta["excused"]),
        from_date=leave.from_date,
        to_date=leave.to_date,
        is_half_day=bool(leave.is_half_day),
        days=leave.days or 0,
        reason=leave.reason,
        status=leave.status,
        reviewer_remarks=leave.reviewer_remarks,
        reviewed_by=leave.reviewed_by,
        reviewed_at=leave.reviewed_at,
        created_at=leave.created_at,
        has_unseen_update=bool(leave.has_unseen_update),
        has_attachment=bool(leave.attachment_path),
        attachment_name=leave.attachment_name,
        can_cancel=(leave.status == "pending"),
        events=[
            schemas.LeaveEventOut(
                id=str(e.id), event=e.event, note=e.note, actor=e.actor, created_at=e.created_at
            )
            for e in events
        ],
    )


def _get_own_leave(db: Session, profile, leave_id: str):
    try:
        lid = uuid.UUID(leave_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Leave nahi mili")
    leave = (
        db.query(models.LeaveRequest)
        .filter(
            models.LeaveRequest.id == lid,
            models.LeaveRequest.student_profile_id == profile.id,
        )
        .first()
    )
    if not leave:
        raise HTTPException(status_code=404, detail="Leave nahi mili")
    return leave


# ---- Endpoints ----
@router.get("/overview", response_model=schemas.LeaveOverview)
def overview(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    profile = _profile(db, current_user)

    leaves = (
        db.query(models.LeaveRequest)
        .filter(models.LeaveRequest.student_profile_id == profile.id)
        .order_by(models.LeaveRequest.created_at.desc())
        .all()
    )
    ids = [l.id for l in leaves]
    events_by_leave = {}
    if ids:
        events = (
            db.query(models.LeaveEvent)
            .filter(models.LeaveEvent.leave_id.in_(ids))
            .order_by(models.LeaveEvent.created_at.asc())
            .all()
        )
        for e in events:
            events_by_leave.setdefault(e.leave_id, []).append(e)

    summary = schemas.LeaveSummaryOut()
    year = date.today().year
    for l in leaves:
        if l.status in ("pending", "approved", "rejected", "cancelled"):
            setattr(summary, l.status, getattr(summary, l.status) + 1)
        if l.status == "approved" and l.from_date.year == year:
            summary.approved_days_this_year += l.days or 0
            if LEAVE_TYPES.get(l.leave_type, {}).get("excused"):
                summary.excused_days_this_year += l.days or 0
        if l.has_unseen_update:
            summary.unseen += 1

    total, present, _avg = _attendance_snapshot(db, profile)
    attendance = schemas.LeaveAttendanceSnapshot(
        has_data=total > 0,
        percentage=round(present / total * 100, 1) if total else None,
        total_classes=total,
        present=present,
        required=REQUIRED_PCT,
    )

    return schemas.LeaveOverview(
        student=schemas.LeaveStudentInfo(
            name=_pf(profile, "full_name", "name", "student_name"),
            college_id=_pf(profile, "college_id"),
            course=_pf(profile, "course"),
            semester=_pf(profile, "semester"),
        ),
        types=[
            schemas.LeaveTypeOut(
                key=k, label=v["label"], excused=v["excused"], attach_after_days=v["attach_after_days"]
            )
            for k, v in LEAVE_TYPES.items()
        ],
        rules=schemas.LeaveRulesOut(
            max_days=MAX_DAYS,
            max_past_days=MAX_PAST_DAYS,
            max_future_days=MAX_FUTURE_DAYS,
            min_reason_len=MIN_REASON_LEN,
            max_reason_len=MAX_REASON_LEN,
            max_file_mb=MAX_FILE_BYTES // (1024 * 1024),
            allowed_ext=sorted(ALLOWED_EXT),
        ),
        summary=summary,
        attendance=attendance,
        requests=[_to_out(l, events_by_leave.get(l.id, [])) for l in leaves],
    )


@router.get("/impact", response_model=schemas.LeaveImpactOut)
def impact(
    leave_type: str,
    from_date: str,
    to_date: str,
    is_half_day: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    profile = _profile(db, current_user)
    start = _parse_date(from_date, "From date")
    end = _parse_date(to_date, "To date")
    if end < start:
        raise HTTPException(status_code=400, detail="To date, From date se pehle nahi ho sakti")
    if (end - start).days > 60:
        raise HTTPException(status_code=400, detail="Date range bahut lambi hai")

    wd = _working_days(start, end)
    excused = bool(LEAVE_TYPES.get(leave_type, {}).get("excused"))
    total, present, avg = _attendance_snapshot(db, profile)
    if total == 0:
        return schemas.LeaveImpactOut(
            has_data=False,
            message="Attendance data nahi hai, isliye impact nahi nikal sakte",
            working_days=wd,
            will_be_excused=excused,
        )

    day_factor = 0.5 if (is_half_day and start == end) else 1.0
    missed = int(round(avg * wd * day_factor))
    current = present / total * 100
    after_absent = present / (total + missed) * 100
    after_excused = (present + missed) / (total + missed) * 100
    return schemas.LeaveImpactOut(
        has_data=True,
        working_days=wd,
        classes_estimated=missed,
        current_pct=round(current, 1),
        projected_if_absent=round(after_absent, 1),
        projected_if_excused=round(after_excused, 1),
        will_be_excused=excused,
        below_required=(after_excused if excused else after_absent) < REQUIRED_PCT,
        required=REQUIRED_PCT,
    )


@router.post("/apply", response_model=schemas.LeaveRequestOut)
async def apply_leave(
    leave_type: str = Form(...),
    from_date: str = Form(...),
    to_date: str = Form(...),
    is_half_day: bool = Form(False),
    reason: str = Form(...),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    profile = _profile(db, current_user)

    if leave_type not in LEAVE_TYPES:
        raise HTTPException(status_code=400, detail="Leave type sahi nahi hai")
    start = _parse_date(from_date, "From date")
    end = _parse_date(to_date, "To date")
    today = date.today()

    if end < start:
        raise HTTPException(status_code=400, detail="To date, From date se pehle nahi ho sakti")
    if start < today - timedelta(days=MAX_PAST_DAYS):
        raise HTTPException(status_code=400, detail=f"{MAX_PAST_DAYS} din se purani date ke liye leave apply nahi hoti")
    if end > today + timedelta(days=MAX_FUTURE_DAYS):
        raise HTTPException(status_code=400, detail="Itni aage ki date ke liye leave apply nahi hoti")
    if is_half_day and start != end:
        raise HTTPException(status_code=400, detail="Half day sirf ek din ki leave me ho sakta hai")

    days = _days_value(start, end, is_half_day)
    if days == 0:
        raise HTTPException(status_code=400, detail="Chuni hui dates me sirf Sunday hai")
    if days > MAX_DAYS:
        raise HTTPException(status_code=400, detail=f"Ek request me maximum {MAX_DAYS} din ki leave le sakte ho")

    reason = (reason or "").strip()
    if len(reason) < MIN_REASON_LEN or len(reason) > MAX_REASON_LEN:
        raise HTTPException(
            status_code=400,
            detail=f"Reason {MIN_REASON_LEN} se {MAX_REASON_LEN} characters ka hona chahiye",
        )

    overlap = (
        db.query(models.LeaveRequest)
        .filter(
            models.LeaveRequest.student_profile_id == profile.id,
            models.LeaveRequest.status.in_(["pending", "approved"]),
            models.LeaveRequest.from_date <= end,
            models.LeaveRequest.to_date >= start,
        )
        .first()
    )
    if overlap:
        raise HTTPException(status_code=400, detail="In dates par pehle se ek leave request hai")

    need_after = LEAVE_TYPES[leave_type]["attach_after_days"]
    has_file = file is not None and bool(file.filename)
    if need_after is not None and days > need_after and not has_file:
        raise HTTPException(
            status_code=400,
            detail=f"{need_after} din se zyada ki {LEAVE_TYPES[leave_type]['label']} ke liye certificate attach karo",
        )

    saved_path = original = ctype = None
    if has_file:
        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_EXT:
            raise HTTPException(status_code=400, detail="Sirf PDF, JPG ya PNG file allowed hai")
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="File khali hai")
        if len(content) > MAX_FILE_BYTES:
            raise HTTPException(status_code=400, detail="File 5 MB se badi hai")
        folder = UPLOAD_ROOT / str(profile.id)
        folder.mkdir(parents=True, exist_ok=True)
        saved_path = str(folder / f"{uuid.uuid4().hex}{ext}")
        with open(saved_path, "wb") as f:
            f.write(content)
        original = os.path.basename(file.filename)[:255]
        ctype = file.content_type or "application/octet-stream"

    leave = models.LeaveRequest(
        student_profile_id=profile.id,
        leave_type=leave_type,
        from_date=start,
        to_date=end,
        is_half_day=bool(is_half_day),
        days=days,
        reason=reason,
        status="pending",
        attachment_path=saved_path,
        attachment_name=original,
        attachment_type=ctype,
    )
    db.add(leave)
    db.flush()
    event = models.LeaveEvent(
        leave_id=leave.id, event="applied", note="Leave request submit hui", actor="student"
    )
    db.add(event)
    db.commit()
    db.refresh(leave)
    return _to_out(leave, [event])


@router.post("/{leave_id}/cancel")
def cancel_leave(
    leave_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    profile = _profile(db, current_user)
    leave = _get_own_leave(db, profile, leave_id)
    if leave.status != "pending":
        raise HTTPException(status_code=400, detail="Sirf pending leave cancel ho sakti hai")
    leave.status = "cancelled"
    db.add(models.LeaveEvent(leave_id=leave.id, event="cancelled", note="Student ne cancel ki", actor="student"))
    db.commit()
    return {"ok": True}


@router.post("/{leave_id}/seen")
def mark_seen(
    leave_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    profile = _profile(db, current_user)
    leave = _get_own_leave(db, profile, leave_id)
    if leave.has_unseen_update:
        leave.has_unseen_update = False
        db.commit()
    return {"ok": True}


@router.get("/{leave_id}/attachment")
def download_attachment(
    leave_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    profile = _profile(db, current_user)
    leave = _get_own_leave(db, profile, leave_id)
    if not leave.attachment_path or not os.path.exists(leave.attachment_path):
        raise HTTPException(status_code=404, detail="Attachment available nahi hai")
    return FileResponse(
        leave.attachment_path,
        media_type=leave.attachment_type or "application/octet-stream",
        filename=leave.attachment_name or "attachment",
    )


@router.post("/demo-seed")
def demo_seed(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """DEV ONLY: sample leaves. Remove once the Faculty / Admin module handles leave approvals."""
    if os.getenv("ENABLE_DEMO_DATA", "false").lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai")
    profile = _profile(db, current_user)

    already = (
        db.query(models.LeaveRequest)
        .filter(
            models.LeaveRequest.student_profile_id == profile.id,
            models.LeaveRequest.reason.like("[SAMPLE]%"),
        )
        .first()
    )
    if already:
        raise HTTPException(status_code=400, detail="Sample data pehle se load hai")

    today = date.today()
    samples = [
        ("medical", today - timedelta(days=10), today - timedelta(days=9), "approved",
         "[SAMPLE] Fever, doctor ne rest bataya", "[SAMPLE] Approved - sample data"),
        ("personal", today + timedelta(days=5), today + timedelta(days=6), "pending",
         "[SAMPLE] Ghar par zaroori kaam hai", None),
        ("family", today - timedelta(days=20), today - timedelta(days=19), "rejected",
         "[SAMPLE] Rishtedar ki shaadi me jaana hai", "[SAMPLE] Exam ke paas hai, reject - sample data"),
    ]
    for ltype, start, end, status, reason, remarks in samples:
        leave = models.LeaveRequest(
            student_profile_id=profile.id,
            leave_type=ltype,
            from_date=start,
            to_date=end,
            is_half_day=False,
            days=_days_value(start, end, False),
            reason=reason,
            status="pending",
        )
        db.add(leave)
        db.flush()
        db.add(models.LeaveEvent(leave_id=leave.id, event="applied", note="Leave request submit hui", actor="student"))
        if status in ("approved", "rejected"):
            leave.status = status
            leave.reviewer_remarks = remarks
            leave.reviewed_by = "Sample Reviewer"
            leave.reviewed_at = datetime.utcnow()
            leave.has_unseen_update = True
            db.add(models.LeaveEvent(leave_id=leave.id, event=status, note=remarks, actor="Sample Reviewer"))
    db.commit()
    return {"ok": True}