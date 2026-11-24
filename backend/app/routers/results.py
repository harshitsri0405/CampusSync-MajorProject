import os
import random
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.routers.auth import get_current_user
from app.routers.student import _require_student

router = APIRouter(prefix="/api/student/results", tags=["student-results"])

INTERNAL_MAX = 40
EXTERNAL_MAX = 60
PASS_MARKS = 40  # total out of 100

# (minimum total marks, grade, grade points) on a 10-point scale.
# Admin "Grade Configuration" will be able to replace this later.
GRADE_SCALE = [
    (90, "O", 10),
    (80, "A+", 9),
    (70, "A", 8),
    (60, "B+", 7),
    (50, "B", 6),
    (40, "C", 5),
    (0, "F", 0),
]

DEMO_SUBJECTS = {
    1: [("Engineering Mathematics I", 4), ("Engineering Physics", 4), ("Programming in C", 4),
        ("Basic Electrical Engineering", 3), ("Communication Skills", 2)],
    2: [("Engineering Mathematics II", 4), ("Data Structures", 4), ("Digital Electronics", 3),
        ("Engineering Chemistry", 3), ("Environmental Studies", 2)],
    3: [("Discrete Mathematics", 4), ("Database Systems", 4), ("Computer Organization", 3),
        ("Object Oriented Programming", 4), ("Operating Systems", 3)],
}


def grade_for(total: float) -> tuple[str, int]:
    for minimum, grade, points in GRADE_SCALE:
        if total >= minimum:
            return grade, points
    return "F", 0


def _subject_out(r: models.ResultRecord) -> schemas.ResultSubject:
    if r.internal_marks is None or r.external_marks is None:
        # exam result not declared yet: show what exists, no grade
        return schemas.ResultSubject(
            subject=r.subject, credits=r.credits, internal_marks=r.internal_marks,
            external_marks=r.external_marks, total=None, grade=None, grade_points=None, passed=None,
        )
    total = round(r.internal_marks + r.external_marks, 1)
    grade, points = grade_for(total)
    return schemas.ResultSubject(
        subject=r.subject, credits=r.credits, internal_marks=r.internal_marks,
        external_marks=r.external_marks, total=total, grade=grade, grade_points=points,
        passed=total >= PASS_MARKS,
    )


@router.get("/overview", response_model=schemas.ResultsOverview)
def overview(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    rows = (
        db.query(models.ResultRecord)
        .filter(
            models.ResultRecord.student_profile_id == profile.id,
            models.ResultRecord.published.is_(True),
        )
        .order_by(models.ResultRecord.semester, models.ResultRecord.subject)
        .all()
    )
    by_sem = defaultdict(list)
    for r in rows:
        by_sem[r.semester].append(_subject_out(r))

    semesters = []
    cgpa_points = 0
    cgpa_credits = 0
    total_credits = 0
    earned_credits = 0
    for sem in sorted(by_sem):
        subjects = by_sem[sem]
        credits = sum(s.credits for s in subjects)
        fully_graded = all(s.grade is not None for s in subjects)
        if not fully_graded:
            semesters.append(schemas.SemesterResult(
                semester=sem, sgpa=None, credits=credits, earned_credits=0,
                status="in_progress", subjects=subjects))
            continue
        points = sum(s.grade_points * s.credits for s in subjects)
        earned = sum(s.credits for s in subjects if s.passed)
        sgpa = round(points / credits, 2) if credits else None
        semesters.append(schemas.SemesterResult(
            semester=sem, sgpa=sgpa, credits=credits, earned_credits=earned,
            status="pass" if all(s.passed for s in subjects) else "fail", subjects=subjects))
        cgpa_points += points
        cgpa_credits += credits
        total_credits += credits
        earned_credits += earned

    return schemas.ResultsOverview(
        cgpa=round(cgpa_points / cgpa_credits, 2) if cgpa_credits else None,
        total_credits=total_credits,
        earned_credits=earned_credits,
        internal_max=INTERNAL_MAX,
        external_max=EXTERNAL_MAX,
        pass_marks=PASS_MARKS,
        grade_scale=[schemas.GradeScaleItem(min_marks=m, grade=g, points=p) for m, g, p in GRADE_SCALE],
        semesters=semesters,
    )


@router.post("/demo-seed")
def demo_seed(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """DEV ONLY. Semesters 1 and 2 are fully published, semester 3 has internal marks only
    (exam result pending) so every screen state can be tested before the Faculty/Admin
    modules exist. Set ENABLE_DEMO_DATA=false in .env to switch it off."""
    if os.getenv("ENABLE_DEMO_DATA", "true").lower() != "true":
        raise HTTPException(status_code=404, detail="Not available.")
    profile = _require_student(current_user)
    if db.query(models.ResultRecord.id).filter(models.ResultRecord.student_profile_id == profile.id).first():
        raise HTTPException(status_code=400, detail="Results already exist for this student.")

    rng = random.Random(profile.college_id)
    created = 0
    for sem, subjects in DEMO_SUBJECTS.items():
        for name, credits in subjects:
            db.add(models.ResultRecord(
                student_profile_id=profile.id, semester=sem, subject=name, credits=credits,
                internal_marks=float(rng.randint(24, 38)),
                external_marks=float(rng.randint(28, 57)) if sem < 3 else None,
                published=True, entered_by="demo",
            ))
            created += 1
    db.commit()
    return {"created": created}
