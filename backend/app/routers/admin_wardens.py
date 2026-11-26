import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..schemas import AdminWardenActiveIn, AdminWardenCreateIn, AdminWardenPasswordIn
from ..security import hash_password
from .warden_common import require_admin_user

router = APIRouter(prefix="/api/admin/wardens", tags=["admin-wardens"])

W, FP = models.WardenAccount, models.FacultyProfile


def _out(w, p) -> dict:
    return {"id": str(w.id), "name": p.faculty_name, "login_id": p.faculty_id, "phone": w.phone,
            "is_active": w.is_active, "created_at": w.created_at.isoformat() if w.created_at else None}


def _get(db: Session, wid: str):
    try:
        key = uuid.UUID(wid)
    except ValueError:
        raise HTTPException(status_code=404, detail="Warden not found.")
    w = db.query(W).filter(W.id == key).first()
    p = db.query(FP).filter(FP.id == w.faculty_profile_id).first() if w else None
    if not w or not p:
        raise HTTPException(status_code=404, detail="Warden not found.")
    return w, p


@router.get("")
def list_wardens(admin=Depends(require_admin_user), db: Session = Depends(get_db)):
    rows = db.query(W, FP).join(FP, FP.id == W.faculty_profile_id).order_by(FP.faculty_name).all()
    return {"items": [_out(w, p) for w, p in rows]}


@router.post("")
def create_warden(body: AdminWardenCreateIn, admin=Depends(require_admin_user), db: Session = Depends(get_db)):
    login = body.login_id.strip()
    if db.query(models.User).filter(models.User.username == login).first() or db.query(FP).filter(FP.faculty_id == login).first():
        raise HTTPException(status_code=409, detail="This login ID is already in use.")
    user = models.User(username=login, hashed_password=hash_password(body.password), role=models.RoleEnum.faculty, is_active=True)
    db.add(user)
    db.flush()
    fields = {"user_id": user.id, "faculty_name": body.name.strip(), "faculty_id": login}
    if hasattr(FP, "designation"):
        fields["designation"] = "Hostel Warden"
    profile = FP(**fields)
    db.add(profile)
    db.flush()
    warden = W(faculty_profile_id=profile.id, phone=body.phone.strip(), created_by=admin.username)
    db.add(warden)
    db.commit()
    db.refresh(warden)
    return _out(warden, profile)


@router.post("/{warden_id}/active")
def set_active(warden_id: str, body: AdminWardenActiveIn, admin=Depends(require_admin_user), db: Session = Depends(get_db)):
    w, p = _get(db, warden_id)
    w.is_active = body.active
    db.commit()
    return {"message": "Hostel access enabled." if body.active else "Hostel access disabled. The account can still sign in as faculty."}


@router.post("/{warden_id}/password")
def reset_password(warden_id: str, body: AdminWardenPasswordIn, admin=Depends(require_admin_user), db: Session = Depends(get_db)):
    w, p = _get(db, warden_id)
    user = db.query(models.User).filter(models.User.id == p.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Login account not found.")
    user.hashed_password = hash_password(body.password)
    db.commit()
    return {"message": "Password updated."}