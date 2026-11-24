import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.routers.auth import get_current_user
from app.routers.student import _require_student
from app.routers.timetable import _class_filter, _norm

router = APIRouter(prefix="/api/student/assignments", tags=["student-assignments"])

# backend/uploads/submissions/<student id>/<stored file>
UPLOAD_ROOT = Path(os.getenv("UPLOAD_DIR") or (Path(__file__).resolve().parents[2] / "uploads"))
UPLOAD_DIR = UPLOAD_ROOT / "submissions"
MAX_FILE_BYTES = 5 * 1024 * 1024
ALLOWED_EXT = {".pdf", ".doc", ".docx", ".ppt", ".pptx", ".txt", ".zip", ".png", ".jpg", ".jpeg"}


def _status(assignment: models.Assignment, submission, now: datetime) -> str:
    if submission is not None and submission.marks is not None:
        return "graded"
    if submission is not None:
        return "submitted"
    return "overdue" if now > assignment.due_at else "pending"


def _submission_out(s: models.AssignmentSubmission) -> schemas.SubmissionOut:
    return schemas.SubmissionOut(
        file_name=s.file_name,
        note=s.note,
        submitted_at=s.submitted_at,
        is_late=s.is_late,
        marks=s.marks,
        feedback=s.feedback,
        graded_at=s.graded_at,
    )


def _delete_stored_file(profile: models.StudentProfile, submission: models.AssignmentSubmission) -> None:
    if submission.file_path:
        try:
            (UPLOAD_DIR / str(profile.id) / submission.file_path).unlink(missing_ok=True)
        except OSError:
            pass


@router.get("/overview", response_model=schemas.AssignmentsOverview)
def overview(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    if not _norm(profile.course) or not _norm(profile.semester):
        return schemas.AssignmentsOverview(
            course=profile.course, semester=profile.semester, class_known=False, assignments=[]
        )

    items = (
        db.query(models.Assignment)
        .filter(*_class_filter(models.Assignment, profile))
        .order_by(models.Assignment.due_at)
        .all()
    )
    subs = {}
    if items:
        rows = (
            db.query(models.AssignmentSubmission)
            .filter(
                models.AssignmentSubmission.student_profile_id == profile.id,
                models.AssignmentSubmission.assignment_id.in_([a.id for a in items]),
            )
            .all()
        )
        subs = {r.assignment_id: r for r in rows}

    now = datetime.now(timezone.utc)
    out = []
    for a in items:
        s = subs.get(a.id)
        out.append(
            schemas.AssignmentOut(
                id=str(a.id),
                subject=a.subject,
                title=a.title,
                description=a.description,
                faculty_name=a.faculty_name,
                max_marks=a.max_marks,
                due_at=a.due_at,
                status=_status(a, s, now),
                submission=_submission_out(s) if s else None,
            )
        )
    return schemas.AssignmentsOverview(
        course=profile.course, semester=profile.semester, class_known=True, assignments=out
    )


@router.post("/{assignment_id}/submit", response_model=schemas.SubmissionOut)
def submit(
    assignment_id: uuid.UUID,
    note: str = Form(""),
    file: UploadFile | None = File(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    assignment = (
        db.query(models.Assignment)
        .filter(models.Assignment.id == assignment_id, *_class_filter(models.Assignment, profile))
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    note = (note or "").strip()
    has_file = file is not None and bool(file.filename)
    if not has_file and not note:
        raise HTTPException(status_code=400, detail="Attach a file or write a note before submitting.")

    existing = (
        db.query(models.AssignmentSubmission)
        .filter(
            models.AssignmentSubmission.assignment_id == assignment.id,
            models.AssignmentSubmission.student_profile_id == profile.id,
        )
        .first()
    )
    if existing is not None and existing.marks is not None:
        raise HTTPException(status_code=400, detail="This assignment is already graded and cannot be changed.")

    stored_name = None
    original_name = None
    if has_file:
        original_name = Path(file.filename).name
        ext = Path(original_name).suffix.lower()
        if ext not in ALLOWED_EXT:
            raise HTTPException(
                status_code=400,
                detail=f"File type '{ext or 'none'}' is not allowed. Allowed: {', '.join(sorted(ALLOWED_EXT))}.",
            )
        data = file.file.read(MAX_FILE_BYTES + 1)
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(status_code=400, detail="The file is larger than 5 MB.")
        folder = UPLOAD_DIR / str(profile.id)
        folder.mkdir(parents=True, exist_ok=True)
        stored_name = f"{assignment.id}_{uuid.uuid4().hex}{ext}"
        (folder / stored_name).write_bytes(data)

    now = datetime.now(timezone.utc)
    is_late = now > assignment.due_at

    if existing is not None:
        if has_file:
            _delete_stored_file(profile, existing)
            existing.file_name = original_name
            existing.file_path = stored_name
        existing.note = note or None
        existing.submitted_at = now
        existing.is_late = is_late
        submission = existing
    else:
        submission = models.AssignmentSubmission(
            assignment_id=assignment.id,
            student_profile_id=profile.id,
            file_name=original_name,
            file_path=stored_name,
            note=note or None,
            submitted_at=now,
            is_late=is_late,
        )
        db.add(submission)

    db.commit()
    db.refresh(submission)
    return _submission_out(submission)


@router.get("/{assignment_id}/file")
def download_submission(
    assignment_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    submission = (
        db.query(models.AssignmentSubmission)
        .filter(
            models.AssignmentSubmission.assignment_id == assignment_id,
            models.AssignmentSubmission.student_profile_id == profile.id,
        )
        .first()
    )
    if not submission or not submission.file_path:
        raise HTTPException(status_code=404, detail="No file submitted for this assignment.")
    path = UPLOAD_DIR / str(profile.id) / submission.file_path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="The file is missing on the server.")
    return FileResponse(path, filename=submission.file_name or submission.file_path)


@router.post("/demo-seed")
def demo_seed(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """DEV ONLY. Creates sample assignments (pending, overdue, submitted, graded) for the student's class
    so the screen can be tried before the Faculty module exists. Set ENABLE_DEMO_DATA=false in .env to switch it off."""
    if os.getenv("ENABLE_DEMO_DATA", "true").lower() != "true":
        raise HTTPException(status_code=404, detail="Not available.")
    profile = _require_student(current_user)
    if not _norm(profile.course) or not _norm(profile.semester):
        raise HTTPException(
            status_code=400,
            detail="Fill Course and Semester in your Student Profile first. Assignments are given to your class.",
        )
    if db.query(models.Assignment.id).filter(*_class_filter(models.Assignment, profile)).first():
        raise HTTPException(status_code=400, detail="Assignments already exist for your class.")

    course = profile.course.strip()
    semester = profile.semester.strip()
    now = datetime.now(timezone.utc)

    def make(subject, title, description, faculty, max_marks, due_in_days):
        a = models.Assignment(
            course=course, semester=semester, subject=subject, title=title, description=description,
            faculty_name=faculty, max_marks=max_marks, due_at=now + timedelta(days=due_in_days),
        )
        db.add(a)
        db.flush()
        return a

    make("Mathematics", "Problem Set 3: Differential Equations",
         "Solve questions 1 to 10 from the problem set and upload clear scanned pages or a PDF.",
         "Dr. A. Sharma", 10, 5)
    make("Data Structures", "Implement a Binary Search Tree",
         "Write insert, search and delete in C++ or Java. Submit the source file with a short note on complexity.",
         "Dr. S. Gupta", 20, 2)

    a3 = make("Database Systems", "ER Diagram for a Library System",
              "Draw the ER diagram with entities, attributes and relationships. Mention all assumptions.",
              "Prof. N. Singh", 10, -3)
    db.add(models.AssignmentSubmission(
        assignment_id=a3.id, student_profile_id=profile.id, note="ER diagram submitted as discussed in class.",
        submitted_at=a3.due_at - timedelta(hours=6), is_late=False,
    ))

    a4 = make("Physics", "Lab Report: Simple Pendulum",
              "Write the aim, observations, calculations and result of the pendulum experiment.",
              "Prof. R. Verma", 10, -12)
    db.add(models.AssignmentSubmission(
        assignment_id=a4.id, student_profile_id=profile.id, note="Lab report submitted.",
        submitted_at=a4.due_at - timedelta(days=1), is_late=False,
        marks=8, feedback="Good observations and neat calculations. Add the error analysis next time.",
        graded_at=a4.due_at + timedelta(days=2),
    ))

    make("English", "Essay: Technology in Education",
         "Write a 500 word essay on how technology is changing education.",
         "Ms. P. Mishra", 10, -1)

    db.commit()
    return {"assignments": 5}