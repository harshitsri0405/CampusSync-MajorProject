import os
from datetime import date, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.routers.auth import get_current_user
from app.routers.student import _require_student

router = APIRouter(prefix="/api/student/timetable", tags=["student-timetable"])

# (subject, teacher, room)
DEMO_SUBJECTS = [
    ("Mathematics", "Dr. A. Sharma", "Room 101"),
    ("Physics", "Prof. R. Verma", "Room 102"),
    ("Data Structures", "Dr. S. Gupta", "Room 201"),
    ("Database Systems", "Prof. N. Singh", "Room 202"),
    ("English", "Ms. P. Mishra", "Room 103"),
]
LECTURE_SLOTS = [
    (time(9, 0), time(10, 0)),
    (time(10, 0), time(11, 0)),
    (time(11, 15), time(12, 15)),
    (time(12, 15), time(13, 15)),
]
# (day, subject, teacher, room, start, end)
DEMO_LABS = [
    (1, "Data Structures Lab", "Dr. S. Gupta", "Computer Lab 1", time(14, 0), time(17, 0)),
    (3, "Database Systems Lab", "Prof. N. Singh", "Computer Lab 2", time(14, 0), time(17, 0)),
    (4, "Physics Lab", "Prof. R. Verma", "Physics Lab", time(14, 0), time(16, 0)),
]


def _norm(value) -> str:
    return (value or "").strip().lower()


def _class_filter(model, profile):
    """Match the timetable rows of the student's class (course + semester), ignoring case and spaces."""
    return (
        func.lower(func.trim(model.course)) == _norm(profile.course),
        func.lower(func.trim(model.semester)) == _norm(profile.semester),
    )


def _weekdays_from(start: date, count: int) -> list[date]:
    out, d = [], start
    while len(out) < count:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(days=1)
    return out

def _term_out(term: models.SemesterTerm, today: date) -> schemas.TermOut:
    if today < term.start_date:
        status = "upcoming"
    elif today > term.end_date:
        status = "ended"
    else:
        status = "running"
    return schemas.TermOut(
        start_date=term.start_date, end_date=term.end_date, academic_year=term.academic_year,
        status=status, days_left=(term.end_date - today).days,
    )


@router.get("/overview", response_model=schemas.TimetableOverview)
def overview(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    if not _norm(profile.course) or not _norm(profile.semester):
        return schemas.TimetableOverview(
            course=profile.course, semester=profile.semester, class_known=False, entries=[], exams=[]
        )

    # the semester dates set by the admin: after the end date the timetable is no longer shown
    term_row = db.query(models.SemesterTerm).filter(*_class_filter(models.SemesterTerm, profile)).first()
    term = _term_out(term_row, date.today()) if term_row else None
    if term is not None and term.status == "ended":
        return schemas.TimetableOverview(
            course=profile.course, semester=profile.semester, class_known=True, entries=[], exams=[], term=term
        )

    entries = (
        db.query(models.TimetableEntry)
        .filter(*_class_filter(models.TimetableEntry, profile))
        .order_by(models.TimetableEntry.day_of_week, models.TimetableEntry.start_time)
        .all()
    )
    exams = (
        db.query(models.ExamScheduleEntry)
        .filter(*_class_filter(models.ExamScheduleEntry, profile))
        .order_by(models.ExamScheduleEntry.exam_date, models.ExamScheduleEntry.start_time)
        .all()
    )
    return schemas.TimetableOverview(
        course=profile.course,
        semester=profile.semester,
        class_known=True,
        entries=[
            schemas.TimetableEntryOut(
                day=e.day_of_week, start_time=e.start_time, end_time=e.end_time, subject=e.subject,
                faculty_name=e.faculty_name, room=e.room, kind=e.kind,
            )
            for e in entries
        ],
        exams=[
            schemas.ExamOut(
                subject=x.subject, exam_type=x.exam_type, exam_date=x.exam_date,
                start_time=x.start_time, end_time=x.end_time, venue=x.venue,
            )
            for x in exams
        ],
        term=term,
    )


@router.post("/demo-seed")
def demo_seed(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """DEV ONLY. Creates a sample weekly timetable, labs and exams for the student's class so the
    screen can be tried before the Admin module exists. Set ENABLE_DEMO_DATA=false in .env to switch it off."""
    if os.getenv("ENABLE_DEMO_DATA", "true").lower() != "true":
        raise HTTPException(status_code=404, detail="Not available.")
    profile = _require_student(current_user)
    if not _norm(profile.course) or not _norm(profile.semester):
        raise HTTPException(
            status_code=400,
            detail="Fill Course and Semester in your Student Profile first. The timetable is made for your class.",
        )
    exists = db.query(models.TimetableEntry.id).filter(*_class_filter(models.TimetableEntry, profile)).first()
    if exists:
        raise HTTPException(status_code=400, detail="A timetable already exists for your class.")

    course = profile.course.strip()
    semester = profile.semester.strip()

    # Monday to Friday lectures (subjects rotate every day)
    for day in range(5):
        for i, (start, end) in enumerate(LECTURE_SLOTS):
            subject, teacher, room = DEMO_SUBJECTS[(day + i) % len(DEMO_SUBJECTS)]
            db.add(models.TimetableEntry(
                course=course, semester=semester, day_of_week=day, start_time=start, end_time=end,
                subject=subject, faculty_name=teacher, room=room, kind="lecture",
            ))
    for day, subject, teacher, room, start, end in DEMO_LABS:
        db.add(models.TimetableEntry(
            course=course, semester=semester, day_of_week=day, start_time=start, end_time=end,
            subject=subject, faculty_name=teacher, room=room, kind="practical",
        ))

    # Exams: one already over, five internal tests soon, five end-semester exams later
    today = date.today()
    exam_rows = [("Mathematics", "Internal Test 1", today - timedelta(days=10), time(10, 0), time(11, 0), "Room 101")]
    for d, (subject, _teacher, room) in zip(_weekdays_from(today + timedelta(days=6), 5), DEMO_SUBJECTS):
        exam_rows.append((subject, "Internal Test 2", d, time(10, 0), time(11, 0), room))
    for d, (subject, _teacher, _room) in zip(_weekdays_from(today + timedelta(days=39), 5), DEMO_SUBJECTS):
        exam_rows.append((subject, "End Semester Exam", d, time(10, 0), time(13, 0), "Exam Hall A"))
    for subject, exam_type, d, start, end, venue in exam_rows:
        db.add(models.ExamScheduleEntry(
            course=course, semester=semester, subject=subject, exam_type=exam_type,
            exam_date=d, start_time=start, end_time=end, venue=venue,
        ))

    if db.query(models.SemesterTerm.id).filter(*_class_filter(models.SemesterTerm, profile)).first() is None:
        start_year = today.year if today.month >= 7 else today.year - 1
        db.add(models.SemesterTerm(
            course=course, semester=semester, start_date=today - timedelta(days=45),
            end_date=today + timedelta(days=60), academic_year=f"{start_year}-{str(start_year + 1)[2:]}",
        ))

    db.commit()
    return {"timetable_entries": 5 * len(LECTURE_SLOTS) + len(DEMO_LABS), "exams": len(exam_rows)}
