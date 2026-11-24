from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .admin_common import require_admin, safe_count

router = APIRouter(prefix="/api/admin/dashboard", tags=["admin-dashboard"])

# card key -> table name. A table that does not exist yet simply shows "-" on the card.
COUNT_TABLES = {
    "students": "student_profiles",
    "faculty": "faculty_profiles",
    "departments": "admin_departments",
    "courses": "admin_courses",
    "subjects": "admin_subjects",
    "notices": "notices",
}


def _activity_out(a) -> schemas.ActivityOut:
    return schemas.ActivityOut(
        id=str(a.id), admin_name=a.admin_name, action=a.action, detail=a.detail, created_at=a.created_at
    )


@router.get("/overview")
def overview(admin=Depends(require_admin), db: Session = Depends(get_db)):
    counts = {key: safe_count(db, table) for key, table in COUNT_TABLES.items()}

    inst = db.query(models.InstitutionDetail).filter(models.InstitutionDetail.admin_id == str(admin.id)).first()
    inst_filled = bool(inst and any([inst.college_code, inst.address, inst.city, inst.email, inst.contact_number]))

    recent = db.query(models.ActivityLog).order_by(models.ActivityLog.created_at.desc()).limit(8).all()
    return {
        "college_name": admin.username,
        "counts": counts,
        "setup": [{"key": "college", "label": "College information bharo", "done": inst_filled}],
        "recent_activities": [_activity_out(a).model_dump(mode="json") for a in recent],
    }


@router.get("/activities", response_model=schemas.ActivityPage)
def activities(
    q: Optional[str] = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(models.ActivityLog)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(models.ActivityLog.detail.ilike(like), models.ActivityLog.action.ilike(like)))
    total = query.count()
    rows = (
        query.order_by(models.ActivityLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    )
    return schemas.ActivityPage(items=[_activity_out(a) for a in rows], total=total, page=page, page_size=page_size)
