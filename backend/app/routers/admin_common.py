"""Shared helpers for every admin router (admin check, activity log, safe table counts)."""
from typing import Optional

from fastapi import Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from .auth import get_current_user


def _role_name(user) -> str:
    role = getattr(user, "role", None)
    return str(getattr(role, "value", role) or "").lower()


def require_admin(user=Depends(get_current_user)):
    """Use as: admin = Depends(require_admin). 401 comes from get_current_user, 403 here."""
    if _role_name(user) != "admin":
        raise HTTPException(status_code=403, detail="Ye section sirf admin ke liye hai.")
    return user


def admin_name(user) -> str:
    return getattr(user, "username", None) or "admin"


def log_activity(db: Session, admin, action: str, detail: str = "") -> None:
    """Write one line to the activity log. Never breaks the real action if it fails."""
    try:
        db.add(
            models.ActivityLog(
                admin_id=str(getattr(admin, "id", "")),
                admin_name=admin_name(admin),
                action=action[:60],
                detail=(detail or "")[:500],
            )
        )
        db.commit()
    except Exception:
        db.rollback()


def model_by_table(table_name: str):
    for mapper in models.Base.registry.mappers:
        if getattr(mapper.class_, "__tablename__", None) == table_name:
            return mapper.class_
    return None


def safe_count(db: Session, table_name: str, *filters) -> Optional[int]:
    """Row count of a table, or None if the table / model does not exist (never crashes)."""
    model = model_by_table(table_name)
    if model is None:
        return None
    try:
        q = db.query(func.count()).select_from(model)
        for f in filters:
            q = q.filter(f(model) if callable(f) else f)
        return int(q.scalar() or 0)
    except Exception:
        db.rollback()
        return None
