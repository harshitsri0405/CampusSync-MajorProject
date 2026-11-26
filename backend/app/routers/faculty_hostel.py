import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..schemas import WardenHostelIn, WardenRoomIn, WardenRoomUpdateIn
from .faculty_common import require_faculty
from .warden_common import require_warden

router = APIRouter(prefix="/api/faculty/hostel", tags=["faculty-hostel"])

H, R, A, W = models.WardenHostel, models.WardenRoom, models.WardenAllocation, models.WardenAccount


def _uid(v: str, msg: str) -> uuid.UUID:
    try:
        return uuid.UUID(v)
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail=msg)


def _occ_map(db: Session) -> dict:
    return dict(db.query(A.room_id, func.count()).filter(A.status == "active").group_by(A.room_id).all())


def _room_state(r, occ: int) -> str:
    if not r.is_active:
        return "maintenance"
    if occ >= r.capacity:
        return "full"
    return "vacant" if occ == 0 else "partial"


def _room_out(r, occ: int, hostel_name: str) -> dict:
    state = _room_state(r, occ)
    return {"id": str(r.id), "hostel_id": str(r.hostel_id), "hostel_name": hostel_name, "room_no": r.room_no,
            "floor": r.floor, "room_type": r.room_type, "capacity": r.capacity, "is_active": r.is_active,
            "notes": r.notes, "occupied": occ, "state": state,
            "available_beds": 0 if state == "maintenance" else max(r.capacity - occ, 0)}


def _stats(db: Session) -> dict:
    occ = _occ_map(db)
    out = {}
    for r in db.query(R).all():
        s = out.setdefault(r.hostel_id, {"rooms": 0, "active_rooms": 0, "beds": 0, "occupied": 0})
        s["rooms"] += 1
        if r.is_active:
            s["active_rooms"] += 1
            s["beds"] += r.capacity
        s["occupied"] += occ.get(r.id, 0)
    return out


def _warden_names(db: Session) -> dict:
    rows = db.query(W, models.FacultyProfile).join(models.FacultyProfile, models.FacultyProfile.id == W.faculty_profile_id).all()
    return {p.id: {"name": p.faculty_name, "login_id": p.faculty_id, "phone": w.phone, "active": w.is_active} for w, p in rows}


def _hostel_out(h, stats: dict, names: dict) -> dict:
    s = stats.get(h.id, {"rooms": 0, "active_rooms": 0, "beds": 0, "occupied": 0})
    w = names.get(h.warden_profile_id)
    return {"id": str(h.id), "name": h.name, "hostel_type": h.hostel_type, "address": h.address, "floors": h.floors,
            "info": h.info, "contact_phone": h.contact_phone,
            "warden": {"id": str(h.warden_profile_id), "name": w["name"], "login_id": w["login_id"], "phone": w["phone"]} if w else None,
            "rooms": s["rooms"], "beds": s["beds"], "occupied_beds": s["occupied"]}


def _check_warden(db: Session, wid: Optional[str]) -> Optional[uuid.UUID]:
    if not wid:
        return None
    key = _uid(wid, "Selected warden not found.")
    if not db.query(W).filter(W.faculty_profile_id == key, W.is_active.is_(True)).first():
        raise HTTPException(status_code=400, detail="The selected warden is not active.")
    return key


@router.get("/access")
def access(faculty=Depends(require_faculty), db: Session = Depends(get_db)):
    acc = db.query(W).filter(W.faculty_profile_id == faculty.id, W.is_active.is_(True)).first()
    return {"is_warden": bool(acc)}


@router.get("/dashboard")
def dashboard(warden=Depends(require_warden), db: Session = Depends(get_db)):
    occ = _occ_map(db)
    rooms = db.query(R).all()
    active = [r for r in rooms if r.is_active]
    beds = sum(r.capacity for r in active)
    used = sum(occ.get(r.id, 0) for r in rooms)
    stats, names = _stats(db), _warden_names(db)
    hostels = db.query(H).order_by(H.name).all()
    return {
        "counts": {
            "hostels": len(hostels), "rooms": len(rooms),
            "occupied_rooms": sum(1 for r in rooms if occ.get(r.id, 0) > 0),
            "available_rooms": sum(1 for r in active if occ.get(r.id, 0) < r.capacity),
            "full_rooms": sum(1 for r in active if occ.get(r.id, 0) >= r.capacity),
            "maintenance_rooms": len(rooms) - len(active),
            "total_beds": beds, "occupied_beds": used, "available_beds": max(beds - used, 0),
        },
        "pending_complaints": None,   # filled in when Complaint Management is added
        "fee_summary": None,          # filled in when Hostel Fee Management is added
        "hostels": [_hostel_out(h, stats, names) for h in hostels],
    }


@router.get("/wardens")
def wardens(warden=Depends(require_warden), db: Session = Depends(get_db)):
    return {"items": [{"id": str(k), **{x: v[x] for x in ("name", "login_id", "phone")}} for k, v in _warden_names(db).items() if v["active"]]}


# ---------------- Hostels ----------------
@router.get("/hostels")
def list_hostels(warden=Depends(require_warden), db: Session = Depends(get_db)):
    stats, names = _stats(db), _warden_names(db)
    return {"items": [_hostel_out(h, stats, names) for h in db.query(H).order_by(H.name).all()]}


@router.post("/hostels")
def create_hostel(body: WardenHostelIn, warden=Depends(require_warden), db: Session = Depends(get_db)):
    name = body.name.strip()
    if db.query(H).filter(func.lower(H.name) == name.lower()).first():
        raise HTTPException(status_code=409, detail="A hostel with this name already exists.")
    h = H(name=name, hostel_type=body.hostel_type, address=body.address.strip(), floors=body.floors, info=body.info.strip(),
          warden_profile_id=_check_warden(db, body.warden_profile_id), contact_phone=body.contact_phone.strip())
    db.add(h)
    db.commit()
    db.refresh(h)
    return _hostel_out(h, _stats(db), _warden_names(db))


@router.put("/hostels/{hostel_id}")
def update_hostel(hostel_id: str, body: WardenHostelIn, warden=Depends(require_warden), db: Session = Depends(get_db)):
    h = db.query(H).filter(H.id == _uid(hostel_id, "Hostel not found.")).first()
    if not h:
        raise HTTPException(status_code=404, detail="Hostel not found.")
    name = body.name.strip()
    if db.query(H).filter(func.lower(H.name) == name.lower(), H.id != h.id).first():
        raise HTTPException(status_code=409, detail="A hostel with this name already exists.")
    top = db.query(func.max(R.floor)).filter(R.hostel_id == h.id).scalar()
    if top is not None and body.floors < top:
        raise HTTPException(status_code=400, detail=f"Rooms already exist on floor {top}. Floors cannot be fewer than that.")
    h.name, h.hostel_type, h.address, h.floors = name, body.hostel_type, body.address.strip(), body.floors
    h.info, h.contact_phone = body.info.strip(), body.contact_phone.strip()
    h.warden_profile_id = _check_warden(db, body.warden_profile_id)
    db.commit()
    return _hostel_out(h, _stats(db), _warden_names(db))


@router.delete("/hostels/{hostel_id}")
def delete_hostel(hostel_id: str, warden=Depends(require_warden), db: Session = Depends(get_db)):
    h = db.query(H).filter(H.id == _uid(hostel_id, "Hostel not found.")).first()
    if not h:
        raise HTTPException(status_code=404, detail="Hostel not found.")
    n = db.query(R).filter(R.hostel_id == h.id).count()
    if n:
        raise HTTPException(status_code=409, detail=f"This hostel still has {n} room(s). Delete or move them first.")
    db.delete(h)
    db.commit()
    return {"message": "Hostel deleted."}


# ---------------- Rooms ----------------
@router.get("/rooms")
def list_rooms(hostel_id: Optional[str] = None, floor: Optional[int] = None,
               status: str = Query("all", pattern="^(all|available|vacant|partial|full|maintenance)$"),
               q: Optional[str] = Query(None, max_length=30),
               warden=Depends(require_warden), db: Session = Depends(get_db)):
    query = db.query(R)
    if hostel_id:
        query = query.filter(R.hostel_id == _uid(hostel_id, "Hostel not found."))
    if floor is not None:
        query = query.filter(R.floor == floor)
    if q:
        query = query.filter(func.lower(R.room_no).contains(q.strip().lower()))
    occ = _occ_map(db)
    hn = {h.id: h.name for h in db.query(H).all()}
    items = []
    for r in query.order_by(R.floor, R.room_no).limit(500).all():
        o = _room_out(r, occ.get(r.id, 0), hn.get(r.hostel_id, "-"))
        if status == "all" or o["state"] == status or (status == "available" and o["state"] in ("vacant", "partial")):
            items.append(o)
    return {"items": items}


def _validate_room(db, hostel, floor, capacity, room_type):
    if floor > hostel.floors:
        raise HTTPException(status_code=400, detail=f"This hostel has only {hostel.floors} floor(s).")


@router.post("/rooms")
def create_room(body: WardenRoomIn, warden=Depends(require_warden), db: Session = Depends(get_db)):
    hostel = db.query(H).filter(H.id == _uid(body.hostel_id, "Hostel not found.")).first()
    if not hostel:
        raise HTTPException(status_code=404, detail="Hostel not found.")
    _validate_room(db, hostel, body.floor, body.capacity, body.room_type)
    no = body.room_no.strip().upper()
    if db.query(R).filter(R.hostel_id == hostel.id, R.room_no == no).first():
        raise HTTPException(status_code=409, detail="This room number already exists in the hostel.")
    r = R(hostel_id=hostel.id, room_no=no, floor=body.floor, room_type=body.room_type, capacity=body.capacity,
          is_active=body.is_active, notes=body.notes.strip())
    db.add(r)
    db.commit()
    db.refresh(r)
    return _room_out(r, 0, hostel.name)


@router.put("/rooms/{room_id}")
def update_room(room_id: str, body: WardenRoomUpdateIn, warden=Depends(require_warden), db: Session = Depends(get_db)):
    r = db.query(R).filter(R.id == _uid(room_id, "Room not found.")).first()
    hostel = db.query(H).filter(H.id == r.hostel_id).first() if r else None
    if not r or not hostel:
        raise HTTPException(status_code=404, detail="Room not found.")
    _validate_room(db, hostel, body.floor, body.capacity, body.room_type)
    no = body.room_no.strip().upper()
    if db.query(R).filter(R.hostel_id == r.hostel_id, R.room_no == no, R.id != r.id).first():
        raise HTTPException(status_code=409, detail="This room number already exists in the hostel.")
    occ = _occ_map(db).get(r.id, 0)
    if body.capacity < occ:
        raise HTTPException(status_code=400, detail=f"{occ} student(s) are allocated to this room. Capacity cannot be lower.")
    if not body.is_active and occ:
        raise HTTPException(status_code=409, detail="Vacate the students before marking this room as under maintenance.")
    r.room_no, r.floor, r.room_type, r.capacity = no, body.floor, body.room_type, body.capacity
    r.is_active, r.notes = body.is_active, body.notes.strip()
    db.commit()
    return _room_out(r, occ, hostel.name)


@router.delete("/rooms/{room_id}")
def delete_room(room_id: str, warden=Depends(require_warden), db: Session = Depends(get_db)):
    r = db.query(R).filter(R.id == _uid(room_id, "Room not found.")).first()
    if not r:
        raise HTTPException(status_code=404, detail="Room not found.")
    if db.query(A).filter(A.room_id == r.id).count():
        raise HTTPException(status_code=409, detail="This room has allocation history and cannot be deleted. Mark it as under maintenance instead.")
    db.delete(r)
    db.commit()
    return {"message": "Room deleted."}