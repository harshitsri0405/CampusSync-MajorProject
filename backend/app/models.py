import enum
import uuid

from datetime import date, datetime, timezone
from sqlalchemy import Column, String, DateTime, Date, Time, Integer, Float, Boolean, ForeignKey, Text , UniqueConstraint, Enum as SAEnum, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.orm import relationship, Session, Mapped, mapped_column
from app.database import Base
from typing import Optional



class RoleEnum(str, enum.Enum):
    student = "student"
    faculty = "faculty"
    admin = "admin"
    hostel = "hostel"


class User(Base):
    """Core auth identity. Every login (any of the 4 modules) is one row here.
    `username` is the field the person actually logs in with:
      - student -> college_id
      - faculty -> faculty_id
      - hostel  -> faculty_id (warden's staff id)
      - admin   -> college_name
    """

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role = Column(SAEnum(RoleEnum), nullable=False, index=True)
    username = Column(String, nullable=False, unique=True, index=True)
    hashed_password = Column(String, nullable=False)
    is_active = Column(String, default="true")
    created_at = Column(DateTime, default=datetime.utcnow)

    student_profile = relationship(
        "StudentProfile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    faculty_profile = relationship(
        "FacultyProfile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    admin_profile = relationship(
        "AdminProfile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    hostel_profile = relationship(
        "HostelProfile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class StudentProfile(Base):
    __tablename__ = "student_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    name = Column(String, nullable=False)
    college_id = Column(String, nullable=False, unique=True, index=True)

    # --- extended profile fields, filled in later via the Student Profile page ---
    # Personal Information
    date_of_birth = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    blood_group = Column(String, nullable=True)
    # Academic Information
    course = Column(String, nullable=True)
    department = Column(String, nullable=True)
    semester = Column(String, nullable=True)
    admission_year = Column(String, nullable=True)
    # Parent Details
    father_name = Column(String, nullable=True)
    mother_name = Column(String, nullable=True)
    parent_contact = Column(String, nullable=True)
    # Contact Information
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)

    user = relationship("User", back_populates="student_profile")


class FacultyProfile(Base):
    __tablename__ = "faculty_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    faculty_name = Column(String, nullable=False)
    faculty_id = Column(String, nullable=False, unique=True, index=True)

    user = relationship("User", back_populates="faculty_profile")


class AdminProfile(Base):
    __tablename__ = "admin_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    college_name = Column(String, nullable=False)

    user = relationship("User", back_populates="admin_profile")


class HostelProfile(Base):
    __tablename__ = "hostel_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    warden_name = Column(String, nullable=False)
    faculty_id = Column(String, nullable=False, unique=True, index=True)
    hostel_name = Column(String, nullable=False)

    user = relationship("User", back_populates="hostel_profile")


class AttendanceRecord(Base):
    """One row = one class of one subject on one date for one student.
    Faculty module will write these rows later; the Student module only reads them."""

    __tablename__ = "attendance_records"
    __table_args__ = (
        UniqueConstraint("student_profile_id", "date", "subject", name="uq_attendance_student_date_subject"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    subject = Column(String, nullable=False)
    status = Column(String, nullable=False)  # "present" or "absent"
    marked_by = Column(String, nullable=True)  # faculty id (filled once Faculty module exists)
    created_at = Column(DateTime, default=datetime.utcnow)


class ResultRecord(Base):
    """Marks of one student in one subject of one semester.
    Faculty (internal / external marks) and Admin (publish) will write these later.
    Grade, grade points, SGPA and CGPA are NOT stored, they are calculated from the marks,
    so changing the grade scale later never needs a data migration."""

    __tablename__ = "result_records"
    __table_args__ = (
        UniqueConstraint("student_profile_id", "semester", "subject", name="uq_result_student_sem_subject"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    semester = Column(Integer, nullable=False)
    subject = Column(String, nullable=False)
    credits = Column(Integer, nullable=False, default=4)
    internal_marks = Column(Float, nullable=True)  # out of 40
    external_marks = Column(Float, nullable=True)  # out of 60, empty until the exam result is declared
    published = Column(Boolean, nullable=False, default=False)  # students only see published rows
    entered_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class TimetableEntry(Base):
    """One weekly slot of a class timetable (lecture or practical).
    Belongs to a class (course + semester), not to one student.
    Admin "Create Timetable" will write these rows later."""

    __tablename__ = "timetable_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course = Column(String, nullable=False, index=True)
    semester = Column(String, nullable=False, index=True)
    day_of_week = Column(Integer, nullable=False)  # 0 = Monday ... 6 = Sunday
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    subject = Column(String, nullable=False)
    faculty_name = Column(String, nullable=True)
    room = Column(String, nullable=True)
    kind = Column(String, nullable=False, default="lecture")  # "lecture" or "practical"
    created_at = Column(DateTime, default=datetime.utcnow)


class ExamScheduleEntry(Base):
    """One exam of a class (course + semester). Admin "Exam Schedule" will write these later."""

    __tablename__ = "exam_schedule_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course = Column(String, nullable=False, index=True)
    semester = Column(String, nullable=False, index=True)
    subject = Column(String, nullable=False)
    exam_type = Column(String, nullable=False)  # e.g. "Internal Test 1", "End Semester Exam"
    exam_date = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    venue = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Assignment(Base):
    """An assignment given to a class (course + semester). Faculty "Create Assignment" will write these later."""

    __tablename__ = "assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course = Column(String, nullable=False, index=True)
    semester = Column(String, nullable=False, index=True)
    subject = Column(String, nullable=False)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    faculty_name = Column(String, nullable=True)
    max_marks = Column(Integer, nullable=False, default=10)
    due_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class AssignmentSubmission(Base):
    """One student's submission for one assignment. Marks and feedback are filled by faculty later."""

    __tablename__ = "assignment_submissions"
    __table_args__ = (
        UniqueConstraint("assignment_id", "student_profile_id", name="uq_submission_assignment_student"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assignment_id = Column(UUID(as_uuid=True), ForeignKey("assignments.id"), nullable=False, index=True)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    file_name = Column(String, nullable=True)  # original name shown to the student
    file_path = Column(String, nullable=True)  # stored name inside backend/uploads/submissions/<student id>/
    note = Column(String, nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=False)
    is_late = Column(Boolean, nullable=False, default=False)
    marks = Column(Float, nullable=True)
    feedback = Column(String, nullable=True)
    graded_at = Column(DateTime(timezone=True), nullable=True)

class FeeItem(Base):
    """One fee head of a class (course + semester), for example "Tuition Fee".
    Admin "Fee Structure" will write these rows later."""

    __tablename__ = "fee_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course = Column(String, nullable=False, index=True)
    semester = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    amount = Column(Integer, nullable=False)  # whole rupees
    due_date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class FeePayment(Base):
    """One payment made by one student against one fee head.
    The accounts office / Admin "Fee Collection" will write these rows later."""

    __tablename__ = "fee_payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    fee_item_id = Column(UUID(as_uuid=True), ForeignKey("fee_items.id"), nullable=False, index=True)
    amount = Column(Integer, nullable=False)  # whole rupees
    paid_on = Column(Date, nullable=False)
    mode = Column(String, nullable=False)  # "UPI", "Cash", "Net Banking", "Card", "Cheque"
    reference = Column(String, nullable=True)  # transaction / cheque number
    receipt_no = Column(String, nullable=False, unique=True, index=True)
    received_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)  

class LibraryBook(Base):
    """A book of the college library. Admin "Book Inventory" will write these rows later."""

    __tablename__ = "library_books"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False, index=True)
    author = Column(String, nullable=True)
    category = Column(String, nullable=True)
    isbn = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class LibraryIssue(Base):
    """One book issued to one student. returned_on stays empty until the book is returned.
    The librarian (Admin "Issue / Return") will write these rows later."""

    __tablename__ = "library_issues"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    book_id = Column(UUID(as_uuid=True), ForeignKey("library_books.id"), nullable=False, index=True)
    issued_on = Column(Date, nullable=False)
    due_on = Column(Date, nullable=False)
    returned_on = Column(Date, nullable=True)
    fine_paid = Column(Integer, nullable=False, default=0)  # whole rupees paid at the counter
    issued_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Notice(Base):
    """A notice or event announcement. Category is "college", "department" or "event".
    Department notices carry the department name and are shown only to that department's students.
    Admin / Faculty "Create Notice" will write these rows later."""

    __tablename__ = "notices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    body = Column(String, nullable=False)
    department = Column(String, nullable=True, index=True)
    posted_by = Column(String, nullable=True)
    posted_on = Column(Date, nullable=False, index=True)
    is_important = Column(Boolean, nullable=False, default=False)
    # only for events
    event_date = Column(Date, nullable=True)
    event_time = Column(Time, nullable=True)
    venue = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class NoticeRead(Base):
    """Remembers which student has opened which notice (for the "New" badge)."""

    __tablename__ = "notice_reads"
    __table_args__ = (
        UniqueConstraint("notice_id", "student_profile_id", name="uq_notice_read"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    notice_id = Column(UUID(as_uuid=True), ForeignKey("notices.id"), nullable=False, index=True)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    read_at = Column(DateTime, default=datetime.utcnow)

class SyllabusSubject(Base):
    """One subject of a course's syllabus (course + semester number + subject code).
    Admin "Upload Syllabus" will write these rows later."""

    __tablename__ = "syllabus_subjects"
    __table_args__ = (
        UniqueConstraint("course", "semester", "code", name="uq_syllabus_course_sem_code"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course = Column(String, nullable=False, index=True)
    semester = Column(Integer, nullable=False, index=True)
    code = Column(String, nullable=False)
    name = Column(String, nullable=False)
    subject_type = Column(String, nullable=False, default="theory")  # "theory" or "practical"
    credits = Column(Integer, nullable=False, default=3)
    internal_marks = Column(Integer, nullable=True)
    external_marks = Column(Integer, nullable=True)
    overview = Column(String, nullable=True)
    books = Column(String, nullable=True)  # one reference book per line
    created_at = Column(DateTime, default=datetime.utcnow)


class SyllabusUnit(Base):
    """One unit (or the list of experiments) of a subject."""

    __tablename__ = "syllabus_units"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("syllabus_subjects.id"), nullable=False, index=True)
    unit_no = Column(Integer, nullable=False)
    title = Column(String, nullable=False)
    topics = Column(String, nullable=False)  # one topic per line
    hours = Column(Integer, nullable=True)

class GalleryAlbum(Base):
    """A photo album of the college. Category is "event", "workshop", "sports", "cultural" or "achievement".
    Gallery is public content, so it is not tied to a class or a student.
    Admin "Create Album" will write these rows later."""

    __tablename__ = "gallery_albums"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    event_date = Column(Date, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class GalleryPhoto(Base):
    """One photo of an album. file_path is the stored file name inside backend/uploads/gallery/.
    When it is empty the server draws a sample picture instead (used by the demo data)."""

    __tablename__ = "gallery_photos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    album_id = Column(UUID(as_uuid=True), ForeignKey("gallery_albums.id"), nullable=False, index=True)
    caption = Column(String, nullable=True)
    file_path = Column(String, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

class MentorAssignment(Base):
    """The mentor (a faculty member) of one student. Admin "Assign Mentors" will write these rows later."""

    __tablename__ = "mentor_assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, unique=True)
    mentor_name = Column(String, nullable=False)
    designation = Column(String, nullable=True)
    department = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    cabin = Column(String, nullable=True)
    availability = Column(String, nullable=True)
    faculty_id = Column(String, nullable=True)  # links to the faculty profile once the Faculty module exists
    created_at = Column(DateTime, default=datetime.utcnow)


class MentorMessage(Base):
    """One chat message between a student and the mentor. sender is "student" or "mentor"."""

    __tablename__ = "mentor_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    sender = Column(String, nullable=False)
    body = Column(String, nullable=False)
    is_read = Column(Boolean, nullable=False, default=False)  # used for the mentor's messages (read by the student)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class MentorMeeting(Base):
    """A meeting the student asked for. status: pending, approved, rejected, completed or cancelled.
    The mentor will approve / reject from the Faculty module later."""

    __tablename__ = "mentor_meetings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    topic = Column(String, nullable=False)
    agenda = Column(String, nullable=False)
    requested_date = Column(Date, nullable=False)
    requested_time = Column(Time, nullable=False)
    mode = Column(String, nullable=False)  # "In person" or "Online"
    status = Column(String, nullable=False, default="pending")
    mentor_response = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class MentorNote(Base):
    """A note written by the mentor after a discussion. note_type is "progress" or "guidance"."""

    __tablename__ = "mentor_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    note_type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    body = Column(String, nullable=False)
    action_points = Column(String, nullable=True)  # one point per line
    created_by = Column(String, nullable=True)
    created_on = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Complaint(Base):
    """A complaint raised by a student. status moves pending -> in_progress -> resolved.
    Admin / staff "Complaint Management" will update the status later."""

    __tablename__ = "complaints"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    ticket_no = Column(String, nullable=False, unique=True, index=True)
    category = Column(String, nullable=False, index=True)
    subject = Column(String, nullable=False)
    description = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending", index=True)
    assigned_to = Column(String, nullable=True)  # department the complaint was forwarded to
    resolution_note = Column(String, nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    has_unseen_update = Column(Boolean, nullable=False, default=False)  # staff updated it, student has not opened it yet
    rating = Column(Integer, nullable=True)  # 1 to 5, given after resolution
    feedback = Column(String, nullable=True)
    feedback_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ComplaintEvent(Base):
    """One line of a complaint's timeline (submitted, forwarded, in progress, resolved, rated)."""

    __tablename__ = "complaint_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    complaint_id = Column(UUID(as_uuid=True), ForeignKey("complaints.id"), nullable=False, index=True)
    status = Column(String, nullable=True)  # set when the event changes the status
    message = Column(String, nullable=False)
    by_name = Column(String, nullable=False)  # "You", "System" or the staff name
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ComplaintAttachment(Base):
    """A photo or document attached to a complaint. file_path is the stored name inside
    backend/uploads/complaints/<student id>/."""

    __tablename__ = "complaint_attachments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    complaint_id = Column(UUID(as_uuid=True), ForeignKey("complaints.id"), nullable=False, index=True)
    file_name = Column(String, nullable=False)  # original name shown to the student
    file_path = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

from sqlalchemy import Boolean, UniqueConstraint


class QrAttendanceSession(Base):
    __tablename__ = "qr_attendance_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    token = Column(String(100), unique=True, nullable=False, index=True)
    subject = Column(String(120), nullable=False)
    course = Column(String(120), nullable=True)
    semester = Column(String(30), nullable=True)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=True)


class QrAttendanceScan(Base):
    __tablename__ = "qr_attendance_scans"
    __table_args__ = (UniqueConstraint("session_id", "student_id", name="uq_qr_scan_session_student"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("qr_attendance_sessions.id"), nullable=False, index=True)
    student_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    scanned_at = Column(DateTime, default=datetime.utcnow)
    attendance_recorded = Column(Boolean, default=False)

class StudentDocument(Base):
    __tablename__ = "student_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    doc_type = Column(String(30), nullable=False)
    title = Column(String(200), nullable=False)
    file_path = Column(String(500), nullable=True)
    original_name = Column(String(255), nullable=True)
    content_type = Column(String(100), nullable=True)
    size_bytes = Column(Integer, default=0)
    source = Column(String(20), default="student")  # student | staff | sample
    created_at = Column(DateTime, default=datetime.utcnow)

class DocumentRequest(Base):
    __tablename__ = "document_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    doc_type = Column(String(30), nullable=False)
    purpose = Column(Text, nullable=True)
    status = Column(String(20), default="pending")  # pending | approved | rejected
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)
    document_id = Column(UUID(as_uuid=True), ForeignKey("student_documents.id"), nullable=True)

class PlacementCompany(Base):
    """A recruiting company. Admin "Add Companies" will write these rows later."""

    __tablename__ = "placement_companies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False, unique=True, index=True)
    industry = Column(String, nullable=True)
    website = Column(String, nullable=True)
    location = Column(String, nullable=True)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PlacementDrive(Base):
    """One recruitment drive of a company, with its eligibility criteria.
    Admin "Create Placement Drives" / "Set Eligibility Criteria" will write these rows later."""

    __tablename__ = "placement_drives"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("placement_companies.id"), nullable=False, index=True)
    role_title = Column(String, nullable=False)
    package_lpa = Column(Float, nullable=False)
    job_type = Column(String, nullable=False, default="Full time")  # Full time / Internship / Internship + PPO
    mode = Column(String, nullable=False, default="On campus")  # On campus / Off campus / Virtual
    location = Column(String, nullable=True)
    drive_date = Column(Date, nullable=False, index=True)
    apply_by = Column(Date, nullable=False)
    description = Column(String, nullable=True)
    selection_process = Column(String, nullable=True)  # one round per line
    skills = Column(String, nullable=True)  # comma separated
    min_cgpa = Column(Float, nullable=True)
    max_backlogs = Column(Integer, nullable=True)
    courses = Column(String, nullable=True)  # comma separated; empty means open to all courses
    created_at = Column(DateTime, default=datetime.utcnow)


class PlacementApplication(Base):
    """A student's application to a drive. status: applied, shortlisted, interview, selected, rejected, withdrawn.
    The placement cell will move it forward from the Admin module later."""

    __tablename__ = "placement_applications"
    __table_args__ = (
        UniqueConstraint("drive_id", "student_profile_id", name="uq_placement_application"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    drive_id = Column(UUID(as_uuid=True), ForeignKey("placement_drives.id"), nullable=False, index=True)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    status = Column(String, nullable=False, default="applied")
    applied_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class PlacementInterview(Base):
    """One round of an application (aptitude test, technical interview, HR...).
    status: scheduled, completed, cancelled. result: pending, cleared, not_cleared."""

    __tablename__ = "placement_interviews"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id = Column(UUID(as_uuid=True), ForeignKey("placement_applications.id"), nullable=False, index=True)
    round_name = Column(String, nullable=False)
    scheduled_at = Column(DateTime(timezone=True), nullable=False, index=True)
    mode = Column(String, nullable=False, default="In person")  # In person / Online
    venue = Column(String, nullable=True)  # room or meeting link
    instructions = Column(String, nullable=True)
    status = Column(String, nullable=False, default="scheduled")
    result = Column(String, nullable=False, default="pending")


class PlacementOffer(Base):
    """A job offer received by a student. status: accepted, pending, declined."""

    __tablename__ = "placement_offers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    drive_id = Column(UUID(as_uuid=True), ForeignKey("placement_drives.id"), nullable=True)
    company_name = Column(String, nullable=False)
    role_title = Column(String, nullable=False)
    package_lpa = Column(Float, nullable=False)
    offer_date = Column(Date, nullable=False)
    joining_date = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="pending")


class PlacementResume(Base):
    """The student's current resume (one per student) and its automatic check.
    The file is stored in backend/uploads/resumes/<student id>/."""

    __tablename__ = "placement_resumes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, unique=True)
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False, default=0)
    uploaded_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    score = Column(Integer, nullable=True)
    analysis = Column(String, nullable=True)  # JSON: checks, skills found, word count, message


class PlacementStatistic(Base):
    """College placement figures of one academic year. The placement cell will enter these from the Admin module."""

    __tablename__ = "placement_statistics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    academic_year = Column(String, nullable=False, unique=True, index=True)  # for example "2025-26"
    total_students = Column(Integer, nullable=False)
    placed_students = Column(Integer, nullable=False)
    offers_made = Column(Integer, nullable=False)
    companies_visited = Column(Integer, nullable=False)
    highest_package = Column(Float, nullable=False)
    average_package = Column(Float, nullable=False)
    median_package = Column(Float, nullable=False)


class PlacementRecruiter(Base):
    """How many offers one company made in one academic year."""

    __tablename__ = "placement_recruiters"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    academic_year = Column(String, nullable=False, index=True)
    company_name = Column(String, nullable=False)
    offers = Column(Integer, nullable=False)
    highest_package = Column(Float, nullable=True)

class StudentPhoto(Base):
    """The profile photo of a student (one per student).
    The file is stored in backend/uploads/photos/<student id>/."""

    __tablename__ = "student_photos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, unique=True)
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False, default=0)
    uploaded_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

from sqlalchemy import Boolean, Date, Float


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    leave_type = Column(String(30), nullable=False)
    from_date = Column(Date, nullable=False)
    to_date = Column(Date, nullable=False)
    is_half_day = Column(Boolean, default=False)
    days = Column(Float, default=1)
    reason = Column(Text, nullable=False)
    status = Column(String(20), default="pending")  # pending | approved | rejected | cancelled
    reviewer_remarks = Column(Text, nullable=True)
    reviewed_by = Column(String(100), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    has_unseen_update = Column(Boolean, default=False)
    attachment_path = Column(String(500), nullable=True)
    attachment_name = Column(String(255), nullable=True)
    attachment_type = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class LeaveEvent(Base):
    __tablename__ = "leave_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    leave_id = Column(UUID(as_uuid=True), ForeignKey("leave_requests.id"), nullable=False, index=True)
    event = Column(String(30), nullable=False)  # applied | approved | rejected | cancelled
    note = Column(Text, nullable=True)
    actor = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class SemesterTerm(Base):
    """Start and end date of the semester of one class (course + semester).
    The timetable is shown only until the end date. Admin "Semester Settings" will write these rows."""

    __tablename__ = "semester_terms"
    __table_args__ = (
        UniqueConstraint("course", "semester", name="uq_term_course_semester"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course = Column(String, nullable=False, index=True)
    semester = Column(String, nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    academic_year = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PaymentOrder(Base):
    """One online payment attempt. purpose is "fee" or "library_fine".
    status: created, paid, failed or cancelled. gateway is "test" or "razorpay"."""

    __tablename__ = "payment_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    purpose = Column(String, nullable=False)
    fee_item_id = Column(UUID(as_uuid=True), ForeignKey("fee_items.id"), nullable=True)
    title = Column(String, nullable=False)
    amount = Column(Integer, nullable=False)  # whole rupees
    status = Column(String, nullable=False, default="created")
    gateway = Column(String, nullable=False)
    gateway_order_id = Column(String, nullable=True)
    gateway_payment_id = Column(String, nullable=True)
    receipt_no = Column(String, nullable=True)
    failure_reason = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    paid_at = Column(DateTime(timezone=True), nullable=True)


class LibraryRenewal(Base):
    """One renewal of an issued book (the due date was moved forward)."""

    __tablename__ = "library_renewals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    issue_id = Column(UUID(as_uuid=True), ForeignKey("library_issues.id"), nullable=False, index=True)
    old_due_on = Column(Date, nullable=False)
    new_due_on = Column(Date, nullable=False)
    renewed_on = Column(Date, nullable=False)


class LibraryEbook(Base):
    """An e-book added by the library admin. Students can only read and download it.
    The file is stored in backend/uploads/ebooks/."""

    __tablename__ = "library_ebooks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False, index=True)
    author = Column(String, nullable=True)
    category = Column(String, nullable=True, index=True)
    description = Column(String, nullable=True)
    file_name = Column(String, nullable=False)  # name shown to the student
    file_path = Column(String, nullable=False)  # stored name inside backend/uploads/ebooks/
    size_bytes = Column(Integer, nullable=False, default=0)
    uploaded_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class MentorAttachment(Base):
    """A document sent in a mentor chat message (by the student or by the mentor).
    The file is stored in backend/uploads/mentor/<student id>/."""

    __tablename__ = "mentor_attachments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id = Column(UUID(as_uuid=True), ForeignKey("mentor_messages.id"), nullable=False, unique=True)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    content_type = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Notification(Base):
    """A notification for one student. kind is "mentor", "complaint", ... and view_key is the page it opens.
    Faculty / Admin modules create these by calling notify() from app/notify.py."""

    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)
    title = Column(String, nullable=False)
    body = Column(String, nullable=True)
    view_key = Column(String, nullable=True)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


class Hostel(Base):
    __tablename__ = "hostels"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(120), unique=True, nullable=False)
    kind = Column(String(30), nullable=True)  # boys | girls | co-ed
    warden_name = Column(String(120), nullable=True)
    warden_phone = Column(String(30), nullable=True)
    address = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class HostelRoom(Base):
    __tablename__ = "hostel_rooms"
    __table_args__ = (UniqueConstraint("hostel_id", "room_no", name="uq_hostel_room_no"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hostel_id = Column(UUID(as_uuid=True), ForeignKey("hostels.id"), nullable=False, index=True)
    room_no = Column(String(20), nullable=False)
    floor = Column(Integer, default=0)
    room_type = Column(String(30), nullable=True)  # single | double | triple
    capacity = Column(Integer, default=2)
    is_active = Column(Boolean, default=True)


class HostelAllocation(Base):
    __tablename__ = "hostel_allocations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    room_id = Column(UUID(as_uuid=True), ForeignKey("hostel_rooms.id"), nullable=False, index=True)
    allocated_on = Column(Date, nullable=True)
    status = Column(String(20), default="active")  # active | vacated
    vacated_on = Column(Date, nullable=True)


class HostelFee(Base):
    __tablename__ = "hostel_fees"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    title = Column(String(150), nullable=False)
    amount = Column(Integer, nullable=False)  # whole rupees
    due_date = Column(Date, nullable=True)
    paid_amount = Column(Integer, default=0)
    paid_on = Column(Date, nullable=True)
    receipt_no = Column(String(50), nullable=True)


class HostelRequest(Base):
    """Hostel leave and outpass requests."""

    __tablename__ = "hostel_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    kind = Column(String(20), nullable=False)  # leave | outpass
    is_emergency = Column(Boolean, default=False)
    destination = Column(String(200), nullable=True)
    reason = Column(Text, nullable=False)
    contact_phone = Column(String(30), nullable=True)
    from_at = Column(DateTime, nullable=False)
    return_at = Column(DateTime, nullable=False)
    status = Column(String(20), default="pending")  # pending | approved | rejected | cancelled
    remarks = Column(Text, nullable=True)
    reviewed_by = Column(String(100), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    returned_at = Column(DateTime, nullable=True)
    has_unseen_update = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class HostelComplaint(Base):
    __tablename__ = "hostel_complaints"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    category = Column(String(30), nullable=False)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(20), default="open")  # open | in_progress | resolved | rejected
    resolution_note = Column(Text, nullable=True)
    resolved_by = Column(String(100), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    has_unseen_update = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class HostelComplaintPhoto(Base):
    __tablename__ = "hostel_complaint_photos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    complaint_id = Column(UUID(as_uuid=True), ForeignKey("hostel_complaints.id"), nullable=False, index=True)
    file_path = Column(String(500), nullable=False)
    original_name = Column(String(255), nullable=True)
    content_type = Column(String(100), nullable=True)
    size_bytes = Column(Integer, default=0)


class HostelVisitor(Base):
    __tablename__ = "hostel_visitors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    visitor_name = Column(String(100), nullable=False)
    relation = Column(String(50), nullable=True)
    phone = Column(String(30), nullable=True)
    visit_date = Column(Date, nullable=False)
    expected_time = Column(String(5), nullable=True)  # HH:MM
    notes = Column(Text, nullable=True)
    # pending | approved | rejected | cancelled | checked_in | checked_out
    status = Column(String(20), default="pending")
    remarks = Column(Text, nullable=True)
    approved_by = Column(String(100), nullable=True)
    entry_time = Column(DateTime, nullable=True)
    exit_time = Column(DateTime, nullable=True)
    has_unseen_update = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class HostelNotice(Base):
    __tablename__ = "hostel_notices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hostel_id = Column(UUID(as_uuid=True), ForeignKey("hostels.id"), nullable=True, index=True)  # null = all hostels
    category = Column(String(20), default="general")  # general | mess | maintenance | holiday
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=True)
    posted_by = Column(String(100), nullable=True)
    is_important = Column(Boolean, default=False)
    posted_on = Column(Date, nullable=True)


class HostelMessMenu(Base):
    __tablename__ = "hostel_mess_menu"
    __table_args__ = (UniqueConstraint("hostel_id", "day", "meal", name="uq_mess_menu_slot"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hostel_id = Column(UUID(as_uuid=True), ForeignKey("hostels.id"), nullable=False, index=True)
    day = Column(Integer, nullable=False)  # Monday = 0 ... Sunday = 6
    meal = Column(String(20), nullable=False)  # breakfast | lunch | snacks | dinner
    items = Column(Text, nullable=False)


class HostelMessTiming(Base):
    __tablename__ = "hostel_mess_timings"
    __table_args__ = (UniqueConstraint("hostel_id", "meal", name="uq_mess_timing_meal"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hostel_id = Column(UUID(as_uuid=True), ForeignKey("hostels.id"), nullable=False, index=True)
    meal = Column(String(20), nullable=False)
    start_time = Column(String(5), nullable=False)  # HH:MM
    end_time = Column(String(5), nullable=False)


class HostelMessSpecial(Base):
    __tablename__ = "hostel_mess_specials"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hostel_id = Column(UUID(as_uuid=True), ForeignKey("hostels.id"), nullable=False, index=True)
    meal_date = Column(Date, nullable=False)
    meal = Column(String(20), nullable=False)
    items = Column(Text, nullable=False)
    note = Column(Text, nullable=True)


class HostelMessFeedback(Base):
    __tablename__ = "hostel_mess_feedback"
    __table_args__ = (
        UniqueConstraint("student_profile_id", "meal_date", "meal", name="uq_mess_feedback_once"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id = Column(UUID(as_uuid=True), ForeignKey("student_profiles.id"), nullable=False, index=True)
    hostel_id = Column(UUID(as_uuid=True), ForeignKey("hostels.id"), nullable=False, index=True)
    meal_date = Column(Date, nullable=False)
    meal = Column(String(20), nullable=False)
    rating = Column(Integer, nullable=False)  # 1 to 5
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# ============================================================================
# ADMIN tables: paste at the END of backend/app/models.py
# (needs the same imports as your other models: uuid, datetime, Column, String,
#  Text, DateTime, UUID. Both tables are NEW -> create_all makes them at startup.)
# ============================================================================


class InstitutionDetail(Base):
    __tablename__ = "institution_details"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_id = Column(String(64), unique=True, nullable=False, index=True)  # users.id of the admin (as text)
    college_code = Column(String(30), nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(80), nullable=True)
    state_name = Column(String(80), nullable=True)
    country = Column(String(80), nullable=True)
    email = Column(String(120), nullable=True)
    contact_number = Column(String(20), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_id = Column(String(64), nullable=True, index=True)
    admin_name = Column(String(120), nullable=True)
    action = Column(String(60), nullable=False)   # e.g. "college.update"
    detail = Column(Text, nullable=True)           # human readable line
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

class AdminDepartment(Base):
    __tablename__ = "admin_departments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(120), nullable=False)
    name_key = Column(String(120), unique=True, nullable=False, index=True)  # lower-case, no spaces
    code = Column(String(20), nullable=False)
    code_key = Column(String(20), unique=True, nullable=False, index=True)
    hod_name = Column(String(120), nullable=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

class AdminCourse(Base):
    __tablename__ = "admin_courses"
    __table_args__ = (UniqueConstraint("department_id", "name_key", name="uq_admin_course_dept_name"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    department_id = Column(UUID(as_uuid=True), ForeignKey("admin_departments.id"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    name_key = Column(String(120), nullable=False, index=True)
    code = Column(String(20), nullable=False)
    code_key = Column(String(20), unique=True, nullable=False, index=True)
    duration_years = Column(Integer, nullable=False)
    semesters = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

class AdminSubject(Base):
    __tablename__ = "admin_subjects"
    __table_args__ = (UniqueConstraint("course_id", "semester", "name_key", name="uq_admin_subject_course_sem_name"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id = Column(UUID(as_uuid=True), ForeignKey("admin_courses.id"), nullable=False, index=True)
    semester = Column(Integer, nullable=False)
    name = Column(String(150), nullable=False)
    name_key = Column(String(150), nullable=False, index=True)
    code = Column(String(20), nullable=False)
    code_key = Column(String(20), unique=True, nullable=False, index=True)
    credits = Column(Integer, nullable=False, default=3)
    subject_type = Column(String(20), nullable=False, default="theory")  # theory | practical | elective
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

class AdminFacultyDetail(Base):
    """Extra details of a faculty member (the old faculty_profiles table is not changed)."""

    __tablename__ = "admin_faculty_details"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    faculty_profile_id = Column(UUID(as_uuid=True), ForeignKey("faculty_profiles.id"), unique=True, nullable=False, index=True)
    department_id = Column(UUID(as_uuid=True), ForeignKey("admin_departments.id"), nullable=True, index=True)
    designation = Column(String(80), nullable=True)
    email = Column(String(120), nullable=True)
    phone = Column(String(20), nullable=True)
    qualification = Column(String(120), nullable=True)
    joining_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

class AdminAcademicYear(Base):
    __tablename__ = "admin_academic_years"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(9), nullable=False)                      # e.g. 2026-27
    name_key = Column(String(9), unique=True, nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_current = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class AdminLibraryBookMeta(Base):
    """Extra info of a library book written by the admin: number of copies, shelf, active flag.
    Kept in its own table so library_books stays unchanged."""

    __tablename__ = "admin_library_book_meta"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    book_id = Column(UUID(as_uuid=True), ForeignKey("library_books.id"), nullable=False, unique=True, index=True)
    copies = Column(Integer, nullable=False, default=1)
    shelf = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class AdminSetting(Base):
    __tablename__ = "admin_settings"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[str] = mapped_column(String(100), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class FacultyAssignment(Base):
    __tablename__ = "faculty_assignments"
    __table_args__ = (UniqueConstraint("faculty_profile_id", "class_key", name="uq_faculty_assignment"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    faculty_profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("faculty_profiles.id"), nullable=False, index=True)
    course: Mapped[str] = mapped_column(String(120), nullable=False)
    semester: Mapped[int] = mapped_column(Integer, nullable=False)
    subject: Mapped[str] = mapped_column(String(150), nullable=False)
    department: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    class_key: Mapped[str] = mapped_column(String(300), nullable=False)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class FacultyExtra(Base):
    __tablename__ = "faculty_extra"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    faculty_profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("faculty_profiles.id"), unique=True, nullable=False)
    qualification: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    experience_years: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    about: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class FacultyPhoto(Base):
    __tablename__ = "faculty_photos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    faculty_profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("faculty_profiles.id"), unique=True, nullable=False)
    file_name: Mapped[str] = mapped_column(String(120), nullable=False)
    content_type: Mapped[str] = mapped_column(String(30), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class FacultyMarkPart(Base):
    __tablename__ = "faculty_mark_parts"
    __table_args__ = (UniqueConstraint("student_profile_id", "semester", "subject_key", "component", name="uq_faculty_mark_part"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("student_profiles.id"), nullable=False, index=True)
    semester: Mapped[int] = mapped_column(Integer, nullable=False)
    subject_key: Mapped[str] = mapped_column(String(150), nullable=False)
    component: Mapped[str] = mapped_column(String(30), nullable=False)
    marks: Mapped[int] = mapped_column(Integer, nullable=False)
    entered_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("faculty_profiles.id"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class FaceTemplate(Base):
    __tablename__ = "face_templates"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    student_profile_id: Mapped[uuid.UUID] = mapped_column(index=True)
    descriptor: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class FacultyNoticeLink(Base):
    __tablename__ = "faculty_notice_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    notice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notices.id"), unique=True, nullable=False)
    faculty_profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("faculty_profiles.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class FacultyAnnouncement(Base):
    __tablename__ = "faculty_announcements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    faculty_profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("faculty_profiles.id"), nullable=False, index=True)
    class_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("faculty_assignments.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    body: Mapped[str] = mapped_column(String(400), nullable=False)
    recipients: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class StudyMaterial(Base):
    __tablename__ = "study_materials"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(index=True)
    faculty_profile_id: Mapped[uuid.UUID] = mapped_column(index=True)
    course_key: Mapped[str] = mapped_column(String(120), index=True)
    semester: Mapped[int] = mapped_column(Integer, index=True)
    subject: Mapped[str] = mapped_column(String(200))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(40))
    file_name: Mapped[str] = mapped_column(String(200))
    stored_name: Mapped[str] = mapped_column(String(80))
    size: Mapped[int] = mapped_column(Integer, default=0)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    downloads: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class FacultyQrSession(Base):
    __tablename__ = "faculty_qr_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(index=True)
    faculty_profile_id: Mapped[uuid.UUID] = mapped_column(index=True)
    course_key: Mapped[str] = mapped_column(String(120), index=True)
    semester: Mapped[int] = mapped_column(Integer)
    subject: Mapped[str] = mapped_column(String(200))
    day: Mapped[datetime.date] = mapped_column(Date)
    secret: Mapped[str] = mapped_column(String(64))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    accuracy: Mapped[float] = mapped_column(Float, default=0.0)
    radius_m: Mapped[int] = mapped_column(Integer, default=100)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finalized: Mapped[bool] = mapped_column(Boolean, default=False)


class FacultyQrScan(Base):
    __tablename__ = "faculty_qr_scans"
    __table_args__ = (UniqueConstraint("session_id", "student_profile_id", name="uq_faculty_qr_scan"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(index=True)
    student_profile_id: Mapped[uuid.UUID] = mapped_column(index=True)
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    distance_m: Mapped[float] = mapped_column(Float)

class FacultyExamCopy(Base):
    __tablename__ = "faculty_exam_copies"
    __table_args__ = (UniqueConstraint("student_profile_id", "assignment_id", "exam_name", name="uq_faculty_exam_copy"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(index=True)
    student_profile_id: Mapped[uuid.UUID] = mapped_column(index=True)
    semester: Mapped[int] = mapped_column(Integer)
    subject: Mapped[str] = mapped_column(String(200))
    exam_name: Mapped[str] = mapped_column(String(60))
    file_name: Mapped[str] = mapped_column(String(200))
    stored_name: Mapped[str] = mapped_column(String(80))
    size: Mapped[int] = mapped_column(Integer, default=0)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FacultyTaskFile(Base):
    __tablename__ = "faculty_task_files"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(index=True)
    course_key: Mapped[str] = mapped_column(String(120), index=True)
    semester: Mapped[int] = mapped_column(Integer, index=True)
    file_name: Mapped[str] = mapped_column(String(200))
    stored_name: Mapped[str] = mapped_column(String(80))
    size: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
class FacultyTaskLink(Base):
    """Links an assignment to the faculty member and the class (faculty_assignments row) it was created for."""
    __tablename__ = "faculty_task_links"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assignments.id"), unique=True, index=True)
    faculty_profile_id: Mapped[uuid.UUID] = mapped_column(index=True)
    class_id: Mapped[uuid.UUID] = mapped_column(index=True)

class FacultyExam(Base):
    __tablename__ = "faculty_exams"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(index=True)
    faculty_profile_id: Mapped[uuid.UUID] = mapped_column(index=True)
    course_key: Mapped[str] = mapped_column(String(120), index=True)
    semester: Mapped[int] = mapped_column(Integer, index=True)
    subject: Mapped[str] = mapped_column(String(200))
    name: Mapped[str] = mapped_column(String(120))
    exam_type: Mapped[str] = mapped_column(String(40))
    max_marks: Mapped[float] = mapped_column(Float)
    pass_percent: Mapped[float] = mapped_column(Float, default=40)
    exam_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    duration_min: Mapped[int] = mapped_column(Integer, default=60)
    instructions: Mapped[str] = mapped_column(Text, default="")
    results_published: Mapped[bool] = mapped_column(Boolean, default=False)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FacultyExamPaper(Base):
    __tablename__ = "faculty_exam_papers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    exam_id: Mapped[uuid.UUID] = mapped_column(unique=True, index=True)
    file_name: Mapped[str] = mapped_column(String(200))
    stored_name: Mapped[str] = mapped_column(String(80))
    size: Mapped[int] = mapped_column(Integer, default=0)
    released: Mapped[bool] = mapped_column(Boolean, default=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FacultyExamMark(Base):
    __tablename__ = "faculty_exam_marks"
    __table_args__ = (UniqueConstraint("exam_id", "student_profile_id", name="uq_faculty_exam_mark"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    exam_id: Mapped[uuid.UUID] = mapped_column(index=True)
    student_profile_id: Mapped[uuid.UUID] = mapped_column(index=True)
    marks: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_absent: Mapped[bool] = mapped_column(Boolean, default=False)
    remarks: Mapped[str] = mapped_column(String(200), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class FacultyPlanLink(Base):
    __tablename__ = "faculty_plan_links"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(unique=True, index=True)
    subject_id: Mapped[uuid.UUID] = mapped_column()


class FacultyPlanUnit(Base):
    __tablename__ = "faculty_plan_units"
    __table_args__ = (UniqueConstraint("assignment_id", "unit_id", name="uq_faculty_plan_unit"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(index=True)
    unit_id: Mapped[uuid.UUID] = mapped_column()
    planned_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    planned_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)


class FacultyPlanTopic(Base):
    __tablename__ = "faculty_plan_topics"
    __table_args__ = (UniqueConstraint("assignment_id", "unit_id", "topic_key", name="uq_faculty_plan_topic"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(index=True)
    unit_id: Mapped[uuid.UUID] = mapped_column(index=True)
    topic_key: Mapped[str] = mapped_column(String(16))
    topic: Mapped[str] = mapped_column(String(500))
    done_on: Mapped[date] = mapped_column(Date)

