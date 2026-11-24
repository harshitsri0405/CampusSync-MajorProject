import os
import re
import uuid
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .auth import get_current_user
from .student import _require_student

router = APIRouter(prefix="/api/student/hostel", tags=["student-hostel"])

# ---- Constants (limits, allowed file types, labels) ----
LEAVE_MAX_DAYS = 30
OUTPASS_MAX_HOURS = 48
MAX_FUTURE_DAYS = 90
PAST_GRACE_MINUTES = 30          # normal request may start up to 30 min in the past
EMERGENCY_PAST_HOURS = 6         # emergency request may start up to 6 h in the past
MIN_REASON_LEN = 10
MAX_REASON_LEN = 500
MAX_DESTINATION_LEN = 200
MAX_TITLE_LEN = 150
MAX_PENDING_REQUESTS = 3
MAX_OPEN_COMPLAINTS = 10
MAX_PHOTOS = 3
MAX_PHOTO_BYTES = 5 * 1024 * 1024
ALLOWED_PHOTO_EXT = {".jpg", ".jpeg", ".png", ".webp"}
VISITOR_MAX_AHEAD_DAYS = 14
MAX_ACTIVE_VISITORS = 5
MAX_NOTES_LEN = 300
FEEDBACK_WINDOW_DAYS = 2         # feedback for today and the 2 days before
MAX_COMMENT_LEN = 300
OVERVIEW_LIMIT = 50

COMPLAINT_CATEGORIES = {
    "electricity": "Electricity Issue",
    "water": "Water Supply Problem",
    "wifi": "Internet / Wi-Fi Issue",
    "maintenance": "Room Maintenance",
    "cleanliness": "Cleanliness",
    "security": "Security Concern",
}
NOTICE_CATEGORIES = {
    "general": "Hostel Notice",
    "mess": "Mess Announcement",
    "maintenance": "Maintenance Notice",
    "holiday": "Holiday Information",
}
MEALS = {"breakfast": "Breakfast", "lunch": "Lunch", "snacks": "Snacks", "dinner": "Dinner"}
OPEN_COMPLAINT = ("open", "in_progress")

UPLOAD_ROOT = Path(
    os.getenv("UPLOAD_DIR") or (Path(__file__).resolve().parents[2] / "uploads")
) / "hostel"

PHONE_RE = re.compile(r"^[0-9+\-\s]{7,20}$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


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


def _stay(db: Session, profile):
    """Returns (allocation, room, hostel) of the active allocation, or None."""
    row = (
        db.query(models.HostelAllocation, models.HostelRoom, models.Hostel)
        .join(models.HostelRoom, models.HostelAllocation.room_id == models.HostelRoom.id)
        .join(models.Hostel, models.HostelRoom.hostel_id == models.Hostel.id)
        .filter(
            models.HostelAllocation.student_profile_id == profile.id,
            models.HostelAllocation.status == "active",
        )
        .first()
    )
    return row


def _need_stay(db: Session, profile):
    stay = _stay(db, profile)
    if not stay:
        raise HTTPException(status_code=400, detail="Is feature ke liye hostel allocation zaroori hai")
    return stay


def _parse_dt(value: str, label: str) -> datetime:
    try:
        dt = datetime.fromisoformat((value or "").strip())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{label} sahi date-time nahi hai")
    return dt.replace(tzinfo=None)


def _parse_date(value: str, label: str) -> date:
    try:
        return date.fromisoformat((value or "").strip())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{label} sahi date nahi hai")


def _uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail="Nahi mila")


def _clean(value: Optional[str]) -> str:
    return (value or "").strip()


# ---- Output builders ----
def _req_out(r) -> schemas.HostelRequestOut:
    return schemas.HostelRequestOut(
        id=str(r.id),
        kind=r.kind,
        is_emergency=bool(r.is_emergency),
        destination=r.destination,
        reason=r.reason,
        contact_phone=r.contact_phone,
        from_at=r.from_at,
        return_at=r.return_at,
        status=r.status,
        remarks=r.remarks,
        reviewed_by=r.reviewed_by,
        reviewed_at=r.reviewed_at,
        returned_at=r.returned_at,
        has_unseen_update=bool(r.has_unseen_update),
        created_at=r.created_at,
        can_cancel=(r.status == "pending"),
    )


def _complaint_out(c, photos) -> schemas.HostelComplaintOut:
    return schemas.HostelComplaintOut(
        id=str(c.id),
        category=c.category,
        category_label=COMPLAINT_CATEGORIES.get(c.category, c.category),
        title=c.title,
        description=c.description,
        status=c.status,
        resolution_note=c.resolution_note,
        resolved_by=c.resolved_by,
        resolved_at=c.resolved_at,
        has_unseen_update=bool(c.has_unseen_update),
        created_at=c.created_at,
        photos=[schemas.HostelPhotoOut(id=str(p.id), name=p.original_name) for p in photos],
    )


def _visitor_out(v) -> schemas.HostelVisitorOut:
    return schemas.HostelVisitorOut(
        id=str(v.id),
        visitor_name=v.visitor_name,
        relation=v.relation,
        phone=v.phone,
        visit_date=v.visit_date,
        expected_time=v.expected_time,
        notes=v.notes,
        status=v.status,
        remarks=v.remarks,
        approved_by=v.approved_by,
        entry_time=v.entry_time,
        exit_time=v.exit_time,
        has_unseen_update=bool(v.has_unseen_update),
        created_at=v.created_at,
        can_cancel=(v.status in ("pending", "approved")),
    )


def _options(mapping):
    return [schemas.HostelOptionOut(key=k, label=v) for k, v in mapping.items()]


# ---- Overview pieces ----
def _stats(db: Session, profile) -> schemas.HostelStatsOut:
    rooms = db.query(models.HostelRoom).filter(models.HostelRoom.is_active.is_(True)).all()
    occ = dict(
        db.query(models.HostelAllocation.room_id, func.count(models.HostelAllocation.id))
        .filter(models.HostelAllocation.status == "active")
        .group_by(models.HostelAllocation.room_id)
        .all()
    )
    occupied = sum(1 for r in rooms if occ.get(r.id, 0) > 0)
    free_rooms = sum(1 for r in rooms if occ.get(r.id, 0) < (r.capacity or 0))
    free_beds = sum(max(0, (r.capacity or 0) - occ.get(r.id, 0)) for r in rooms)
    pending = (
        db.query(models.HostelComplaint)
        .filter(
            models.HostelComplaint.student_profile_id == profile.id,
            models.HostelComplaint.status.in_(OPEN_COMPLAINT),
        )
        .count()
    )
    return schemas.HostelStatsOut(
        total_hostels=db.query(models.Hostel).count(),
        total_rooms=len(rooms),
        occupied_rooms=occupied,
        available_rooms=free_rooms,
        free_beds=free_beds,
        pending_complaints=pending,
    )


def _fees(db: Session, profile) -> schemas.HostelFeeSummaryOut:
    today = date.today()
    rows = (
        db.query(models.HostelFee)
        .filter(models.HostelFee.student_profile_id == profile.id)
        .order_by(models.HostelFee.due_date.asc())
        .all()
    )
    items, total, paid, due, overdue = [], 0, 0, 0, 0
    for f in rows:
        paid_amt = f.paid_amount or 0
        due_amt = max(0, (f.amount or 0) - paid_amt)
        if due_amt == 0:
            status = "paid"
        elif f.due_date and f.due_date < today:
            status = "overdue"
            overdue += due_amt
        elif paid_amt > 0:
            status = "partial"
        else:
            status = "due"
        total += f.amount or 0
        paid += min(paid_amt, f.amount or 0)
        due += due_amt
        items.append(
            schemas.HostelFeeItemOut(
                id=str(f.id),
                title=f.title,
                amount=f.amount or 0,
                paid_amount=paid_amt,
                due_amount=due_amt,
                due_date=f.due_date,
                paid_on=f.paid_on,
                receipt_no=f.receipt_no,
                status=status,
            )
        )
    return schemas.HostelFeeSummaryOut(total=total, paid=paid, due=due, overdue=overdue, items=items)


def _notices(db: Session, hostel_id) -> List[schemas.HostelNoticeOut]:
    q = db.query(models.HostelNotice)
    if hostel_id:
        q = q.filter((models.HostelNotice.hostel_id.is_(None)) | (models.HostelNotice.hostel_id == hostel_id))
    else:
        q = q.filter(models.HostelNotice.hostel_id.is_(None))
    rows = q.order_by(models.HostelNotice.posted_on.desc()).limit(OVERVIEW_LIMIT).all()
    return [
        schemas.HostelNoticeOut(
            id=str(n.id),
            category=n.category or "general",
            category_label=NOTICE_CATEGORIES.get(n.category, "Hostel Notice"),
            title=n.title,
            body=n.body,
            posted_by=n.posted_by,
            is_important=bool(n.is_important),
            posted_on=n.posted_on,
        )
        for n in rows
    ]


def _mess(db: Session, profile, hostel) -> schemas.HostelMessOut:
    if not hostel:
        return schemas.HostelMessOut(has_hostel=False)
    today = date.today()
    menu = (
        db.query(models.HostelMessMenu)
        .filter(models.HostelMessMenu.hostel_id == hostel.id)
        .order_by(models.HostelMessMenu.day.asc())
        .all()
    )
    timings = db.query(models.HostelMessTiming).filter(models.HostelMessTiming.hostel_id == hostel.id).all()
    order = list(MEALS.keys())
    timings.sort(key=lambda t: order.index(t.meal) if t.meal in order else 99)
    specials = (
        db.query(models.HostelMessSpecial)
        .filter(models.HostelMessSpecial.hostel_id == hostel.id, models.HostelMessSpecial.meal_date >= today)
        .order_by(models.HostelMessSpecial.meal_date.asc())
        .limit(10)
        .all()
    )
    feedback = (
        db.query(models.HostelMessFeedback)
        .filter(models.HostelMessFeedback.student_profile_id == profile.id)
        .order_by(models.HostelMessFeedback.meal_date.desc(), models.HostelMessFeedback.created_at.desc())
        .limit(10)
        .all()
    )
    avg_rows = (
        db.query(
            models.HostelMessFeedback.meal,
            func.avg(models.HostelMessFeedback.rating),
            func.count(models.HostelMessFeedback.id),
        )
        .filter(
            models.HostelMessFeedback.hostel_id == hostel.id,
            models.HostelMessFeedback.meal_date >= today - timedelta(days=30),
        )
        .group_by(models.HostelMessFeedback.meal)
        .all()
    )
    return schemas.HostelMessOut(
        has_hostel=True,
        menu=[schemas.MessMenuItemOut(day=m.day, meal=m.meal, items=m.items) for m in menu],
        timings=[schemas.MessTimingOut(meal=t.meal, start_time=t.start_time, end_time=t.end_time) for t in timings],
        specials=[
            schemas.MessSpecialOut(id=str(s.id), meal_date=s.meal_date, meal=s.meal, items=s.items, note=s.note)
            for s in specials
        ],
        feedback=[
            schemas.MessFeedbackOut(
                id=str(f.id), meal_date=f.meal_date, meal=f.meal, rating=f.rating,
                comment=f.comment, created_at=f.created_at,
            )
            for f in feedback
        ],
        averages=[
            schemas.MessAverageOut(meal=m, average=round(float(a), 1), count=int(c)) for m, a, c in avg_rows
        ],
    )


# ---- Endpoints ----
@router.get("/overview", response_model=schemas.HostelOverviewOut)
def overview(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    profile = _profile(db, current_user)
    stay = _stay(db, profile)
    alloc, room, hostel = stay if stay else (None, None, None)

    stay_out = schemas.HostelStayOut(allocated=False)
    if stay:
        stay_out = schemas.HostelStayOut(
            allocated=True,
            is_sample=(hostel.name or "").startswith("[SAMPLE]"),
            hostel_name=hostel.name,
            hostel_kind=hostel.kind,
            room_no=room.room_no,
            floor=room.floor,
            room_type=room.room_type,
            warden_name=hostel.warden_name,
            warden_phone=hostel.warden_phone,
            allocated_on=alloc.allocated_on,
        )

    requests = (
        db.query(models.HostelRequest)
        .filter(models.HostelRequest.student_profile_id == profile.id)
        .order_by(models.HostelRequest.created_at.desc())
        .limit(OVERVIEW_LIMIT)
        .all()
    )
    complaints = (
        db.query(models.HostelComplaint)
        .filter(models.HostelComplaint.student_profile_id == profile.id)
        .order_by(models.HostelComplaint.created_at.desc())
        .limit(OVERVIEW_LIMIT)
        .all()
    )
    photos_by = {}
    if complaints:
        photos = (
            db.query(models.HostelComplaintPhoto)
            .filter(models.HostelComplaintPhoto.complaint_id.in_([c.id for c in complaints]))
            .all()
        )
        for p in photos:
            photos_by.setdefault(p.complaint_id, []).append(p)
    visitors = (
        db.query(models.HostelVisitor)
        .filter(models.HostelVisitor.student_profile_id == profile.id)
        .order_by(models.HostelVisitor.visit_date.desc(), models.HostelVisitor.created_at.desc())
        .limit(OVERVIEW_LIMIT)
        .all()
    )

    unseen = (
        sum(1 for r in requests if r.has_unseen_update)
        + sum(1 for c in complaints if c.has_unseen_update)
        + sum(1 for v in visitors if v.has_unseen_update)
    )

    return schemas.HostelOverviewOut(
        stay=stay_out,
        stats=_stats(db, profile),
        fees=_fees(db, profile),
        requests=[_req_out(r) for r in requests],
        complaints=[_complaint_out(c, photos_by.get(c.id, [])) for c in complaints],
        visitors=[_visitor_out(v) for v in visitors],
        notices=_notices(db, hostel.id if hostel else None),
        mess=_mess(db, profile, hostel),
        complaint_categories=_options(COMPLAINT_CATEGORIES),
        notice_categories=_options(NOTICE_CATEGORIES),
        meals=_options(MEALS),
        rules=schemas.HostelRulesOut(
            leave_max_days=LEAVE_MAX_DAYS,
            outpass_max_hours=OUTPASS_MAX_HOURS,
            max_future_days=MAX_FUTURE_DAYS,
            min_reason_len=MIN_REASON_LEN,
            max_reason_len=MAX_REASON_LEN,
            max_photos=MAX_PHOTOS,
            max_photo_mb=MAX_PHOTO_BYTES // (1024 * 1024),
            allowed_ext=sorted(ALLOWED_PHOTO_EXT),
            visitor_max_ahead_days=VISITOR_MAX_AHEAD_DAYS,
            max_active_visitors=MAX_ACTIVE_VISITORS,
            feedback_window_days=FEEDBACK_WINDOW_DAYS,
        ),
        unseen=unseen,
    )


# ---------------- Leave and outpass ----------------
@router.post("/requests", response_model=schemas.HostelRequestOut)
def create_request(
    payload: schemas.HostelRequestIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    profile = _profile(db, current_user)
    _need_stay(db, profile)

    kind = _clean(payload.kind).lower()
    if kind not in ("leave", "outpass"):
        raise HTTPException(status_code=400, detail="Request type leave ya outpass hona chahiye")

    start = _parse_dt(payload.from_at, "Jaane ka time")
    back = _parse_dt(payload.return_at, "Wapas aane ka time")
    now = datetime.now()
    emergency = bool(payload.is_emergency)

    grace = timedelta(hours=EMERGENCY_PAST_HOURS) if emergency else timedelta(minutes=PAST_GRACE_MINUTES)
    if start < now - grace:
        raise HTTPException(status_code=400, detail="Jaane ka time beet chuka hai")
    if start > now + timedelta(days=MAX_FUTURE_DAYS):
        raise HTTPException(status_code=400, detail="Itni aage ki date ke liye request nahi hoti")
    if back <= start:
        raise HTTPException(status_code=400, detail="Wapas aane ka time jaane ke time ke baad hona chahiye")
    span = back - start
    if kind == "outpass" and span > timedelta(hours=OUTPASS_MAX_HOURS):
        raise HTTPException(status_code=400, detail=f"Outpass maximum {OUTPASS_MAX_HOURS} ghante ka ho sakta hai")
    if kind == "leave" and span > timedelta(days=LEAVE_MAX_DAYS):
        raise HTTPException(status_code=400, detail=f"Leave maximum {LEAVE_MAX_DAYS} din ki ho sakti hai")

    reason = _clean(payload.reason)
    if len(reason) < MIN_REASON_LEN or len(reason) > MAX_REASON_LEN:
        raise HTTPException(
            status_code=400, detail=f"Reason {MIN_REASON_LEN} se {MAX_REASON_LEN} characters ka hona chahiye"
        )
    destination = _clean(payload.destination)
    if len(destination) > MAX_DESTINATION_LEN:
        raise HTTPException(status_code=400, detail="Destination bahut lamba hai")
    if kind == "outpass" and not destination:
        raise HTTPException(status_code=400, detail="Outpass ke liye jaane ki jagah likho")
    phone = _clean(payload.contact_phone)
    if phone and not PHONE_RE.match(phone):
        raise HTTPException(status_code=400, detail="Contact number sahi nahi hai")
    if emergency and not phone:
        raise HTTPException(status_code=400, detail="Emergency request me contact number zaroori hai")

    active = (
        db.query(models.HostelRequest)
        .filter(
            models.HostelRequest.student_profile_id == profile.id,
            models.HostelRequest.status.in_(["pending", "approved"]),
            models.HostelRequest.from_at < back,
            models.HostelRequest.return_at > start,
        )
        .first()
    )
    if active:
        raise HTTPException(status_code=400, detail="In timings par pehle se ek request hai")
    pending = (
        db.query(models.HostelRequest)
        .filter(models.HostelRequest.student_profile_id == profile.id, models.HostelRequest.status == "pending")
        .count()
    )
    if pending >= MAX_PENDING_REQUESTS:
        raise HTTPException(status_code=400, detail=f"Ek saath maximum {MAX_PENDING_REQUESTS} pending requests ho sakti hain")

    req = models.HostelRequest(
        student_profile_id=profile.id,
        kind=kind,
        is_emergency=emergency,
        destination=destination,
        reason=reason,
        contact_phone=phone,
        from_at=start,
        return_at=back,
        status="pending",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return _req_out(req)


@router.post("/requests/{request_id}/cancel")
def cancel_request(request_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    profile = _profile(db, current_user)
    req = (
        db.query(models.HostelRequest)
        .filter(models.HostelRequest.id == _uuid(request_id), models.HostelRequest.student_profile_id == profile.id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request nahi mili")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Sirf pending request cancel ho sakti hai")
    req.status = "cancelled"
    db.commit()
    return {"ok": True}


# ---------------- Complaints ----------------
@router.post("/complaints", response_model=schemas.HostelComplaintOut)
async def create_complaint(
    category: str = Form(...),
    title: str = Form(...),
    description: str = Form(...),
    files: Optional[List[UploadFile]] = File(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    profile = _profile(db, current_user)
    _need_stay(db, profile)

    category = _clean(category).lower()
    if category not in COMPLAINT_CATEGORIES:
        raise HTTPException(status_code=400, detail="Complaint category sahi nahi hai")
    title = _clean(title)
    if not title or len(title) > MAX_TITLE_LEN:
        raise HTTPException(status_code=400, detail=f"Title 1 se {MAX_TITLE_LEN} characters ka hona chahiye")
    description = _clean(description)
    if len(description) < MIN_REASON_LEN or len(description) > MAX_REASON_LEN * 2:
        raise HTTPException(status_code=400, detail=f"Description {MIN_REASON_LEN} se {MAX_REASON_LEN * 2} characters ka hona chahiye")

    open_count = (
        db.query(models.HostelComplaint)
        .filter(
            models.HostelComplaint.student_profile_id == profile.id,
            models.HostelComplaint.status.in_(OPEN_COMPLAINT),
        )
        .count()
    )
    if open_count >= MAX_OPEN_COMPLAINTS:
        raise HTTPException(status_code=400, detail="Pehle purani complaints resolve hone do")

    uploads = [f for f in (files or []) if f is not None and f.filename]
    if len(uploads) > MAX_PHOTOS:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_PHOTOS} photos allowed hain")

    prepared = []  # (content, ext, original name, content type)
    for f in uploads:
        ext = Path(f.filename).suffix.lower()
        if ext not in ALLOWED_PHOTO_EXT:
            raise HTTPException(status_code=400, detail="Sirf JPG, PNG ya WEBP photo allowed hai")
        content = await f.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Photo khali hai")
        if len(content) > MAX_PHOTO_BYTES:
            raise HTTPException(status_code=400, detail=f"Photo {MAX_PHOTO_BYTES // (1024 * 1024)} MB se badi hai")
        prepared.append((content, ext, os.path.basename(f.filename)[:255], f.content_type or "application/octet-stream"))

    saved_paths = []
    try:
        complaint = models.HostelComplaint(
            student_profile_id=profile.id,
            category=category,
            title=title,
            description=description,
            status="open",
        )
        db.add(complaint)
        db.flush()
        photos = []
        if prepared:
            folder = UPLOAD_ROOT / str(profile.id)
            folder.mkdir(parents=True, exist_ok=True)
        for content, ext, original, ctype in prepared:
            path = str(folder / f"{uuid.uuid4().hex}{ext}")
            with open(path, "wb") as fh:
                fh.write(content)
            saved_paths.append(path)
            photo = models.HostelComplaintPhoto(
                complaint_id=complaint.id,
                file_path=path,
                original_name=original,
                content_type=ctype,
                size_bytes=len(content),
            )
            db.add(photo)
            photos.append(photo)
        db.commit()
    except Exception:
        db.rollback()
        for p in saved_paths:
            try:
                os.remove(p)
            except OSError:
                pass
        raise HTTPException(status_code=500, detail="Complaint save nahi ho payi")
    db.refresh(complaint)
    return _complaint_out(complaint, photos)


@router.get("/complaints/photo/{photo_id}")
def complaint_photo(photo_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    profile = _profile(db, current_user)
    row = (
        db.query(models.HostelComplaintPhoto)
        .join(models.HostelComplaint, models.HostelComplaintPhoto.complaint_id == models.HostelComplaint.id)
        .filter(
            models.HostelComplaintPhoto.id == _uuid(photo_id),
            models.HostelComplaint.student_profile_id == profile.id,
        )
        .first()
    )
    if not row or not os.path.exists(row.file_path):
        raise HTTPException(status_code=404, detail="Photo nahi mili")
    return FileResponse(
        row.file_path,
        media_type=row.content_type or "application/octet-stream",
        filename=row.original_name or "photo",
    )


# ---------------- Visitors ----------------
@router.post("/visitors", response_model=schemas.HostelVisitorOut)
def register_visitor(
    payload: schemas.HostelVisitorIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    profile = _profile(db, current_user)
    _need_stay(db, profile)

    name = _clean(payload.visitor_name)
    if len(name) < 2 or len(name) > 100:
        raise HTTPException(status_code=400, detail="Visitor ka naam 2 se 100 characters ka hona chahiye")
    relation = _clean(payload.relation)
    if len(relation) > 50:
        raise HTTPException(status_code=400, detail="Relation bahut lamba hai")
    phone = _clean(payload.phone)
    if not phone or not PHONE_RE.match(phone):
        raise HTTPException(status_code=400, detail="Visitor ka sahi contact number likho")
    visit_date = _parse_date(payload.visit_date, "Visit date")
    today = date.today()
    if visit_date < today or visit_date > today + timedelta(days=VISITOR_MAX_AHEAD_DAYS):
        raise HTTPException(status_code=400, detail=f"Visit date aaj se {VISITOR_MAX_AHEAD_DAYS} din ke andar hi ho sakti hai")
    expected = _clean(payload.expected_time)
    if expected and not TIME_RE.match(expected):
        raise HTTPException(status_code=400, detail="Time HH:MM format me likho")
    notes = _clean(payload.notes)
    if len(notes) > MAX_NOTES_LEN:
        raise HTTPException(status_code=400, detail=f"Notes {MAX_NOTES_LEN} characters se chhote rakho")

    active = (
        db.query(models.HostelVisitor)
        .filter(
            models.HostelVisitor.student_profile_id == profile.id,
            models.HostelVisitor.status.in_(["pending", "approved"]),
            models.HostelVisitor.visit_date >= today,
        )
        .count()
    )
    if active >= MAX_ACTIVE_VISITORS:
        raise HTTPException(status_code=400, detail=f"Ek saath maximum {MAX_ACTIVE_VISITORS} visitor requests ho sakti hain")

    visitor = models.HostelVisitor(
        student_profile_id=profile.id,
        visitor_name=name,
        relation=relation,
        phone=phone,
        visit_date=visit_date,
        expected_time=expected or None,
        notes=notes,
        status="pending",
    )
    db.add(visitor)
    db.commit()
    db.refresh(visitor)
    return _visitor_out(visitor)


@router.post("/visitors/{visitor_id}/cancel")
def cancel_visitor(visitor_id: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    profile = _profile(db, current_user)
    v = (
        db.query(models.HostelVisitor)
        .filter(models.HostelVisitor.id == _uuid(visitor_id), models.HostelVisitor.student_profile_id == profile.id)
        .first()
    )
    if not v:
        raise HTTPException(status_code=404, detail="Visitor request nahi mili")
    if v.status not in ("pending", "approved"):
        raise HTTPException(status_code=400, detail="Ye request ab cancel nahi ho sakti")
    v.status = "cancelled"
    db.commit()
    return {"ok": True}


# ---------------- Mess feedback ----------------
@router.post("/mess/feedback", response_model=schemas.MessFeedbackOut)
def mess_feedback(
    payload: schemas.HostelFeedbackIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    profile = _profile(db, current_user)
    _alloc, _room, hostel = _need_stay(db, profile)

    meal = _clean(payload.meal).lower()
    if meal not in MEALS:
        raise HTTPException(status_code=400, detail="Meal sahi nahi hai")
    meal_date = _parse_date(payload.meal_date, "Date")
    today = date.today()
    if meal_date > today or meal_date < today - timedelta(days=FEEDBACK_WINDOW_DAYS):
        raise HTTPException(status_code=400, detail=f"Feedback sirf pichhle {FEEDBACK_WINDOW_DAYS} din aur aaj ke meal ka de sakte ho")
    if not 1 <= int(payload.rating) <= 5:
        raise HTTPException(status_code=400, detail="Rating 1 se 5 ke beech honi chahiye")
    comment = _clean(payload.comment)
    if len(comment) > MAX_COMMENT_LEN:
        raise HTTPException(status_code=400, detail=f"Comment {MAX_COMMENT_LEN} characters se chhota rakho")

    row = (
        db.query(models.HostelMessFeedback)
        .filter(
            models.HostelMessFeedback.student_profile_id == profile.id,
            models.HostelMessFeedback.meal_date == meal_date,
            models.HostelMessFeedback.meal == meal,
        )
        .first()
    )
    if row:  # one feedback per meal: sending again updates it
        row.rating = int(payload.rating)
        row.comment = comment
    else:
        row = models.HostelMessFeedback(
            student_profile_id=profile.id,
            hostel_id=hostel.id,
            meal_date=meal_date,
            meal=meal,
            rating=int(payload.rating),
            comment=comment,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return schemas.MessFeedbackOut(
        id=str(row.id), meal_date=row.meal_date, meal=row.meal, rating=row.rating,
        comment=row.comment, created_at=row.created_at,
    )


# ---------------- "New update" dot ----------------
@router.post("/seen")
def mark_seen(
    payload: schemas.HostelSeenIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    profile = _profile(db, current_user)
    model = {
        "request": models.HostelRequest,
        "complaint": models.HostelComplaint,
        "visitor": models.HostelVisitor,
    }.get(payload.kind)
    if model is None:
        raise HTTPException(status_code=400, detail="Type sahi nahi hai")
    row = (
        db.query(model)
        .filter(model.id == _uuid(payload.id), model.student_profile_id == profile.id)
        .first()
    )
    if row and row.has_unseen_update:
        row.has_unseen_update = False
        db.commit()
    return {"ok": True}


# ============================================================================
# Reusable by the future Hostel (warden) module. These write the same tables the
# student pages read, so the student screens show real data without changes.
# ============================================================================
def review_request(db: Session, req, status: str, remarks: Optional[str] = None, reviewer: Optional[str] = None):
    if status not in ("approved", "rejected"):
        raise ValueError("status must be approved or rejected")
    req.status = status
    req.remarks = remarks
    req.reviewed_by = reviewer
    req.reviewed_at = datetime.utcnow()
    req.has_unseen_update = True
    db.commit()


def update_complaint(db: Session, complaint, status: str, note: Optional[str] = None, staff: Optional[str] = None):
    if status not in ("open", "in_progress", "resolved", "rejected"):
        raise ValueError("invalid complaint status")
    complaint.status = status
    complaint.resolution_note = note
    if status in ("resolved", "rejected"):
        complaint.resolved_by = staff
        complaint.resolved_at = datetime.utcnow()
    complaint.has_unseen_update = True
    db.commit()


def review_visitor(db: Session, visitor, status: str, remarks: Optional[str] = None, warden: Optional[str] = None):
    """status: approved | rejected | checked_in | checked_out"""
    if status not in ("approved", "rejected", "checked_in", "checked_out"):
        raise ValueError("invalid visitor status")
    visitor.status = status
    if status in ("approved", "rejected"):
        visitor.approved_by = warden
        visitor.remarks = remarks
    if status == "checked_in":
        visitor.entry_time = datetime.now()
    if status == "checked_out":
        visitor.exit_time = datetime.now()
    visitor.has_unseen_update = True
    db.commit()


# ============================================================================
# DEV ONLY sample data. Remove once the Hostel / Admin module creates real data.
# ============================================================================
SAMPLE_PREFIX = "[SAMPLE]"
SAMPLE_MENU = {
    "breakfast": ["Poha, tea", "Idli, sambar", "Aloo paratha, curd", "Upma, tea", "Bread omelette / jam", "Chole bhature", "Puri bhaji"],
    "lunch": ["Dal, rice, roti, sabzi", "Rajma, rice, roti", "Kadhi, rice, roti", "Dal fry, jeera rice", "Chole, rice, roti", "Veg pulao, raita", "Dal tadka, rice, roti"],
    "snacks": ["Tea, biscuits", "Tea, samosa", "Tea, bread pakora", "Tea, sandwich", "Tea, namkeen", "Tea, vada pav", "Tea, cake"],
    "dinner": ["Paneer, roti, rice", "Mix veg, roti, dal", "Egg curry / paneer, roti", "Dal makhani, roti", "Aloo gobhi, roti, dal", "Veg biryani, raita", "Kheer, roti, sabzi"],
}
SAMPLE_TIMINGS = {
    "breakfast": ("07:30", "09:00"),
    "lunch": ("12:30", "14:00"),
    "snacks": ("17:00", "18:00"),
    "dinner": ("19:30", "21:00"),
}


def _sample_hostel(db: Session, name: str, kind: str, warden: str, phone: str):
    hostel = db.query(models.Hostel).filter(models.Hostel.name == name).first()
    if hostel:
        return hostel
    hostel = models.Hostel(name=name, kind=kind, warden_name=warden, warden_phone=phone, address="[SAMPLE] address")
    db.add(hostel)
    db.flush()
    for floor in (1, 2, 3):
        for n in range(1, 5):
            capacity = 1 if n == 1 else 3 if n == 4 else 2
            db.add(models.HostelRoom(
                hostel_id=hostel.id,
                room_no=f"{floor}0{n}",
                floor=floor,
                room_type={1: "single", 2: "double", 3: "triple"}[capacity],
                capacity=capacity,
            ))
    for meal, rows in SAMPLE_MENU.items():
        for day, items in enumerate(rows):
            db.add(models.HostelMessMenu(hostel_id=hostel.id, day=day, meal=meal, items=items))
        start, end = SAMPLE_TIMINGS[meal]
        db.add(models.HostelMessTiming(hostel_id=hostel.id, meal=meal, start_time=start, end_time=end))
    db.flush()
    return hostel


def _at(days_from_today: int, hour: int, minute: int = 0) -> datetime:
    """A local date-time on (today + days_from_today) at hour:minute."""
    return datetime.combine(date.today() + timedelta(days=days_from_today), time(hour, minute))


@router.post("/demo-seed")
def demo_seed(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """DEV ONLY: sample hostel data. Remove once the Hostel / Admin module creates real data."""
    if os.getenv("ENABLE_DEMO_DATA", "false").lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai")
    profile = _profile(db, current_user)
    if _stay(db, profile):
        raise HTTPException(status_code=400, detail="Is account ko pehle se hostel allocate hai")

    today = date.today()
    girls = str(getattr(profile, "gender", "") or "").strip().lower().startswith("f")
    hostel = (
        _sample_hostel(db, f"{SAMPLE_PREFIX} Hostel B (Girls)", "girls", "[SAMPLE] Warden B", "0000000000")
        if girls
        else _sample_hostel(db, f"{SAMPLE_PREFIX} Hostel A (Boys)", "boys", "[SAMPLE] Warden A", "0000000000")
    )
    other = (
        _sample_hostel(db, f"{SAMPLE_PREFIX} Hostel A (Boys)", "boys", "[SAMPLE] Warden A", "0000000000")
        if girls
        else _sample_hostel(db, f"{SAMPLE_PREFIX} Hostel B (Girls)", "girls", "[SAMPLE] Warden B", "0000000000")
    )
    _ = other  # created only so that "Total hostels" shows more than one

    room = (
        db.query(models.HostelRoom)
        .filter(models.HostelRoom.hostel_id == hostel.id, models.HostelRoom.room_no == "202")
        .first()
    )
    db.add(models.HostelAllocation(
        student_profile_id=profile.id, room_id=room.id, allocated_on=today - timedelta(days=90), status="active"
    ))

    # fees
    db.add(models.HostelFee(
        student_profile_id=profile.id, title="[SAMPLE] Hostel rent (semester)", amount=24000,
        due_date=today - timedelta(days=60), paid_amount=24000, paid_on=today - timedelta(days=62),
        receipt_no="SAMPLE-0001",
    ))
    db.add(models.HostelFee(
        student_profile_id=profile.id, title="[SAMPLE] Mess charges (semester)", amount=9000,
        due_date=today + timedelta(days=12), paid_amount=4500, paid_on=today - timedelta(days=20),
        receipt_no="SAMPLE-0002",
    ))
    db.add(models.HostelFee(
        student_profile_id=profile.id, title="[SAMPLE] Maintenance fund", amount=1500,
        due_date=today - timedelta(days=5), paid_amount=0,
    ))

    # notices and the special meal are shared by every student of the hostel,
    # so they are created only once (even if several students load sample data)
    has_hostel_notices = (
        db.query(models.HostelNotice)
        .filter(models.HostelNotice.hostel_id == hostel.id, models.HostelNotice.title.like(f"{SAMPLE_PREFIX}%"))
        .first()
    )
    if not has_hostel_notices:
        notices = [
            (hostel.id, "general", "[SAMPLE] Room inspection this Saturday", "Rooms will be inspected between 10 AM and 12 PM.", True),
            (hostel.id, "mess", "[SAMPLE] Special dinner on Sunday", "Menu is updated in the Mess tab.", False),
            (hostel.id, "maintenance", "[SAMPLE] Water tank cleaning", "Water supply may stop from 11 AM to 1 PM tomorrow.", True),
        ]
        for i, (hid, cat, title, body, important) in enumerate(notices):
            db.add(models.HostelNotice(
                hostel_id=hid, category=cat, title=title, body=body, posted_by="[SAMPLE] Warden",
                is_important=important, posted_on=today - timedelta(days=i),
            ))
        db.add(models.HostelMessSpecial(
            hostel_id=hostel.id, meal_date=today + timedelta(days=(6 - today.weekday()) % 7 or 7), meal="dinner",
            items="[SAMPLE] Biryani, raita, gulab jamun", note="[SAMPLE] Special Sunday dinner",
        ))
    has_global_notice = (
        db.query(models.HostelNotice)
        .filter(models.HostelNotice.hostel_id.is_(None), models.HostelNotice.title.like(f"{SAMPLE_PREFIX}%"))
        .first()
    )
    if not has_global_notice:
        db.add(models.HostelNotice(
            hostel_id=None, category="holiday", title="[SAMPLE] Hostel timings during the holiday",
            body="Gate timings change during the holiday week.", posted_by="[SAMPLE] Warden",
            is_important=False, posted_on=today - timedelta(days=3),
        ))

    # leave / outpass
    db.add(models.HostelRequest(
        student_profile_id=profile.id, kind="outpass", destination="[SAMPLE] Market", reason="[SAMPLE] Buying books and stationery",
        contact_phone="0000000000", from_at=_at(-6, 14), return_at=_at(-6, 19), status="approved",
        remarks="[SAMPLE] Approved - return before 8 PM", reviewed_by="[SAMPLE] Warden",
        reviewed_at=datetime.utcnow() - timedelta(days=6), returned_at=_at(-6, 18, 40),
        has_unseen_update=True,
    ))
    db.add(models.HostelRequest(
        student_profile_id=profile.id, kind="leave", destination="[SAMPLE] Home town", reason="[SAMPLE] Going home for a family function",
        contact_phone="0000000000", from_at=_at(5, 9), return_at=_at(8, 18), status="pending",
    ))
    db.add(models.HostelRequest(
        student_profile_id=profile.id, kind="outpass", destination="[SAMPLE] Hospital", is_emergency=True,
        reason="[SAMPLE] Urgent doctor visit", contact_phone="0000000000",
        from_at=_at(-15, 11), return_at=_at(-15, 16), status="rejected",
        remarks="[SAMPLE] Rejected - sample data", reviewed_by="[SAMPLE] Warden",
        reviewed_at=datetime.utcnow() - timedelta(days=15),
    ))

    # complaints
    resolved = models.HostelComplaint(
        student_profile_id=profile.id, category="electricity", title="[SAMPLE] Fan not working",
        description="[SAMPLE] The ceiling fan in my room stopped working yesterday.", status="resolved",
        resolution_note="[SAMPLE] Fan replaced by the electrician.", resolved_by="[SAMPLE] Warden",
        resolved_at=datetime.utcnow() - timedelta(days=3), has_unseen_update=True,
        created_at=datetime.utcnow() - timedelta(days=5),
    )
    progress = models.HostelComplaint(
        student_profile_id=profile.id, category="wifi", title="[SAMPLE] Wi-Fi is very slow at night",
        description="[SAMPLE] Internet speed drops after 10 PM on the second floor.", status="in_progress",
        resolution_note="[SAMPLE] Router has been reported to the network team.",
        created_at=datetime.utcnow() - timedelta(days=1),
    )
    db.add_all([resolved, progress])

    # visitors
    db.add(models.HostelVisitor(
        student_profile_id=profile.id, visitor_name="[SAMPLE] Parent", relation="Father", phone="0000000000",
        visit_date=today - timedelta(days=10), expected_time="16:00", notes="[SAMPLE] Bringing documents",
        status="checked_out", approved_by="[SAMPLE] Warden",
        entry_time=_at(-10, 16, 10), exit_time=_at(-10, 17, 5),
    ))
    db.add(models.HostelVisitor(
        student_profile_id=profile.id, visitor_name="[SAMPLE] Cousin", relation="Cousin", phone="0000000000",
        visit_date=today + timedelta(days=2), expected_time="11:00", notes="[SAMPLE] Short visit",
        status="approved", approved_by="[SAMPLE] Warden", remarks="[SAMPLE] Come with an ID card",
        has_unseen_update=True,
    ))
    db.add(models.HostelVisitor(
        student_profile_id=profile.id, visitor_name="[SAMPLE] Friend", relation="Friend", phone="0000000000",
        visit_date=today + timedelta(days=4), expected_time="17:30", status="pending",
    ))

    # mess feedback
    db.add(models.HostelMessFeedback(
        student_profile_id=profile.id, hostel_id=hostel.id, meal_date=today - timedelta(days=1), meal="dinner",
        rating=4, comment="[SAMPLE] Good food",
    ))
    db.commit()
    return {"ok": True}
