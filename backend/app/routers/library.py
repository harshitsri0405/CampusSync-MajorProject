import os
import re
import uuid
from datetime import date, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.pdf_utils import text_pdf
from app.routers.auth import get_current_user
from app.routers.student import _require_student

router = APIRouter(prefix="/api/student/library", tags=["student-library"])

LOAN_DAYS = 14
FINE_PER_DAY = 2  # rupees for every day after the due date
MAX_RENEWALS = 2
RENEW_DAYS = 7

# backend/uploads/ebooks/<stored file>
UPLOAD_ROOT = Path(os.getenv("UPLOAD_DIR") or (Path(__file__).resolve().parents[2] / "uploads"))
EBOOK_DIR = UPLOAD_ROOT / "ebooks"

# (title, author, category)
DEMO_BOOKS = [
    ("Introduction to Algorithms", "Thomas H. Cormen et al.", "Computer Science"),
    ("Database System Concepts", "Abraham Silberschatz et al.", "Computer Science"),
    ("Operating System Concepts", "Abraham Silberschatz et al.", "Computer Science"),
    ("Computer Networks", "Andrew S. Tanenbaum", "Computer Science"),
    ("Let Us C", "Yashavant Kanetkar", "Programming"),
    ("Higher Engineering Mathematics", "B. S. Grewal", "Mathematics"),
]

# (title, author, category, description, paragraphs). All sample content, the real e-books come from the admin.
DEMO_EBOOKS = [
    ("Sample E-Book: Programming Basics", "CampusSync Demo", "Computer Science",
     "A short sample e-book to try reading and downloading. Real e-books are added by the library admin.",
     ["# About this sample",
      "This file was created by CampusSync to test the e-book section. The library admin will upload the real e-books of your college.",
      "# What a program is",
      "A program is a list of instructions written in a programming language. The computer follows the instructions one by one, so a clear order and clear names make a program easy to read.",
      "# Variables and decisions",
      "A variable stores a value such as a mark or a name. A decision (if / else) lets the program choose what to do depending on a value."]),
    ("Sample E-Book: Study Skills for Engineering Students", "CampusSync Demo", "General",
     "A sample guide with study habits. Replace it with real e-books from the admin.",
     ["# About this sample",
      "This is a sample document made by CampusSync. It only shows how an e-book looks when you read or download it.",
      "# Plan your week",
      "Write down your classes, assignments and exams on one page. Give every subject a fixed study slot so that nothing is left for the last night.",
      "# Revise little and often",
      "Short revision every day works better than one long session before the exam. After each class, write three lines about what you learned."]),
    ("Sample E-Book: Database Concepts Guide", "CampusSync Demo", "Computer Science",
     "A sample guide to basic database words.",
     ["# About this sample",
      "This is a sample document made by CampusSync to test the e-book section.",
      "# Tables and keys",
      "A table stores records in rows and columns. A primary key is a column whose value is different for every row, so each row can be found exactly.",
      "# Queries",
      "A query asks the database a question. SQL is the language used to ask: SELECT reads data, INSERT adds a row, UPDATE changes it and DELETE removes it."]),
]


def _late_days(issue: models.LibraryIssue, today: date) -> int:
    end = issue.returned_on or today
    return max((end - issue.due_on).days, 0)


def _ebook_out(e: models.LibraryEbook) -> schemas.LibraryEbookOut:
    return schemas.LibraryEbookOut(
        id=str(e.id), title=e.title, author=e.author, category=e.category, description=e.description,
        file_name=e.file_name, file_type=(Path(e.file_name).suffix.lstrip(".").upper() or "FILE"),
        size_bytes=e.size_bytes, added_on=e.created_at.date() if e.created_at else date.today(),
    )


@router.get("/overview", response_model=schemas.LibraryOverview)
def overview(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    rows = (
        db.query(models.LibraryIssue, models.LibraryBook)
        .join(models.LibraryBook, models.LibraryBook.id == models.LibraryIssue.book_id)
        .filter(models.LibraryIssue.student_profile_id == profile.id)
        .order_by(models.LibraryIssue.issued_on.desc())
        .all()
    )

    today = date.today()
    renewals = {}
    if rows:
        counts = (
            db.query(models.LibraryRenewal.issue_id, func.count(models.LibraryRenewal.id))
            .filter(models.LibraryRenewal.issue_id.in_([i.id for i, _b in rows]))
            .group_by(models.LibraryRenewal.issue_id)
            .all()
        )
        renewals = {issue_id: count for issue_id, count in counts}
    any_overdue = any(i.returned_on is None and i.due_on < today for i, _b in rows)

    issued, returned, fines = [], [], []
    total_fine = 0
    fine_paid_total = 0
    overdue = 0

    for issue, book in rows:
        late = _late_days(issue, today)
        fine = late * FINE_PER_DAY
        paid = min(issue.fine_paid or 0, fine)
        total_fine += fine
        fine_paid_total += paid

        if issue.returned_on is None:
            days_left = (issue.due_on - today).days
            is_overdue = days_left < 0
            if is_overdue:
                overdue += 1
            renew_count = renewals.get(issue.id, 0)
            note = None
            if is_overdue:
                note = "An overdue book cannot be renewed. Return it at the library counter."
            elif any_overdue:
                note = "Return your overdue books first to renew this one."
            elif renew_count >= MAX_RENEWALS:
                note = f"Renewed {MAX_RENEWALS} times already. Please return it."
            issued.append(schemas.LibraryIssuedOut(
                id=str(issue.id), title=book.title, author=book.author, category=book.category,
                issued_on=issue.issued_on, due_on=issue.due_on, days_left=days_left, is_overdue=is_overdue,
                fine_so_far=fine, renewals=renew_count, can_renew=note is None, renew_note=note,
            ))
        else:
            returned.append(schemas.LibraryReturnedOut(
                title=book.title, author=book.author, issued_on=issue.issued_on, due_on=issue.due_on,
                returned_on=issue.returned_on, days_late=late, fine=fine,
            ))

        if fine > 0:
            pending = fine - paid
            if issue.returned_on is None:
                status = "accruing"
            else:
                status = "paid" if pending == 0 else "pending"
            fines.append(schemas.LibraryFineOut(
                title=book.title, issued_on=issue.issued_on, due_on=issue.due_on,
                returned_on=issue.returned_on, days_late=late, fine=fine, paid=paid,
                pending=pending, status=status,
            ))

    issued.sort(key=lambda x: x.due_on)  # most urgent first
    returned.sort(key=lambda x: x.returned_on, reverse=True)

    return schemas.LibraryOverview(
        summary=schemas.LibrarySummary(
            currently_issued=len(issued),
            overdue=overdue,
            total_fine=total_fine,
            fine_paid=fine_paid_total,
            fine_pending=total_fine - fine_paid_total,
            fine_per_day=FINE_PER_DAY,
            loan_days=LOAN_DAYS,
            max_renewals=MAX_RENEWALS,
            renew_days=RENEW_DAYS,
        ),
        issued=issued,
        returned=returned,
        fines=fines,
    )


@router.post("/issues/{issue_id}/renew")
def renew(
    issue_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    today = date.today()
    issue = (
        db.query(models.LibraryIssue)
        .filter(models.LibraryIssue.id == issue_id, models.LibraryIssue.student_profile_id == profile.id)
        .first()
    )
    if not issue:
        raise HTTPException(status_code=404, detail="Book not found.")
    if issue.returned_on is not None:
        raise HTTPException(status_code=400, detail="This book is already returned.")
    if issue.due_on < today:
        raise HTTPException(status_code=400, detail="An overdue book cannot be renewed. Return it at the library counter.")
    other_overdue = (
        db.query(models.LibraryIssue.id)
        .filter(
            models.LibraryIssue.student_profile_id == profile.id,
            models.LibraryIssue.returned_on.is_(None),
            models.LibraryIssue.due_on < today,
        )
        .first()
    )
    if other_overdue:
        raise HTTPException(status_code=400, detail="Return your overdue books first to renew this one.")
    count = (
        db.query(func.count(models.LibraryRenewal.id)).filter(models.LibraryRenewal.issue_id == issue.id).scalar() or 0
    )
    if count >= MAX_RENEWALS:
        raise HTTPException(status_code=400, detail=f"A book can be renewed only {MAX_RENEWALS} times. Please return it.")

    new_due = issue.due_on + timedelta(days=RENEW_DAYS)
    db.add(models.LibraryRenewal(issue_id=issue.id, old_due_on=issue.due_on, new_due_on=new_due, renewed_on=today))
    issue.due_on = new_due
    db.commit()
    return {"due_on": new_due.isoformat(), "renewals_left": MAX_RENEWALS - count - 1}


# ------------------------------------------------------------------ e-books (added by the admin)
@router.get("/ebooks", response_model=list[schemas.LibraryEbookOut])
def list_ebooks(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_student(current_user)
    return [_ebook_out(e) for e in db.query(models.LibraryEbook).order_by(models.LibraryEbook.title).all()]


@router.get("/ebooks/{ebook_id}/file")
def ebook_file(
    ebook_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_student(current_user)
    ebook = db.query(models.LibraryEbook).filter(models.LibraryEbook.id == ebook_id).first()
    if not ebook:
        raise HTTPException(status_code=404, detail="E-book not found.")
    path = EBOOK_DIR / Path(ebook.file_path).name  # .name keeps the lookup inside the e-book folder
    if not path.is_file():
        raise HTTPException(status_code=404, detail="The file is missing on the server.")
    return FileResponse(path, filename=ebook.file_name)


@router.post("/ebooks/demo-seed")
def ebooks_demo_seed(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """DEV ONLY. Creates three sample e-books (generated PDFs) so the section can be tried before the admin
    uploads real ones. Set ENABLE_DEMO_DATA=false in .env to switch it off."""
    if os.getenv("ENABLE_DEMO_DATA", "true").lower() != "true":
        raise HTTPException(status_code=404, detail="Not available.")
    _require_student(current_user)
    if db.query(models.LibraryEbook.id).first():
        raise HTTPException(status_code=400, detail="The library already has e-books.")

    EBOOK_DIR.mkdir(parents=True, exist_ok=True)
    for title, author, category, description, paragraphs in DEMO_EBOOKS:
        data = text_pdf(title, paragraphs, subtitle="Sample e-book for testing CampusSync")
        stored = f"{uuid.uuid4().hex}.pdf"
        (EBOOK_DIR / stored).write_bytes(data)
        db.add(models.LibraryEbook(
            title=title, author=author, category=category, description=description,
            file_name=re.sub(r"[^A-Za-z0-9]+", "_", title).strip("_") + ".pdf", file_path=stored,
            size_bytes=len(data), uploaded_by="demo",
        ))
    db.commit()
    return {"ebooks": len(DEMO_EBOOKS)}


# ------------------------------------------------------------------ sample issued books
@router.post("/demo-seed")
def demo_seed(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """DEV ONLY. Issues a few sample books to the student (one on time, one overdue, returned on time,
    returned late with fine paid, returned late with fine unpaid) so the screen can be tried before the
    librarian module exists. Set ENABLE_DEMO_DATA=false in .env to switch it off."""
    if os.getenv("ENABLE_DEMO_DATA", "true").lower() != "true":
        raise HTTPException(status_code=404, detail="Not available.")
    profile = _require_student(current_user)
    if db.query(models.LibraryIssue.id).filter(models.LibraryIssue.student_profile_id == profile.id).first():
        raise HTTPException(status_code=400, detail="Library records already exist for this student.")

    today = date.today()
    titles = [t for t, _a, _c in DEMO_BOOKS]
    books = {b.title: b for b in db.query(models.LibraryBook).filter(models.LibraryBook.title.in_(titles)).all()}
    for title, author, category in DEMO_BOOKS:
        if title not in books:
            book = models.LibraryBook(title=title, author=author, category=category)
            db.add(book)
            books[title] = book
    db.flush()

    def issue(title, issued_days_ago, returned_days_ago=None, fine_paid=0):
        issued_on = today - timedelta(days=issued_days_ago)
        db.add(models.LibraryIssue(
            student_profile_id=profile.id,
            book_id=books[title].id,
            issued_on=issued_on,
            due_on=issued_on + timedelta(days=LOAN_DAYS),
            returned_on=(today - timedelta(days=returned_days_ago)) if returned_days_ago is not None else None,
            fine_paid=fine_paid,
            issued_by="demo",
        ))

    issue("Database System Concepts", 5)  # issued, due in 9 days
    issue("Operating System Concepts", 20)  # issued, 6 days overdue, fine Rs 12 and growing
    issue("Introduction to Algorithms", 60, returned_days_ago=48)  # returned on time
    issue("Computer Networks", 45, returned_days_ago=24, fine_paid=14)  # 7 days late, fine Rs 14 paid
    issue("Let Us C", 40, returned_days_ago=18)  # 8 days late, fine Rs 16 unpaid
    issue("Higher Engineering Mathematics", 30, returned_days_ago=20)  # returned on time

    db.commit()
    return {"books_issued": 6}