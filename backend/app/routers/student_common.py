from fastapi import Depends, HTTPException

from app import models
from app.routers.auth import get_current_user


def get_current_student(user: models.User = Depends(get_current_user)):
    """Login student ka StudentProfile deta hai (id, name, course, semester...)."""
    if user.role != models.RoleEnum.student or not user.student_profile:
        raise HTTPException(status_code=403, detail="Ye sirf student ke liye hai.")
    return user.student_profile