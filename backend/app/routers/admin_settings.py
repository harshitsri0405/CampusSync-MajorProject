from datetime import datetime, timezone
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from .admin_common import log_activity, require_admin

router = APIRouter(prefix="/api/admin/settings", tags=["admin-settings"])

# key, group, label, default, min, max, unit, help
DEFS = [
    {"key": "min_attendance_pct", "group": "Attendance", "label": "Minimum attendance", "default": 75, "min": 1, "max": 100, "unit": "%", "help": "Isse kam attendance wale students low attendance me ginte jayenge."},
    {"key": "loan_days", "group": "Library", "label": "Book issue period", "default": 14, "min": 1, "max": 90, "unit": "days", "help": "Kitne din ke liye kitab issue hoti hai."},
    {"key": "fine_per_day", "group": "Library", "label": "Fine per day", "default": 2, "min": 0, "max": 500, "unit": "Rs", "help": "Due date ke baad har din ka fine."},
    {"key": "max_books", "group": "Library", "label": "Max books per student", "default": 3, "min": 1, "max": 20, "unit": "books", "help": "Ek student ek saath kitni kitabein le sakta hai."},
    {"key": "max_mentees", "group": "Mentor", "label": "Max mentees per mentor", "default": 30, "min": 1, "max": 200, "unit": "students", "help": "Ek mentor ke paas zyada se zyada kitne students."},
    {"key": "pass_marks", "group": "Exams", "label": "Pass marks", "default": 40, "min": 1, "max": 100, "unit": "/ 100", "help": "Internal + external ka kam se kam total (100 me se) pass hone ke liye."},
]
BY_KEY = {d["key"]: d for d in DEFS}


def get_setting(db: Session, key: str) -> int:
    """Other routers use this to read a setting (falls back to the default)."""
    d = BY_KEY[key]
    row = db.get(models.AdminSetting, key)
    if row:
        try:
            return int(row.value)
        except ValueError:
            pass
    return d["default"]


def _all(db: Session):
    rows = {r.key: r for r in db.query(models.AdminSetting).all()}
    items = []
    for d in DEFS:
        r = rows.get(d["key"])
        items.append({**d, "value": get_setting(db, d["key"]), "updated_at": r.updated_at.isoformat() if r and r.updated_at else None})
    return {"items": items}


class SettingsIn(BaseModel):
    values: Dict[str, int]


class ResetIn(BaseModel):
    group: Optional[str] = None


@router.get("")
def list_settings(admin=Depends(require_admin), db: Session = Depends(get_db)):
    return _all(db)


@router.put("")
def save_settings(data: SettingsIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    for k, v in data.values.items():
        d = BY_KEY.get(k)
        if not d:
            raise HTTPException(status_code=400, detail=f"'{k}' naam ki koi setting nahi hai.")
        if v < d["min"] or v > d["max"]:
            raise HTTPException(status_code=400, detail=f"{d['label']} {d['min']} se {d['max']} ke beech hona chahiye.")
    changed = []
    for k, v in data.values.items():
        old = get_setting(db, k)
        if old == v:
            continue
        row = db.get(models.AdminSetting, k)
        if row:
            row.value, row.updated_at = str(v), datetime.now(timezone.utc)
        else:
            db.add(models.AdminSetting(key=k, value=str(v)))
        changed.append(f"{BY_KEY[k]['label']}: {old} -> {v}")
    if not changed:
        raise HTTPException(status_code=400, detail="Koi badlaav nahi hai.")
    db.commit()
    log_activity(db, admin, "settings.update", "Settings updated: " + "; ".join(changed))
    return _all(db)


@router.post("/reset")
def reset_settings(data: ResetIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    keys = [d["key"] for d in DEFS if not data.group or d["group"] == data.group]
    if not keys:
        raise HTTPException(status_code=400, detail="Ye group nahi mila.")
    n = db.query(models.AdminSetting).filter(models.AdminSetting.key.in_(keys)).delete(synchronize_session=False)
    db.commit()
    log_activity(db, admin, "settings.reset", f"Settings reset to defaults: {data.group or 'all'} ({n} changed)")
    return _all(db)