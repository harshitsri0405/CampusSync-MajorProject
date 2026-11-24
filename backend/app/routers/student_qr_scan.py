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
        raise HTTPException(status_code=400, detail="Ye CampusSync attendance ka QR nahi hai.")
    try:
        sid = uuid.UUID(parts[1])
    except ValueError:
        raise HTTPException(status_code=400, detail="QR sahi nahi hai.")
    s = db.query(Q).filter(Q.id == sid).first()
    if not s:
        raise HTTPException(status_code=404, detail="Attendance session nahi mili.")
    if not is_active(s):
        raise HTTPException(status_code=400, detail="Ye attendance session band ho chuka hai.")
    if not code_ok(s, parts[2]):
        raise HTTPException(status_code=400, detail="QR purana ho gaya. Screen par naya QR dekhkar dobara scan karo.")
    if norm(student.course) != s.course_key or sem_num(student.semester) != s.semester:
        raise HTTPException(status_code=403, detail="Ye QR aapki class ka nahi hai.")

    old = db.query(S).filter(S.session_id == s.id, S.student_profile_id == student.id).first()
    if old:
        raise HTTPException(status_code=400, detail="Aapki attendance is session me pehle hi darj ho chuki hai.")

    if body.accuracy > MAX_ACCURACY:
        raise HTTPException(status_code=400, detail=f"Aapki location ki accuracy kam hai (±{int(body.accuracy)} m). Khuli jagah par jaakar ya WiFi/GPS on karke dobara try karo.")
    d = dist_m(body.lat, body.lng, s.lat, s.lng)
    if d > s.radius_m:
        raise HTTPException(status_code=400, detail=f"Aap class ki location se {int(d)} m door ho (limit {s.radius_m} m). Class ke andar aakar scan karo.")

    now = now_utc()
    db.add(S(session_id=s.id, student_profile_id=student.id, scanned_at=now, lat=body.lat, lng=body.lng, distance_m=d))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Aapki attendance is session me pehle hi darj ho chuki hai.")
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