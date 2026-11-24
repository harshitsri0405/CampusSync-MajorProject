import csv
import io
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..notify import notify
from ..schemas import (
    FacultyExamIn,
    FacultyExamMarksIn,
    FacultyExamPublishIn,
    FacultyExamReleaseIn,
    FacultyExamUpdateIn,
)
from .faculty_attendance import _students
from .faculty_common import my_assignment, norm, require_faculty
from .faculty_uploads import path_of, read_upload, remove, store

router = APIRouter(prefix="/api/faculty/exams", tags=["faculty-exams"])

E, P, M = models.FacultyExam, models.FacultyExamPaper, models.FacultyExamMark
FOLDER = "exam_papers"
PAPER_EXTS = {".pdf", ".docx"}
MAX_MB = 10
TYPES = ["Internal Test", "Mid Semester", "Quiz", "Practical", "Viva", "Class Test", "Other"]


def _get(db: Session, faculty, exam_id: str):
    try:
        eid = uuid.UUID(exam_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Exam not found.")
    e = db.query(E).filter(E.id == eid).first()
    if not e:
        raise HTTPException(status_code=404, detail="Exam not found.")
    a = my_assignment(db, faculty, str(e.assignment_id))
    return e, a


def _paper_out(p) -> Optional[dict]:
    if p is None:
        return None
    return {"file_name": p.file_name, "size": p.size, "released": p.released,
            "uploaded_at": p.uploaded_at.isoformat() if p.uploaded_at else None}


def _exam_out(db: Session, e, total: int) -> dict:
    paper = db.query(P).filter(P.exam_id == e.id).first()
    entered = db.query(M).filter(M.exam_id == e.id).count()
    return {
        "id": str(e.id), "name": e.name, "exam_type": e.exam_type, "subject": e.subject,
        "max_marks": e.max_marks, "pass_percent": e.pass_percent,
        "exam_date": e.exam_date.isoformat() if e.exam_date else None,
        "duration_min": e.duration_min, "instructions": e.instructions,
        "results_published": e.results_published,
        "published_at": e.published_at.isoformat() if e.published_at else None,
        "entered": entered, "total": total, "paper": _paper_out(paper),
    }


def _cell(v):
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@") else s


def _report(db: Session, e, a) -> dict:
    marks = {m.student_profile_id: m for m in db.query(M).filter(M.exam_id == e.id).all()}
    rows = []
    for p in sorted(_students(db, a), key=lambda s: s.name.lower()):
        m = marks.get(p.id)
        pct = None
        if m is None:
            status = "Not entered"
        elif m.is_absent or m.marks is None:
            status = "Absent"
        else:
            pct = round(m.marks / e.max_marks * 100, 1)
            status = "Pass" if pct >= e.pass_percent else "Fail"
        rows.append({"student_id": str(p.id), "name": p.name, "college_id": p.college_id,
                     "marks": m.marks if m and not m.is_absent else None, "percent": pct,
                     "status": status, "remarks": m.remarks if m else ""})
    scored = [r for r in rows if r["status"] in ("Pass", "Fail")]
    vals = [r["marks"] for r in scored]
    passed = sum(1 for r in scored if r["status"] == "Pass")
    buckets = [("Below 40%", 0, 40), ("40% - 59%", 40, 60), ("60% - 79%", 60, 80), ("80% - 100%", 80, 101)]
    dist = [{"label": lb, "count": sum(1 for r in scored if lo <= r["percent"] < hi)} for lb, lo, hi in buckets]
    return {
        "exam": {"id": str(e.id), "name": e.name, "subject": e.subject, "max_marks": e.max_marks,
                 "pass_percent": e.pass_percent, "exam_date": e.exam_date.isoformat() if e.exam_date else None,
                 "results_published": e.results_published},
        "summary": {
            "total": len(rows), "appeared": len(scored),
            "absent": sum(1 for r in rows if r["status"] == "Absent"),
            "not_entered": sum(1 for r in rows if r["status"] == "Not entered"),
            "passed": passed, "failed": len(scored) - passed,
            "pass_rate": round(passed / len(scored) * 100, 1) if scored else None,
            "average": round(sum(vals) / len(vals), 2) if vals else None,
            "highest": max(vals) if vals else None, "lowest": min(vals) if vals else None,
        },
        "distribution": dist,
        "toppers": sorted(scored, key=lambda r: -r["marks"])[:3],
        "rows": rows,
    }


@router.get("/meta")
def meta(faculty=Depends(require_faculty)):
    return {"types": TYPES, "max_mb": MAX_MB}


@router.get("")
def list_exams(assignment_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, assignment_id)
    total = len(_students(db, a))
    exams = db.query(E).filter(E.assignment_id == a.id).order_by(E.exam_date.desc().nullslast(), E.created_at.desc()).all()
    return {"items": [_exam_out(db, e, total) for e in exams]}


@router.post("")
def create_exam(body: FacultyExamIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    a = my_assignment(db, faculty, body.assignment_id)
    name = body.name.strip()
    if db.query(E).filter(E.assignment_id == a.id, E.name == name).first():
        raise HTTPException(status_code=409, detail="An exam with this name already exists for this class.")
    e = E(assignment_id=a.id, faculty_profile_id=faculty.id,
          course_key=getattr(a, "course_key", None) or norm(a.course), semester=a.semester,
          subject=a.subject, name=name, exam_type=body.exam_type.strip(), max_marks=body.max_marks,
          pass_percent=body.pass_percent, exam_date=body.exam_date, duration_min=body.duration_min,
          instructions=body.instructions.strip())
    db.add(e)
    db.commit()
    db.refresh(e)
    return _exam_out(db, e, len(_students(db, a)))


@router.put("/{exam_id}")
def update_exam(exam_id: str, body: FacultyExamUpdateIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    e, a = _get(db, faculty, exam_id)
    name = body.name.strip()
    dup = db.query(E).filter(E.assignment_id == e.assignment_id, E.name == name, E.id != e.id).first()
    if dup:
        raise HTTPException(status_code=409, detail="An exam with this name already exists for this class.")
    if body.max_marks != e.max_marks:
        if e.results_published:
            raise HTTPException(status_code=409, detail="Unpublish the results before changing maximum marks.")
        over = db.query(M).filter(M.exam_id == e.id, M.marks > body.max_marks).count()
        if over:
            raise HTTPException(status_code=400, detail=f"{over} student(s) already have marks above the new maximum.")
    e.name, e.exam_type, e.max_marks = name, body.exam_type.strip(), body.max_marks
    e.pass_percent, e.exam_date, e.duration_min = body.pass_percent, body.exam_date, body.duration_min
    e.instructions = body.instructions.strip()
    db.commit()
    return _exam_out(db, e, len(_students(db, a)))


@router.delete("/{exam_id}")
def delete_exam(exam_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    e, _ = _get(db, faculty, exam_id)
    paper = db.query(P).filter(P.exam_id == e.id).first()
    stored = paper.stored_name if paper else None
    db.query(M).filter(M.exam_id == e.id).delete()
    db.query(P).filter(P.exam_id == e.id).delete()
    db.delete(e)
    db.commit()
    if stored:
        remove(FOLDER, stored)
    return {"message": "Exam deleted."}


@router.get("/{exam_id}/marks")
def get_marks(exam_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    e, a = _get(db, faculty, exam_id)
    marks = {m.student_profile_id: m for m in db.query(M).filter(M.exam_id == e.id).all()}
    rows = []
    for p in sorted(_students(db, a), key=lambda s: s.name.lower()):
        m = marks.get(p.id)
        rows.append({"student_id": str(p.id), "name": p.name, "college_id": p.college_id,
                     "marks": m.marks if m else None, "absent": bool(m and m.is_absent),
                     "remarks": m.remarks if m else ""})
    return {"exam": _exam_out(db, e, len(rows)), "rows": rows}


@router.put("/{exam_id}/marks")
def save_marks(exam_id: str, body: FacultyExamMarksIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    e, a = _get(db, faculty, exam_id)
    if e.results_published:
        raise HTTPException(status_code=409, detail="Unpublish the results before editing marks.")
    students = {str(p.id): p for p in _students(db, a)}
    for r in body.rows:
        p = students.get(r.student_id)
        if not p:
            raise HTTPException(status_code=403, detail="A student in the list is not part of your class.")
        if not r.absent and r.marks is not None and not (0 <= r.marks <= e.max_marks):
            raise HTTPException(status_code=400, detail=f"Marks for {p.name} must be between 0 and {e.max_marks:g}.")
    existing = {m.student_profile_id: m for m in db.query(M).filter(M.exam_id == e.id).all()}
    for r in body.rows:
        p = students[r.student_id]
        m = existing.get(p.id)
        if not r.absent and r.marks is None:
            if m:
                db.delete(m)
            continue
        if m is None:
            m = M(exam_id=e.id, student_profile_id=p.id)
            db.add(m)
        m.is_absent = r.absent
        m.marks = None if r.absent else r.marks
        m.remarks = r.remarks.strip()
    db.commit()
    return {"message": "Marks saved.", "entered": db.query(M).filter(M.exam_id == e.id).count()}


@router.post("/{exam_id}/publish")
def publish(exam_id: str, body: FacultyExamPublishIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    e, a = _get(db, faculty, exam_id)
    if not body.publish:
        e.results_published, e.published_at = False, None
        db.commit()
        return {"message": "Results unpublished. Students can no longer see them."}
    students = _students(db, a)
    entered = {m.student_profile_id for m in db.query(M).filter(M.exam_id == e.id).all()}
    missing = [p.name for p in students if p.id not in entered]
    if missing:
        raise HTTPException(status_code=400, detail=f"{len(missing)} student(s) have no marks or absence recorded yet (e.g. {missing[0]}).")
    if not students:
        raise HTTPException(status_code=400, detail="This class has no students.")
    e.results_published, e.published_at = True, datetime.now(timezone.utc)
    for p in students:
        notify(db, p.id, "results", f"Result published: {e.name}", f"{e.subject} - {e.name} results are now available.", "results")
    db.commit()
    return {"message": f"Results published to {len(students)} students."}


@router.post("/{exam_id}/paper")
def upload_paper(exam_id: str, file: UploadFile = File(...), faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    e, _ = _get(db, faculty, exam_id)
    data, ext, clean = read_upload(file, PAPER_EXTS, MAX_MB)
    stored = store(FOLDER, data, ext)
    old = db.query(P).filter(P.exam_id == e.id).first()
    old_stored = old.stored_name if old else None
    try:
        if old:
            old.file_name, old.stored_name, old.size = clean, stored, len(data)
            old.uploaded_at = datetime.now(timezone.utc)
        else:
            db.add(P(exam_id=e.id, file_name=clean, stored_name=stored, size=len(data), released=False))
        db.commit()
    except Exception:
        db.rollback()
        remove(FOLDER, stored)
        raise
    if old_stored:
        remove(FOLDER, old_stored)
    return {"message": "Question paper uploaded. It stays hidden from students until you release it."}


@router.put("/{exam_id}/paper/release")
def release_paper(exam_id: str, body: FacultyExamReleaseIn, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    e, a = _get(db, faculty, exam_id)
    paper = db.query(P).filter(P.exam_id == e.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="No question paper uploaded.")
    was = paper.released
    paper.released = body.released
    if body.released and not was:
        for p in _students(db, a):
            notify(db, p.id, "results", f"Question paper available: {e.name}", f"{e.subject} - the question paper for {e.name} has been shared.", "results")
    db.commit()
    return {"message": "Question paper is now visible to students." if body.released else "Question paper hidden from students."}


@router.delete("/{exam_id}/paper")
def delete_paper(exam_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    e, _ = _get(db, faculty, exam_id)
    paper = db.query(P).filter(P.exam_id == e.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="No question paper uploaded.")
    stored = paper.stored_name
    db.delete(paper)
    db.commit()
    remove(FOLDER, stored)
    return {"message": "Question paper deleted."}


@router.get("/{exam_id}/paper/file")
def paper_file(exam_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    e, _ = _get(db, faculty, exam_id)
    paper = db.query(P).filter(P.exam_id == e.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="No question paper uploaded.")
    return FileResponse(path_of(FOLDER, paper.stored_name), filename=paper.file_name)


@router.get("/{exam_id}/report")
def report(exam_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    e, a = _get(db, faculty, exam_id)
    return _report(db, e, a)


@router.get("/{exam_id}/report/export")
def report_export(exam_id: str, faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    e, a = _get(db, faculty, exam_id)
    r = _report(db, e, a)
    s = r["summary"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Exam", _cell(e.name), "Subject", _cell(e.subject), "Max marks", e.max_marks, "Pass %", e.pass_percent])
    w.writerow(["Students", s["total"], "Appeared", s["appeared"], "Absent", s["absent"], "Pass rate %", s["pass_rate"] if s["pass_rate"] is not None else ""])
    w.writerow(["Average", s["average"] if s["average"] is not None else "", "Highest", s["highest"] if s["highest"] is not None else "", "Lowest", s["lowest"] if s["lowest"] is not None else ""])
    w.writerow([])
    w.writerow(["College ID", "Name", "Marks", "Max marks", "Percent", "Status", "Remarks"])
    for x in r["rows"]:
        w.writerow([_cell(x["college_id"]), _cell(x["name"]), "" if x["marks"] is None else x["marks"], e.max_marks,
                    "" if x["percent"] is None else x["percent"], x["status"], _cell(x["remarks"])])
    return Response(content="\ufeff" + buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="exam-report.csv"'})