from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .admin_common import log_activity, require_admin

router = APIRouter(prefix="/api/admin/institution", tags=["admin-institution"])

FIELDS = ["college_code", "address", "city", "state_name", "country", "email", "contact_number"]
LABELS = {
    "college_code": "College code",
    "address": "Address",
    "city": "City",
    "state_name": "State",
    "country": "Country",
    "email": "Email",
    "contact_number": "Contact number",
}


def _row(db: Session, admin):
    return db.query(models.InstitutionDetail).filter(models.InstitutionDetail.admin_id == str(admin.id)).first()


def _out(admin, row) -> schemas.InstitutionOut:
    data = {f: getattr(row, f, None) if row else None for f in FIELDS}
    return schemas.InstitutionOut(
        college_name=admin.username,
        filled=bool(row and any(data.values())),
        updated_at=row.updated_at if row else None,
        **data,
    )


@router.get("", response_model=schemas.InstitutionOut)
def get_institution(admin=Depends(require_admin), db: Session = Depends(get_db)):
    return _out(admin, _row(db, admin))


@router.put("", response_model=schemas.InstitutionOut)
def save_institution(payload: schemas.InstitutionIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    row = _row(db, admin)
    is_new = row is None
    if is_new:
        row = models.InstitutionDetail(admin_id=str(admin.id))
        db.add(row)

    changed = []
    for f in FIELDS:
        new = getattr(payload, f)
        if (getattr(row, f, None) or None) != new:
            changed.append(LABELS[f])
            setattr(row, f, new)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)

    if changed:
        log_activity(db, admin, "college.update", "College information updated: " + ", ".join(changed))
    return _out(admin, row)
