from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from .auth import get_current_user
from .faculty_common import require_faculty


def require_warden(faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    """Allows only faculty accounts that the admin has marked as an active hostel warden."""
    acc = db.query(models.WardenAccount).filter(
        models.WardenAccount.faculty_profile_id == faculty.id,
        models.WardenAccount.is_active.is_(True),
    ).first()
    if not acc:
        raise HTTPException(status_code=403, detail="Hostel access is limited to wardens.")
    return faculty


def require_admin_user(user: models.User = Depends(get_current_user)):
    if user.role != models.RoleEnum.admin:
        raise HTTPException(status_code=403, detail="Only administrators can do this.")
    return user