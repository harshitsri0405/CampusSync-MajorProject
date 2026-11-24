import os
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from app.notify import notify
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.routers.auth import get_current_user
from app.routers.student import _require_student

router = APIRouter(prefix="/api/student/complaints", tags=["student-complaints"])

# backend/uploads/complaints/<student id>/<stored file>
UPLOAD_ROOT = Path(os.getenv("UPLOAD_DIR") or (Path(__file__).resolve().parents[2] / "uploads"))
UPLOAD_DIR = UPLOAD_ROOT / "complaints"
MAX_FILES = 3
MAX_FILE_BYTES = 5 * 1024 * 1024
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".pdf", ".doc", ".docx", ".txt"}
MAX_OPEN = 10  # complaints that are still pending or in progress

# category -> department the complaint is forwarded to (Admin can change this later)
CATEGORY_DEPARTMENT = {
    "Hostel": "Hostel Warden Office",
    "Library": "Library",
    "IT / Wi-Fi": "IT Department",
    "Faculty": "Head of Department",
    "Transport": "Transport Office",
    "Campus / Infrastructure": "Estate and Maintenance",
    "Canteen": "Canteen Committee",
    "Exam / Academic": "Examination Cell",
    "Fees / Accounts": "Accounts Office",
    "Other": "Administration",
}


def _ticket(when: datetime) -> str:
    return f"CMP-{when:%y%m%d}-{uuid.uuid4().hex[:5].upper()}"


def _get_own(db: Session, profile: models.StudentProfile, complaint_id: uuid.UUID) -> models.Complaint:
    complaint = (
        db.query(models.Complaint)
        .filter(models.Complaint.id == complaint_id, models.Complaint.student_profile_id == profile.id)
        .first()
    )
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    return complaint


def _build(db: Session, complaints: list[models.Complaint]) -> list[schemas.ComplaintOut]:
    if not complaints:
        return []
    ids = [c.id for c in complaints]

    attachments = defaultdict(list)
    for a in (
        db.query(models.ComplaintAttachment)
        .filter(models.ComplaintAttachment.complaint_id.in_(ids))
        .order_by(models.ComplaintAttachment.created_at)
        .all()
    ):
        attachments[a.complaint_id].append(
            schemas.ComplaintAttachmentOut(id=str(a.id), file_name=a.file_name, size_bytes=a.size_bytes)
        )

    timelines = defaultdict(list)
    for e in (
        db.query(models.ComplaintEvent)
        .filter(models.ComplaintEvent.complaint_id.in_(ids))
        .order_by(models.ComplaintEvent.created_at)
        .all()
    ):
        timelines[e.complaint_id].append(
            schemas.ComplaintEventOut(status=e.status, message=e.message, by=e.by_name, created_at=e.created_at)
        )

    return [
        schemas.ComplaintOut(
            id=str(c.id), ticket_no=c.ticket_no, category=c.category, subject=c.subject,
            description=c.description, status=c.status, assigned_to=c.assigned_to,
            created_at=c.created_at, updated_at=c.updated_at or c.created_at, resolved_at=c.resolved_at,
            resolution_note=c.resolution_note, rating=c.rating, feedback=c.feedback,
            has_unseen_update=c.has_unseen_update, attachments=attachments.get(c.id, []),
            timeline=timelines.get(c.id, []),
        )
        for c in complaints
    ]


@router.get("/overview", response_model=schemas.ComplaintsOverview)
def overview(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    complaints = (
        db.query(models.Complaint)
        .filter(models.Complaint.student_profile_id == profile.id)
        .order_by(models.Complaint.created_at.desc())
        .all()
    )
    return schemas.ComplaintsOverview(
        categories=[schemas.ComplaintCategoryOut(name=n, department=d) for n, d in CATEGORY_DEPARTMENT.items()],
        complaints=_build(db, complaints),
    )


@router.post("", response_model=schemas.ComplaintOut)
def create_complaint(
    category: str = Form(...),
    subject: str = Form(...),
    description: str = Form(...),
    files: list[UploadFile] | None = File(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)

    if category not in CATEGORY_DEPARTMENT:
        raise HTTPException(status_code=400, detail="Choose a category from the list.")
    subject = (subject or "").strip()
    description = (description or "").strip()
    if not 5 <= len(subject) <= 100:
        raise HTTPException(status_code=400, detail="The subject must be 5 to 100 characters long.")
    if not 10 <= len(description) <= 1000:
        raise HTTPException(status_code=400, detail="The description must be 10 to 1000 characters long.")

    open_count = (
        db.query(func.count(models.Complaint.id))
        .filter(
            models.Complaint.student_profile_id == profile.id,
            models.Complaint.status.in_(["pending", "in_progress"]),
        )
        .scalar()
    )
    if open_count >= MAX_OPEN:
        raise HTTPException(
            status_code=400,
            detail=f"You already have {MAX_OPEN} open complaints. Please wait until some are resolved.",
        )

    # check every file before anything is saved
    real_files = [f for f in (files or []) if f is not None and f.filename]
    if len(real_files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"You can attach at most {MAX_FILES} files.")
    prepared = []
    for f in real_files:
        original = Path(f.filename).name
        ext = Path(original).suffix.lower()
        if ext not in ALLOWED_EXT:
            raise HTTPException(
                status_code=400,
                detail=f"'{original}' is not allowed. Allowed types: {', '.join(sorted(ALLOWED_EXT))}.",
            )
        data = f.file.read(MAX_FILE_BYTES + 1)
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(status_code=400, detail=f"'{original}' is larger than 5 MB.")
        prepared.append((original, ext, data))

    now = datetime.now(timezone.utc)
    department = CATEGORY_DEPARTMENT[category]
    complaint = models.Complaint(
        student_profile_id=profile.id, ticket_no=_ticket(now), category=category, subject=subject,
        description=description, status="pending", assigned_to=department, created_at=now, updated_at=now,
    )
    db.add(complaint)
    db.flush()
    db.add(models.ComplaintEvent(
        complaint_id=complaint.id, status="pending", message="Complaint submitted.", by_name="You", created_at=now
    ))
    db.add(models.ComplaintEvent(
        complaint_id=complaint.id, status=None, message=f"Forwarded to {department}.", by_name="System",
        created_at=now + timedelta(seconds=1),
    ))

    if prepared:
        folder = UPLOAD_DIR / str(profile.id)
        folder.mkdir(parents=True, exist_ok=True)
        for original, ext, data in prepared:
            stored = f"{complaint.id}_{uuid.uuid4().hex}{ext}"
            (folder / stored).write_bytes(data)
            db.add(models.ComplaintAttachment(
                complaint_id=complaint.id, file_name=original, file_path=stored, size_bytes=len(data)
            ))

    db.commit()
    db.refresh(complaint)
    return _build(db, [complaint])[0]


@router.post("/{complaint_id}/seen")
def mark_seen(
    complaint_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    complaint = _get_own(db, profile, complaint_id)
    if complaint.has_unseen_update:
        complaint.has_unseen_update = False
        db.commit()
    return {"ok": True}


@router.post("/{complaint_id}/feedback", response_model=schemas.ComplaintOut)
def give_feedback(
    complaint_id: uuid.UUID,
    payload: schemas.ComplaintFeedbackIn,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    complaint = _get_own(db, profile, complaint_id)
    if complaint.status != "resolved":
        raise HTTPException(status_code=400, detail="You can give feedback only after the complaint is resolved.")
    if complaint.rating is not None:
        raise HTTPException(status_code=400, detail="You have already given feedback for this complaint.")

    now = datetime.now(timezone.utc)
    complaint.rating = payload.rating
    complaint.feedback = (payload.comment or "").strip() or None
    complaint.feedback_at = now
    db.add(models.ComplaintEvent(
        complaint_id=complaint.id, status=None, message=f"You rated the resolution {payload.rating} out of 5.",
        by_name="You", created_at=now,
    ))
    db.commit()
    db.refresh(complaint)
    return _build(db, [complaint])[0]


@router.get("/{complaint_id}/attachments/{attachment_id}")
def download_attachment(
    complaint_id: uuid.UUID,
    attachment_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    row = (
        db.query(models.ComplaintAttachment)
        .join(models.Complaint, models.Complaint.id == models.ComplaintAttachment.complaint_id)
        .filter(
            models.ComplaintAttachment.id == attachment_id,
            models.ComplaintAttachment.complaint_id == complaint_id,
            models.Complaint.student_profile_id == profile.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    path = UPLOAD_DIR / str(profile.id) / row.file_path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="The file is missing on the server.")
    return FileResponse(path, filename=row.file_name)


@router.post("/demo-seed")
def demo_seed(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """DEV ONLY. Creates four sample complaints (pending, in progress, resolved waiting for feedback, and
    resolved with feedback) so the whole flow can be seen before the Admin / staff modules exist.
    Set ENABLE_DEMO_DATA=false in .env to switch it off."""
    if os.getenv("ENABLE_DEMO_DATA", "true").lower() != "true":
        raise HTTPException(status_code=404, detail="Not available.")
    profile = _require_student(current_user)
    if db.query(models.Complaint.id).filter(models.Complaint.student_profile_id == profile.id).first():
        raise HTTPException(status_code=400, detail="You already have complaints.")

    now = datetime.now(timezone.utc)

    def make(category, subject, description, days_ago, status, steps, resolution=None, rating=None,
             feedback=None, unseen=False):
        created = now - timedelta(days=days_ago)
        department = CATEGORY_DEPARTMENT[category]
        complaint = models.Complaint(
            student_profile_id=profile.id, ticket_no=_ticket(created), category=category, subject=subject,
            description=description, status=status, assigned_to=department, resolution_note=resolution,
            has_unseen_update=unseen, rating=rating, feedback=feedback, created_at=created, updated_at=created,
        )
        db.add(complaint)
        db.flush()
        db.add(models.ComplaintEvent(
            complaint_id=complaint.id, status="pending", message="Complaint submitted.", by_name="You",
            created_at=created,
        ))
        db.add(models.ComplaintEvent(
            complaint_id=complaint.id, status=None, message=f"Forwarded to {department}.", by_name="System",
            created_at=created + timedelta(minutes=1),
        ))
        last = created
        for step_status, message, by, hours in steps:
            when = created + timedelta(hours=hours)
            db.add(models.ComplaintEvent(
                complaint_id=complaint.id, status=step_status, message=message, by_name=by, created_at=when
            ))
            last = max(last, when)
        complaint.updated_at = last
        if status == "resolved":
            complaint.resolved_at = last
        if rating is not None:
            complaint.feedback_at = last + timedelta(days=1)

    make(
        "Hostel", "Water cooler on the second floor is not working",
        "The water cooler near room 214 has not been giving cold water for more than a week. "
        "Many students are using the tap water instead.",
        12, "resolved",
        [("in_progress", "The maintenance team has been informed and will visit tomorrow.", "Hostel Warden Office", 20),
         ("resolved", "The cooler was repaired and tested. Please check it and rate the resolution.",
          "Hostel Warden Office", 70)],
        resolution="The water cooler on the second floor was repaired and tested.", unseen=True,
    )
    make(
        "IT / Wi-Fi", "Wi-Fi is very slow in the library reading room",
        "The Wi-Fi in the reading room is extremely slow after 4 PM and keeps disconnecting. "
        "It becomes difficult to use online journals.",
        5, "in_progress",
        [("in_progress", "The network team will check the access point in the reading room on Friday.",
          "IT Department", 30)],
        unseen=True,
    )
    make(
        "Library", "A returned book is still showing as issued",
        "I returned the book last week and got a slip from the counter, but it is still shown as issued in my "
        "library record.",
        1, "pending", [],
    )
    make(
        "Transport", "Bus route 4 reaches college late every morning",
        "The bus on route 4 reaches the college after the first lecture has already started on most days.",
        30, "resolved",
        [("in_progress", "The route timing is being reviewed with the driver.", "Transport Office", 24),
         ("resolved", "The pickup time was moved 10 minutes earlier from this week.", "Transport Office", 120)],
        resolution="The pickup time of route 4 was moved 10 minutes earlier.", rating=4,
        feedback="Much better now, but the bus is still a little late on Mondays.",
    )
    notify(db, profile.id, "complaint", "Your complaint was resolved",
           "The water cooler complaint is resolved. Please rate the resolution.", "complaints")
    notify(db, profile.id, "complaint", "Update on your complaint",
           "Your Wi-Fi complaint is now in progress.", "complaints")
    db.commit()
    return {"complaints": 4}