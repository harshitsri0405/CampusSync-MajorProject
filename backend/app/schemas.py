import datetime as dt
from datetime import time as dtime
from pydantic import BaseModel, Field , field_validator
from app.models import RoleEnum
from typing import Optional
from typing import List, Dict
from datetime import date, datetime
import re
from pydantic import BaseModel, field_validator
from typing import ClassVar
class StudentRegister(BaseModel):
    name: str
    college_id: str
    password: str = Field(min_length=6)


class FacultyRegister(BaseModel):
    faculty_name: str
    faculty_id: str
    password: str = Field(min_length=6)


class AdminRegister(BaseModel):
    college_name: str
    password: str = Field(min_length=6)


class HostelRegister(BaseModel):
    warden_name: str
    faculty_id: str
    hostel_name: str
    password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    role: RoleEnum
    username: str  # college_id / faculty_id / college_name depending on role
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: RoleEnum
    display_name: str


class MeResponse(BaseModel):
    role: RoleEnum
    username: str
    display_name: str

class StudentProfileIn(BaseModel):
    """All optional — the person fills in whatever they have, and can come back later."""

    date_of_birth: str | None = None
    gender: str | None = None
    blood_group: str | None = None
    course: str | None = None
    department: str | None = None
    semester: str | None = None
    admission_year: str | None = None
    father_name: str | None = None
    mother_name: str | None = None
    parent_contact: str | None = None
    phone: str | None = None
    address: str | None = None


class StudentProfileOut(StudentProfileIn):
    name: str
    college_id: str
    is_filled: bool  # False the first time — tells the frontend to show the form, not the view


class AttendanceRecordOut(BaseModel):
    date: dt.date
    subject: str
    status: str


class SubjectAttendance(BaseModel):
    subject: str
    present: int
    total: int
    percentage: float


class AttendanceSummary(BaseModel):
    total_classes: int
    present: int
    absent: int
    percentage: float
    required_percentage: float
    at_risk: bool
    subjects: list[SubjectAttendance]


class AttendanceClass(BaseModel):
    subject: str
    status: str  # "present" | "absent"


class AttendanceClass(BaseModel):
    subject: str
    status: str  # "present" | "absent"


class AttendanceDay(BaseModel):
    date: dt.date
    present: int
    absent: int
    status: str  # "present" | "absent" | "mixed"
    classes: list[AttendanceClass]
    classes: list[AttendanceClass]


class AttendanceMonth(BaseModel):
    year: int
    month: int
    total_classes: int
    present: int
    percentage: float
    days: list[AttendanceDay]


class AttendanceHistory(BaseModel):
    items: list[AttendanceRecordOut]
    total: int
    page: int
    page_size: int



class ResultSubject(BaseModel):
    subject: str
    credits: int
    internal_marks: float | None
    external_marks: float | None
    total: float | None
    grade: str | None
    grade_points: int | None
    passed: bool | None


class SemesterResult(BaseModel):
    semester: int
    sgpa: float | None
    credits: int
    earned_credits: int
    status: str  # "pass" | "fail" | "in_progress"
    subjects: list[ResultSubject]


class GradeScaleItem(BaseModel):
    min_marks: int
    grade: str
    points: int


class ResultsOverview(BaseModel):
    cgpa: float | None
    total_credits: int
    earned_credits: int
    internal_max: int
    external_max: int
    pass_marks: int
    grade_scale: list[GradeScaleItem]
    semesters: list[SemesterResult]


class TimetableEntryOut(BaseModel):
    day: int  # 0 = Monday ... 6 = Sunday
    start_time: dt.time
    end_time: dt.time
    subject: str
    faculty_name: str | None
    room: str | None
    kind: str  # "lecture" | "practical"


class ExamOut(BaseModel):
    subject: str
    exam_type: str
    exam_date: dt.date
    start_time: dt.time
    end_time: dt.time
    venue: str | None

class TermOut(BaseModel):
    start_date: dt.date
    end_date: dt.date
    academic_year: str | None
    status: str  # "upcoming" | "running" | "ended"
    days_left: int  # days until the semester ends (negative after it ended)

class TimetableOverview(BaseModel):
    course: str | None
    semester: str | None
    class_known: bool  # False when Course / Semester are not filled in the student profile
    entries: list[TimetableEntryOut]
    exams: list[ExamOut]
    term: TermOut | None = None

class AttendanceRange(BaseModel):
    start: dt.date
    end: dt.date
    subject: str | None = None
    total_classes: int
    present: int
    absent: int
    percentage: float
    subjects: list[SubjectAttendance]
    records: list[AttendanceRecordOut] = []


class SubmissionOut(BaseModel):
    file_name: str | None
    note: str | None
    submitted_at: dt.datetime
    is_late: bool
    marks: float | None
    feedback: str | None
    graded_at: dt.datetime | None


class AssignmentOut(BaseModel):
    id: str
    subject: str
    title: str
    description: str | None
    faculty_name: str | None
    max_marks: int
    due_at: dt.datetime
    status: str  # "pending" | "overdue" | "submitted" | "graded"
    submission: SubmissionOut | None


class AssignmentsOverview(BaseModel):
    course: str | None
    semester: str | None
    class_known: bool  # False when Course / Semester are not filled in the student profile
    assignments: list[AssignmentOut]

class FeeItemOut(BaseModel):
    id: str
    name: str
    amount: int
    due_date: dt.date
    paid: int
    due: int
    status: str  # "paid" | "partial" | "pending" | "overdue"


class FeePaymentOut(BaseModel):
    receipt_no: str
    fee_name: str
    amount: int
    paid_on: dt.date
    mode: str
    reference: str | None


class FeeSummary(BaseModel):
    total_fee: int = 0
    total_paid: int = 0
    total_due: int = 0
    overdue_amount: int = 0
    next_due_name: str | None = None
    next_due_date: dt.date | None = None
    next_due_amount: int | None = None


class FeesOverview(BaseModel):
    course: str | None
    semester: str | None
    class_known: bool  # False when Course / Semester are not filled in the student profile
    summary: FeeSummary
    items: list[FeeItemOut]
    payments: list[FeePaymentOut]


class ReceiptOut(BaseModel):
    receipt_no: str
    paid_on: dt.date
    student_name: str
    college_id: str
    course: str | None
    semester: str | None
    fee_name: str
    amount: int
    amount_in_words: str
    mode: str
    reference: str | None
    fee_total: int
    paid_till_date: int
    balance: int
    received_by: str | None

class LibraryIssuedOut(BaseModel):
    id: str
    title: str
    author: str | None
    category: str | None
    issued_on: dt.date
    due_on: dt.date
    days_left: int  # negative when the book is overdue
    is_overdue: bool
    fine_so_far: int
    renewals: int
    can_renew: bool
    renew_note: str | None = None


class LibraryReturnedOut(BaseModel):
    title: str
    author: str | None
    issued_on: dt.date
    due_on: dt.date
    returned_on: dt.date
    days_late: int
    fine: int


class LibraryFineOut(BaseModel):
    title: str
    issued_on: dt.date
    due_on: dt.date
    returned_on: dt.date | None
    days_late: int
    fine: int
    paid: int
    pending: int
    status: str  # "accruing" (book not returned yet) | "pending" | "paid"


class LibrarySummary(BaseModel):
    currently_issued: int
    overdue: int
    total_fine: int
    fine_paid: int
    fine_pending: int
    fine_per_day: int
    loan_days: int
    max_renewals: int
    renew_days: int


class LibraryOverview(BaseModel):
    summary: LibrarySummary
    issued: list[LibraryIssuedOut]
    returned: list[LibraryReturnedOut]
    fines: list[LibraryFineOut]

class NoticeOut(BaseModel):
    id: str
    category: str  # "college" | "department" | "event"
    title: str
    body: str
    department: str | None
    posted_by: str | None
    posted_on: dt.date
    is_important: bool
    event_date: dt.date | None
    event_time: dt.time | None
    venue: str | None
    is_read: bool


class NoticesOverview(BaseModel):
    department: str | None
    department_known: bool  # False when Department is not filled in the student profile
    notices: list[NoticeOut]

class SyllabusUnitOut(BaseModel):
    unit_no: int
    title: str
    topics: list[str]
    hours: int | None


class SyllabusSubjectOut(BaseModel):
    id: str
    code: str
    name: str
    subject_type: str  # "theory" | "practical"
    credits: int
    internal_marks: int | None
    external_marks: int | None
    overview: str | None
    books: list[str]
    units: list[SyllabusUnitOut]


class SyllabusSemesterOut(BaseModel):
    semester: int
    total_credits: int
    subjects: list[SyllabusSubjectOut]


class SyllabusOverview(BaseModel):
    course: str | None
    course_known: bool  # False when Course is not filled in the student profile
    current_semester: int | None
    semesters: list[SyllabusSemesterOut]

class GalleryPhotoOut(BaseModel):
    id: str
    caption: str | None


class GalleryAlbumOut(BaseModel):
    id: str
    category: str  # "event" | "workshop" | "sports" | "cultural" | "achievement"
    title: str
    description: str | None
    event_date: dt.date | None
    photos: list[GalleryPhotoOut]


class GalleryOverview(BaseModel):
    albums: list[GalleryAlbumOut]

class MentorOut(BaseModel):
    name: str
    designation: str | None
    department: str | None
    email: str | None
    phone: str | None
    cabin: str | None
    availability: str | None


class MentorMessageIn(BaseModel):
    body: str


class MentorAttachmentOut(BaseModel):
    file_name: str
    size_bytes: int


class MentorMessageOut(BaseModel):
    id: str
    sender: str  # "student" | "mentor"
    body: str
    created_at: dt.datetime
    is_read: bool
    attachment: MentorAttachmentOut | None = None


class MentorMeetingIn(BaseModel):
    topic: str
    agenda: str = Field(min_length=1, max_length=500)
    requested_date: dt.date
    requested_time: dt.time
    mode: str


class MentorMeetingOut(BaseModel):
    id: str
    topic: str
    agenda: str
    requested_date: dt.date
    requested_time: dt.time
    mode: str
    status: str  # "pending" | "approved" | "rejected" | "completed" | "cancelled"
    mentor_response: str | None
    created_at: dt.datetime


class MentorNoteOut(BaseModel):
    id: str
    note_type: str  # "progress" | "guidance"
    title: str
    body: str
    action_points: list[str]
    created_by: str | None
    created_on: dt.date


class MentorSnapshot(BaseModel):
    attendance_percentage: float | None
    attendance_classes: int
    low_attendance_subjects: list[str]
    cgpa: float | None
    backlog_subjects: list[str]
    talking_points: list[str]


class MentorOverview(BaseModel):
    has_mentor: bool
    mentor: MentorOut | None
    unread_messages: int
    messages: list[MentorMessageOut]
    meetings: list[MentorMeetingOut]
    progress_notes: list[MentorNoteOut]
    guidance_notes: list[MentorNoteOut]
    snapshot: MentorSnapshot

class ComplaintCategoryOut(BaseModel):
    name: str
    department: str  # where a complaint of this category is forwarded


class ComplaintAttachmentOut(BaseModel):
    id: str
    file_name: str
    size_bytes: int


class ComplaintEventOut(BaseModel):
    status: str | None
    message: str
    by: str
    created_at: dt.datetime


class ComplaintOut(BaseModel):
    id: str
    ticket_no: str
    category: str
    subject: str
    description: str
    status: str  # "pending" | "in_progress" | "resolved"
    assigned_to: str | None
    created_at: dt.datetime
    updated_at: dt.datetime
    resolved_at: dt.datetime | None
    resolution_note: str | None
    rating: int | None
    feedback: str | None
    has_unseen_update: bool
    attachments: list[ComplaintAttachmentOut]
    timeline: list[ComplaintEventOut]


class ComplaintsOverview(BaseModel):
    categories: list[ComplaintCategoryOut]
    complaints: list[ComplaintOut]


class ComplaintFeedbackIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=500)

class QrScanIn(BaseModel):
    token: str

class QrScanOut(BaseModel):
    ok: bool
    message: str
    subject: Optional[str] = None
    date: Optional[str] = None
    attendance_recorded: bool = False

class QrScanItem(BaseModel):
    id: str
    subject: str
    scanned_at: datetime
    attendance_recorded: bool

class QrOverview(BaseModel):
    valid_minutes: int
    recent: List[QrScanItem]

class QrDemoSessionIn(BaseModel):
    subject: str

class QrDemoSessionOut(BaseModel):
    code: str
    subject: str
    expires_at: datetime
    qr_image: str

class DocProfileInfo(BaseModel):
    name: Optional[str] = None
    college_id: Optional[str] = None
    course: Optional[str] = None
    semester: Optional[str] = None
    department: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    dob: Optional[str] = None
    blood_group: Optional[str] = None
    address: Optional[str] = None


class StudentDocumentOut(BaseModel):
    id: str
    doc_type: str
    doc_label: str
    title: str
    source: str
    has_file: bool
    original_name: Optional[str] = None
    size_bytes: int = 0
    created_at: datetime
    can_delete: bool


class DocumentRequestOut(BaseModel):
    id: str
    doc_type: str
    doc_label: str
    purpose: Optional[str] = None
    status: str
    remarks: Optional[str] = None
    created_at: datetime
    processed_at: Optional[datetime] = None


class DocumentTypeOut(BaseModel):
    key: str
    label: str
    requestable: bool


class DocumentsOverview(BaseModel):
    profile: DocProfileInfo
    doc_types: List[DocumentTypeOut]
    documents: List[StudentDocumentOut]
    requests: List[DocumentRequestOut]
    max_file_mb: int
    allowed_ext: List[str]


class DocumentRequestIn(BaseModel):
    doc_type: str
    purpose: str = ""

class AnalyticsWeeklyPoint(BaseModel):
    week: str
    percentage: float


class AnalyticsAttendanceSubject(BaseModel):
    subject: str
    total: int
    present: int
    percentage: float
    status: str  # safe | warning | risk
    classes_needed: int = 0
    can_skip: int = 0


class AnalyticsAttendanceOut(BaseModel):
    has_data: bool
    message: Optional[str] = None
    overall_percentage: Optional[float] = None
    total_classes: int = 0
    risk_level: str = "unknown"  # low | medium | high | unknown
    trend: str = "unknown"  # improving | stable | declining | unknown
    trend_slope: Optional[float] = None
    target: float = 75.0
    weekly: List[AnalyticsWeeklyPoint] = []
    subjects: List[AnalyticsAttendanceSubject] = []


class AnalyticsSubjectPerformance(BaseModel):
    subject: str
    percentage: float
    assessments: int
    status: str  # failing | weak | average | strong
    below_own_average: bool = False


class AnalyticsSemesterPoint(BaseModel):
    semester: str
    percentage: float


class AnalyticsPerformanceOut(BaseModel):
    has_data: bool
    message: Optional[str] = None
    current_average: Optional[float] = None
    predicted_next: Optional[float] = None
    predicted_status: Optional[str] = None
    confidence: str = "low"
    pass_mark: float = 40.0
    semesters: List[AnalyticsSemesterPoint] = []
    subjects: List[AnalyticsSubjectPerformance] = []


class AnalyticsRecommendation(BaseModel):
    priority: int
    title: str
    detail: str
    hours_per_week: Optional[float] = None


class AnalyticsOverview(BaseModel):
    attendance: AnalyticsAttendanceOut
    performance: AnalyticsPerformanceOut
    weak_subjects: List[str]
    recommendations: List[AnalyticsRecommendation]
    note: str

class PlacementStudentOut(BaseModel):
    cgpa: float | None
    backlogs: int
    course: str | None
    department: str | None


class ResumeCheckOut(BaseModel):
    name: str
    points: int
    max_points: int
    status: str  # "good" | "partial" | "missing"
    tip: str


class ResumeOut(BaseModel):
    has_resume: bool
    file_name: str | None = None
    size_bytes: int | None = None
    uploaded_at: dt.datetime | None = None
    score: int | None = None
    label: str | None = None
    checks: list[ResumeCheckOut] = []
    skills_found: list[str] = []
    word_count: int | None = None
    message: str | None = None  # for example when the text of the file could not be read


class PlacementDriveOut(BaseModel):
    id: str
    company: str
    industry: str | None
    website: str | None
    location: str | None
    role_title: str
    package_lpa: float
    job_type: str
    mode: str
    drive_date: dt.date
    apply_by: dt.date
    description: str | None
    selection_process: list[str]
    skills: list[str]
    min_cgpa: float | None
    max_backlogs: int | None
    courses: list[str]
    phase: str  # "open" | "closed" (apply date passed) | "over" (drive date passed)
    days_left: int  # days left to apply; negative when the apply date has passed
    eligible: bool
    reasons: list[str]  # why the student is not eligible
    application_status: str | None


class PlacementInterviewOut(BaseModel):
    id: str
    application_id: str
    company: str
    role_title: str
    round_name: str
    scheduled_at: dt.datetime
    mode: str
    venue: str | None
    instructions: str | None
    status: str  # "scheduled" | "completed" | "cancelled"
    result: str  # "pending" | "cleared" | "not_cleared"


class PlacementApplicationOut(BaseModel):
    id: str
    drive_id: str
    company: str
    role_title: str
    package_lpa: float
    applied_at: dt.datetime
    status: str  # "applied" | "shortlisted" | "interview" | "selected" | "rejected" | "withdrawn"
    can_withdraw: bool
    interviews: list[PlacementInterviewOut]


class PlacementOfferOut(BaseModel):
    company_name: str
    role_title: str
    package_lpa: float
    offer_date: dt.date
    joining_date: dt.date | None
    status: str  # "accepted" | "pending" | "declined"


class PlacementRecruiterOut(BaseModel):
    company_name: str
    offers: int
    highest_package: float | None


class PlacementStatisticOut(BaseModel):
    academic_year: str
    total_students: int
    placed_students: int
    offers_made: int
    companies_visited: int
    highest_package: float
    average_package: float
    median_package: float
    recruiters: list[PlacementRecruiterOut]


class PlacementOverview(BaseModel):
    student: PlacementStudentOut
    resume: ResumeOut
    drives: list[PlacementDriveOut]
    applications: list[PlacementApplicationOut]
    interviews: list[PlacementInterviewOut]
    offers: list[PlacementOfferOut]
    statistics: list[PlacementStatisticOut]

class LeaveStudentInfo(BaseModel):
    name: Optional[str] = None
    college_id: Optional[str] = None
    course: Optional[str] = None
    semester: Optional[str] = None


class LeaveTypeOut(BaseModel):
    key: str
    label: str
    excused: bool
    attach_after_days: Optional[int] = None


class LeaveRulesOut(BaseModel):
    max_days: int
    max_past_days: int
    max_future_days: int
    min_reason_len: int
    max_reason_len: int
    max_file_mb: int
    allowed_ext: List[str]


class LeaveEventOut(BaseModel):
    id: str
    event: str
    note: Optional[str] = None
    actor: Optional[str] = None
    created_at: datetime


class LeaveRequestOut(BaseModel):
    id: str
    leave_type: str
    type_label: str
    excused: bool
    from_date: date
    to_date: date
    is_half_day: bool
    days: float
    reason: str
    status: str
    reviewer_remarks: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    has_unseen_update: bool
    has_attachment: bool
    attachment_name: Optional[str] = None
    can_cancel: bool
    events: List[LeaveEventOut] = []


class LeaveSummaryOut(BaseModel):
    pending: int = 0
    approved: int = 0
    rejected: int = 0
    cancelled: int = 0
    approved_days_this_year: float = 0
    excused_days_this_year: float = 0
    unseen: int = 0


class LeaveAttendanceSnapshot(BaseModel):
    has_data: bool
    percentage: Optional[float] = None
    total_classes: int = 0
    present: int = 0
    required: float = 75.0


class LeaveOverview(BaseModel):
    student: LeaveStudentInfo
    types: List[LeaveTypeOut]
    rules: LeaveRulesOut
    summary: LeaveSummaryOut
    attendance: LeaveAttendanceSnapshot
    requests: List[LeaveRequestOut]


class LeaveImpactOut(BaseModel):
    has_data: bool
    message: Optional[str] = None
    working_days: int = 0
    classes_estimated: int = 0
    current_pct: Optional[float] = None
    projected_if_absent: Optional[float] = None
    projected_if_excused: Optional[float] = None
    will_be_excused: bool = False
    below_required: bool = False
    required: float = 75.0

class LibraryEbookOut(BaseModel):
    id: str
    title: str
    author: str | None
    category: str | None
    description: str | None
    file_name: str
    file_type: str  # "PDF" | "EPUB"
    size_bytes: int
    added_on: dt.date


class PaymentStartIn(BaseModel):
    purpose: str  # "fee" | "library_fine"
    fee_item_id: str | None = None
    amount: int = Field(ge=1, le=1000000)


class PaymentOrderOut(BaseModel):
    order_id: str
    purpose: str
    title: str
    amount: int
    mode: str  # "test" | "razorpay"
    gateway_order_id: str | None = None
    key_id: str | None = None


class PaymentConfirmIn(BaseModel):
    outcome: str | None = None  # test mode only: "success" | "failed"
    method: str | None = None  # test mode only
    razorpay_payment_id: str | None = None
    razorpay_order_id: str | None = None
    razorpay_signature: str | None = None


class PaymentResultOut(BaseModel):
    status: str  # "paid" | "failed" | "cancelled"
    message: str
    receipt_no: str | None
    reference: str | None
    amount: int
    title: str
    purpose: str


class NotificationOut(BaseModel):
    id: str
    kind: str
    title: str
    body: str | None
    view: str | None
    is_read: bool
    created_at: dt.datetime


class NotificationsOut(BaseModel):
    unread: int
    items: list[NotificationOut]


class SemesterTermIn(BaseModel):
    course: str
    semester: str
    start_date: dt.date
    end_date: dt.date
    academic_year: str | None = None



class HostelOptionOut(BaseModel):
    key: str
    label: str


class HostelStayOut(BaseModel):
    allocated: bool
    is_sample: bool = False
    hostel_name: Optional[str] = None
    hostel_kind: Optional[str] = None
    room_no: Optional[str] = None
    floor: Optional[int] = None
    room_type: Optional[str] = None
    warden_name: Optional[str] = None
    warden_phone: Optional[str] = None
    allocated_on: Optional[date] = None


class HostelStatsOut(BaseModel):
    total_hostels: int
    total_rooms: int
    occupied_rooms: int
    available_rooms: int
    free_beds: int
    pending_complaints: int


class HostelFeeItemOut(BaseModel):
    id: str
    title: str
    amount: int
    paid_amount: int
    due_amount: int
    due_date: Optional[date] = None
    paid_on: Optional[date] = None
    receipt_no: Optional[str] = None
    status: str  # paid | partial | due | overdue


class HostelFeeSummaryOut(BaseModel):
    total: int = 0
    paid: int = 0
    due: int = 0
    overdue: int = 0
    items: List[HostelFeeItemOut] = []


class HostelRequestOut(BaseModel):
    id: str
    kind: str
    is_emergency: bool
    destination: Optional[str] = None
    reason: str
    contact_phone: Optional[str] = None
    from_at: datetime
    return_at: datetime
    status: str
    remarks: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    returned_at: Optional[datetime] = None
    has_unseen_update: bool
    created_at: datetime
    can_cancel: bool


class HostelPhotoOut(BaseModel):
    id: str
    name: Optional[str] = None


class HostelComplaintOut(BaseModel):
    id: str
    category: str
    category_label: str
    title: str
    description: str
    status: str
    resolution_note: Optional[str] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    has_unseen_update: bool
    created_at: datetime
    photos: List[HostelPhotoOut] = []


class HostelVisitorOut(BaseModel):
    id: str
    visitor_name: str
    relation: Optional[str] = None
    phone: Optional[str] = None
    visit_date: date
    expected_time: Optional[str] = None
    notes: Optional[str] = None
    status: str
    remarks: Optional[str] = None
    approved_by: Optional[str] = None
    entry_time: Optional[datetime] = None
    exit_time: Optional[datetime] = None
    has_unseen_update: bool
    created_at: datetime
    can_cancel: bool


class HostelNoticeOut(BaseModel):
    id: str
    category: str
    category_label: str
    title: str
    body: Optional[str] = None
    posted_by: Optional[str] = None
    is_important: bool
    posted_on: Optional[date] = None


class MessMenuItemOut(BaseModel):
    day: int
    meal: str
    items: str


class MessTimingOut(BaseModel):
    meal: str
    start_time: str
    end_time: str


class MessSpecialOut(BaseModel):
    id: str
    meal_date: date
    meal: str
    items: str
    note: Optional[str] = None


class MessFeedbackOut(BaseModel):
    id: str
    meal_date: date
    meal: str
    rating: int
    comment: Optional[str] = None
    created_at: datetime


class MessAverageOut(BaseModel):
    meal: str
    average: float
    count: int


class HostelMessOut(BaseModel):
    has_hostel: bool
    menu: List[MessMenuItemOut] = []
    timings: List[MessTimingOut] = []
    specials: List[MessSpecialOut] = []
    feedback: List[MessFeedbackOut] = []
    averages: List[MessAverageOut] = []


class HostelRulesOut(BaseModel):
    leave_max_days: int
    outpass_max_hours: int
    max_future_days: int
    min_reason_len: int
    max_reason_len: int
    max_photos: int
    max_photo_mb: int
    allowed_ext: List[str]
    visitor_max_ahead_days: int
    max_active_visitors: int
    feedback_window_days: int


class HostelOverviewOut(BaseModel):
    stay: HostelStayOut
    stats: HostelStatsOut
    fees: HostelFeeSummaryOut
    requests: List[HostelRequestOut]
    complaints: List[HostelComplaintOut]
    visitors: List[HostelVisitorOut]
    notices: List[HostelNoticeOut]
    mess: HostelMessOut
    complaint_categories: List[HostelOptionOut]
    notice_categories: List[HostelOptionOut]
    meals: List[HostelOptionOut]
    rules: HostelRulesOut
    unseen: int = 0


class HostelRequestIn(BaseModel):
    kind: str  # leave | outpass
    is_emergency: bool = False
    destination: str = ""
    reason: str
    contact_phone: str = ""
    from_at: str  # "YYYY-MM-DDTHH:MM" (local time)
    return_at: str


class HostelVisitorIn(BaseModel):
    visitor_name: str
    relation: str = ""
    phone: str = ""
    visit_date: str  # YYYY-MM-DD
    expected_time: str = ""  # HH:MM
    notes: str = ""


class HostelFeedbackIn(BaseModel):
    meal_date: str  # YYYY-MM-DD
    meal: str
    rating: int
    comment: str = ""


class HostelSeenIn(BaseModel):
    kind: str  # request | complaint | visitor
    id: str

# ============================================================================
# ADMIN schemas: paste at the END of backend/app/schemas.py
# needs: import re ; from datetime import datetime ; from typing import List, Optional
#        from pydantic import BaseModel, field_validator
# ============================================================================


def _clean(v):
    if v is None:
        return None
    v = " ".join(str(v).split())
    return v or None


class InstitutionIn(BaseModel):
    college_code: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state_name: Optional[str] = None
    country: Optional[str] = None
    email: Optional[str] = None
    contact_number: Optional[str] = None

    @field_validator("college_code", "address", "city", "state_name", "country", "email", "contact_number", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("college_code")
    @classmethod
    def _code(cls, v):
        if v and len(v) > 30:
            raise ValueError("College code 30 characters se chhota hona chahiye.")
        return v

    @field_validator("address")
    @classmethod
    def _addr(cls, v):
        if v and len(v) > 300:
            raise ValueError("Address 300 characters se chhota hona chahiye.")
        return v

    @field_validator("city", "state_name", "country")
    @classmethod
    def _place(cls, v):
        if v and len(v) > 80:
            raise ValueError("City / State / Country 80 characters se chhote hone chahiye.")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        if v and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
            raise ValueError("Email sahi format me daalo (name@example.com).")
        return v.lower() if v else v

    @field_validator("contact_number")
    @classmethod
    def _phone(cls, v):
        if v:
            digits = re.sub(r"[\s\-()]", "", v)
            if not re.fullmatch(r"\+?\d{7,15}", digits):
                raise ValueError("Contact number 7 se 15 digits ka hona chahiye.")
            return digits
        return v


class InstitutionOut(BaseModel):
    college_name: str
    college_code: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state_name: Optional[str] = None
    country: Optional[str] = None
    email: Optional[str] = None
    contact_number: Optional[str] = None
    filled: bool = False
    updated_at: Optional[datetime] = None


class ActivityOut(BaseModel):
    id: str
    admin_name: Optional[str] = None
    action: str
    detail: Optional[str] = None
    created_at: datetime


class ActivityPage(BaseModel):
    items: List[ActivityOut]
    total: int
    page: int
    page_size: int



class DepartmentIn(BaseModel):
    name: str
    code: str
    hod_name: Optional[str] = None
    description: Optional[str] = None

    @field_validator("name", "code", "hod_name", "description", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        if not v:
            raise ValueError("Department ka naam zaroori hai.")
        if len(v) > 120:
            raise ValueError("Naam 120 characters se chhota hona chahiye.")
        return v

    @field_validator("code")
    @classmethod
    def _code(cls, v):
        if not v:
            raise ValueError("Department code zaroori hai.")
        if not re.fullmatch(r"[A-Za-z0-9\-]{1,20}", v):
            raise ValueError("Code me sirf letters, numbers aur '-' (max 20) allowed hain.")
        return v.upper()

    @field_validator("hod_name")
    @classmethod
    def _hod(cls, v):
        if v and len(v) > 120:
            raise ValueError("HOD ka naam 120 characters se chhota hona chahiye.")
        return v

    @field_validator("description")
    @classmethod
    def _desc(cls, v):
        if v and len(v) > 500:
            raise ValueError("Description 500 characters se chhota hona chahiye.")
        return v


class DepartmentOut(BaseModel):
    id: str
    name: str
    code: str
    hod_name: Optional[str] = None
    description: Optional[str] = None
    is_active: bool
    students: int = 0
    faculty: int = 0
    created_at: Optional[datetime] = None


class DepartmentPage(BaseModel):
    items: List[DepartmentOut]
    total: int
    page: int
    page_size: int

# ADMIN STEP 3: paste at the END of backend/app/schemas.py (uses _clean, re, List, Optional, datetime from before)


class CourseIn(BaseModel):
    name: str
    code: str
    department_id: str
    duration_years: int
    semesters: int
    description: Optional[str] = None

    @field_validator("name", "code", "department_id", "description", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        if not v:
            raise ValueError("Course ka naam zaroori hai.")
        if len(v) > 120:
            raise ValueError("Naam 120 characters se chhota hona chahiye.")
        return v

    @field_validator("code")
    @classmethod
    def _code(cls, v):
        if not v:
            raise ValueError("Course code zaroori hai.")
        if not re.fullmatch(r"[A-Za-z0-9\-]{1,20}", v):
            raise ValueError("Code me sirf letters, numbers aur '-' (max 20) allowed hain.")
        return v.upper()

    @field_validator("department_id")
    @classmethod
    def _dept(cls, v):
        if not v:
            raise ValueError("Department chuno.")
        return v

    @field_validator("duration_years")
    @classmethod
    def _years(cls, v):
        if not 1 <= v <= 6:
            raise ValueError("Duration 1 se 6 saal ke beech hona chahiye.")
        return v

    @field_validator("semesters")
    @classmethod
    def _sems(cls, v, info):
        if not 1 <= v <= 12:
            raise ValueError("Semesters 1 se 12 ke beech hone chahiye.")
        years = info.data.get("duration_years")
        if years and v < years:
            raise ValueError("Semesters duration (saal) se kam nahi ho sakte.")
        return v

    @field_validator("description")
    @classmethod
    def _desc(cls, v):
        if v and len(v) > 500:
            raise ValueError("Description 500 characters se chhota hona chahiye.")
        return v


class CourseOut(BaseModel):
    id: str
    name: str
    code: str
    department_id: str
    department_name: Optional[str] = None
    duration_years: int
    semesters: int
    description: Optional[str] = None
    is_active: bool
    students: int = 0
    created_at: Optional[datetime] = None


class CoursePage(BaseModel):
    items: List[CourseOut]
    total: int
    page: int
    page_size: int

SUBJECT_TYPES = ("theory", "practical", "elective")


class SubjectIn(BaseModel):
    course_id: str
    semester: int
    name: str
    code: str
    credits: int = 3
    subject_type: str = "theory"

    @field_validator("course_id", "name", "code", "subject_type", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("course_id")
    @classmethod
    def _course(cls, v):
        if not v:
            raise ValueError("Course chuno.")
        return v

    @field_validator("semester")
    @classmethod
    def _sem(cls, v):
        if not 1 <= v <= 12:
            raise ValueError("Semester 1 se 12 ke beech hona chahiye.")
        return v

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        if not v:
            raise ValueError("Subject ka naam zaroori hai.")
        if len(v) > 150:
            raise ValueError("Naam 150 characters se chhota hona chahiye.")
        return v

    @field_validator("code")
    @classmethod
    def _code(cls, v):
        if not v:
            raise ValueError("Subject code zaroori hai.")
        if not re.fullmatch(r"[A-Za-z0-9\-]{1,20}", v):
            raise ValueError("Code me sirf letters, numbers aur '-' (max 20) allowed hain.")
        return v.upper()

    @field_validator("credits")
    @classmethod
    def _credits(cls, v):
        if not 0 <= v <= 10:
            raise ValueError("Credits 0 se 10 ke beech hone chahiye.")
        return v

    @field_validator("subject_type")
    @classmethod
    def _type(cls, v):
        v = (v or "").lower()
        if v not in SUBJECT_TYPES:
            raise ValueError("Type theory, practical ya elective hona chahiye.")
        return v


class SubjectOut(BaseModel):
    id: str
    course_id: str
    course_name: Optional[str] = None
    department_name: Optional[str] = None
    semester: int
    name: str
    code: str
    credits: int
    subject_type: str
    is_active: bool
    in_use: int = 0
    created_at: Optional[datetime] = None


class SubjectPage(BaseModel):
    items: List[SubjectOut]
    total: int
    page: int
    page_size: int


class FacultyBase(BaseModel):
    faculty_name: str
    department_id: Optional[str] = None
    designation: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    qualification: Optional[str] = None
    joining_date: Optional[date] = None

    @field_validator("faculty_name", "department_id", "designation", "email", "phone", "qualification", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("joining_date", mode="before")
    @classmethod
    def _blank_date(cls, v):
        return None if v in ("", None) else v

    @field_validator("faculty_name")
    @classmethod
    def _fname(cls, v):
        if not v or len(v) < 2:
            raise ValueError("Faculty ka naam likho (kam se kam 2 letters).")
        if len(v) > 120:
            raise ValueError("Naam 120 characters se chhota hona chahiye.")
        return v

    @field_validator("designation")
    @classmethod
    def _desig(cls, v):
        if v and len(v) > 80:
            raise ValueError("Designation 80 characters se chhota hona chahiye.")
        return v

    @field_validator("qualification")
    @classmethod
    def _qual(cls, v):
        if v and len(v) > 120:
            raise ValueError("Qualification 120 characters se chhota hona chahiye.")
        return v

    @field_validator("email")
    @classmethod
    def _mail(cls, v):
        if v and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
            raise ValueError("Email sahi format me daalo (name@example.com).")
        return v.lower() if v else v

    @field_validator("phone")
    @classmethod
    def _tel(cls, v):
        if v:
            digits = re.sub(r"[\s\-()]", "", v)
            if not re.fullmatch(r"\+?\d{7,15}", digits):
                raise ValueError("Phone number 7 se 15 digits ka hona chahiye.")
            return digits
        return v


class FacultyCreate(FacultyBase):
    faculty_id: str
    password: str

    @field_validator("faculty_id", mode="before")
    @classmethod
    def _fid_strip(cls, v):
        return _clean(v)

    @field_validator("faculty_id")
    @classmethod
    def _fid(cls, v):
        if not v or not re.fullmatch(r"[A-Za-z0-9._\-]{3,30}", v):
            raise ValueError("Faculty ID 3 se 30 characters ka ho (letters, numbers, . _ -), spaces nahi.")
        return v

    @field_validator("password")
    @classmethod
    def _pw(cls, v):
        if not 8 <= len(v or "") <= 64:
            raise ValueError("Password 8 se 64 characters ka hona chahiye.")
        return v


class FacultyUpdate(FacultyBase):
    pass


class FacultyPasswordReset(BaseModel):
    password: str

    @field_validator("password")
    @classmethod
    def _pw(cls, v):
        if not 8 <= len(v or "") <= 64:
            raise ValueError("Password 8 se 64 characters ka hona chahiye.")
        return v


class FacultyOut(BaseModel):
    id: str
    faculty_id: str
    faculty_name: str
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    designation: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    qualification: Optional[str] = None
    joining_date: Optional[date] = None
    is_active: bool
    created_at: Optional[datetime] = None


class FacultyPage(BaseModel):
    items: List[FacultyOut]
    total: int
    page: int
    page_size: int
    stats: dict

class StudentBase(BaseModel):
    name: str
    course_id: Optional[str] = None
    semester: Optional[str] = None
    admission_year: Optional[str] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    parent_contact: Optional[str] = None
    father_name: Optional[str] = None

    @field_validator("name", "course_id", "semester", "admission_year", "gender", "phone", "parent_contact", "father_name", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("name")
    @classmethod
    def _sname(cls, v):
        if not v or len(v) < 2:
            raise ValueError("Student ka naam likho (kam se kam 2 letters).")
        if len(v) > 120:
            raise ValueError("Naam 120 characters se chhota hona chahiye.")
        return v

    @field_validator("semester")
    @classmethod
    def _sem(cls, v):
        if v and len(v) > 20:
            raise ValueError("Semester 20 characters se chhota hona chahiye.")
        return v

    @field_validator("admission_year")
    @classmethod
    def _year(cls, v):
        if v and not (re.fullmatch(r"\d{4}", v) and 1990 <= int(v) <= 2100):
            raise ValueError("Admission year 4 digits ka ho (jaise 2024).")
        return v

    @field_validator("gender", "father_name")
    @classmethod
    def _short(cls, v):
        if v and len(v) > 120:
            raise ValueError("Text 120 characters se chhota hona chahiye.")
        return v

    @field_validator("phone", "parent_contact")
    @classmethod
    def _tel(cls, v):
        if v:
            digits = re.sub(r"[\s\-()]", "", v)
            if not re.fullmatch(r"\+?\d{7,15}", digits):
                raise ValueError("Phone number 7 se 15 digits ka hona chahiye.")
            return digits
        return v


class StudentCreate(StudentBase):
    college_id: str
    password: str

    @field_validator("college_id", mode="before")
    @classmethod
    def _cid_strip(cls, v):
        return _clean(v)

    @field_validator("college_id")
    @classmethod
    def _cid(cls, v):
        if not v or not re.fullmatch(r"[A-Za-z0-9._\-]{3,30}", v):
            raise ValueError("College ID 3 se 30 characters ka ho (letters, numbers, . _ -), spaces nahi.")
        return v

    @field_validator("password")
    @classmethod
    def _pw(cls, v):
        if not 8 <= len(v or "") <= 64:
            raise ValueError("Password 8 se 64 characters ka hona chahiye.")
        return v


class StudentUpdate(StudentBase):
    pass


class StudentToggleIn(BaseModel):
    reason: Optional[str] = None

    @field_validator("reason", mode="before")
    @classmethod
    def _r(cls, v):
        v = _clean(v)
        return v[:200] if v else v


class StudentPasswordReset(BaseModel):
    password: str

    @field_validator("password")
    @classmethod
    def _pw(cls, v):
        if not 8 <= len(v or "") <= 64:
            raise ValueError("Password 8 se 64 characters ka hona chahiye.")
        return v


class StudentIdsIn(BaseModel):
    student_ids: List[str]

    @field_validator("student_ids")
    @classmethod
    def _ids(cls, v):
        if not v:
            raise ValueError("Kam se kam ek student chuno.")
        if len(v) > 500:
            raise ValueError("Ek baar me 500 se zyada students nahi chun sakte.")
        return v


class StudentTransferIn(StudentIdsIn):
    course_id: str
    semester: Optional[str] = None

    @field_validator("semester", mode="before")
    @classmethod
    def _s(cls, v):
        return _clean(v)


class StudentOut(BaseModel):
    id: str
    college_id: str
    name: str
    course: Optional[str] = None
    department: Optional[str] = None
    semester: Optional[str] = None
    admission_year: Optional[str] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    parent_contact: Optional[str] = None
    father_name: Optional[str] = None
    is_active: bool


class StudentPage(BaseModel):
    items: List[StudentOut]
    total: int
    page: int
    page_size: int
    stats: dict


class AcademicYearIn(BaseModel):
    name: str
    start_date: date
    end_date: date

    @field_validator("name", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        if not v or not re.fullmatch(r"\d{4}-\d{2}", v):
            raise ValueError("Academic year ka format 2026-27 jaisa hona chahiye.")
        if int(v[5:]) != (int(v[:4]) + 1) % 100:
            raise ValueError("Academic year me dusra saal agla saal hona chahiye (jaise 2026-27).")
        return v

    @field_validator("end_date")
    @classmethod
    def _dates(cls, v, info):
        start = info.data.get("start_date")
        if start and v <= start:
            raise ValueError("End date start date ke baad honi chahiye.")
        return v


class AcademicYearOut(BaseModel):
    id: str
    name: str
    start_date: date
    end_date: date
    is_current: bool
    status: str
    terms: int = 0


class SemesterTermIn(BaseModel):
    course_id: str
    semester: int
    start_date: date
    end_date: date
    academic_year: str

    @field_validator("course_id", "academic_year", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("course_id", "academic_year")
    @classmethod
    def _req(cls, v):
        if not v:
            raise ValueError("Course aur academic year dono chuno.")
        return v

    @field_validator("semester")
    @classmethod
    def _sem(cls, v):
        if not 1 <= v <= 12:
            raise ValueError("Semester 1 se 12 ke beech hona chahiye.")
        return v

    @field_validator("end_date")
    @classmethod
    def _dates(cls, v, info):
        start = info.data.get("start_date")
        if start and v <= start:
            raise ValueError("End date start date ke baad honi chahiye.")
        return v


class SemesterTermOut(BaseModel):
    id: str
    course: str
    semester: str
    start_date: date
    end_date: date
    academic_year: Optional[str] = None
    status: str
    progress: int = 0


class SemesterTermPage(BaseModel):
    items: List[SemesterTermOut]
    total: int
    page: int
    page_size: int
    stats: dict

class TimetableIn(BaseModel):
    course_id: str
    semester: int
    day_of_week: int
    start_time: dtime
    end_time: dtime
    subject: str
    faculty_name: Optional[str] = None
    room: Optional[str] = None
    kind: str = "lecture"

    @field_validator("course_id", "subject", "faculty_name", "room", "kind", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("course_id", "subject")
    @classmethod
    def _req(cls, v):
        if not v:
            raise ValueError("Course aur subject zaroori hain.")
        return v

    @field_validator("semester")
    @classmethod
    def _sem(cls, v):
        if not 1 <= v <= 12:
            raise ValueError("Semester 1 se 12 ke beech hona chahiye.")
        return v

    @field_validator("day_of_week")
    @classmethod
    def _day(cls, v):
        if not 0 <= v <= 6:
            raise ValueError("Din 0 (Monday) se 6 (Sunday) ke beech hona chahiye.")
        return v

    @field_validator("end_time")
    @classmethod
    def _times(cls, v, info):
        start = info.data.get("start_time")
        if start and v <= start:
            raise ValueError("End time start time ke baad hona chahiye.")
        return v

    @field_validator("room")
    @classmethod
    def _room(cls, v):
        if v and len(v) > 40:
            raise ValueError("Room 40 characters se chhota hona chahiye.")
        return v

    @field_validator("kind")
    @classmethod
    def _kind(cls, v):
        v = (v or "lecture").lower()
        if v not in ("lecture", "practical"):
            raise ValueError("Type lecture ya practical hona chahiye.")
        return v


class TimetableOut(BaseModel):
    id: str
    course: str
    semester: str
    day_of_week: int
    start_time: str
    end_time: str
    subject: str
    faculty_name: Optional[str] = None
    room: Optional[str] = None
    kind: str


EXAM_TYPES = ["Internal Test 1", "Internal Test 2", "End Semester Exam", "Practical Exam", "Viva"]


class ExamIn(BaseModel):
    course_id: str
    semester: int
    subject: str
    exam_type: str
    exam_date: date
    start_time: dtime
    end_time: dtime
    venue: Optional[str] = None

    @field_validator("course_id", "subject", "exam_type", "venue", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("course_id", "subject")
    @classmethod
    def _req(cls, v):
        if not v:
            raise ValueError("Course aur subject zaroori hain.")
        return v

    @field_validator("exam_type")
    @classmethod
    def _type(cls, v):
        for t in EXAM_TYPES:
            if v and v.lower() == t.lower():
                return t
        raise ValueError("Exam type: " + ", ".join(EXAM_TYPES))

    @field_validator("semester")
    @classmethod
    def _sem(cls, v):
        if not 1 <= v <= 12:
            raise ValueError("Semester 1 se 12 ke beech hona chahiye.")
        return v

    @field_validator("end_time")
    @classmethod
    def _times(cls, v, info):
        start = info.data.get("start_time")
        if start and v <= start:
            raise ValueError("End time start time ke baad hona chahiye.")
        return v

    @field_validator("venue")
    @classmethod
    def _venue(cls, v):
        if v and len(v) > 80:
            raise ValueError("Venue 80 characters se chhota hona chahiye.")
        return v


class ExamOut(BaseModel):
    id: str
    course: str
    semester: str
    subject: str
    exam_type: str
    exam_date: date
    start_time: str
    end_time: str
    venue: Optional[str] = None
    status: str


class ExamPage(BaseModel):
    items: List[ExamOut]
    total: int
    page: int
    page_size: int
    stats: dict


class MarksRow(BaseModel):
    student_id: str
    internal_marks: Optional[float] = None
    external_marks: Optional[float] = None

    @field_validator("internal_marks")
    @classmethod
    def _int(cls, v):
        if v is not None and not 0 <= v <= 40:
            raise ValueError("Internal marks 0 se 40 ke beech hone chahiye.")
        return None if v is None else round(v, 2)

    @field_validator("external_marks")
    @classmethod
    def _ext(cls, v):
        if v is not None and not 0 <= v <= 60:
            raise ValueError("External marks 0 se 60 ke beech hone chahiye.")
        return None if v is None else round(v, 2)


class MarksSaveIn(BaseModel):
    course_id: str
    semester: int
    subject: str
    rows: List[MarksRow]

    @field_validator("rows")
    @classmethod
    def _rows(cls, v):
        if not v:
            raise ValueError("Kam se kam ek student ke marks bhejo.")
        if len(v) > 500:
            raise ValueError("Ek baar me 500 se zyada students nahi.")
        return v


class PublishIn(BaseModel):
    course_id: str
    semester: int
    subject: Optional[str] = None
    publish: bool


FEE_MODES = ["UPI", "Cash", "Net Banking", "Card", "Cheque"]


class AdminFeeItemIn(BaseModel):
    course_id: str
    semester: int
    name: str
    amount: int
    due_date: date

    @field_validator("course_id", "name", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("course_id", "name")
    @classmethod
    def _req(cls, v):
        if not v:
            raise ValueError("Course aur fee ka naam zaroori hain.")
        return v

    @field_validator("name")
    @classmethod
    def _len(cls, v):
        if len(v) > 80:
            raise ValueError("Fee ka naam 80 characters se chhota hona chahiye.")
        return v

    @field_validator("semester")
    @classmethod
    def _sem(cls, v):
        if not 1 <= v <= 12:
            raise ValueError("Semester 1 se 12 ke beech hona chahiye.")
        return v

    @field_validator("amount")
    @classmethod
    def _amt(cls, v):
        if not 1 <= v <= 10_000_000:
            raise ValueError("Amount 1 se 1,00,00,000 rupees ke beech hona chahiye.")
        return v


class AdminFeePaymentIn(BaseModel):
    student_id: str
    fee_item_id: str
    amount: int
    paid_on: date
    mode: str
    reference: Optional[str] = None

    @field_validator("student_id", "fee_item_id", "mode", "reference", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("mode")
    @classmethod
    def _mode(cls, v):
        for m in FEE_MODES:
            if v and v.lower() == m.lower():
                return m
        raise ValueError("Mode: " + ", ".join(FEE_MODES))

    @field_validator("amount")
    @classmethod
    def _amt(cls, v):
        if v < 1:
            raise ValueError("Amount kam se kam 1 rupee hona chahiye.")
        return v

    @field_validator("paid_on")
    @classmethod
    def _date(cls, v):
        if v > date.today():
            raise ValueError("Payment ki date future me nahi ho sakti.")
        return v

    @field_validator("reference")
    @classmethod
    def _ref(cls, v):
        if v and len(v) > 60:
            raise ValueError("Reference 60 characters se chhota hona chahiye.")
        return v

NOTICE_CATEGORIES = ["college", "department", "event"]


class AdminNoticeIn(BaseModel):
    category: str
    title: str
    body: str
    department_id: Optional[str] = None
    is_important: bool = False
    event_date: Optional[date] = None
    event_time: Optional[dtime] = None
    venue: Optional[str] = None

    @field_validator("category", "title", "body", "department_id", "venue", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("category")
    @classmethod
    def _cat(cls, v):
        v = (v or "").lower()
        if v not in NOTICE_CATEGORIES:
            raise ValueError("Category: college, department ya event.")
        return v

    @field_validator("title")
    @classmethod
    def _title(cls, v):
        if not v:
            raise ValueError("Title zaroori hai.")
        if len(v) > 150:
            raise ValueError("Title 150 characters se chhota hona chahiye.")
        return v

    @field_validator("body")
    @classmethod
    def _body(cls, v):
        if not v:
            raise ValueError("Notice ka message zaroori hai.")
        if len(v) > 5000:
            raise ValueError("Message 5000 characters se chhota hona chahiye.")
        return v

    @field_validator("venue")
    @classmethod
    def _venue(cls, v):
        if v and len(v) > 100:
            raise ValueError("Venue 100 characters se chhota hona chahiye.")
        return v

class AdminSyllabusUnitIn(BaseModel):
    title: str
    topics: str
    hours: Optional[int] = None

    @field_validator("title", "topics", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("title")
    @classmethod
    def _title(cls, v):
        if not v:
            raise ValueError("Har unit ka title zaroori hai.")
        if len(v) > 120:
            raise ValueError("Unit title 120 characters se chhota hona chahiye.")
        return v

    @field_validator("topics")
    @classmethod
    def _topics(cls, v):
        lines = [ln.strip() for ln in (v or "").splitlines() if ln.strip()]
        if not lines:
            raise ValueError("Har unit me kam se kam ek topic likho.")
        out = "\n".join(lines)
        if len(out) > 3000:
            raise ValueError("Ek unit ke topics 3000 characters se chhote hone chahiye.")
        return out

    @field_validator("hours")
    @classmethod
    def _hours(cls, v):
        if v is not None and not 1 <= v <= 100:
            raise ValueError("Hours 1 se 100 ke beech hone chahiye.")
        return v


class AdminSyllabusIn(BaseModel):
    subject_type: str = "theory"
    credits: int
    internal_marks: Optional[int] = None
    external_marks: Optional[int] = None
    overview: Optional[str] = None
    books: Optional[str] = None
    units: List[AdminSyllabusUnitIn]

    @field_validator("overview", "books", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("subject_type")
    @classmethod
    def _type(cls, v):
        v = (v or "").strip().lower()
        if v not in ("theory", "practical"):
            raise ValueError("Type theory ya practical hona chahiye.")
        return v

    @field_validator("credits")
    @classmethod
    def _credits(cls, v):
        if not 1 <= v <= 10:
            raise ValueError("Credits 1 se 10 ke beech hone chahiye.")
        return v

    @field_validator("internal_marks", "external_marks")
    @classmethod
    def _marks(cls, v):
        if v is not None and not 0 <= v <= 100:
            raise ValueError("Marks 0 se 100 ke beech hone chahiye.")
        return v

    @field_validator("overview")
    @classmethod
    def _overview(cls, v):
        if v and len(v) > 2000:
            raise ValueError("Overview 2000 characters se chhota hona chahiye.")
        return v

    @field_validator("books")
    @classmethod
    def _books(cls, v):
        if not v:
            return v
        out = "\n".join(ln.strip() for ln in v.splitlines() if ln.strip())
        if len(out) > 2000:
            raise ValueError("Books ki list 2000 characters se chhoti honi chahiye.")
        return out

    @field_validator("units")
    @classmethod
    def _units(cls, v):
        if not v:
            raise ValueError("Kam se kam ek unit zaroori hai.")
        if len(v) > 20:
            raise ValueError("Ek subject me 20 se zyada units nahi.")
        return v


class AdminBookIn(BaseModel):
    title: str
    author: Optional[str] = None
    category: Optional[str] = None
    isbn: Optional[str] = None
    copies: int = 1
    shelf: Optional[str] = None

    @field_validator("title", "author", "category", "isbn", "shelf", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("title")
    @classmethod
    def _title(cls, v):
        if not v:
            raise ValueError("Book ka title zaroori hai.")
        if len(v) > 150:
            raise ValueError("Title 150 characters se chhota hona chahiye.")
        return v

    @field_validator("author")
    @classmethod
    def _author(cls, v):
        if v and len(v) > 100:
            raise ValueError("Author 100 characters se chhota hona chahiye.")
        return v

    @field_validator("category")
    @classmethod
    def _category(cls, v):
        if v and len(v) > 50:
            raise ValueError("Category 50 characters se chhoti honi chahiye.")
        return v

    @field_validator("isbn")
    @classmethod
    def _isbn(cls, v):
        if v and len(v) > 20:
            raise ValueError("ISBN 20 characters se chhota hona chahiye.")
        return v

    @field_validator("shelf")
    @classmethod
    def _shelf(cls, v):
        if v and len(v) > 30:
            raise ValueError("Shelf 30 characters se chhota hona chahiye.")
        return v

    @field_validator("copies")
    @classmethod
    def _copies(cls, v):
        if not 1 <= v <= 500:
            raise ValueError("Copies 1 se 500 ke beech honi chahiye.")
        return v


class AdminIssueIn(BaseModel):
    student_id: str
    book_id: str
    days: int = 14

    @field_validator("days")
    @classmethod
    def _days(cls, v):
        if not 1 <= v <= 60:
            raise ValueError("Din 1 se 60 ke beech hone chahiye.")
        return v


class AdminReturnIn(BaseModel):
    fine: Optional[int] = None

    @field_validator("fine")
    @classmethod
    def _fine(cls, v):
        if v is not None and not 0 <= v <= 10000:
            raise ValueError("Fine 0 se 10,000 rupees ke beech hona chahiye.")
        return v

import re as _re

DRIVE_JOB_TYPES = ["Full time", "Internship", "Internship + PPO"]
DRIVE_MODES = ["On campus", "Off campus", "Virtual"]
INTERVIEW_MODES = ["In person", "Online"]
APPLICATION_STATUSES = ["shortlisted", "interview", "selected", "rejected"]


def _choice(v, options, label):
    for o in options:
        if v and str(v).strip().lower() == o.lower():
            return o
    raise ValueError(f"{label}: " + ", ".join(options))


class AdminCompanyIn(BaseModel):
    name: str
    industry: Optional[str] = None
    website: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None

    @field_validator("name", "industry", "website", "location", "description", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        if not v:
            raise ValueError("Company ka naam zaroori hai.")
        if len(v) > 100:
            raise ValueError("Naam 100 characters se chhota hona chahiye.")
        return v

    @field_validator("website")
    @classmethod
    def _site(cls, v):
        if v and (len(v) > 200 or not v.lower().startswith(("http://", "https://"))):
            raise ValueError("Website http:// ya https:// se shuru honi chahiye.")
        return v

    @field_validator("industry", "location")
    @classmethod
    def _short(cls, v):
        if v and len(v) > 100:
            raise ValueError("Industry/Location 100 characters se chhota hona chahiye.")
        return v

    @field_validator("description")
    @classmethod
    def _desc(cls, v):
        if v and len(v) > 1000:
            raise ValueError("Description 1000 characters se chhota hona chahiye.")
        return v


class AdminDriveIn(BaseModel):
    company_id: str
    role_title: str
    package_lpa: float
    job_type: str = "Full time"
    mode: str = "On campus"
    location: Optional[str] = None
    drive_date: date
    apply_by: date
    description: Optional[str] = None
    selection_process: Optional[str] = None
    skills: Optional[str] = None
    min_cgpa: Optional[float] = None
    max_backlogs: Optional[int] = None
    courses: Optional[List[str]] = None

    @field_validator("company_id", "role_title", "location", "description", "selection_process", "skills", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("role_title")
    @classmethod
    def _role(cls, v):
        if not v:
            raise ValueError("Role ka naam zaroori hai.")
        if len(v) > 100:
            raise ValueError("Role 100 characters se chhota hona chahiye.")
        return v

    @field_validator("package_lpa")
    @classmethod
    def _pkg(cls, v):
        if not 0.1 <= v <= 200:
            raise ValueError("Package 0.1 se 200 LPA ke beech hona chahiye.")
        return round(v, 2)

    @field_validator("job_type")
    @classmethod
    def _jt(cls, v):
        return _choice(v, DRIVE_JOB_TYPES, "Job type")

    @field_validator("mode")
    @classmethod
    def _mode(cls, v):
        return _choice(v, DRIVE_MODES, "Mode")

    @field_validator("min_cgpa")
    @classmethod
    def _cgpa(cls, v):
        if v is not None and not 0 <= v <= 10:
            raise ValueError("Minimum CGPA 0 se 10 ke beech hona chahiye.")
        return v

    @field_validator("max_backlogs")
    @classmethod
    def _bk(cls, v):
        if v is not None and not 0 <= v <= 20:
            raise ValueError("Max backlogs 0 se 20 ke beech hone chahiye.")
        return v

    @field_validator("skills")
    @classmethod
    def _skills(cls, v):
        if v and len(v) > 300:
            raise ValueError("Skills 300 characters se chhoti honi chahiye.")
        return v

    @field_validator("selection_process", "description")
    @classmethod
    def _long(cls, v):
        if v and len(v) > 1500:
            raise ValueError("Text 1500 characters se chhota hona chahiye.")
        return v

    @field_validator("apply_by")
    @classmethod
    def _dates(cls, v, info):
        d = info.data.get("drive_date")
        if d and v > d:
            raise ValueError("Apply-by date drive date se pehle (ya usi din) honi chahiye.")
        return v


class AdminApplicationStatusIn(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def _st(cls, v):
        return _choice(v, APPLICATION_STATUSES, "Status")


class AdminInterviewIn(BaseModel):
    round_name: str
    scheduled_at: datetime
    mode: str = "In person"
    venue: Optional[str] = None
    instructions: Optional[str] = None

    @field_validator("round_name", "venue", "instructions", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("round_name")
    @classmethod
    def _round(cls, v):
        if not v:
            raise ValueError("Round ka naam zaroori hai.")
        if len(v) > 60:
            raise ValueError("Round ka naam 60 characters se chhota hona chahiye.")
        return v

    @field_validator("mode")
    @classmethod
    def _mode(cls, v):
        return _choice(v, INTERVIEW_MODES, "Mode")

    @field_validator("venue")
    @classmethod
    def _venue(cls, v):
        if v and len(v) > 200:
            raise ValueError("Venue/link 200 characters se chhota hona chahiye.")
        return v

    @field_validator("instructions")
    @classmethod
    def _ins(cls, v):
        if v and len(v) > 500:
            raise ValueError("Instructions 500 characters se chhoti honi chahiye.")
        return v


class AdminInterviewUpdateIn(BaseModel):
    status: str
    result: Optional[str] = None

    @field_validator("status")
    @classmethod
    def _st(cls, v):
        return _choice(v, ["completed", "cancelled"], "Status")

    @field_validator("result")
    @classmethod
    def _res(cls, v):
        return _choice(v, ["cleared", "not_cleared"], "Result") if v else v


class AdminOfferIn(BaseModel):
    joining_date: Optional[date] = None


class AdminPlacementStatIn(BaseModel):
    academic_year: str
    total_students: int
    placed_students: int
    offers_made: int
    companies_visited: int
    highest_package: float
    average_package: float
    median_package: float

    @field_validator("academic_year", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("academic_year")
    @classmethod
    def _year(cls, v):
        if not v or not _re.match(r"^\d{4}-\d{2}$", v):
            raise ValueError("Academic year aise likho: 2025-26")
        return v

    @field_validator("total_students", "placed_students", "offers_made", "companies_visited")
    @classmethod
    def _int(cls, v):
        if not 0 <= v <= 100000:
            raise ValueError("Count 0 se 1,00,000 ke beech hona chahiye.")
        return v

    @field_validator("highest_package", "average_package", "median_package")
    @classmethod
    def _pkg(cls, v):
        if not 0 <= v <= 500:
            raise ValueError("Package 0 se 500 LPA ke beech hona chahiye.")
        return round(v, 2)


class AdminRecruiterIn(BaseModel):
    academic_year: str
    company_name: str
    offers: int
    highest_package: Optional[float] = None

    @field_validator("academic_year", "company_name", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("academic_year")
    @classmethod
    def _year(cls, v):
        if not v or not _re.match(r"^\d{4}-\d{2}$", v):
            raise ValueError("Academic year aise likho: 2025-26")
        return v

    @field_validator("company_name")
    @classmethod
    def _name(cls, v):
        if not v or len(v) > 100:
            raise ValueError("Company ka naam zaroori hai (max 100 characters).")
        return v

    @field_validator("offers")
    @classmethod
    def _offers(cls, v):
        if not 1 <= v <= 10000:
            raise ValueError("Offers 1 se 10,000 ke beech hone chahiye.")
        return v

    @field_validator("highest_package")
    @classmethod
    def _hp(cls, v):
        if v is not None and not 0 <= v <= 500:
            raise ValueError("Package 0 se 500 LPA ke beech hona chahiye.")
        return v

class AdminComplaintUpdateIn(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    note: Optional[str] = None

    @field_validator("status", "assigned_to", "note", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        if v is None:
            return v
        v = v.lower()
        if v not in ("in_progress", "resolved"):
            raise ValueError("Status in_progress ya resolved hona chahiye.")
        return v

    @field_validator("assigned_to")
    @classmethod
    def _assigned(cls, v):
        if v and len(v) > 80:
            raise ValueError("Department/office ka naam 80 characters se chhota hona chahiye.")
        return v

    @field_validator("note")
    @classmethod
    def _note(cls, v):
        if v and len(v) > 1000:
            raise ValueError("Note 1000 characters se chhota hona chahiye.")
        return v

class AdminMentorAssignIn(BaseModel):
    faculty_id: str
    student_ids: List[str]
    cabin: Optional[str] = None
    availability: Optional[str] = None

    @field_validator("faculty_id", "cabin", "availability", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("student_ids")
    @classmethod
    def _ids(cls, v):
        if not v:
            raise ValueError("Kam se kam ek student chuno.")
        if len(v) > 200:
            raise ValueError("Ek baar me 200 se zyada students nahi.")
        return list(dict.fromkeys(v))

    @field_validator("cabin")
    @classmethod
    def _cabin(cls, v):
        if v and len(v) > 40:
            raise ValueError("Cabin 40 characters se chhota hona chahiye.")
        return v

    @field_validator("availability")
    @classmethod
    def _avail(cls, v):
        if v and len(v) > 100:
            raise ValueError("Availability 100 characters se chhoti honi chahiye.")
        return v


class AdminMentorClassIn(BaseModel):
    faculty_id: str
    course_id: str
    semester: int
    only_unassigned: bool = True

    @field_validator("semester")
    @classmethod
    def _sem(cls, v):
        if not 1 <= v <= 12:
            raise ValueError("Semester 1 se 12 ke beech hona chahiye.")
        return v


class AdminMentorUnassignIn(BaseModel):
    student_ids: List[str]

    @field_validator("student_ids")
    @classmethod
    def _ids(cls, v):
        if not v:
            raise ValueError("Kam se kam ek student chuno.")
        if len(v) > 200:
            raise ValueError("Ek baar me 200 se zyada students nahi.")
        return list(dict.fromkeys(v))


class AdminMentorDetailsIn(BaseModel):

    cabin: Optional[str] = None
    availability: Optional[str] = None

    GALLERY_CATEGORIES: ClassVar[list[str]] = [
        "event",
        "workshop",
        "sports",
        "cultural",
        "achievement"
    ]

    @field_validator("cabin", "availability", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("cabin")
    @classmethod
    def _cabin(cls, v):
        if v and len(v) > 40:
            raise ValueError("Cabin 40 characters se chhota hona chahiye.")
        return v

    @field_validator("availability")
    @classmethod
    def _avail(cls, v):
        if v and len(v) > 100:
            raise ValueError("Availability 100 characters se chhoti honi chahiye.")
        return v

class AdminAlbumIn(BaseModel):
    category: str
    title: str
    description: Optional[str] = None
    event_date: Optional[date] = None

    @field_validator("category", "title", "description", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("event_date", mode="before")
    @classmethod
    def _blank_date(cls, v):
        return None if v in ("", None) else v

    @field_validator("category")
    @classmethod
    def _cat(cls, v):
        return _choice(v, GALLERY_CATEGORIES, "Category")

    @field_validator("title")
    @classmethod
    def _title(cls, v):
        if not v:
            raise ValueError("Album ka title zaroori hai.")
        if len(v) > 100:
            raise ValueError("Title 100 characters se chhota hona chahiye.")
        return v

    @field_validator("description")
    @classmethod
    def _desc(cls, v):
        if v and len(v) > 500:
            raise ValueError("Description 500 characters se chhota hona chahiye.")
        return v


class AdminPhotoIn(BaseModel):
    caption: Optional[str] = None

    @field_validator("caption", mode="before")
    @classmethod
    def _strip(cls, v):
        return _clean(v)

    @field_validator("caption")
    @classmethod
    def _cap(cls, v):
        if v and len(v) > 150:
            raise ValueError("Caption 150 characters se chhota hona chahiye.")
        return v

class FacultyProfileIn(BaseModel):
    qualification: Optional[str] = Field(None, max_length=150)
    experience_years: Optional[int] = Field(None, ge=0, le=60)
    about: Optional[str] = Field(None, max_length=500)

    @field_validator("qualification", "about")
    @classmethod
    def _strip(cls, v):
        v = (v or "").strip()
        return v or None

class FacultyAttendanceRecordIn(BaseModel):
    student_id: str
    status: str

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        v = (v or "").strip().lower()
        if v not in ("present", "absent"):
            raise ValueError("Status 'present' ya 'absent' hona chahiye.")
        return v


class FacultyAttendanceMarkIn(BaseModel):
    assignment_id: str
    day: date
    records: List[FacultyAttendanceRecordIn] = Field(..., min_length=1, max_length=500)

class FacultyMarkRowIn(BaseModel):
    student_id: str
    parts: Dict[str, Optional[int]]


class FacultyMarksSaveIn(BaseModel):
    assignment_id: str
    rows: List[FacultyMarkRowIn] = Field(..., min_length=1, max_length=500)


class FacultyMarksPublishIn(BaseModel):
    assignment_id: str

class FacultyFaceEnrollIn(BaseModel):
    assignment_id: str
    student_id: str
    descriptor: List[float] = Field(min_length=128, max_length=128)
    consent: bool = False


class FacultyFaceMatchIn(BaseModel):
    assignment_id: str
    descriptors: List[List[float]] = Field(min_length=1, max_length=100)

class FacultyTaskIn(BaseModel):
    class_id: str
    title: str = Field(..., min_length=3, max_length=150)
    description: Optional[str] = Field(None, max_length=2000)
    max_marks: int = Field(..., ge=1, le=100)
    due_at: datetime

    @field_validator("title", "description")
    @classmethod
    def _strip(cls, v):
        v = (v or "").strip()
        return v or None


class FacultyTaskUpdateIn(BaseModel):
    title: str = Field(..., min_length=3, max_length=150)
    description: Optional[str] = Field(None, max_length=2000)
    max_marks: int = Field(..., ge=1, le=100)
    due_at: datetime

    @field_validator("title", "description")
    @classmethod
    def _strip(cls, v):
        v = (v or "").strip()
        return v or None


class FacultyGradeIn(BaseModel):
    student_id: str
    marks: int = Field(..., ge=0, le=100)
    feedback: Optional[str] = Field(None, max_length=1000)

    @field_validator("feedback")
    @classmethod
    def _strip(cls, v):
        v = (v or "").strip()
        return v or None

class FacultyNoticeIn(BaseModel):
    kind: str
    title: str = Field(..., min_length=3, max_length=150)
    body: str = Field(..., min_length=3, max_length=2000)
    is_important: bool = False
    event_date: Optional[date] = None
    event_time: Optional[str] = Field(None, max_length=5)
    venue: Optional[str] = Field(None, max_length=150)

    @field_validator("kind")
    @classmethod
    def _kind(cls, v):
        v = (v or "").strip().lower()
        if v not in ("department", "event"):
            raise ValueError("Type 'department' ya 'event' hona chahiye.")
        return v

    @field_validator("title", "body", "venue")
    @classmethod
    def _strip(cls, v):
        v = (v or "").strip()
        return v or None

    @field_validator("event_time")
    @classmethod
    def _time(cls, v):
        v = (v or "").strip()
        if not v:
            return None
        if not _re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v):
            raise ValueError("Time HH:MM format me do.")
        return v


class FacultyAnnouncementIn(BaseModel):
    class_id: str
    title: str = Field(..., min_length=3, max_length=100)
    body: str = Field(..., min_length=3, max_length=400)

    @field_validator("title", "body")
    @classmethod
    def _strip(cls, v):
        return (v or "").strip()

class FacultyMentorMessageIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=1000)

    @field_validator("body")
    @classmethod
    def _strip(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("Message khali nahi ho sakta.")
        return v


class FacultyMeetingRespondIn(BaseModel):
    action: str
    response: Optional[str] = Field(None, max_length=500)

    @field_validator("action")
    @classmethod
    def _action(cls, v):
        v = (v or "").strip().lower()
        if v not in ("approve", "reject", "complete"):
            raise ValueError("Action approve, reject ya complete hona chahiye.")
        return v

    @field_validator("response")
    @classmethod
    def _strip(cls, v):
        v = (v or "").strip()
        return v or None


class FacultyMentorNoteIn(BaseModel):
    note_type: str
    title: str = Field(..., min_length=3, max_length=150)
    body: str = Field(..., min_length=3, max_length=2000)
    action_points: Optional[str] = Field(None, max_length=1000)

    @field_validator("note_type")
    @classmethod
    def _type(cls, v):
        v = (v or "").strip().lower()
        if v not in ("progress", "guidance"):
            raise ValueError("Note type progress ya guidance hona chahiye.")
        return v

    @field_validator("title", "body", "action_points")
    @classmethod
    def _strip2(cls, v):
        v = (v or "").strip()
        return v or None

class FacultyComplaintUpdateIn(BaseModel):
    status: Optional[str] = None
    note: Optional[str] = None

    @field_validator("status", "note", mode="before")
    @classmethod
    def _strip(cls, v):
        v = (v or "").strip() if isinstance(v, str) or v is None else v
        return v or None

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        if v is None:
            return v
        v = v.lower()
        if v not in ("in_progress", "resolved"):
            raise ValueError("Status in_progress ya resolved hona chahiye.")
        return v

    @field_validator("note")
    @classmethod
    def _note(cls, v):
        if v and len(v) > 1000:
            raise ValueError("Note 1000 characters se chhota hona chahiye.")
        return 

class FacultyMaterialUpdateIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    is_visible: Optional[bool] = None

class FacultyQrStartIn(BaseModel):
    assignment_id: str
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy: float = Field(default=0, ge=0)
    radius_m: int = Field(default=100, ge=30, le=500)
    minutes: int = Field(default=10, ge=1, le=60)


class StudentQrScanIn(BaseModel):
    code: str = Field(max_length=200)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy: float = Field(default=0, ge=0)

class FacultyExamCopyVisibilityIn(BaseModel):
    is_visible: bool

class FacultyExamIn(BaseModel):
    assignment_id: str
    name: str = Field(min_length=2, max_length=120)
    exam_type: str = Field(min_length=2, max_length=40)
    max_marks: float = Field(gt=0, le=1000)
    pass_percent: float = Field(default=40, ge=0, le=100)
    exam_date: Optional[date] = None
    duration_min: int = Field(default=60, ge=0, le=600)
    instructions: str = Field(default="", max_length=2000)


class FacultyExamUpdateIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    exam_type: str = Field(min_length=2, max_length=40)
    max_marks: float = Field(gt=0, le=1000)
    pass_percent: float = Field(default=40, ge=0, le=100)
    exam_date: Optional[date] = None
    duration_min: int = Field(default=60, ge=0, le=600)
    instructions: str = Field(default="", max_length=2000)


class FacultyExamMarkRow(BaseModel):
    student_id: str
    marks: Optional[float] = None
    absent: bool = False
    remarks: str = Field(default="", max_length=200)


class FacultyExamMarksIn(BaseModel):
    rows: list[FacultyExamMarkRow] = Field(max_length=500)


class FacultyExamPublishIn(BaseModel):
    publish: bool


class FacultyExamReleaseIn(BaseModel):
    released: bool

class FacultyPlanLinkIn(BaseModel):
    assignment_id: str
    subject_id: str


class FacultyPlanUnitIn(BaseModel):
    assignment_id: str
    unit_id: str
    planned_start: Optional[date] = None
    planned_end: Optional[date] = None


class FacultyPlanTopicsIn(BaseModel):
    assignment_id: str
    unit_id: str
    keys: List[str] = Field(min_length=1, max_length=200)
    done: bool
    done_on: Optional[date] = None

class AdminWardenCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    login_id: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9._-]+$")
    password: str = Field(min_length=8, max_length=72)
    phone: str = Field(default="", max_length=20)


class AdminWardenActiveIn(BaseModel):
    active: bool


class AdminWardenPasswordIn(BaseModel):
    password: str = Field(min_length=8, max_length=72)


class WardenHostelIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    hostel_type: str = Field(pattern="^(Boys|Girls)$")
    address: str = Field(default="", max_length=300)
    floors: int = Field(ge=1, le=30)
    info: str = Field(default="", max_length=2000)
    warden_profile_id: Optional[str] = None
    contact_phone: str = Field(default="", max_length=20)


class WardenRoomIn(BaseModel):
    hostel_id: str
    room_no: str = Field(min_length=1, max_length=20)
    floor: int = Field(ge=0, le=30)
    room_type: str = Field(pattern="^(Single|Double|Triple)$")
    capacity: int = Field(ge=1, le=6)
    is_active: bool = True
    notes: str = Field(default="", max_length=200)


class WardenRoomUpdateIn(BaseModel):
    room_no: str = Field(min_length=1, max_length=20)
    floor: int = Field(ge=0, le=30)
    room_type: str = Field(pattern="^(Single|Double|Triple)$")
    capacity: int = Field(ge=1, le=6)
    is_active: bool = True
    notes: str = Field(default="", max_length=200)