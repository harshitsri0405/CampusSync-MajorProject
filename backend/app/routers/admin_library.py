import os
import uuid
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from .admin_common import admin_name, log_activity, require_admin
from .admin_settings import get_setting

router = APIRouter(prefix="/api/admin/library", tags=["admin-library"])

# Library rules (issue period, fine per day, max books) now come from Admin > Settings.


def _key(s) -> str:
    return "".join(str(s or "").lower().split())


def _uuid(value, msg):
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _issued_map(db: Session):
    I = models.LibraryIssue
    return dict(db.query(I.book_id, func.count(I.id)).filter(I.returned_on.is_(None)).group_by(I.book_id).all())


def _book_out(b, m, out_count) -> dict:
    copies = m.copies if m else 1
    active = m.is_active if m else True
    return {
        "id": str(b.id), "title": b.title, "author": b.author, "category": b.category, "isbn": b.isbn,
        "copies": copies, "shelf": m.shelf if m else None, "is_active": bool(active),
        "issued": out_count, "available": max(copies - out_count, 0),
    }


def _get_book(db: Session, book_id: str):
    B, M = models.LibraryBook, models.AdminLibraryBookMeta
    row = db.query(B, M).outerjoin(M, M.book_id == B.id).filter(B.id == _uuid(book_id, "Book nahi mili.")).first()
    if not row:
        raise HTTPException(status_code=404, detail="Book nahi mili.")
    return row


def _dup_check(db: Session, p: schemas.AdminBookIn, exclude_id=None):
    B = models.LibraryBook
    for b in db.query(B).all():
        if b.id == exclude_id:
            continue
        if p.isbn and b.isbn and _key(b.isbn) == _key(p.isbn):
            raise HTTPException(status_code=400, detail=f"Ye ISBN pehle se '{b.title}' ke liye hai.")
        if _key(b.title) == _key(p.title) and _key(b.author) == _key(p.author):
            raise HTTPException(status_code=400, detail="Ye book (title + author) pehle se hai. Nayi book ki jagah copies badhao.")


@router.get("/summary")
def summary(admin=Depends(require_admin), db: Session = Depends(get_db)):
    B, M, I = models.LibraryBook, models.AdminLibraryBookMeta, models.LibraryIssue
    today = date.today()
    rows = db.query(B.id, M.copies, M.is_active).outerjoin(M, M.book_id == B.id).all()
    copies = sum((c if c is not None else 1) for _, c, _a in rows)
    issued = db.query(I).filter(I.returned_on.is_(None)).count()
    overdue = db.query(I).filter(I.returned_on.is_(None), I.due_on < today).count()
    fines = int(db.query(func.coalesce(func.sum(I.fine_paid), 0)).scalar() or 0)
    return {
        "titles": len(rows), "copies": copies, "issued": issued, "available": max(copies - issued, 0), "overdue": overdue,
        "fines_collected": fines,
        "rules": {"loan_days": get_setting(db, "loan_days"), "fine_per_day": get_setting(db, "fine_per_day"), "max_books": get_setting(db, "max_books")},
    }


# ---------------------------------- Books ----------------------------------
@router.get("/books")
def list_books(
    q: Optional[str] = Query(None, max_length=80),
    category: Optional[str] = Query(None, max_length=50),
    availability: Optional[str] = Query(None, pattern="^(available|unavailable)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    B, M = models.LibraryBook, models.AdminLibraryBookMeta
    cats = sorted({c for (c,) in db.query(B.category).filter(B.category.isnot(None)).distinct().all() if c})
    query = db.query(B, M).outerjoin(M, M.book_id == B.id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(B.title.ilike(like) | B.author.ilike(like) | B.isbn.ilike(like))
    if category:
        query = query.filter(func.lower(B.category) == category.strip().lower())
    issued = _issued_map(db)
    items = []
    for b, m in query.order_by(B.title).all():
        o = _book_out(b, m, issued.get(b.id, 0))
        ok = o["available"] > 0 and o["is_active"]
        if availability == "available" and not ok:
            continue
        if availability == "unavailable" and ok:
            continue
        items.append(o)
    total = len(items)
    return {"items": items[(page - 1) * page_size: page * page_size], "total": total, "page": page, "page_size": page_size, "categories": cats}


@router.post("/books")
def create_book(payload: schemas.AdminBookIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    _dup_check(db, payload)
    b = models.LibraryBook(title=payload.title, author=payload.author, category=payload.category, isbn=payload.isbn)
    db.add(b)
    db.flush()
    db.add(models.AdminLibraryBookMeta(book_id=b.id, copies=payload.copies, shelf=payload.shelf, is_active=True))
    db.commit()
    log_activity(db, admin, "library.book.create", f"Book added: {b.title} ({payload.copies} copies)")
    return {"id": str(b.id)}


@router.put("/books/{book_id}")
def update_book(book_id: str, payload: schemas.AdminBookIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    b, m = _get_book(db, book_id)
    out = _issued_map(db).get(b.id, 0)
    if payload.copies < out:
        raise HTTPException(status_code=400, detail=f"{out} copies abhi issue hain. Copies isse kam nahi ho sakti.")
    _dup_check(db, payload, exclude_id=b.id)
    b.title, b.author, b.category, b.isbn = payload.title, payload.author, payload.category, payload.isbn
    if m is None:
        m = models.AdminLibraryBookMeta(book_id=b.id, is_active=True)
        db.add(m)
    m.copies, m.shelf = payload.copies, payload.shelf
    db.commit()
    log_activity(db, admin, "library.book.update", f"Book updated: {b.title}")
    return {"ok": True}


@router.post("/books/{book_id}/toggle")
def toggle_book(book_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    b, m = _get_book(db, book_id)
    if m is None:
        m = models.AdminLibraryBookMeta(book_id=b.id, copies=1, is_active=True)
        db.add(m)
    m.is_active = not m.is_active
    db.commit()
    log_activity(db, admin, "library.book.toggle", f"Book {'activated' if m.is_active else 'deactivated'}: {b.title}")
    return {"is_active": m.is_active}


@router.delete("/books/{book_id}")
def delete_book(book_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    b, m = _get_book(db, book_id)
    n = db.query(models.LibraryIssue).filter(models.LibraryIssue.book_id == b.id).count()
    if n:
        raise HTTPException(status_code=400, detail=f"Is book ke {n} issue records hain, isliye delete nahi ho sakti. Use Deactivate karo.")
    title = b.title
    if m:
        db.delete(m)
    db.delete(b)
    db.commit()
    log_activity(db, admin, "library.book.delete", f"Book deleted: {title}")
    return {"ok": True}


# ------------------------------- Issue / Return -------------------------------
@router.get("/students")
def find_students(q: str = Query(..., min_length=1, max_length=60), admin=Depends(require_admin), db: Session = Depends(get_db)):
    P, U, I = models.StudentProfile, models.User, models.LibraryIssue
    like = f"%{q.strip()}%"
    rows = db.query(P, U).join(U, U.id == P.user_id).filter(P.name.ilike(like) | P.college_id.ilike(like)).order_by(P.name).limit(30).all()
    holding = dict(db.query(I.student_profile_id, func.count(I.id)).filter(I.returned_on.is_(None)).group_by(I.student_profile_id).all())
    out = [{"id": str(p.id), "name": p.name, "college_id": p.college_id, "course": p.course, "holding": holding.get(p.id, 0)}
           for p, u in rows if str(u.is_active).lower() != "false"]
    return {"items": out[:10], "max_books": get_setting(db, "max_books")}


@router.get("/issues")
def list_issues(
    status: Optional[str] = Query(None, pattern="^(active|overdue|returned)$"),
    q: Optional[str] = Query(None, max_length=80),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    I, P, B = models.LibraryIssue, models.StudentProfile, models.LibraryBook
    today = date.today()
    fine_per_day = get_setting(db, "fine_per_day")
    query = db.query(I, P, B).join(P, P.id == I.student_profile_id).join(B, B.id == I.book_id)
    if status == "active":
        query = query.filter(I.returned_on.is_(None))
    elif status == "overdue":
        query = query.filter(I.returned_on.is_(None), I.due_on < today)
    elif status == "returned":
        query = query.filter(I.returned_on.isnot(None))
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(P.name.ilike(like) | P.college_id.ilike(like) | B.title.ilike(like))
    total = query.count()
    rows = query.order_by(I.returned_on.isnot(None), I.due_on, I.issued_on.desc()).offset((page - 1) * page_size).limit(page_size).all()
    items = []
    for i, p, b in rows:
        late = 0 if i.returned_on else max((today - i.due_on).days, 0)
        items.append({
            "id": str(i.id), "student": p.name, "college_id": p.college_id, "book": b.title, "issued_on": i.issued_on.isoformat(),
            "due_on": i.due_on.isoformat(), "returned_on": i.returned_on.isoformat() if i.returned_on else None,
            "overdue_days": late, "fine_due": late * fine_per_day, "fine_paid": i.fine_paid or 0,
            "status": "returned" if i.returned_on else ("overdue" if late else "active"),
        })
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/issues")
def issue_book(payload: schemas.AdminIssueIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    P, U, I = models.StudentProfile, models.User, models.LibraryIssue
    p = db.query(P).filter(P.id == _uuid(payload.student_id, "Student nahi mila.")).first()
    if not p:
        raise HTTPException(status_code=404, detail="Student nahi mila.")
    u = db.query(U).filter(U.id == p.user_id).first()
    if u and str(u.is_active).lower() == "false":
        raise HTTPException(status_code=400, detail="Ye student blocked hai.")
    b, m = _get_book(db, payload.book_id)
    if m is not None and not m.is_active:
        raise HTTPException(status_code=400, detail="Ye book inactive hai, issue nahi ho sakti.")
    copies = m.copies if m else 1
    if _issued_map(db).get(b.id, 0) >= copies:
        raise HTTPException(status_code=400, detail="Is book ki koi copy available nahi hai.")
    if db.query(I.id).filter(I.student_profile_id == p.id, I.book_id == b.id, I.returned_on.is_(None)).first():
        raise HTTPException(status_code=400, detail="Ye book is student ke paas pehle se issue hai.")
    max_books = get_setting(db, "max_books")
    holding = db.query(I).filter(I.student_profile_id == p.id, I.returned_on.is_(None)).count()
    if holding >= max_books:
        raise HTTPException(status_code=400, detail=f"Student ke paas pehle se {holding} books hain (limit {max_books}).")
    today = date.today()
    issue = I(student_profile_id=p.id, book_id=b.id, issued_on=today, due_on=today + timedelta(days=payload.days), fine_paid=0, issued_by=admin_name(admin))
    db.add(issue)
    db.commit()
    log_activity(db, admin, "library.issue", f"Book issued: '{b.title}' to {p.name}, due {issue.due_on}")
    return {"id": str(issue.id), "due_on": issue.due_on.isoformat()}


@router.post("/issues/{issue_id}/return")
def return_book(issue_id: str, payload: schemas.AdminReturnIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    I, P, B = models.LibraryIssue, models.StudentProfile, models.LibraryBook
    row = db.query(I, P, B).join(P, P.id == I.student_profile_id).join(B, B.id == I.book_id).filter(I.id == _uuid(issue_id, "Issue record nahi mila.")).first()
    if not row:
        raise HTTPException(status_code=404, detail="Issue record nahi mila.")
    i, p, b = row
    if i.returned_on:
        raise HTTPException(status_code=400, detail="Ye book pehle hi wapas aa chuki hai.")
    today = date.today()
    late = max((today - i.due_on).days, 0)
    fine = payload.fine if payload.fine is not None else late * get_setting(db, "fine_per_day")
    i.returned_on = today
    i.fine_paid = (i.fine_paid or 0) + fine
    db.commit()
    log_activity(db, admin, "library.return", f"Book returned: '{b.title}' from {p.name}" + (f", fine Rs {fine}" if fine else ""))
    return {"fine": fine, "overdue_days": late}


@router.post("/demo-seed")
def demo_seed(admin=Depends(require_admin), db: Session = Depends(get_db)):
    """SAMPLE books (isbn DEMO-xxx) and a few sample issues. Runs once."""
    if os.getenv("ENABLE_DEMO_DATA", "").strip().lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai. backend\\.env me ENABLE_DEMO_DATA=true karke backend restart karo.")
    B, I = models.LibraryBook, models.LibraryIssue
    if db.query(B.id).filter(B.isbn.like("DEMO-%")).first():
        return {"added": 0, "message": "Sample books pehle se bani hain."}
    data = [("Sample Book: Programming Basics", "Sample Author A", "Computer", 3), ("Sample Book: Data Structures", "Sample Author B", "Computer", 2),
            ("Sample Book: Engineering Maths", "Sample Author C", "Mathematics", 2), ("Sample Book: Physics Notes", "Sample Author D", "Science", 1),
            ("Sample Book: Business Studies", "Sample Author E", "Management", 2), ("Sample Book: English Grammar", "Sample Author F", "Language", 2)]
    books = []
    for n, (title, author, cat, copies) in enumerate(data, 1):
        b = B(title=title, author=author, category=cat, isbn=f"DEMO-{n:03d}")
        db.add(b)
        db.flush()
        db.add(models.AdminLibraryBookMeta(book_id=b.id, copies=copies, shelf=f"S-{n}", is_active=True))
        books.append(b)
    db.commit()
    P, U = models.StudentProfile, models.User
    studs = [p for p, u in db.query(P, U).join(U, U.id == P.user_id).order_by(P.name).all() if str(u.is_active).lower() != "false"][:3]
    today = date.today()
    made = 0
    plans = [(books[0], today - timedelta(days=3), today + timedelta(days=11), None, 0),
             (books[1], today - timedelta(days=20), today - timedelta(days=6), None, 0),
             (books[2], today - timedelta(days=25), today - timedelta(days=11), today - timedelta(days=8), 6)]
    for s, (b, issued, due, ret, fine) in zip(studs, plans):
        db.add(I(student_profile_id=s.id, book_id=b.id, issued_on=issued, due_on=due, returned_on=ret, fine_paid=fine, issued_by="demo"))
        made += 1
    db.commit()
    log_activity(db, admin, "library.demo", f"Sample library data added ({len(books)} books, {made} issues, demo data)")
    return {"added": len(books), "message": f"{len(books)} sample books aur {made} sample issues bane."}