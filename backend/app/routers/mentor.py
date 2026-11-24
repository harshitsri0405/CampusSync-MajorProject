import os
import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.notify import notify
from app.pdf_utils import text_pdf
from app.routers.auth import get_current_user
from app.routers.results import grade_for, PASS_MARKS
from app.routers.student import _require_student

router = APIRouter(prefix="/api/student/mentor", tags=["student-mentor"])

TOPICS = [
    "Academic guidance", "Progress discussion", "Attendance", "Exams and marks",
    "Career guidance", "Personal matter", "Other",
]
MODES = ["In person", "Online"]
MAX_PENDING = 3
REQUIRED_ATTENDANCE = 75.0
CHAT_LIMIT = 200  # the latest messages shown in the chat
MAX_MESSAGE_CHARS = 1000

# backend/uploads/mentor/<student id>/<stored file>
UPLOAD_ROOT = Path(os.getenv("UPLOAD_DIR") or (Path(__file__).resolve().parents[2] / "uploads"))
UPLOAD_DIR = UPLOAD_ROOT / "mentor"
MAX_FILE_BYTES = 10 * 1024 * 1024
ALLOWED_EXT = {".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt", ".png", ".jpg", ".jpeg", ".zip"}


def _utc(value):
    """Times are stored as naive UTC. Mark them as UTC so the browser shows them in local time."""
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _lines(text) -> list[str]:
    return [line.strip() for line in (text or "").splitlines() if line.strip()]


def _get_mentor(db: Session, profile: models.StudentProfile):
    return (
        db.query(models.MentorAssignment)
        .filter(models.MentorAssignment.student_profile_id == profile.id)
        .first()
    )


def _require_mentor(db: Session, profile: models.StudentProfile):
    mentor = _get_mentor(db, profile)
    if not mentor:
        raise HTTPException(status_code=404, detail="No mentor is assigned to you yet.")
    return mentor


def _message_out(m: models.MentorMessage, attachment: models.MentorAttachment | None = None) -> schemas.MentorMessageOut:
    return schemas.MentorMessageOut(
        id=str(m.id), sender=m.sender, body=m.body, created_at=_utc(m.created_at), is_read=m.is_read,
        attachment=(
            schemas.MentorAttachmentOut(file_name=attachment.file_name, size_bytes=attachment.size_bytes)
            if attachment else None
        ),
    )


def _messages_out(db: Session, messages: list[models.MentorMessage]) -> list[schemas.MentorMessageOut]:
    attachments = {}
    if messages:
        rows = (
            db.query(models.MentorAttachment)
            .filter(models.MentorAttachment.message_id.in_([m.id for m in messages]))
            .all()
        )
        attachments = {a.message_id: a for a in rows}
    return [_message_out(m, attachments.get(m.id)) for m in messages]


def _meeting_out(x: models.MentorMeeting) -> schemas.MentorMeetingOut:
    return schemas.MentorMeetingOut(
        id=str(x.id), topic=x.topic, agenda=x.agenda, requested_date=x.requested_date,
        requested_time=x.requested_time, mode=x.mode, status=x.status,
        mentor_response=x.mentor_response, created_at=_utc(x.created_at),
    )


def _note_out(n: models.MentorNote) -> schemas.MentorNoteOut:
    return schemas.MentorNoteOut(
        id=str(n.id), note_type=n.note_type, title=n.title, body=n.body,
        action_points=_lines(n.action_points), created_by=n.created_by, created_on=n.created_on,
    )


def _recent_messages(db: Session, profile: models.StudentProfile) -> list[models.MentorMessage]:
    rows = (
        db.query(models.MentorMessage)
        .filter(models.MentorMessage.student_profile_id == profile.id)
        .order_by(models.MentorMessage.created_at.desc())
        .limit(CHAT_LIMIT)
        .all()
    )
    rows.reverse()
    return rows


def _snapshot(db: Session, profile: models.StudentProfile) -> schemas.MentorSnapshot:
    """A short picture of the student's attendance and results, built from the real tables."""
    rows = (
        db.query(
            models.AttendanceRecord.subject,
            models.AttendanceRecord.status,
            func.count(models.AttendanceRecord.id),
        )
        .filter(models.AttendanceRecord.student_profile_id == profile.id)
        .group_by(models.AttendanceRecord.subject, models.AttendanceRecord.status)
        .all()
    )
    per_subject = defaultdict(lambda: {"present": 0, "total": 0})
    for subject, status, count in rows:
        per_subject[subject]["total"] += count
        if status == "present":
            per_subject[subject]["present"] += count
    total = sum(v["total"] for v in per_subject.values())
    present = sum(v["present"] for v in per_subject.values())
    percentage = round(present * 100 / total, 1) if total else None
    low = sorted(
        name for name, v in per_subject.items()
        if v["total"] and v["present"] * 100 / v["total"] < REQUIRED_ATTENDANCE
    )

    records = (
        db.query(models.ResultRecord)
        .filter(models.ResultRecord.student_profile_id == profile.id, models.ResultRecord.published.is_(True))
        .all()
    )
    by_semester = defaultdict(list)
    for r in records:
        by_semester[r.semester].append(r)
    points = 0
    credits = 0
    backlogs = []
    for items in by_semester.values():
        if any(r.internal_marks is None or r.external_marks is None for r in items):
            continue
        for r in items:
            marks = round(r.internal_marks + r.external_marks, 1)
            _grade, grade_points = grade_for(marks)
            points += grade_points * r.credits
            credits += r.credits
            if marks < PASS_MARKS:
                backlogs.append(r.subject)
    cgpa = round(points / credits, 2) if credits else None

    talking = []
    if percentage is not None and percentage < REQUIRED_ATTENDANCE:
        talking.append(f"Overall attendance is {percentage}%, below the required {int(REQUIRED_ATTENDANCE)}%.")
    if low:
        talking.append(f"Attendance is below {int(REQUIRED_ATTENDANCE)}% in {', '.join(low)}.")
    if backlogs:
        talking.append(f"Subjects to clear: {', '.join(sorted(set(backlogs)))}.")
    if cgpa is not None and cgpa < 6.0:
        talking.append(f"CGPA is {cgpa}. Plan together how to improve it.")
    if not talking:
        if percentage is None and cgpa is None:
            talking.append("There is not enough attendance or result data yet. You can still discuss your goals and any difficulty.")
        else:
            talking.append("Your attendance and results look fine. Ask your mentor about goals, electives and career plans.")

    return schemas.MentorSnapshot(
        attendance_percentage=percentage,
        attendance_classes=total,
        low_attendance_subjects=low,
        cgpa=cgpa,
        backlog_subjects=sorted(set(backlogs)),
        talking_points=talking,
    )


@router.get("/overview", response_model=schemas.MentorOverview)
def overview(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    mentor = _get_mentor(db, profile)
    snapshot = _snapshot(db, profile)
    if not mentor:
        return schemas.MentorOverview(
            has_mentor=False, mentor=None, unread_messages=0, messages=[], meetings=[],
            progress_notes=[], guidance_notes=[], snapshot=snapshot,
        )

    messages = _recent_messages(db, profile)
    meetings = (
        db.query(models.MentorMeeting)
        .filter(models.MentorMeeting.student_profile_id == profile.id)
        .order_by(models.MentorMeeting.requested_date.desc(), models.MentorMeeting.requested_time.desc())
        .all()
    )
    notes = (
        db.query(models.MentorNote)
        .filter(models.MentorNote.student_profile_id == profile.id)
        .order_by(models.MentorNote.created_on.desc(), models.MentorNote.created_at.desc())
        .all()
    )
    return schemas.MentorOverview(
        has_mentor=True,
        mentor=schemas.MentorOut(
            name=mentor.mentor_name, designation=mentor.designation, department=mentor.department,
            email=mentor.email, phone=mentor.phone, cabin=mentor.cabin, availability=mentor.availability,
        ),
        unread_messages=sum(1 for m in messages if m.sender == "mentor" and not m.is_read),
        messages=_messages_out(db, messages),
        meetings=[_meeting_out(x) for x in meetings],
        progress_notes=[_note_out(n) for n in notes if n.note_type == "progress"],
        guidance_notes=[_note_out(n) for n in notes if n.note_type == "guidance"],
        snapshot=snapshot,
    )


@router.get("/messages", response_model=list[schemas.MentorMessageOut])
def list_messages(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    _require_mentor(db, profile)
    return _messages_out(db, _recent_messages(db, profile))


@router.post("/messages", response_model=schemas.MentorMessageOut)
def send_message(
    payload: schemas.MentorMessageIn,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    _require_mentor(db, profile)
    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Write a message first.")
    if len(body) > MAX_MESSAGE_CHARS:
        raise HTTPException(status_code=400, detail=f"A message can have at most {MAX_MESSAGE_CHARS} characters.")
    message = models.MentorMessage(student_profile_id=profile.id, sender="student", body=body, is_read=True)
    db.add(message)
    db.commit()
    db.refresh(message)
    return _message_out(message)


@router.post("/messages/upload", response_model=schemas.MentorMessageOut)
def send_message_with_file(
    body: str = Form(""),
    file: UploadFile | None = File(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """A message with a document (and an optional text). Either the text or the file is required."""
    profile = _require_student(current_user)
    _require_mentor(db, profile)
    text = (body or "").strip()
    has_file = file is not None and bool(file.filename)
    if not text and not has_file:
        raise HTTPException(status_code=400, detail="Write a message or attach a document.")
    if len(text) > MAX_MESSAGE_CHARS:
        raise HTTPException(status_code=400, detail=f"A message can have at most {MAX_MESSAGE_CHARS} characters.")

    original = ext = data = None
    if has_file:
        original = Path(file.filename).name
        ext = Path(original).suffix.lower()
        if ext not in ALLOWED_EXT:
            raise HTTPException(
                status_code=400,
                detail=f"'{ext or 'this file'}' is not allowed. Allowed: PDF, Word, PowerPoint, Excel, TXT, PNG, JPG, ZIP.",
            )
        data = file.file.read(MAX_FILE_BYTES + 1)
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(status_code=400, detail="The file is larger than 10 MB.")
        if not data:
            raise HTTPException(status_code=400, detail="The file is empty.")

    message = models.MentorMessage(student_profile_id=profile.id, sender="student", body=text, is_read=True)
    db.add(message)
    db.flush()

    attachment = None
    if has_file:
        folder = UPLOAD_DIR / str(profile.id)
        folder.mkdir(parents=True, exist_ok=True)
        stored = f"{message.id}_{uuid.uuid4().hex}{ext}"
        (folder / stored).write_bytes(data)
        attachment = models.MentorAttachment(
            message_id=message.id, student_profile_id=profile.id, file_name=original, file_path=stored,
            content_type=file.content_type, size_bytes=len(data),
        )
        db.add(attachment)

    db.commit()
    db.refresh(message)
    return _message_out(message, attachment)


@router.get("/messages/{message_id}/file")
def download_message_file(
    message_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Downloads a document of this student's chat (sent by the student or by the mentor)."""
    profile = _require_student(current_user)
    attachment = (
        db.query(models.MentorAttachment)
        .filter(
            models.MentorAttachment.message_id == message_id,
            models.MentorAttachment.student_profile_id == profile.id,
        )
        .first()
    )
    if not attachment:
        raise HTTPException(status_code=404, detail="Document not found.")
    path = UPLOAD_DIR / str(profile.id) / Path(attachment.file_path).name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="The file is missing on the server.")
    return FileResponse(path, filename=attachment.file_name)


@router.post("/messages/read")
def mark_messages_read(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    db.query(models.MentorMessage).filter(
        models.MentorMessage.student_profile_id == profile.id,
        models.MentorMessage.sender == "mentor",
        models.MentorMessage.is_read.is_(False),
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"ok": True}


@router.post("/meetings", response_model=schemas.MentorMeetingOut)
def request_meeting(
    payload: schemas.MentorMeetingIn,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    _require_mentor(db, profile)
    if payload.topic not in TOPICS:
        raise HTTPException(status_code=400, detail="Choose a topic from the list.")
    if payload.mode not in MODES:
        raise HTTPException(status_code=400, detail="Choose In person or Online.")
    agenda = payload.agenda.strip()
    if not agenda:
        raise HTTPException(status_code=400, detail="Write what you want to discuss.")
    if payload.requested_date < date.today():
        raise HTTPException(status_code=400, detail="Choose today or a later date.")
    pending = (
        db.query(func.count(models.MentorMeeting.id))
        .filter(
            models.MentorMeeting.student_profile_id == profile.id,
            models.MentorMeeting.status == "pending",
        )
        .scalar()
    )
    if pending >= MAX_PENDING:
        raise HTTPException(
            status_code=400,
            detail=f"You already have {MAX_PENDING} meeting requests waiting for a reply. Cancel one or wait for your mentor.",
        )
    meeting = models.MentorMeeting(
        student_profile_id=profile.id, topic=payload.topic, agenda=agenda,
        requested_date=payload.requested_date, requested_time=payload.requested_time,
        mode=payload.mode, status="pending",
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return _meeting_out(meeting)


@router.post("/meetings/{meeting_id}/cancel", response_model=schemas.MentorMeetingOut)
def cancel_meeting(
    meeting_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    meeting = None
    try:
        meeting = (
            db.query(models.MentorMeeting)
            .filter(
                models.MentorMeeting.id == meeting_id,
                models.MentorMeeting.student_profile_id == profile.id,
            )
            .first()
        )
    except Exception:
        db.rollback()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found.")
    if meeting.status not in ("pending", "approved"):
        raise HTTPException(status_code=400, detail="Only a waiting or approved meeting can be cancelled.")
    meeting.status = "cancelled"
    db.commit()
    db.refresh(meeting)
    return _meeting_out(meeting)


def _next_weekday(d: date) -> date:
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


@router.post("/demo-seed")
def demo_seed(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """DEV ONLY. Assigns a sample mentor and creates a sample chat (with a document from the mentor), meetings,
    notes and notifications so the screen can be tried before the Faculty module exists.
    Set ENABLE_DEMO_DATA=false in .env to switch it off."""
    if os.getenv("ENABLE_DEMO_DATA", "true").lower() != "true":
        raise HTTPException(status_code=404, detail="Not available.")
    profile = _require_student(current_user)
    if _get_mentor(db, profile):
        raise HTTPException(status_code=400, detail="A mentor is already assigned to you.")

    now = datetime.utcnow()
    today = date.today()
    mentor_name = "Dr. Neha Kapoor"
    department = (profile.department or "").strip() or "Computer Science"

    db.add(models.MentorAssignment(
        student_profile_id=profile.id, mentor_name=mentor_name, designation="Associate Professor",
        department=department, email="neha.kapoor@example.edu", phone="+91 90000 00000",
        cabin="Room 305, Block B", availability="Mon to Fri, 2:00 PM to 4:00 PM",
    ))

    # (sender, message, hours ago, read)
    chat = [
        ("mentor", "Welcome! I am your mentor for this year. Feel free to message me about studies, attendance or anything that worries you.", 72, True),
        ("student", "Thank you, ma'am. I wanted to ask about the Data Structures assignment deadline.", 71, True),
        ("mentor", "The deadline is as posted in your Assignments section. Start with the tree questions, they take the most time. Come to my cabin if you get stuck.", 70, True),
        ("student", "Okay, I will start today. Also, I missed two Physics classes last week because I was unwell.", 26, True),
        ("mentor", "Please get a medical note and show it to the Physics faculty. Also try to attend every class this week, your attendance needs attention.", 20, True),
        ("mentor", "Let us also discuss your progress in person. You can request a meeting from the Request Meeting tab.", 3, False),
    ]
    for sender, body, hours_ago, read in chat:
        db.add(models.MentorMessage(
            student_profile_id=profile.id, sender=sender, body=body, is_read=read,
            created_at=now - timedelta(hours=hours_ago),
        ))

    # a message from the mentor with a document
    doc_message = models.MentorMessage(
        student_profile_id=profile.id, sender="mentor", is_read=False, created_at=now - timedelta(hours=2),
        body="I have attached a week-wise revision plan for your end semester exams. Please go through it before we meet.",
    )
    db.add(doc_message)
    db.flush()
    pdf = text_pdf(
        "Revision plan for the end semester exams",
        ["# Week 1: Plan and cover the basics",
         "List all subjects and units. Read the notes of every subject once and mark the topics you find difficult.",
         "# Week 2: Practice",
         "Solve at least three previous year papers per subject. Time yourself and check the answers.",
         "# Week 3: Revise and clear doubts",
         "Revise the marked topics. Meet the subject faculty for any remaining doubt before the exam leave starts.",
         "Shared by your mentor through CampusSync (sample document)."],
        subtitle=f"Shared by {mentor_name}",
    )
    folder = UPLOAD_DIR / str(profile.id)
    folder.mkdir(parents=True, exist_ok=True)
    stored = f"{doc_message.id}_{uuid.uuid4().hex}.pdf"
    (folder / stored).write_bytes(pdf)
    db.add(models.MentorAttachment(
        message_id=doc_message.id, student_profile_id=profile.id, file_name="Revision_plan.pdf",
        file_path=stored, content_type="application/pdf", size_bytes=len(pdf),
    ))

    notify(db, profile.id, "mentor", f"New message from {mentor_name}",
           "Let us also discuss your progress in person. You can request a meeting.", "mentor")
    notify(db, profile.id, "mentor", f"{mentor_name} shared a document",
           "Revision plan for the end semester exams (PDF).", "mentor")

    # (topic, agenda, date, time, mode, status, response, created days ago)
    meetings = [
        ("Progress discussion", "Discuss my attendance and internal marks.", _next_weekday(today + timedelta(days=3)),
         time(15, 0), "In person", "approved", "Confirmed. Please bring your internal marks sheet.", 2),
        ("Academic guidance", "Need advice on choosing electives for the next semester.",
         _next_weekday(today + timedelta(days=8)), time(14, 30), "Online", "pending", None, 0),
        ("Progress discussion", "Review of mid-semester performance.", _next_weekday(today - timedelta(days=14)),
         time(15, 0), "In person", "completed",
         "We reviewed attendance and marks and agreed on an action plan.", 18),
        ("Career guidance", "Want to talk about internships.", _next_weekday(today - timedelta(days=6)),
         time(16, 0), "Online", "rejected", "I am on leave on that day. Please request another date.", 9),
    ]
    for topic, agenda, when, at, mode, status, response, created_ago in meetings:
        db.add(models.MentorMeeting(
            student_profile_id=profile.id, topic=topic, agenda=agenda, requested_date=when, requested_time=at,
            mode=mode, status=status, mentor_response=response, created_at=now - timedelta(days=created_ago),
        ))

    # (type, title, body, action points, days ago)
    notes = [
        ("progress", "Mid-semester progress review",
         "Marks are satisfactory overall. Attendance in a few subjects is close to the limit and must be improved before the end of the semester.",
         "Keep attendance above 75% in every subject\nSubmit the pending lab records this week\nRevise units 1 and 2 before the next internal test", 14),
        ("progress", "First month check-in",
         "You have settled well into the semester. What is missing is a regular study routine.",
         "Study at least one hour every day after classes\nMake short notes after every class", 60),
        ("guidance", "Choosing your electives",
         "Pick electives that match the career you want, not only the easy ones. Talk to seniors and read the syllabus before deciding.",
         "Read the elective syllabus in the Syllabus section\nList two career options and match electives to them\nMeet me before the registration date", 10),
        ("guidance", "Preparing for end-semester exams",
         "Start early and practise previous year papers. Divide the syllabus week by week instead of leaving it for the last days.",
         "Make a week-wise revision plan\nSolve at least three previous year papers per subject\nClear doubts with faculty before the exam leave starts", 4),
    ]
    for note_type, title, body, points, days_ago in notes:
        db.add(models.MentorNote(
            student_profile_id=profile.id, note_type=note_type, title=title, body=body, action_points=points,
            created_by=mentor_name, created_on=today - timedelta(days=days_ago),
            created_at=now - timedelta(days=days_ago),
        ))

    db.commit()
    return {"mentor": mentor_name, "messages": len(chat) + 1, "meetings": len(meetings), "notes": len(notes)}