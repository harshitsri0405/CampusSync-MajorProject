import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..schemas import StudentQrScanIn
from .faculty_common import norm, sem_num
from .faculty_qr import Q, S, code_ok, dist_m, is_active, now_utc

from .student_common import get_current_student

router = APIRouter(prefix="/api/student/qr-attendance", tags=["student-qr-attendance"])

MAX_ACCURACY = 150


@router.post("/scan")
def scan(body: StudentQrScanIn, student=Depends(get_current_student), db: Session = Depends(get_db)):
    parts = body.code.strip().split(":")
    if len(parts) != 3 or parts[0] != "CS1":
        raise HTTPException(status_code=400, detail="This is not a CampusSync attendance QR code.")
    try:
        sid = uuid.UUID(parts[1])
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid QR code.")
    s = db.query(Q).filter(Q.id == sid).first()
    if not s:
        raise HTTPException(status_code=404, detail="Attendance session not found.")
    if not is_active(s):
        raise HTTPException(status_code=400, detail="This attendance session has ended.")
    if not code_ok(s, parts[2]):
        raise HTTPException(status_code=400, detail="This QR code has expired. Scan the new QR code shown on the screen.")
    if norm(student.course) != s.course_key or sem_num(student.semester) != s.semester:
        raise HTTPException(status_code=403, detail="This QR code is not for your class.")

    old = db.query(S).filter(S.session_id == s.id, S.student_profile_id == student.id).first()
    if old:
        raise HTTPException(status_code=400, detail="Your attendance has already been recorded for this session.")

    if body.accuracy > MAX_ACCURACY:
        raise HTTPException(status_code=400, detail=f"Your location accuracy is low (±{int(body.accuracy)} m). Move to an open area or turn on Wi-Fi/GPS and try again.")
    d = dist_m(body.lat, body.lng, s.lat, s.lng)
    if d > s.radius_m:
        raise HTTPException(status_code=400, detail=f"You are {int(d)} m away from the class location (limit {s.radius_m} m). Please scan from inside the classroom.")

    now = now_utc()
    db.add(S(session_id=s.id, student_profile_id=student.id, scanned_at=now, lat=body.lat, lng=body.lng, distance_m=d))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Your attendance has already been recorded for this session.")
    return {"subject": s.subject, "day": s.day.isoformat(), "scanned_at": now.isoformat(), "distance_m": round(d)}


@router.get("/history")
def history(student=Depends(get_current_student), db: Session = Depends(get_db)):
    rows = (
        db.query(S, Q).join(Q, Q.id == S.session_id)
        .filter(S.student_profile_id == student.id)
        .order_by(S.scanned_at.desc()).limit(20).all()
    )
    return {"items": [
        {"subject": q.subject, "day": q.day.isoformat(), "scanned_at": sc.scanned_at.isoformat(),
         "distance_m": round(sc.distance_m), "in_register": q.finalized}
        for sc, q in rows
    ]}