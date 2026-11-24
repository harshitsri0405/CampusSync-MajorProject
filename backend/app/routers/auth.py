from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def _create_user_and_profile(db: Session, role: models.RoleEnum, username: str, password: str):
    existing = db.query(models.User).filter(models.User.username == username).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"'{username}' is already registered.")
    user = models.User(role=role, username=username, hashed_password=hash_password(password))
    db.add(user)
    db.flush()  # get user.id before commit
    return user


@router.post("/register/student", response_model=schemas.TokenResponse)
def register_student(payload: schemas.StudentRegister, db: Session = Depends(get_db)):
    user = _create_user_and_profile(db, models.RoleEnum.student, payload.college_id, payload.password)
    profile = models.StudentProfile(user_id=user.id, name=payload.name, college_id=payload.college_id)
    db.add(profile)
    db.commit()
    token = create_access_token({"sub": user.username, "role": user.role.value})
    return schemas.TokenResponse(access_token=token, role=user.role, display_name=payload.name)


@router.post("/register/faculty", response_model=schemas.TokenResponse)
def register_faculty(payload: schemas.FacultyRegister, db: Session = Depends(get_db)):
    user = _create_user_and_profile(db, models.RoleEnum.faculty, payload.faculty_id, payload.password)
    profile = models.FacultyProfile(
        user_id=user.id, faculty_name=payload.faculty_name, faculty_id=payload.faculty_id
    )
    db.add(profile)
    db.commit()
    token = create_access_token({"sub": user.username, "role": user.role.value})
    return schemas.TokenResponse(access_token=token, role=user.role, display_name=payload.faculty_name)


@router.post("/register/admin", response_model=schemas.TokenResponse)
def register_admin(payload: schemas.AdminRegister, db: Session = Depends(get_db)):
    user = _create_user_and_profile(db, models.RoleEnum.admin, payload.college_name, payload.password)
    profile = models.AdminProfile(user_id=user.id, college_name=payload.college_name)
    db.add(profile)
    db.commit()
    token = create_access_token({"sub": user.username, "role": user.role.value})
    return schemas.TokenResponse(access_token=token, role=user.role, display_name=payload.college_name)


@router.post("/register/hostel", response_model=schemas.TokenResponse)
def register_hostel(payload: schemas.HostelRegister, db: Session = Depends(get_db)):
    user = _create_user_and_profile(db, models.RoleEnum.hostel, payload.faculty_id, payload.password)
    profile = models.HostelProfile(
        user_id=user.id,
        warden_name=payload.warden_name,
        faculty_id=payload.faculty_id,
        hostel_name=payload.hostel_name,
    )
    db.add(profile)
    db.commit()
    token = create_access_token({"sub": user.username, "role": user.role.value})
    return schemas.TokenResponse(access_token=token, role=user.role, display_name=payload.warden_name)


def _display_name_for(user: models.User) -> str:
    if user.role == models.RoleEnum.student and user.student_profile:
        return user.student_profile.name
    if user.role == models.RoleEnum.faculty and user.faculty_profile:
        return user.faculty_profile.faculty_name
    if user.role == models.RoleEnum.admin and user.admin_profile:
        return user.admin_profile.college_name
    if user.role == models.RoleEnum.hostel and user.hostel_profile:
        return user.hostel_profile.warden_name
    return user.username


@router.post("/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = (
        db.query(models.User)
        .filter(models.User.username == payload.username, models.User.role == payload.role)
        .first()
    )
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

    if str(user.is_active).lower() == "false":
        raise HTTPException(status_code=403, detail="Aapka account block hai. Admin se sampark karo.")
    token = create_access_token({"sub": user.username, "role": user.role.value})
    return schemas.TokenResponse(access_token=token, role=user.role, display_name=_display_name_for(user))


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    username = payload.get("sub")
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")

    if str(user.is_active).lower() == "false":
        raise HTTPException(status_code=401, detail="Account blocked.")
    return user


@router.get("/me", response_model=schemas.MeResponse)
def me(current_user: models.User = Depends(get_current_user)):
    return schemas.MeResponse(
        role=current_user.role,
        username=current_user.username,
        display_name=_display_name_for(current_user),
    )
