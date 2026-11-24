import math

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from sklearn.linear_model import LinearRegression
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .auth import get_current_user
from .student import _require_student

router = APIRouter(prefix="/api/student/analytics", tags=["student-analytics"])

# ---- Constants ----
ATT_TARGET = 75.0
ATT_HIGH_RISK = 65.0
PASS_PCT = 40.0
WEAK_PCT = 50.0
STRONG_PCT = 70.0
TREND_SLOPE = 1.5          # percentage points per week
MIN_WEEKS_FOR_TREND = 3
MAX_WEEKS = 8
MAX_RECOMMENDATIONS = 8

# Table names (the model classes are found by table name)
ATT_TABLE = "attendance_records"
RES_TABLE = "result_records"

PRESENT_WORDS = {"present", "p", "late", "od", "on duty", "true", "1"}
SKIP_WORDS = {"holiday", "cancelled", "canceled", "no class"}


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


def _model_by_table(table_name: str):
    for mapper in models.Base.registry.mappers:
        cls = mapper.class_
        if getattr(cls, "__tablename__", None) == table_name:
            return cls
    return None


def _rows(db: Session, table_name: str, profile):
    model = _model_by_table(table_name)
    if model is None:
        return None
    col = getattr(model, "student_profile_id", None)
    if col is None:
        col = getattr(model, "student_id", None)
    if col is None:
        return None
    return db.query(model).filter(col == profile.id).all()


def _is_present(v) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v > 0
    return str(v).strip().lower() in PRESENT_WORDS


def _r1(x) -> float:
    return round(float(x), 1)


def _sem_key(label: str) -> int:
    digits = "".join(ch if ch.isdigit() else " " for ch in (label or "")).split()
    return int(digits[0]) if digits else 0


def _fit(values):
    x = np.arange(len(values)).reshape(-1, 1)
    y = np.array(values, dtype=float)
    return LinearRegression().fit(x, y)


# ---- Attendance risk ----
def _attendance(rows) -> schemas.AnalyticsAttendanceOut:
    if rows is None:
        return schemas.AnalyticsAttendanceOut(
            has_data=False,
            message="attendance_records table ya student column nahi mila",
        )

    recs = []
    for r in rows:
        status = getattr(r, "status", None)
        subj = getattr(r, "subject", None)
        d = getattr(r, "date", None)
        if status is None or subj is None or d is None:
            continue
        if isinstance(status, str) and status.strip().lower() in SKIP_WORDS:
            continue
        recs.append(
            {
                "subject": str(subj).strip(),
                "date": d,
                "present": 1 if _is_present(status) else 0,
            }
        )

    if not recs:
        return schemas.AnalyticsAttendanceOut(
            has_data=False,
            message="Is account ke liye attendance data nahi hai. Attendance page se sample data load karo.",
        )

    df = pd.DataFrame(recs)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"])
    if df.empty:
        return schemas.AnalyticsAttendanceOut(has_data=False, message="Attendance dates read nahi ho payi")

    subjects = []
    for name, g in df.groupby("subject"):
        total = int(len(g))
        present = int(g["present"].sum())
        pct = present / total * 100
        if pct >= ATT_TARGET:
            status, needed = "safe", 0
            skip = max(0, math.floor(present / (ATT_TARGET / 100) - total))
        else:
            status = "warning" if pct >= ATT_HIGH_RISK else "risk"
            skip = 0
            needed = max(0, math.ceil((ATT_TARGET / 100 * total - present) / (1 - ATT_TARGET / 100)))
        subjects.append(
            schemas.AnalyticsAttendanceSubject(
                subject=str(name),
                total=total,
                present=present,
                percentage=_r1(pct),
                status=status,
                classes_needed=needed,
                can_skip=skip,
            )
        )
    subjects.sort(key=lambda s: s.percentage)

    total_all = int(len(df))
    overall = df["present"].sum() / total_all * 100

    # weekly trend (last MAX_WEEKS weeks that have classes)
    df["week"] = df["date"].dt.strftime("%G-W%V")
    weekly_series = (df.groupby("week")["present"].mean() * 100).sort_index().tail(MAX_WEEKS)
    weekly = [schemas.AnalyticsWeeklyPoint(week=w, percentage=_r1(v)) for w, v in weekly_series.items()]

    trend, slope = "unknown", None
    if len(weekly_series) >= MIN_WEEKS_FOR_TREND:
        slope = float(_fit(list(weekly_series.values)).coef_[0])
        trend = "improving" if slope >= TREND_SLOPE else "declining" if slope <= -TREND_SLOPE else "stable"

    if overall < ATT_HIGH_RISK:
        risk = "high"
    elif overall < ATT_TARGET or (overall < ATT_TARGET + 5 and trend == "declining"):
        risk = "medium"
    else:
        risk = "low"

    return schemas.AnalyticsAttendanceOut(
        has_data=True,
        overall_percentage=_r1(overall),
        total_classes=total_all,
        risk_level=risk,
        trend=trend,
        trend_slope=_r1(slope) if slope is not None else None,
        target=ATT_TARGET,
        weekly=weekly,
        subjects=subjects,
    )


# ---- Performance ----
def _performance(rows) -> schemas.AnalyticsPerformanceOut:
    if rows is None:
        return schemas.AnalyticsPerformanceOut(
            has_data=False,
            message="result_records table ya student column nahi mila",
        )

    # total marks = internal + external (out of 100)
    recs = []
    for r in rows:
        if getattr(r, "published", True) is False:
            continue
        subj = getattr(r, "subject", None)
        internal = getattr(r, "internal_marks", None)
        external = getattr(r, "external_marks", None)
        if subj is None or (internal is None and external is None):
            continue
        try:
            total = float(internal or 0) + float(external or 0)
        except (TypeError, ValueError):
            continue
        sem = getattr(r, "semester", None)
        recs.append(
            {
                "subject": str(subj).strip(),
                "semester": str(sem).strip() if sem is not None else "-",
                "pct": min(100.0, max(0.0, total)),
            }
        )

    if not recs:
        msg = (
            "Result records mile par ya to published nahi hain ya marks khali hain"
            if rows
            else "Is account ke liye results data nahi hai. Results page se sample data load karo."
        )
        return schemas.AnalyticsPerformanceOut(has_data=False, message=msg)

    df = pd.DataFrame(recs)

    # subject-wise
    sub = df.groupby("subject")["pct"].agg(["mean", "count"])
    means = sub["mean"].values
    std = float(np.std(means)) if len(means) >= 3 else 0.0
    avg_all = float(np.mean(means))
    subjects = []
    for name, row in sub.iterrows():
        pct = float(row["mean"])
        status = (
            "failing" if pct < PASS_PCT else "weak" if pct < WEAK_PCT else "average" if pct < STRONG_PCT else "strong"
        )
        below = bool(std > 0 and (avg_all - pct) / std >= 1.0)
        subjects.append(
            schemas.AnalyticsSubjectPerformance(
                subject=str(name),
                percentage=_r1(pct),
                assessments=int(row["count"]),
                status=status,
                below_own_average=below,
            )
        )
    subjects.sort(key=lambda s: s.percentage)

    # semester-wise + prediction
    sem_avg = df.groupby("semester")["pct"].mean()
    ordered = sorted(sem_avg.items(), key=lambda kv: _sem_key(kv[0]))
    semesters = [schemas.AnalyticsSemesterPoint(semester=k, percentage=_r1(v)) for k, v in ordered]
    values = [float(v) for _, v in ordered]
    current = values[-1]

    if len(values) >= 2:
        pred = float(_fit(values).predict([[len(values)]])[0])
        pred = min(100.0, max(0.0, pred))
        confidence = "medium" if len(values) >= 3 else "low"
    else:
        pred, confidence = current, "low"

    pstatus = "at risk of failing" if pred < PASS_PCT else "needs attention" if pred < WEAK_PCT else "on track"

    return schemas.AnalyticsPerformanceOut(
        has_data=True,
        current_average=_r1(current),
        predicted_next=_r1(pred),
        predicted_status=pstatus,
        confidence=confidence,
        pass_mark=PASS_PCT,
        semesters=semesters,
        subjects=subjects,
    )


# ---- Recommendations ----
def _recommendations(att, perf):
    items = []  # (sort_key, title, detail, hours)

    if perf.has_data:
        for s in perf.subjects:
            if s.status == "failing":
                items.append((0, f"{s.subject}: pass hone par focus karo",
                              f"Average {s.percentage}% hai, pass mark {int(PASS_PCT)}% hai. Basics revise karo, previous papers solve karo.", 4.0))
            elif s.status == "weak":
                items.append((1, f"{s.subject}: weak subject",
                              f"Average {s.percentage}% hai. Weak topics ki list banao aur har hafte practice karo.", 3.0))
            elif s.below_own_average:
                items.append((3, f"{s.subject}: apne average se neeche",
                              f"{s.percentage}% hai, baaki subjects se kam. Thoda extra time do.", 2.0))
        if len(perf.semesters) >= 2 and perf.semesters[-1].percentage < perf.semesters[-2].percentage:
            items.append((2, "Pichhle semester se marks kam hue",
                          "Study routine check karo aur mentor se baat karo.", None))

    if att.has_data:
        for s in att.subjects:
            if s.status in ("risk", "warning"):
                key = 0 if s.status == "risk" else 2
                items.append((key, f"Attendance: {s.subject}",
                              f"Abhi {s.percentage}% hai. Agli {s.classes_needed} classes lagatar attend karo to {int(ATT_TARGET)}% ho jayega.", None))
        if att.trend == "declining":
            items.append((2, "Attendance gir rahi hai",
                          "Pichhle hafton me attendance kam hui hai. Is hafte ki classes miss mat karo.", None))

    items.sort(key=lambda x: x[0])
    items = items[:MAX_RECOMMENDATIONS]

    if not items and (perf.has_data or att.has_data):
        items = [(9, "Sab theek chal raha hai", "Abhi koi bada risk nahi dikh raha. Isi routine ko continue rakho.", None)]

    return [
        schemas.AnalyticsRecommendation(priority=i + 1, title=t, detail=d, hours_per_week=h)
        for i, (_, t, d, h) in enumerate(items)
    ]


# ---- Endpoint ----
@router.get("/overview", response_model=schemas.AnalyticsOverview)
def overview(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    profile = _profile(db, current_user)
    att = _attendance(_rows(db, ATT_TABLE, profile))
    perf = _performance(_rows(db, RES_TABLE, profile))
    weak = [s.subject for s in perf.subjects if s.status in ("failing", "weak") or s.below_own_average]
    return schemas.AnalyticsOverview(
        attendance=att,
        performance=perf,
        weak_subjects=weak,
        recommendations=_recommendations(att, perf),
        note="Ye estimates tumhare apne attendance/marks data par simple models se bane hain. Kam data ho to accuracy kam hoti hai. Final decision ke liye faculty/mentor se baat karo.",
    )