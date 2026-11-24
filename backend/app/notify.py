from datetime import datetime, timezone

from app import models


def notify(db, student_profile_id, kind: str, title: str, body: str | None = None, view: str | None = None):
    """Adds a notification for one student. It does not commit, the caller commits.
    Faculty / Admin modules must call this whenever they send a mentor message or update a complaint, for example:
        notify(db, student.id, "mentor", "New message from your mentor", "...", "mentor")
        notify(db, student.id, "complaint", "Your complaint was resolved", "...", "complaints")
    """
    db.add(models.Notification(
        student_profile_id=student_profile_id, kind=kind, title=title[:200], body=body, view_key=view,
        is_read=False, created_at=datetime.now(timezone.utc),
    ))