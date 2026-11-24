import base64
import hashlib
import hmac
import json
import os
import urllib.request
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.routers.auth import get_current_user
from app.routers.library import FINE_PER_DAY, _late_days
from app.routers.student import _require_student
from app.routers.timetable import _class_filter

router = APIRouter(prefix="/api/student/payments", tags=["student-payments"])

MIN_FEE_PAYMENT = 100  # rupees; if less than this is due, the whole due amount can be paid
METHODS = ["UPI", "Card", "Net Banking"]


def _mode() -> str:
    return os.getenv("PAYMENT_MODE", "test").strip().lower()


# ------------------------------------------------------------------ what can be paid
def _fee_due(db: Session, profile: models.StudentProfile, item: models.FeeItem) -> int:
    paid = (
        db.query(func.coalesce(func.sum(models.FeePayment.amount), 0))
        .filter(
            models.FeePayment.student_profile_id == profile.id,
            models.FeePayment.fee_item_id == item.id,
        )
        .scalar()
    )
    return max(item.amount - int(paid or 0), 0)


def _fine_rows(db: Session, profile: models.StudentProfile):
    """[(issue, pending fine in rupees)] of every issue that still has a fine to pay, oldest first."""
    today = date.today()
    issues = (
        db.query(models.LibraryIssue)
        .filter(models.LibraryIssue.student_profile_id == profile.id)
        .order_by(models.LibraryIssue.issued_on)
        .all()
    )
    out = []
    for issue in issues:
        fine = _late_days(issue, today) * FINE_PER_DAY
        pending = max(fine - (issue.fine_paid or 0), 0)
        if pending > 0:
            out.append((issue, pending))
    return out


def _check_request(db, profile, purpose, fee_item_id, amount):
    """Returns (title, fee item or None). Raises a clear error when the amount is not allowed."""
    if purpose == "fee":
        try:
            item_id = uuid.UUID(fee_item_id or "")
        except ValueError:
            raise HTTPException(status_code=400, detail="Choose the fee you want to pay.")
        item = (
            db.query(models.FeeItem)
            .filter(models.FeeItem.id == item_id, *_class_filter(models.FeeItem, profile))
            .first()
        )
        if not item:
            raise HTTPException(status_code=404, detail="Fee item not found.")
        due = _fee_due(db, profile, item)
        if due <= 0:
            raise HTTPException(status_code=400, detail="This fee is already paid.")
        minimum = min(MIN_FEE_PAYMENT, due)
        if amount < minimum:
            raise HTTPException(status_code=400, detail=f"The minimum payment is ₹{minimum}.")
        if amount > due:
            raise HTTPException(status_code=400, detail=f"You cannot pay more than the due amount (₹{due}).")
        return item.name, item

    if purpose == "library_fine":
        total = sum(p for _issue, p in _fine_rows(db, profile))
        if total <= 0:
            raise HTTPException(status_code=400, detail="You have no library fine to pay.")
        if amount > total:
            raise HTTPException(status_code=400, detail=f"You cannot pay more than the fine (₹{total}).")
        return "Library fine", None

    raise HTTPException(status_code=400, detail="Unknown payment type.")


def _apply(db, profile, order, method, reference) -> str:
    """Records the money in the fee / library tables and returns the receipt number."""
    today = date.today()
    if order.purpose == "fee":
        item = db.query(models.FeeItem).filter(models.FeeItem.id == order.fee_item_id).first()
        if item is None or order.amount > _fee_due(db, profile, item):
            raise HTTPException(status_code=400, detail="The due amount changed. Please start the payment again.")
        receipt = f"RCP-{today:%Y%m%d}-{uuid.uuid4().hex[:6].upper()}"
        db.add(models.FeePayment(
            student_profile_id=profile.id, fee_item_id=item.id, amount=order.amount, paid_on=today,
            mode=f"Online · {method}", reference=reference, receipt_no=receipt, received_by="Online payment",
        ))
        return receipt

    rows = _fine_rows(db, profile)
    if order.amount > sum(p for _i, p in rows):
        raise HTTPException(status_code=400, detail="The fine changed. Please start the payment again.")
    remaining = order.amount
    for issue, pending in rows:
        take = min(pending, remaining)
        issue.fine_paid = (issue.fine_paid or 0) + take
        remaining -= take
        if remaining <= 0:
            break
    return f"LFP-{today:%Y%m%d}-{uuid.uuid4().hex[:6].upper()}"


# ------------------------------------------------------------------ Razorpay
def _razorpay_order(amount: int, receipt: str) -> dict:
    key_id = os.getenv("RAZORPAY_KEY_ID", "")
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "")
    if not key_id or not key_secret:
        raise HTTPException(status_code=503, detail="The online payment gateway is not set up yet.")
    payload = json.dumps({"amount": amount * 100, "currency": "INR", "receipt": receipt}).encode()
    auth = base64.b64encode(f"{key_id}:{key_secret}".encode()).decode()
    req = urllib.request.Request(
        "https://api.razorpay.com/v1/orders", data=payload, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Basic {auth}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        raise HTTPException(status_code=502, detail="Could not reach the payment gateway. Please try again.")


def _verify_razorpay(order: models.PaymentOrder, payload: schemas.PaymentConfirmIn) -> None:
    if not (payload.razorpay_payment_id and payload.razorpay_order_id and payload.razorpay_signature):
        raise HTTPException(status_code=400, detail="The payment details are incomplete.")
    if payload.razorpay_order_id != order.gateway_order_id:
        raise HTTPException(status_code=400, detail="This payment does not belong to this order.")
    secret = os.getenv("RAZORPAY_KEY_SECRET", "")
    expected = hmac.new(
        secret.encode(), f"{order.gateway_order_id}|{payload.razorpay_payment_id}".encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, payload.razorpay_signature):
        raise HTTPException(status_code=400, detail="The payment could not be verified.")


# ------------------------------------------------------------------ endpoints
def _result(order: models.PaymentOrder, message: str) -> schemas.PaymentResultOut:
    return schemas.PaymentResultOut(
        status=order.status, message=message, receipt_no=order.receipt_no, reference=order.gateway_payment_id,
        amount=order.amount, title=order.title, purpose=order.purpose,
    )


def _own_order(db: Session, profile: models.StudentProfile, order_id: uuid.UUID) -> models.PaymentOrder:
    order = (
        db.query(models.PaymentOrder)
        .filter(models.PaymentOrder.id == order_id, models.PaymentOrder.student_profile_id == profile.id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Payment not found.")
    return order


@router.post("/start", response_model=schemas.PaymentOrderOut)
def start(
    payload: schemas.PaymentStartIn,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    mode = _mode()
    if mode not in ("test", "razorpay"):
        raise HTTPException(status_code=503, detail="Online payment is switched off.")
    title, item = _check_request(db, profile, payload.purpose, payload.fee_item_id, payload.amount)

    order = models.PaymentOrder(
        student_profile_id=profile.id, purpose=payload.purpose, fee_item_id=item.id if item else None,
        title=title, amount=payload.amount, status="created", gateway=mode,
    )
    db.add(order)
    db.flush()
    if mode == "razorpay":
        order.gateway_order_id = _razorpay_order(payload.amount, order.id.hex)["id"]
    db.commit()

    return schemas.PaymentOrderOut(
        order_id=str(order.id), purpose=order.purpose, title=title, amount=order.amount, mode=mode,
        gateway_order_id=order.gateway_order_id,
        key_id=os.getenv("RAZORPAY_KEY_ID") if mode == "razorpay" else None,
    )


@router.post("/{order_id}/confirm", response_model=schemas.PaymentResultOut)
def confirm(
    order_id: uuid.UUID,
    payload: schemas.PaymentConfirmIn,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    order = _own_order(db, profile, order_id)
    if order.status == "paid":
        return _result(order, "This payment was already completed.")
    if order.status != "created":
        raise HTTPException(status_code=400, detail="This payment is closed. Please start a new one.")

    if order.gateway == "test":
        if _mode() != "test":
            raise HTTPException(status_code=400, detail="Test payments are switched off.")
        outcome = (payload.outcome or "").lower()
        if outcome == "failed":
            order.status = "failed"
            order.failure_reason = "Test payment failed."
            db.commit()
            return _result(order, "The test payment failed. No money was taken.")
        if outcome != "success":
            raise HTTPException(status_code=400, detail="Unknown test outcome.")
        method = payload.method if payload.method in METHODS else "UPI"
        reference = f"TEST-{uuid.uuid4().hex[:10].upper()}"
    else:
        _verify_razorpay(order, payload)
        method = "Razorpay"
        reference = payload.razorpay_payment_id

    receipt = _apply(db, profile, order, method, reference)
    order.status = "paid"
    order.gateway_payment_id = reference
    order.receipt_no = receipt
    order.paid_at = datetime.now(timezone.utc)
    db.commit()
    return _result(order, "Payment successful.")


@router.post("/{order_id}/cancel")
def cancel(
    order_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    order = _own_order(db, profile, order_id)
    if order.status == "created":
        order.status = "cancelled"
        db.commit()
    return {"status": order.status}