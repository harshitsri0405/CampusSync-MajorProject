import os
import uuid
from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.routers.auth import get_current_user
from app.routers.student import _require_student
from app.routers.timetable import _class_filter, _norm

router = APIRouter(prefix="/api/student/fees", tags=["student-fees"])

_ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
    "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _two(n: int) -> str:
    if n < 20:
        return _ONES[n]
    return (_TENS[n // 10] + " " + _ONES[n % 10]).strip()


def _three(n: int) -> str:
    parts = []
    if n // 100:
        parts.append(_ONES[n // 100] + " Hundred")
    if n % 100:
        parts.append(_two(n % 100))
    return " ".join(parts)


def rupees_in_words(n: int) -> str:
    """12500 -> 'Twelve Thousand Five Hundred Rupees Only' (Indian system: thousand, lakh, crore)."""
    if n <= 0:
        return "Zero Rupees Only"
    crore, rest = divmod(n, 10000000)
    lakh, rest = divmod(rest, 100000)
    thousand, rest = divmod(rest, 1000)
    parts = []
    if crore:
        parts.append(_three(crore) + " Crore")
    if lakh:
        parts.append(_two(lakh) + " Lakh")
    if thousand:
        parts.append(_two(thousand) + " Thousand")
    if rest:
        parts.append(_three(rest))
    return " ".join(parts) + " Rupees Only"


def _item_status(amount: int, paid: int, due_date: date, today: date) -> str:
    if paid >= amount:
        return "paid"
    if due_date < today:
        return "overdue"
    if paid > 0:
        return "partial"
    return "pending"


@router.get("/overview", response_model=schemas.FeesOverview)
def overview(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    if not _norm(profile.course) or not _norm(profile.semester):
        return schemas.FeesOverview(
            course=profile.course, semester=profile.semester, class_known=False,
            summary=schemas.FeeSummary(), items=[], payments=[],
        )

    items = (
        db.query(models.FeeItem)
        .filter(*_class_filter(models.FeeItem, profile))
        .order_by(models.FeeItem.due_date, models.FeeItem.name)
        .all()
    )
    payments = (
        db.query(models.FeePayment)
        .filter(models.FeePayment.student_profile_id == profile.id)
        .order_by(models.FeePayment.paid_on.desc(), models.FeePayment.created_at.desc())
        .all()
    )

    # names for every payment, even if the fee head is not in the current class list
    item_names = {i.id: i.name for i in items}
    missing = {p.fee_item_id for p in payments if p.fee_item_id not in item_names}
    if missing:
        for i in db.query(models.FeeItem).filter(models.FeeItem.id.in_(missing)).all():
            item_names[i.id] = i.name

    paid_by_item = defaultdict(int)
    for p in payments:
        paid_by_item[p.fee_item_id] += p.amount

    today = date.today()
    items_out = []
    total_fee = total_paid = total_due = overdue_amount = 0
    next_due = None  # (due_date, name, amount still to pay)
    for i in items:
        paid = paid_by_item.get(i.id, 0)
        due = max(i.amount - paid, 0)
        status = _item_status(i.amount, paid, i.due_date, today)
        items_out.append(schemas.FeeItemOut(
            id=str(i.id), name=i.name, amount=i.amount, due_date=i.due_date,
            paid=min(paid, i.amount), due=due, status=status,
        ))
        total_fee += i.amount
        total_paid += min(paid, i.amount)
        total_due += due
        if status == "overdue":
            overdue_amount += due
        elif due > 0 and (next_due is None or i.due_date < next_due[0]):
            next_due = (i.due_date, i.name, due)

    return schemas.FeesOverview(
        course=profile.course,
        semester=profile.semester,
        class_known=True,
        summary=schemas.FeeSummary(
            total_fee=total_fee, total_paid=total_paid, total_due=total_due, overdue_amount=overdue_amount,
            next_due_name=next_due[1] if next_due else None,
            next_due_date=next_due[0] if next_due else None,
            next_due_amount=next_due[2] if next_due else None,
        ),
        items=items_out,
        payments=[
            schemas.FeePaymentOut(
                receipt_no=p.receipt_no, fee_name=item_names.get(p.fee_item_id, "Fee"), amount=p.amount,
                paid_on=p.paid_on, mode=p.mode, reference=p.reference,
            )
            for p in payments
        ],
    )


@router.get("/receipts/{receipt_no}", response_model=schemas.ReceiptOut)
def receipt(
    receipt_no: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    pay = (
        db.query(models.FeePayment)
        .filter(models.FeePayment.receipt_no == receipt_no, models.FeePayment.student_profile_id == profile.id)
        .first()
    )
    if not pay:
        raise HTTPException(status_code=404, detail="Receipt not found.")
    item = db.query(models.FeeItem).filter(models.FeeItem.id == pay.fee_item_id).first()
    same = (
        db.query(models.FeePayment)
        .filter(
            models.FeePayment.student_profile_id == profile.id,
            models.FeePayment.fee_item_id == pay.fee_item_id,
        )
        .all()
    )
    key = (pay.paid_on, pay.created_at)
    paid_till = sum(p.amount for p in same if (p.paid_on, p.created_at) <= key)
    fee_total = item.amount if item else pay.amount
    return schemas.ReceiptOut(
        receipt_no=pay.receipt_no,
        paid_on=pay.paid_on,
        student_name=profile.name,
        college_id=profile.college_id,
        course=profile.course,
        semester=profile.semester,
        fee_name=item.name if item else "Fee",
        amount=pay.amount,
        amount_in_words=rupees_in_words(pay.amount),
        mode=pay.mode,
        reference=pay.reference,
        fee_total=fee_total,
        paid_till_date=paid_till,
        balance=max(fee_total - paid_till, 0),
        received_by=pay.received_by,
    )


@router.post("/demo-seed")
def demo_seed(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """DEV ONLY. Creates a sample fee structure for the student's class and a few payments so the screen
    can be tried before the Admin module exists. Set ENABLE_DEMO_DATA=false in .env to switch it off."""
    if os.getenv("ENABLE_DEMO_DATA", "true").lower() != "true":
        raise HTTPException(status_code=404, detail="Not available.")
    profile = _require_student(current_user)
    if not _norm(profile.course) or not _norm(profile.semester):
        raise HTTPException(
            status_code=400,
            detail="Fill Course and Semester in your Student Profile first. Fees are set for your class.",
        )
    if db.query(models.FeePayment.id).filter(models.FeePayment.student_profile_id == profile.id).first():
        raise HTTPException(status_code=400, detail="Payments already exist for this student.")

    course = profile.course.strip()
    semester = profile.semester.strip()
    today = date.today()

    # (fee head, amount in rupees, due date as days from today)
    blueprint = [
        ("Tuition Fee", 45000, -20),
        ("Examination Fee", 3500, -5),
        ("Library and Lab Fee", 6000, 10),
        ("Development Fee", 5000, 25),
        ("Student Activity Fee", 1500, -15),
    ]
    items = {i.name: i for i in db.query(models.FeeItem).filter(*_class_filter(models.FeeItem, profile)).all()}
    for name, amount, offset in blueprint:
        if name not in items:
            item = models.FeeItem(
                course=course, semester=semester, name=name, amount=amount, due_date=today + timedelta(days=offset)
            )
            db.add(item)
            items[name] = item
    db.flush()

    # (fee head, amount, paid this many days ago, mode)
    payments = [
        ("Tuition Fee", 25000, 34, "UPI"),
        ("Tuition Fee", 20000, 22, "Net Banking"),
        ("Library and Lab Fee", 2000, 6, "Cash"),
        ("Student Activity Fee", 1500, 18, "UPI"),
    ]
    created = 0
    for name, amount, days_ago, mode in payments:
        item = items.get(name)
        if item is None:
            continue
        paid_on = today - timedelta(days=days_ago)
        db.add(models.FeePayment(
            student_profile_id=profile.id,
            fee_item_id=item.id,
            amount=amount,
            paid_on=paid_on,
            mode=mode,
            reference=None if mode == "Cash" else f"TXN{uuid.uuid4().hex[:10].upper()}",
            receipt_no=f"RCP-{paid_on:%Y%m%d}-{uuid.uuid4().hex[:6].upper()}",
            received_by="demo",
        ))
        created += 1
    db.commit()
    return {"fee_items": len(items), "payments": created}