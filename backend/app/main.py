from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import admin_exams, admin_results
from app.database import Base, engine
from app import models  # noqa: F401  (ensures models are registered before create_all)
from app.routers import auth, student, attendance, results, timetable
from app.routers import auth, student, attendance, results, timetable, assignments, fees, library, notices, syllabus, gallery, mentor, complaints, placement, photo, payments, notifications, admin_content
from .routers import qr_attendance
from .routers import documents
from .routers import analytics
from .routers import leave
from app.routers import hostel
from .routers import admin_dashboard, admin_institution
from .routers import admin_departments
from .routers import admin_courses
from .routers import admin_subjects
from app.routers import admin_faculty
from app.routers import admin_students
from app.routers import admin_academic
from app.routers import admin_timetable



app = FastAPI(title="CampusSync API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    # Creates tables if they don't exist yet. Swap for Alembic migrations later.
    Base.metadata.create_all(bind=engine)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(student.router)
app.include_router(attendance.router)
app.include_router(results.router)
app.include_router(timetable.router)
app.include_router(admin_courses.router)
app.include_router(assignments.router)

app.include_router(fees.router)

app.include_router(library.router)

app.include_router(notices.router)

app.include_router(syllabus.router)

app.include_router(gallery.router)

app.include_router(mentor.router)
app.include_router(complaints.router)

app.include_router(qr_attendance.router)
app.include_router(documents.router)
app.include_router(analytics.router)
app.include_router(photo.router)
app.include_router(placement.router)
app.include_router(leave.router)

app.include_router(payments.router)
app.include_router(notifications.router)
app.include_router(admin_content.router)
app.include_router(hostel.router)

app.include_router(admin_dashboard.router)
app.include_router(admin_institution.router)
app.include_router(admin_subjects.router)
app.include_router(admin_departments.router)
app.include_router(admin_subjects.router)
app.include_router(admin_faculty.router)
app.include_router(admin_students.router)
app.include_router(admin_academic.router)

app.include_router(admin_exams.router)
app.include_router(admin_results.router)


app.include_router(admin_timetable.router)

from app.routers import admin_fees
app.include_router(admin_fees.router)

from app.routers import admin_attendance
app.include_router(admin_attendance.router)

from app.routers import admin_notices
app.include_router(admin_notices.router)

from app.routers import admin_syllabus
app.include_router(admin_syllabus.router)

from app.routers import admin_library
app.include_router(admin_library.router)

from app.routers import admin_placement
app.include_router(admin_placement.router)

from app.routers import admin_complaints
app.include_router(admin_complaints.router)

from app.routers import admin_mentor
app.include_router(admin_mentor.router)
from app.routers import admin_gallery
app.include_router(admin_gallery.router)

from app.routers import admin_reports
app.include_router(admin_reports.router)

from app.routers import admin_settings
app.include_router(admin_settings.router)

from app.routers import faculty_dashboard, faculty_profile, faculty_classes
app.include_router(faculty_dashboard.router)
app.include_router(faculty_profile.router)
app.include_router(faculty_classes.router)
from app.routers import faculty_attendance
app.include_router(faculty_attendance.router)

from app.routers import faculty_marks
app.include_router(faculty_marks.router)

from .routers import faculty_face
app.include_router(faculty_face.router)

from app.routers import faculty_assignments
app.include_router(faculty_assignments.router)

from app.routers import faculty_notices
app.include_router(faculty_notices.router)

from app.routers import faculty_mentor
app.include_router(faculty_mentor.router)

from app.routers import faculty_complaints
app.include_router(faculty_complaints.router)

from app.routers import faculty_materials, student_materials
app.include_router(faculty_materials.router)
app.include_router(student_materials.router)

from app.routers import faculty_qr, student_qr_scan
app.include_router(faculty_qr.router)
app.include_router(student_qr_scan.router)

from app.routers import student_common  # iski zarurat nahi, sirf import hone se chalta hai
from app.routers import faculty_materials, student_materials, faculty_qr, student_qr_scan
app.include_router(faculty_materials.router)
app.include_router(student_materials.router)
app.include_router(faculty_qr.router)
app.include_router(student_qr_scan.router)

from app.routers import faculty_examcopies, faculty_taskfiles, student_files
app.include_router(faculty_examcopies.router)
app.include_router(faculty_taskfiles.router)
app.include_router(student_files.router)

from .routers import faculty_exams, student_exams
app.include_router(faculty_exams.router)
app.include_router(student_exams.router)

from app.routers import faculty_planner
app.include_router(faculty_planner.router)

from app.routers import faculty_timetable
app.include_router(faculty_timetable.router)

from app.routers import faculty_analytics
app.include_router(faculty_analytics.router)

from .routers import admin_wardens, faculty_hostel
app.include_router(admin_wardens.router)
app.include_router(faculty_hostel.router)