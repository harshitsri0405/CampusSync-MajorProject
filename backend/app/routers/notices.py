import os
import uuid
from datetime import date, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.routers.auth import get_current_user
from app.routers.student import _require_student
from app.routers.timetable import _norm

router = APIRouter(prefix="/api/student/notices", tags=["student-notices"])


def _visible_query(db: Session, profile: models.StudentProfile):
    """College and event notices for everyone, department notices only for the student's own department."""
    q = db.query(models.Notice)
    dept = _norm(profile.department)
    if dept:
        return q.filter(
            or_(
                models.Notice.category != "department",
                func.lower(func.trim(models.Notice.department)) == dept,
            )
        )
    return q.filter(models.Notice.category != "department")


@router.get("/overview", response_model=schemas.NoticesOverview)
def overview(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    notices = (
        _visible_query(db, profile)
        .order_by(models.Notice.posted_on.desc(), models.Notice.created_at.desc())
        .all()
    )
    read_ids = set()
    if notices:
        rows = (
            db.query(models.NoticeRead.notice_id)
            .filter(
                models.NoticeRead.student_profile_id == profile.id,
                models.NoticeRead.notice_id.in_([n.id for n in notices]),
            )
            .all()
        )
        read_ids = {r[0] for r in rows}

    return schemas.NoticesOverview(
        department=profile.department,
        department_known=bool(_norm(profile.department)),
        notices=[
            schemas.NoticeOut(
                id=str(n.id), category=n.category, title=n.title, body=n.body, department=n.department,
                posted_by=n.posted_by, posted_on=n.posted_on, is_important=n.is_important,
                event_date=n.event_date, event_time=n.event_time, venue=n.venue, is_read=n.id in read_ids,
            )
            for n in notices
        ],
    )


@router.post("/read-all")
def mark_all_read(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    visible_ids = [n.id for n in _visible_query(db, profile).all()]
    already = set()
    if visible_ids:
        rows = (
            db.query(models.NoticeRead.notice_id)
            .filter(
                models.NoticeRead.student_profile_id == profile.id,
                models.NoticeRead.notice_id.in_(visible_ids),
            )
            .all()
        )
        already = {r[0] for r in rows}
    for nid in visible_ids:
        if nid not in already:
            db.add(models.NoticeRead(notice_id=nid, student_profile_id=profile.id))
    db.commit()
    return {"ok": True}


@router.post("/{notice_id}/read")
def mark_read(
    notice_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    notice = _visible_query(db, profile).filter(models.Notice.id == notice_id).first()
    if not notice:
        raise HTTPException(status_code=404, detail="Notice not found.")
    exists = (
        db.query(models.NoticeRead.id)
        .filter(models.NoticeRead.notice_id == notice.id, models.NoticeRead.student_profile_id == profile.id)
        .first()
    )
    if not exists:
        db.add(models.NoticeRead(notice_id=notice.id, student_profile_id=profile.id))
        db.commit()
    return {"ok": True}


@router.post("/demo-seed")
def demo_seed(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """DEV ONLY. Creates sample college notices, events and (if Department is filled in the profile)
    department notices so the screen can be tried before the Admin / Faculty modules exist.
    Set ENABLE_DEMO_DATA=false in .env to switch it off."""
    if os.getenv("ENABLE_DEMO_DATA", "true").lower() != "true":
        raise HTTPException(status_code=404, detail="Not available.")
    profile = _require_student(current_user)
    today = date.today()
    created = 0

    def add(category, title, body, posted_days_ago, by, important=False, department=None,
            event_in_days=None, event_time=None, venue=None):
        nonlocal created
        db.add(models.Notice(
            category=category, title=title, body=body, department=department, posted_by=by,
            posted_on=today - timedelta(days=posted_days_ago), is_important=important,
            event_date=(today + timedelta(days=event_in_days)) if event_in_days is not None else None,
            event_time=event_time, venue=venue,
        ))
        created += 1

    if not db.query(models.Notice.id).filter(models.Notice.category.in_(["college", "event"])).first():
        add("college", "Mid-semester examination guidelines",
            "All students must carry their college ID card to every examination. Mobile phones and smart watches "
            "are not allowed inside the hall. Reach the exam hall at least 15 minutes before the start time.\n\n"
            "Students without an ID card will not be allowed to sit for the exam.",
            2, "Controller of Examinations", important=True)
        add("college", "Library timings extended during exams",
            "The central library will stay open from 8:00 AM to 8:00 PM on all working days until the end of the "
            "examinations. Reading room seats are available on a first come, first served basis.",
            5, "Librarian")
        add("college", "Reminder: clear pending fees before the due date",
            "Students who have pending fees are requested to clear them at the accounts office before the due date "
            "to avoid a late fee. Check your Fee Management section for the exact amount.",
            8, "Accounts Office")
        add("college", "College closed on the next public holiday",
            "The college will remain closed on the next public holiday as per the academic calendar. "
            "Regular classes will resume on the following working day.",
            15, "Administration")

        add("event", "Annual Technical Fest",
            "Two days of coding contests, robotics, project exhibitions and workshops. Teams can register at the "
            "student activity cell. Certificates will be given to all participants.",
            3, "Student Activity Cell", event_in_days=12, event_time=time(10, 0), venue="Main Auditorium")
        add("event", "Guest lecture: Careers in Cloud Computing",
            "An alumnus working in the cloud industry will talk about career paths, skills to learn and how to "
            "prepare for placements. Open to all branches.",
            4, "Training and Placement Cell", event_in_days=4, event_time=time(14, 0), venue="Seminar Hall")
        add("event", "Inter-department Sports Meet",
            "Cricket, football, volleyball and athletics. Names must be submitted to your department sports "
            "coordinator at least one week before the meet.",
            6, "Sports Committee", event_in_days=25, event_time=time(9, 0), venue="College Ground")
        add("event", "Blood Donation Camp",
            "Thank you to everyone who donated. Certificates can be collected from the NSS office.",
            14, "NSS Unit", event_in_days=-7, event_time=time(10, 0), venue="Health Centre")

    dept = (profile.department or "").strip()
    if dept:
        has_dept = (
            db.query(models.Notice.id)
            .filter(
                models.Notice.category == "department",
                func.lower(func.trim(models.Notice.department)) == dept.lower(),
            )
            .first()
        )
        if not has_dept:
            by = f"HOD, {dept}"
            add("department", "Project group allocation meeting",
                "All final year students must attend the project group allocation meeting. Bring your project "
                "topic preferences and the names of your team members.",
                1, by, important=True, department=dept)
            add("department", "Lab manuals are now available",
                "Lab manuals for this semester are available in the department office. Collect your copy and "
                "bring it to every lab session.",
                6, by, department=dept)
            add("department", "Extra classes for backlog subjects",
                "Extra classes will be held on Saturdays for students with backlog subjects. Interested students "
                "should give their names to the class coordinator.",
                9, by, department=dept)

    if created == 0:
        if not dept:
            raise HTTPException(
                status_code=400,
                detail="College notices already exist. Fill Department in your Student Profile to get department notices.",
            )
        raise HTTPException(status_code=400, detail="Notices already exist.")

    db.commit()
    return {"notices_created": created}