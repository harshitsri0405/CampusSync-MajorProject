import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .auth import get_current_user
from .student import _require_student

router = APIRouter(prefix="/api/student/documents", tags=["student-documents"])

# ---- Constants ----
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_STUDENT_UPLOADS = 20
MAX_TITLE_LEN = 120
MAX_PURPOSE_LEN = 300
ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png"}
DOC_TYPES = {
    "id_card": "ID Card",
    "marksheet": "Marksheet",
    "certificate": "Certificate",
    "bonafide": "Bonafide Certificate",
    "other": "Other",
}
REQUESTABLE = {"id_card", "marksheet", "certificate", "bonafide"}
UPLOAD_ROOT = Path(
    os.getenv("UPLOAD_DIR") or (Path(__file__).resolve().parents[2] / "uploads")
) / "documents"


# ---- Helpers ----
def _profile(db: Session, current_user):
    _require_student(current_user)
    profile = (
        db.query(models.StudentProfile)
        .filter(models.StudentProfile.user_id == current_user.id)
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Pehle apna Profile fill karo")
    return profile


def _pf(profile, *names):
    for n in names:
        v = getattr(profile, n, None)
        if v not in (None, ""):
            return str(v)
    return None


def _profile_info(p) -> schemas.DocProfileInfo:
    return schemas.DocProfileInfo(
        name=_pf(p, "full_name", "name", "student_name"),
        college_id=_pf(p, "college_id"),
        course=_pf(p, "course"),
        semester=_pf(p, "semester"),
        department=_pf(p, "department"),
        email=_pf(p, "email"),
        phone=_pf(p, "phone", "mobile", "contact"),
        dob=_pf(p, "dob", "date_of_birth"),
        blood_group=_pf(p, "blood_group"),
        address=_pf(p, "address"),
    )


def _doc_out(d: models.StudentDocument) -> schemas.StudentDocumentOut:
    return schemas.StudentDocumentOut(
        id=str(d.id),
        doc_type=d.doc_type,
        doc_label=DOC_TYPES.get(d.doc_type, d.doc_type),
        title=d.title,
        source=d.source or "student",
        has_file=bool(d.file_path),
        original_name=d.original_name,
        size_bytes=d.size_bytes or 0,
        created_at=d.created_at,
        can_delete=(d.source == "student"),
    )


def _req_out(r: models.DocumentRequest) -> schemas.DocumentRequestOut:
    return schemas.DocumentRequestOut(
        id=str(r.id),
        doc_type=r.doc_type,
        doc_label=DOC_TYPES.get(r.doc_type, r.doc_type),
        purpose=r.purpose,
        status=r.status,
        remarks=r.remarks,
        created_at=r.created_at,
        processed_at=r.processed_at,
    )


def _parse_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found")


# ---- Endpoints ----
@router.get("/overview", response_model=schemas.DocumentsOverview)
def overview(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    profile = _profile(db, current_user)
    docs = (
        db.query(models.StudentDocument)
        .filter(models.StudentDocument.student_id == profile.id)
        .order_by(models.StudentDocument.created_at.desc())
        .all()
    )
    reqs = (
        db.query(models.DocumentRequest)
        .filter(models.DocumentRequest.student_id == profile.id)
        .order_by(models.DocumentRequest.created_at.desc())
        .all()
    )
    return schemas.DocumentsOverview(
        profile=_profile_info(profile),
        doc_types=[
            schemas.DocumentTypeOut(key=k, label=v, requestable=(k in REQUESTABLE))
            for k, v in DOC_TYPES.items()
        ],
        documents=[_doc_out(d) for d in docs],
        requests=[_req_out(r) for r in reqs],
        max_file_mb=MAX_FILE_BYTES // (1024 * 1024),
        allowed_ext=sorted(ALLOWED_EXT),
    )


@router.post("/request", response_model=schemas.DocumentRequestOut)
def create_request(
    payload: schemas.DocumentRequestIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    profile = _profile(db, current_user)
    if payload.doc_type not in REQUESTABLE:
        raise HTTPException(status_code=400, detail="Is document ki request nahi ho sakti")
    purpose = (payload.purpose or "").strip()
    if len(purpose) > MAX_PURPOSE_LEN:
        raise HTTPException(status_code=400, detail=f"Purpose {MAX_PURPOSE_LEN} characters se chhota rakho")

    pending = (
        db.query(models.DocumentRequest)
        .filter(
            models.DocumentRequest.student_id == profile.id,
            models.DocumentRequest.doc_type == payload.doc_type,
            models.DocumentRequest.status == "pending",
        )
        .first()
    )
    if pending:
        raise HTTPException(status_code=400, detail="Is document ki request pehle se pending hai")

    req = models.DocumentRequest(
        student_id=profile.id,
        doc_type=payload.doc_type,
        purpose=purpose,
        status="pending",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return _req_out(req)


@router.post("/upload", response_model=schemas.StudentDocumentOut)
async def upload_document(
    title: str = Form(...),
    doc_type: str = Form("other"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    profile = _profile(db, current_user)
    title = (title or "").strip()
    if not title or len(title) > MAX_TITLE_LEN:
        raise HTTPException(status_code=400, detail=f"Title 1 se {MAX_TITLE_LEN} characters ka hona chahiye")
    if doc_type not in DOC_TYPES:
        raise HTTPException(status_code=400, detail="Invalid document type")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Sirf PDF, JPG ya PNG file allowed hai")

    count = (
        db.query(models.StudentDocument)
        .filter(
            models.StudentDocument.student_id == profile.id,
            models.StudentDocument.source == "student",
        )
        .count()
    )
    if count >= MAX_STUDENT_UPLOADS:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_STUDENT_UPLOADS} uploads allowed hain")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File khali hai")
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=400, detail="File 5 MB se badi hai")

    folder = UPLOAD_ROOT / str(profile.id)
    folder.mkdir(parents=True, exist_ok=True)
    saved_name = f"{uuid.uuid4().hex}{ext}"
    saved_path = folder / saved_name
    with open(saved_path, "wb") as f:
        f.write(content)

    doc = models.StudentDocument(
        student_id=profile.id,
        doc_type=doc_type,
        title=title,
        file_path=str(saved_path),
        original_name=os.path.basename(file.filename or saved_name)[:255],
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        source="student",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return _doc_out(doc)


def _get_own_doc(db: Session, profile, doc_id: str) -> models.StudentDocument:
    doc = (
        db.query(models.StudentDocument)
        .filter(
            models.StudentDocument.id == _parse_id(doc_id),
            models.StudentDocument.student_id == profile.id,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document nahi mila")
    return doc


@router.get("/{doc_id}/file")
def download_document(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    profile = _profile(db, current_user)
    doc = _get_own_doc(db, profile, doc_id)
    if not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Is document ki file available nahi hai")
    return FileResponse(
        doc.file_path,
        media_type=doc.content_type or "application/octet-stream",
        filename=doc.original_name or "document",
    )


@router.delete("/{doc_id}")
def delete_document(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    profile = _profile(db, current_user)
    doc = _get_own_doc(db, profile, doc_id)
    if doc.source != "student":
        raise HTTPException(status_code=403, detail="Sirf apne upload kiye document delete ho sakte hain")
    if doc.file_path and os.path.exists(doc.file_path):
        try:
            os.remove(doc.file_path)
        except OSError:
            pass
    db.delete(doc)
    db.commit()
    return {"ok": True}


@router.post("/demo-seed")
def demo_seed(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """DEV ONLY: sample data. Remove once the Admin module creates real documents."""
    if os.getenv("ENABLE_DEMO_DATA", "false").lower() != "true":
        raise HTTPException(status_code=403, detail="Demo data disabled hai")
    profile = _profile(db, current_user)

    already = (
        db.query(models.StudentDocument)
        .filter(
            models.StudentDocument.student_id == profile.id,
            models.StudentDocument.source == "sample",
        )
        .first()
    )
    if already:
        raise HTTPException(status_code=400, detail="Sample data pehle se load hai")

    db.add(models.StudentDocument(
        student_id=profile.id,
        doc_type="certificate",
        title="[SAMPLE] Course Completion Certificate",
        source="sample",
    ))
    db.add(models.DocumentRequest(
        student_id=profile.id,
        doc_type="bonafide",
        purpose="[SAMPLE] Bank account opening",
        status="approved",
        remarks="[SAMPLE] Approved - sample data",
        processed_at=datetime.utcnow(),
    ))
    db.add(models.DocumentRequest(
        student_id=profile.id,
        doc_type="marksheet",
        purpose="[SAMPLE] Scholarship form",
        status="pending",
    ))
    db.commit()
    return {"ok": True}