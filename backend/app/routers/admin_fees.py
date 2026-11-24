import os
import re
import uuid
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from .admin_common import admin_name, log_activity, require_admin

router = APIRouter(prefix="/api/admin/fees", tags=["admin-fees"])


def _key(s) -> str:
    return "".join(str(s or "").lower().split())


def _sem_num(s) -> Optional[int]:
    m = re.search(r"\d+", str(s or ""))
    return int(m.group()) if m else None


def _uuid(value, msg):
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise HTTPException(status_code=404, detail=msg)


def _course(db: Session, course_id: str, semester: int):
    c = db.query(models.AdminCourse).filter(models.AdminCourse.id == _uuid(course_id, "Course nahi mila.")).first()
    if not c:
        raise HTTPException(status_code=400, detail="Ye course nahi mila.")
    if not 1 <= semester <= c.semesters:
        raise HTTPException(status_code=400, detail=f"Is course me sirf {c.semesters} semesters hain.")
    return c


def _students(db: Session, course, semester: int):
    P, U = models.StudentProfile, models.User
    rows = db.query(P, U).join(U, U.id == P.user_id).filter(func.lower(func.replace(P.course, " ", "")) == course.name_key).order_by(P.name).all()
    return [p for p, u in rows if _sem_num(p.semester) == semester and str(u.is_active).lower() != "false"]


def _items(db: Session, course, semester: int):
    I = models.FeeItem
    rows = db.query(I).filter(func.lower(func.replace(I.course, " ", "")) == course.name_key).order_by(I.due_date, I.name).all()
    return [i for i in rows if _sem_num(i.semester) == semester]


def _paid_map(db: Session):
    P = models.FeePayment
    rows = db.query(P.student_profile_id, P.fee_item_id, func.sum(P.amount)).group_by(P.student_profile_id, P.fee_item_id).all()
    return {(s, i): int(t or 0) for s, i, t in rows}


def _totals(student_id, items, paid, today):
    total = paid_sum = balance = overdue = 0
    for it in items:
        p = paid.get((student_id, it.id), 0)
        b = max(it.amount - p, 0)
        total += it.amount
        paid_sum += min(p, it.amount)
        balance += b
        if b > 0 and it.due_date < today:
            overdue += b
    if total and balance == 0:
        status = "paid"
    elif overdue > 0:
        status = "overdue"
    elif paid_sum > 0:
        status = "partial"
    else:
        status = "pending"
    return {"total": total, "paid": paid_sum, "balance": balance, "overdue": overdue, "status": status}


def _receipt_no(db: Session) -> str:
    year = date.today().year
    n = db.query(func.count(models.FeePayment.id)).scalar() or 0
    while True:
        n += 1
        no = f"RCP-{year}-{n:05d}"
        if not db.query(models.FeePayment.id).filter(models.FeePayment.receipt_no == no).first():
            return no


def _receipt(pay, student, item) -> dict:
    return {
        "id": str(pay.id), "receipt_no": pay.receipt_no, "student_id": str(student.id), "student_name": student.name,
        "college_id": student.college_id, "course": item.course, "semester": item.semester, "fee_name": item.name,
        "amount": pay.amount, "paid_on": pay.paid_on.isoformat(), "mode": pay.mode, "reference": pay.reference,
        "received_by": pay.received_by,
    }


@router.get("/summary")
def summary(admin=Depends(require_admin), db: Session = Depends(get_db)):
    P, U = models.StudentProfile, models.User
    groups = {}
    for p, u in db.query(P, U).join(U, U.id == P.user_id).all():
        n = _sem_num(p.semester)
        if n is not None and str(u.is_active).lower() != "false":
            groups.setdefault((_key(p.course), n), []).append(p)
    items = {}
    for it in db.query(models.FeeItem).all():
        n = _sem_num(it.semester)
        if n is not None:
            items.setdefault((_key(it.course), n), []).append(it)
    paid = _paid_map(db)
    today = date.today()
    billed = collected = outstanding = overdue = defaulters = 0
    for k, its in items.items():
        for p in groups.get(k, []):
            t = _totals(p.id, its, paid, today)
            billed += t["total"]
            collected += t["paid"]
            outstanding += t["balance"]
            overdue += t["overdue"]
            if t["overdue"] > 0:
                defaulters += 1
    return {
        "billed": billed, "collected": collected, "outstanding": outstanding, "overdue": overdue, "defaulters": defaulters,
        "collection_pct": round(collected * 100 / billed) if billed else 0,
        "payments": db.query(models.FeePayment).count(),
    }


# ------------------------------- Fee structure -------------------------------
@router.get("/structure")
def structure(course_id: str, semester: int = Query(..., ge=1, le=12), admin=Depends(require_admin), db: Session = Depends(get_db)):
    course = _course(db, course_id, semester)
    items = _items(db, course, semester)
    students = _students(db, course, semester)
    paid_rows = {}
    if items:
        P = models.FeePayment
        for iid, tot, cnt in db.query(P.fee_item_id, func.sum(P.amount), func.count(P.id)).filter(P.fee_item_id.in_([i.id for i in items])).group_by(P.fee_item_id).all():
            paid_rows[iid] = (int(tot or 0), cnt)
    out = [{
        "id": str(i.id), "name": i.name, "amount": i.amount, "due_date": i.due_date.isoformat(),
        "collected": paid_rows.get(i.id, (0, 0))[0], "payments": paid_rows.get(i.id, (0, 0))[1],
    } for i in items]
    return {"students": len(students), "total_per_student": sum(i.amount for i in items), "items": out}


def _dup_check(db, course, semester, name, exclude_id=None):
    for i in _items(db, course, semester):
        if _key(i.name) == _key(name) and i.id != exclude_id:
            raise HTTPException(status_code=400, detail=f"'{i.name}' is class ke liye pehle se bana hai.")


@router.post("/structure")
def create_item(payload: schemas.AdminFeeItemIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    course = _course(db, payload.course_id, payload.semester)
    _dup_check(db, course, payload.semester, payload.name)
    it = models.FeeItem(course=course.name, semester=str(payload.semester), name=payload.name, amount=payload.amount, due_date=payload.due_date)
    db.add(it)
    db.commit()
    log_activity(db, admin, "fee.item.create", f"Fee added: {course.name} sem {payload.semester} {it.name} Rs {it.amount}")
    return {"id": str(it.id)}


@router.put("/structure/{item_id}")
def update_item(item_id: str, payload: schemas.AdminFeeItemIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    it = db.query(models.FeeItem).filter(models.FeeItem.id == _uuid(item_id, "Fee nahi mili.")).first()
    if not it:
        raise HTTPException(status_code=404, detail="Fee nahi mili.")
    course = _course(db, payload.course_id, payload.semester)
    P = models.FeePayment
    max_paid = db.query(func.max(func.coalesce(func.sum(P.amount), 0))).filter(P.fee_item_id == it.id).group_by(P.student_profile_id).first()
    has_pay = db.query(P.id).filter(P.fee_item_id == it.id).first() is not None
    if has_pay and (_key(course.name) != _key(it.course) or str(payload.semester) != str(_sem_num(it.semester))):
        raise HTTPException(status_code=400, detail="Payment aa chuki hai, isliye course/semester nahi badal sakte.")
    top = max((int(x[0] or 0) for x in db.query(func.sum(P.amount)).filter(P.fee_item_id == it.id).group_by(P.student_profile_id).all()), default=0)
    if payload.amount < top:
        raise HTTPException(status_code=400, detail=f"Kisi student ne already Rs {top} de diye hain. Amount isse kam nahi ho sakta.")
    _dup_check(db, course, payload.semester, payload.name, exclude_id=it.id)
    it.course, it.semester, it.name, it.amount, it.due_date = course.name, str(payload.semester), payload.name, payload.amount, payload.due_date
    db.commit()
    log_activity(db, admin, "fee.item.update", f"Fee updated: {course.name} sem {payload.semester} {it.name} Rs {it.amount}")
    return {"ok": True}


@router.delete("/structure/{item_id}")
def delete_item(item_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    it = db.query(models.FeeItem).filter(models.FeeItem.id == _uuid(item_id, "Fee nahi mili.")).first()
    if not it:
        raise HTTPException(status_code=404, detail="Fee nahi mili.")
    n = db.query(models.FeePayment).filter(models.FeePayment.fee_item_id == it.id).count()
    if n:
        raise HTTPException(status_code=400, detail=f"Is fee par {n} payments hain, isliye delete nahi ho sakti.")
    label = f"{it.course} sem {it.semester} {it.name}"
    db.delete(it)
    db.commit()
    log_activity(db, admin, "fee.item.delete", f"Fee deleted: {label}")
    return {"ok": True}


# ------------------------------- Collection -------------------------------
@router.get("/collection")
def collection(
    course_id: str,
    semester: int = Query(..., ge=1, le=12),
    search: Optional[str] = Query(None, max_length=80),
    status: Optional[str] = Query(None, pattern="^(paid|partial|pending|overdue)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    course = _course(db, course_id, semester)
    items = _items(db, course, semester)
    students = _students(db, course, semester)
    paid = _paid_map(db)
    today = date.today()
    rows = []
    for p in students:
        t = _totals(p.id, items, paid, today)
        rows.append({"student_id": str(p.id), "name": p.name, "college_id": p.college_id, **t})
    cls = {
        "students": len(rows), "fees": len(items), "billed": sum(r["total"] for r in rows), "collected": sum(r["paid"] for r in rows),
        "outstanding": sum(r["balance"] for r in rows), "overdue_students": sum(1 for r in rows if r["overdue"] > 0),
    }
    if search:
        q = search.strip().lower()
        rows = [r for r in rows if q in (r["name"] or "").lower() or q in (r["college_id"] or "").lower()]
    if status:
        rows = [r for r in rows if r["status"] == status]
    total = len(rows)
    rows = rows[(page - 1) * page_size: page * page_size]
    return {"items": rows, "total": total, "page": page, "page_size": page_size, "class": cls}


@router.get("/student/{student_id}")
def student_fees(student_id: str, admin=Depends(require_admin), db: Session = Depends(get_db)):
    p = db.query(models.StudentProfile).filter(models.StudentProfile.id == _uuid(student_id, "Student nahi mila.")).first()
    if not p:
        raise HTTPException(status_code=404, detail="Student nahi mila.")
    sem = _sem_num(p.semester)
    I = models.FeeItem
    items = [i for i in db.query(I).filter(func.lower(func.replace(I.course, " ", "")) == _key(p.course)).order_by(I.due_date).all() if _sem_num(i.semester) == sem]
    paid = _paid_map(db)
    today = date.today()
    out = []
    for i in items:
        pd = paid.get((p.id, i.id), 0)
        bal = max(i.amount - pd, 0)
        out.append({"id": str(i.id), "name": i.name, "amount": i.amount, "paid": min(pd, i.amount), "balance": bal,
                    "due_date": i.due_date.isoformat(), "overdue": bal > 0 and i.due_date < today})
    pays = db.query(models.FeePayment, I).join(I, I.id == models.FeePayment.fee_item_id).filter(
        models.FeePayment.student_profile_id == p.id).order_by(models.FeePayment.created_at.desc()).all()
    return {
        "student": {"id": str(p.id), "name": p.name, "college_id": p.college_id, "course": p.course, "semester": p.semester},
        "items": out, "payments": [_receipt(pay, p, it) for pay, it in pays],
    }


@router.post("/payments")
def record_payment(payload: schemas.AdminFeePaymentIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    p = db.query(models.StudentProfile).filter(models.StudentProfile.id == _uuid(payload.student_id, "Student nahi mila.")).first()
    it = db.query(models.FeeItem).filter(models.FeeItem.id == _uuid(payload.fee_item_id, "Fee nahi mili.")).first()
    if not p or not it:
        raise HTTPException(status_code=404, detail="Student ya fee nahi mili.")
    if _key(p.course) != _key(it.course) or _sem_num(p.semester) != _sem_num(it.semester):
        raise HTTPException(status_code=400, detail="Ye fee is student ki class ki nahi hai.")
    if payload.mode != "Cash" and not payload.reference:
        raise HTTPException(status_code=400, detail=f"{payload.mode} ke liye transaction/cheque reference daalo.")
    already = int(db.query(func.coalesce(func.sum(models.FeePayment.amount), 0)).filter(
        models.FeePayment.student_profile_id == p.id, models.FeePayment.fee_item_id == it.id).scalar() or 0)
    balance = it.amount - already
    if balance <= 0:
        raise HTTPException(status_code=400, detail="Ye fee pehle se poori bhari ja chuki hai.")
    if payload.amount > balance:
        raise HTTPException(status_code=400, detail=f"Amount balance (Rs {balance}) se zyada nahi ho sakta.")
    pay = models.FeePayment(student_profile_id=p.id, fee_item_id=it.id, amount=payload.amount, paid_on=payload.paid_on,
                            mode=payload.mode, reference=payload.reference, receipt_no=_receipt_no(db), received_by=admin_name(admin))
    db.add(pay)
    db.commit()
    db.refresh(pay)
    log_activity(db, admin, "fee.payment", f"Payment Rs {pay.amount} ({pay.mode}) from {p.name} for {it.name}, receipt {pay.receipt_no}")
    return _receipt(pay, p, it)


@router.get("/payments")
def list_payments(
    search: Optional[str] = Query(None, max_length=80),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    P, S, I = models.FeePayment, models.StudentProfile, models.FeeItem
    q = db.query(P, S, I).join(S, S.id == P.student_profile_id).join(I, I.id == P.fee_item_id)
    if search and search.strip():
        like = f"%{search.strip()}%"
        q = q.filter(S.name.ilike(like) | S.college_id.ilike(like) | P.receipt_no.ilike(like))
    total = q.count()
    rows = q.order_by(P.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_receipt(pay, s, it) for pay, s, it in rows], "total": total, "page": page, "page_size": page_size}


@router.post("/demo-seed")
def demo_seed(admin=Depends(require_admin), db: Session = Depends(get_db)):
    """SAMPLE fee heads + a few payments for the first class that has students but no fees yet."""
    if os.getenv("ENABLE_DEMO_DATA", "").strip().lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai. backend\\.env me ENABLE_DEMO_DATA=true karke backend restart karo.")
    for course in db.query(models.AdminCourse).filter(models.AdminCourse.is_active.is_(True)).order_by(models.AdminCourse.name).all():
        for sem in range(1, course.semesters + 1):
            students = _students(db, course, sem)
            if not students or _items(db, course, sem):
                continue
            today = date.today()
            heads = [("Tuition Fee", 45000, today + timedelta(days=30)), ("Exam Fee", 2500, today + timedelta(days=15)),
                     ("Library Fee", 1000, today - timedelta(days=10))]
            items = []
            for name, amt, due in heads:
                it = models.FeeItem(course=course.name, semester=str(sem), name=name, amount=amt, due_date=due)
                db.add(it)
                items.append(it)
            db.commit()
            for it in items:
                db.refresh(it)
            made = 0
            for idx, p in enumerate(students[:6]):
                plan = [(items[0], 45000 if idx % 3 == 0 else (20000 if idx % 3 == 1 else 0)), (items[2], 1000 if idx % 2 == 0 else 0)]
                for it, amt in plan:
                    if amt <= 0:
                        continue
                    db.add(models.FeePayment(student_profile_id=p.id, fee_item_id=it.id, amount=amt, paid_on=today, mode="UPI",
                                             reference=f"DEMO-{idx + 1:03d}", receipt_no=_receipt_no(db), received_by="demo"))
                    db.commit()
                    made += 1
            log_activity(db, admin, "fee.demo", f"Sample fees added: {course.name} sem {sem} (3 fee heads, {made} payments, demo data)")
            return {"added": made, "message": f"{course.name} semester {sem}: 3 sample fees aur {made} sample payments bane."}
    return {"added": 0, "message": "Sample ke liye aisi class chahiye jisme active students ho aur abhi fees na bani ho."}