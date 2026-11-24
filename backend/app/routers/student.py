from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/student", tags=["student"])

EXTENDED_FIELDS = [
    "date_of_birth", "gender", "blood_group",
    "course", "department", "semester", "admission_year",
    "father_name", "mother_name", "parent_contact",
    "phone", "address",
]


def _require_student(current_user: models.User) -> models.StudentProfile:
    if current_user.role != models.RoleEnum.student or not current_user.student_profile:
        raise HTTPException(status_code=403, detail="Student access only.")
    return current_user.student_profile


def _to_out(profile: models.StudentProfile) -> schemas.StudentProfileOut:
    values = {f: getattr(profile, f) for f in EXTENDED_FIELDS}
    is_filled = any(v not in (None, "") for v in values.values())
    return schemas.StudentProfileOut(
        name=profile.name,
        college_id=profile.college_id,
        is_filled=is_filled,
        **values,
    )


@router.get("/profile", response_model=schemas.StudentProfileOut)
def get_profile(current_user: models.User = Depends(get_current_user)):
    profile = _require_student(current_user)
    return _to_out(profile)


@router.put("/profile", response_model=schemas.StudentProfileOut)
def update_profile(
    payload: schemas.StudentProfileIn,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return _to_out(profile)