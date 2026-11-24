const BASE_URL = '/api'
async function request(path, options = {}) {
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    // for file uploads the browser must set the Content-Type (with the multipart boundary) itself
    headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    let message = 'Something went wrong. Please try again.'
    if (typeof data.detail === 'string') {
      message = data.detail
    } else if (Array.isArray(data.detail) && data.detail.length) {
      message = data.detail.map((d) => d.msg).join(', ')
    }
    const error = new Error(message)
    error.status = res.status
    throw error
  }
  return data
}

function authedRequest(path, token, options = {}) {
  return request(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}` },
  }).catch((err) => {
    if (err.status === 401) {
      // token expired or invalid: clear the saved session and go back to login
      localStorage.removeItem('erp_session')
      window.location.reload()
    }
    throw err
  })
}

export async function registerRole(role, payload) {
  const result = await request(`/auth/register/${role}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (role === 'admin' && result && result.access_token) {
    // register sirf college_name save karta hai; baaki details alag table me jaati hain
    const extras = {}
    ;['college_code', 'address', 'city', 'state_name', 'country', 'email', 'contact_number'].forEach((k) => {
      if (payload[k]) extras[k] = payload[k]
    })
    try {
      await request('/admin/institution', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${result.access_token}` },
        body: JSON.stringify(extras),
      })
    } catch (e) {
      // account ban chuka hai; details baad me College Information page se bhar sakte ho
    }
  }
  return result
}


export function login(role, username, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ role, username, password }),
  })
}

export function getStudentProfile(token) {
  return authedRequest('/student/profile', token)
}

export function saveStudentProfile(token, payload) {
  return authedRequest('/student/profile', token, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function getAttendanceSummary(token) {
  return authedRequest('/student/attendance/summary', token)
}

export function getAttendanceMonth(token, year, month) {
  return authedRequest(`/student/attendance/monthly?year=${year}&month=${month}`, token)
}

export function getAttendanceHistory(token, page = 1, pageSize = 15) {
  return authedRequest(`/student/attendance/history?page=${page}&page_size=${pageSize}`, token)
}

// DEV ONLY: fills sample attendance until the Faculty module can mark it.
export function seedDemoAttendance(token) {
  return authedRequest('/student/attendance/demo-seed', token, { method: 'POST' })
}

export function getResultsOverview(token) {
  return authedRequest('/student/results/overview', token)
}

// DEV ONLY: fills sample marks until the Faculty / Admin modules can publish them.
export function seedDemoResults(token) {
  return authedRequest('/student/results/demo-seed', token, { method: 'POST' })
}

export function getTimetableOverview(token) {
  return authedRequest('/student/timetable/overview', token)
}

// DEV ONLY: creates a sample timetable for the student's class until the Admin module exists.
export function seedDemoTimetable(token) {
  return authedRequest('/student/timetable/demo-seed', token, { method: 'POST' })
}

export function getAttendanceRange(token, start, end, subject = '') {
  const subjectPart = subject ? `&subject=${encodeURIComponent(subject)}` : ''
  return authedRequest(`/student/attendance/range?start=${start}&end=${end}${subjectPart}`, token)
}

export function getAssignments(token) {
  return authedRequest('/student/assignments/overview', token)
}

export function submitAssignment(token, assignmentId, file, note) {
  const form = new FormData()
  if (file) form.append('file', file)
  form.append('note', note || '')
  return authedRequest(`/student/assignments/${assignmentId}/submit`, token, { method: 'POST', body: form })
}

// downloads the student's own submitted file (needs the Authorization header, so a plain link will not work)
export async function downloadSubmission(token, assignmentId, fileName) {
  const res = await fetch(`${BASE_URL}/student/assignments/${assignmentId}/file`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Could not download the file.')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName || 'submission'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// DEV ONLY: creates sample assignments for the student's class until the Faculty module exists.
export function seedDemoAssignments(token) {
  return authedRequest('/student/assignments/demo-seed', token, { method: 'POST' })
}

export function getFeesOverview(token) {
  return authedRequest('/student/fees/overview', token)
}

export function getFeeReceipt(token, receiptNo) {
  return authedRequest(`/student/fees/receipts/${encodeURIComponent(receiptNo)}`, token)
}

// DEV ONLY: creates a sample fee structure and payments until the Admin module exists.
export function seedDemoFees(token) {
  return authedRequest('/student/fees/demo-seed', token, { method: 'POST' })
}

export function getLibraryOverview(token) {
  return authedRequest('/student/library/overview', token)
}

// DEV ONLY: issues a few sample books until the librarian module exists.
export function seedDemoLibrary(token) {
  return authedRequest('/student/library/demo-seed', token, { method: 'POST' })
}

export function getNotices(token) {
  return authedRequest('/student/notices/overview', token)
}

export function markNoticeRead(token, noticeId) {
  return authedRequest(`/student/notices/${noticeId}/read`, token, { method: 'POST' })
}

export function markAllNoticesRead(token) {
  return authedRequest('/student/notices/read-all', token, { method: 'POST' })
}

// DEV ONLY: creates sample notices and events until the Admin / Faculty modules exist.
export function seedDemoNotices(token) {
  return authedRequest('/student/notices/demo-seed', token, { method: 'POST' })
}

export function getSyllabus(token) {
  return authedRequest('/student/syllabus/overview', token)
}

// DEV ONLY: creates a sample syllabus for the student's course until the Admin module exists.
export function seedDemoSyllabus(token) {
  return authedRequest('/student/syllabus/demo-seed', token, { method: 'POST' })
}

export function getGallery(token) {
  return authedRequest('/student/gallery/overview', token)
}

// DEV ONLY: creates sample albums (with generated sample pictures) until the Admin module can upload photos.
export function seedDemoGallery(token) {
  return authedRequest('/student/gallery/demo-seed', token, { method: 'POST' })
}

export function getMentorOverview(token) {
  return authedRequest('/student/mentor/overview', token)
}

export function getMentorMessages(token) {
  return authedRequest('/student/mentor/messages', token)
}

export function sendMentorMessage(token, body) {
  return authedRequest('/student/mentor/messages', token, { method: 'POST', body: JSON.stringify({ body }) })
}

export function markMentorMessagesRead(token) {
  return authedRequest('/student/mentor/messages/read', token, { method: 'POST' })
}

export function requestMentorMeeting(token, payload) {
  return authedRequest('/student/mentor/meetings', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function cancelMentorMeeting(token, meetingId) {
  return authedRequest(`/student/mentor/meetings/${meetingId}/cancel`, token, { method: 'POST' })
}

// DEV ONLY: assigns a sample mentor with a sample chat, meetings and notes until the Faculty module exists.
export function seedDemoMentor(token) {
  return authedRequest('/student/mentor/demo-seed', token, { method: 'POST' })
}

export function getComplaints(token) {
  return authedRequest('/student/complaints/overview', token)
}

export function createComplaint(token, { category, subject, description, files }) {
  const form = new FormData()
  form.append('category', category)
  form.append('subject', subject)
  form.append('description', description)
  ;(files || []).forEach((f) => form.append('files', f))
  return authedRequest('/student/complaints', token, { method: 'POST', body: form })
}

export function markComplaintSeen(token, complaintId) {
  return authedRequest(`/student/complaints/${complaintId}/seen`, token, { method: 'POST' })
}

export function submitComplaintFeedback(token, complaintId, rating, comment) {
  return authedRequest(`/student/complaints/${complaintId}/feedback`, token, {
    method: 'POST',
    body: JSON.stringify({ rating, comment: comment || null }),
  })
}

// downloads one of the student's own attachments (needs the Authorization header, so a plain link will not work)
export async function downloadComplaintFile(token, complaintId, attachmentId, fileName) {
  const res = await fetch(`${BASE_URL}/student/complaints/${complaintId}/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Could not download the file.')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName || 'attachment'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// DEV ONLY: creates sample complaints (pending, in progress, resolved) until the Admin / staff modules exist.
export function seedDemoComplaints(token) {
  return authedRequest('/student/complaints/demo-seed', token, { method: 'POST' })
}

// ---------- Student: QR Attendance ----------
export const getQrOverview = () => _docFetch('/api/student/attendance-qr/overview')

export const scanQrAttendance = (token) =>
  _docFetch('/api/student/attendance-qr/scan', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })

export const createDemoQrSession = (subject) =>
  _docFetch('/api/student/attendance-qr/demo-session', {
    method: 'POST',
    body: JSON.stringify({ subject }),
  })

// ---------- Student: Documents ----------
function _docToken() {
  try {
    return JSON.parse(localStorage.getItem('erp_session'))?.access_token || null
  } catch {
    return null
  }
}

async function _docFetch(path, options = {}, asBlob = false) {
  const headers = { Authorization: `Bearer ${_docToken()}`, ...(options.headers || {}) }
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(path, { ...options, headers })
  if (res.status === 401) {
    localStorage.removeItem('erp_session')
    window.location.reload()
    throw new Error('Session expire ho gaya')
  }
  if (!res.ok) {
    let msg = 'Request fail ho gayi'
    try {
      const d = await res.json()
      if (typeof d.detail === 'string') msg = d.detail
    } catch (e) {
      /* ignore */
    }
    throw new Error(msg)
  }
  return asBlob ? res.blob() : res.json()
}

export const getDocumentsOverview = () => _docFetch('/api/student/documents/overview')

export const requestStudentDocument = (doc_type, purpose) =>
  _docFetch('/api/student/documents/request', {
    method: 'POST',
    body: JSON.stringify({ doc_type, purpose }),
  })

export const uploadStudentDocument = (title, doc_type, file) => {
  const fd = new FormData()
  fd.append('title', title)
  fd.append('doc_type', doc_type)
  fd.append('file', file)
  return _docFetch('/api/student/documents/upload', { method: 'POST', body: fd })
}

export const deleteStudentDocument = (id) =>
  _docFetch(`/api/student/documents/${id}`, { method: 'DELETE' })

export const seedDocumentsDemo = () =>
  _docFetch('/api/student/documents/demo-seed', { method: 'POST' })

export async function openStudentDocument(id) {
  const blob = await _docFetch(`/api/student/documents/${id}/file`, {}, true)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
// ---------- Student: AI Analytics ----------
export const getStudentAnalytics = () => _docFetch('/api/student/analytics/overview')

export function getPlacement(token) {
  return authedRequest('/student/placement/overview', token)
}

export function applyToDrive(token, driveId) {
  return authedRequest(`/student/placement/drives/${driveId}/apply`, token, { method: 'POST' })
}

export function withdrawApplication(token, applicationId) {
  return authedRequest(`/student/placement/applications/${applicationId}/withdraw`, token, { method: 'POST' })
}

export function uploadResume(token, file) {
  const form = new FormData()
  form.append('file', file)
  return authedRequest('/student/placement/resume', token, { method: 'POST', body: form })
}

// downloads the student's own resume (needs the Authorization header, so a plain link will not work)
export async function downloadResume(token, fileName) {
  const res = await fetch(`${BASE_URL}/student/placement/resume/file`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Could not download the resume.')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName || 'resume'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// DEV ONLY: creates sample companies, drives, applications and statistics until the Admin module exists.
export function seedDemoPlacement(token) {
  return authedRequest('/student/placement/demo-seed', token, { method: 'POST' })
}

export function uploadStudentPhoto(token, file) {
  const form = new FormData()
  form.append('file', file)
  return authedRequest('/student/photo', token, { method: 'POST', body: form })
}

export function deleteStudentPhoto(token) {
  return authedRequest('/student/photo', token, { method: 'DELETE' })
}

// Returns a temporary browser URL of the student's photo, or null when there is no photo.
// A plain <img src> cannot send the login token, so the picture is fetched and turned into a blob URL.
export async function fetchStudentPhotoUrl(token) {
  try {
    const res = await fetch(`${BASE_URL}/student/photo`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return URL.createObjectURL(await res.blob())
  } catch {
    return null
  }
}
// ---------- Student: Leave ----------
export const getLeaveOverview = () => _docFetch('/api/student/leave/overview')

export const getLeaveImpact = ({ leaveType, fromDate, toDate, halfDay }) => {
  const q = new URLSearchParams({
    leave_type: leaveType,
    from_date: fromDate,
    to_date: toDate,
    is_half_day: halfDay ? 'true' : 'false',
  })
  return _docFetch(`/api/student/leave/impact?${q.toString()}`)
}

export const applyLeave = ({ leaveType, fromDate, toDate, halfDay, reason, file }) => {
  const fd = new FormData()
  fd.append('leave_type', leaveType)
  fd.append('from_date', fromDate)
  fd.append('to_date', toDate)
  fd.append('is_half_day', halfDay ? 'true' : 'false')
  fd.append('reason', reason)
  if (file) fd.append('file', file)
  return _docFetch('/api/student/leave/apply', { method: 'POST', body: fd })
}

export const cancelLeave = (id) =>
  _docFetch(`/api/student/leave/${id}/cancel`, { method: 'POST' })

export const markLeaveSeen = (id) =>
  _docFetch(`/api/student/leave/${id}/seen`, { method: 'POST' })

export const seedLeaveDemo = () =>
  _docFetch('/api/student/leave/demo-seed', { method: 'POST' })

export async function openLeaveAttachment(id) {
  const blob = await _docFetch(`/api/student/leave/${id}/attachment`, {}, true)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

// ------------------------------------------------------------ shared download helpers
function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName || 'download'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function errorFrom(res, fallback) {
  try {
    const d = await res.json()
    if (d && typeof d.detail === 'string') return d.detail
  } catch {
    /* not JSON */
  }
  return fallback
}

// downloads a file that needs the login token (a plain link cannot send it)
export async function downloadAuthed(path, token, fileName) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(await errorFrom(res, 'Could not download the file.'))
  saveBlob(await res.blob(), fileName)
}

// opens a file (for example a PDF) in a new browser tab
export async function openAuthedInTab(path, token, fileName) {
  const win = window.open('', '_blank')
  try {
    const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(await errorFrom(res, 'Could not open the file.'))
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    if (win) win.location.href = url
    else saveBlob(blob, fileName) // pop-up blocked: download instead
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch (e) {
    if (win) win.close()
    throw e
  }
}

// ------------------------------------------------------------ payments
export function startPayment(token, body) {
  return authedRequest('/student/payments/start', token, { method: 'POST', body: JSON.stringify(body) })
}

export function confirmPayment(token, orderId, body) {
  return authedRequest(`/student/payments/${orderId}/confirm`, token, { method: 'POST', body: JSON.stringify(body) })
}

export function cancelPayment(token, orderId) {
  return authedRequest(`/student/payments/${orderId}/cancel`, token, { method: 'POST' })
}

// ------------------------------------------------------------ library
export function renewBook(token, issueId) {
  return authedRequest(`/student/library/issues/${issueId}/renew`, token, { method: 'POST' })
}

export function getEbooks(token) {
  return authedRequest('/student/library/ebooks', token)
}

export function downloadEbook(token, ebook) {
  return downloadAuthed(`/student/library/ebooks/${ebook.id}/file`, token, ebook.file_name)
}

export function readEbook(token, ebook) {
  return openAuthedInTab(`/student/library/ebooks/${ebook.id}/file`, token, ebook.file_name)
}

// DEV ONLY: creates sample e-books until the admin uploads real ones.
export function seedDemoEbooks(token) {
  return authedRequest('/student/library/ebooks/demo-seed', token, { method: 'POST' })
}

// ------------------------------------------------------------ syllabus pdf
export function downloadSyllabusPdf(token, { semester, subjectId }, fileName) {
  const query = subjectId ? `subject_id=${subjectId}` : `semester=${semester}`
  return downloadAuthed(`/student/syllabus/pdf?${query}`, token, fileName)
}

// ------------------------------------------------------------ mentor documents
export function sendMentorMessageWithFile(token, body, file) {
  const form = new FormData()
  form.append('body', body || '')
  if (file) form.append('file', file)
  return authedRequest('/student/mentor/messages/upload', token, { method: 'POST', body: form })
}

export function downloadMentorFile(token, message) {
  return downloadAuthed(
    `/student/mentor/messages/${message.id}/file`,
    token,
    message.attachment ? message.attachment.file_name : 'document'
  )
}

// ------------------------------------------------------------ notifications
export function getNotifications(token) {
  return authedRequest('/student/notifications', token)
}

export function markNotificationRead(token, id) {
  return authedRequest(`/student/notifications/${id}/read`, token, { method: 'POST' })
}

export function markAllNotificationsRead(token) {
  return authedRequest('/student/notifications/read-all', token, { method: 'POST' })
}

// DEV ONLY: adds three sample notifications.
export function seedDemoNotifications(token) {
  return authedRequest('/student/notifications/demo-seed', token, { method: 'POST' })
}

export const getHostelOverview = () => _docFetch('/api/student/hostel/overview')

export const createHostelRequest = (body) =>
  _docFetch('/api/student/hostel/requests', { method: 'POST', body: JSON.stringify(body) })

export const cancelHostelRequest = (id) =>
  _docFetch(`/api/student/hostel/requests/${id}/cancel`, { method: 'POST' })

export const createHostelComplaint = ({ category, title, description, files }) => {
  const fd = new FormData()
  fd.append('category', category)
  fd.append('title', title)
  fd.append('description', description)
  ;(files || []).forEach((f) => fd.append('files', f))
  return _docFetch('/api/student/hostel/complaints', { method: 'POST', body: fd })
}

export async function openHostelPhoto(id) {
  const blob = await _docFetch(`/api/student/hostel/complaints/photo/${id}`, {}, true)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export const registerHostelVisitor = (body) =>
  _docFetch('/api/student/hostel/visitors', { method: 'POST', body: JSON.stringify(body) })

export const cancelHostelVisitor = (id) =>
  _docFetch(`/api/student/hostel/visitors/${id}/cancel`, { method: 'POST' })

export const sendMessFeedback = (body) =>
  _docFetch('/api/student/hostel/mess/feedback', { method: 'POST', body: JSON.stringify(body) })

export const markHostelSeen = (kind, id) =>
  _docFetch('/api/student/hostel/seen', { method: 'POST', body: JSON.stringify({ kind, id }) })

export const seedHostelDemo = () => _docFetch('/api/student/hostel/demo-seed', { method: 'POST' })

export function getAdminOverview(token) {
  return authedRequest('/admin/dashboard/overview', token)
}

export function getAdminActivities(token, { q = '', page = 1, pageSize = 20 } = {}) {
  const qs = new URLSearchParams({ q, page, page_size: pageSize })
  return authedRequest(`/admin/dashboard/activities?${qs.toString()}`, token)
}

export function getInstitution(token) {
  return authedRequest('/admin/institution', token)
}

export function saveInstitution(token, payload) {
  return authedRequest('/admin/institution', token, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}


export function listDepartments(token, { q = '', status = '', page = 1, pageSize = 10 } = {}) {
  const qs = new URLSearchParams({ q, page, page_size: pageSize })
  if (status) qs.set('status', status)
  return authedRequest(`/admin/departments?${qs.toString()}`, token)
}

export function createDepartment(token, payload) {
  return authedRequest('/admin/departments', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function updateDepartment(token, id, payload) {
  return authedRequest(`/admin/departments/${id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
}

export function toggleDepartment(token, id) {
  return authedRequest(`/admin/departments/${id}/toggle`, token, { method: 'POST' })
}

export function deleteDepartment(token, id) {
  return authedRequest(`/admin/departments/${id}`, token, { method: 'DELETE' })
}
export function listCourses(token, { q = '', status = '', departmentId = '', page = 1, pageSize = 10 } = {}) {
  const qs = new URLSearchParams({ q, page, page_size: pageSize })
  if (status) qs.set('status', status)
  if (departmentId) qs.set('department_id', departmentId)
  return authedRequest(`/admin/courses?${qs.toString()}`, token)
}

export function createCourse(token, payload) {
  return authedRequest('/admin/courses', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function updateCourse(token, id, payload) {
  return authedRequest(`/admin/courses/${id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
}

export function toggleCourse(token, id) {
  return authedRequest(`/admin/courses/${id}/toggle`, token, { method: 'POST' })
}

export function deleteCourse(token, id) {
  return authedRequest(`/admin/courses/${id}`, token, { method: 'DELETE' })
}
export function listSubjects(token, { q = '', status = '', courseId = '', semester = '', page = 1, pageSize = 10 } = {}) {
  const qs = new URLSearchParams({ q, page, page_size: pageSize })
  if (status) qs.set('status', status)
  if (courseId) qs.set('course_id', courseId)
  if (semester) qs.set('semester', semester)
  return authedRequest(`/admin/subjects?${qs.toString()}`, token)
}

export function createSubject(token, payload) {
  return authedRequest('/admin/subjects', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function updateSubject(token, id, payload) {
  return authedRequest(`/admin/subjects/${id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
}

export function toggleSubject(token, id) {
  return authedRequest(`/admin/subjects/${id}/toggle`, token, { method: 'POST' })
}

export function deleteSubject(token, id) {
  return authedRequest(`/admin/subjects/${id}`, token, { method: 'DELETE' })
}

export function listFaculty(token, { q = '', status = '', departmentId = '', page = 1, pageSize = 10 } = {}) {
  const qs = new URLSearchParams({ q, page, page_size: pageSize })
  if (status) qs.set('status', status)
  if (departmentId) qs.set('department_id', departmentId)
  return authedRequest(`/admin/faculty?${qs.toString()}`, token)
}

export function createFaculty(token, payload) {
  return authedRequest('/admin/faculty', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function updateFaculty(token, id, payload) {
  return authedRequest(`/admin/faculty/${id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
}

export function toggleFaculty(token, id) {
  return authedRequest(`/admin/faculty/${id}/toggle`, token, { method: 'POST' })
}

export function resetFacultyPassword(token, id, password) {
  return authedRequest(`/admin/faculty/${id}/reset-password`, token, { method: 'POST', body: JSON.stringify({ password }) })
}

export function seedDemoFaculty(token) {
  return authedRequest('/admin/faculty/demo-seed', token, { method: 'POST' })
}

export function listStudents(token, { q = '', status = '', course = '', semester = '', page = 1, pageSize = 10 } = {}) {
  const qs = new URLSearchParams({ q, page, page_size: pageSize })
  if (status) qs.set('status', status)
  if (course) qs.set('course', course)
  if (semester) qs.set('semester', semester)
  return authedRequest(`/admin/students?${qs.toString()}`, token)
}

export function createStudent(token, payload) {
  return authedRequest('/admin/students', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function updateStudent(token, id, payload) {
  return authedRequest(`/admin/students/${id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
}

export function toggleStudent(token, id, reason = '') {
  return authedRequest(`/admin/students/${id}/toggle`, token, { method: 'POST', body: JSON.stringify({ reason }) })
}

export function resetStudentPassword(token, id, password) {
  return authedRequest(`/admin/students/${id}/reset-password`, token, { method: 'POST', body: JSON.stringify({ password }) })
}

export function promoteStudents(token, studentIds) {
  return authedRequest('/admin/students/promote', token, { method: 'POST', body: JSON.stringify({ student_ids: studentIds }) })
}

export function transferStudents(token, studentIds, courseId, semester) {
  return authedRequest('/admin/students/transfer', token, {
    method: 'POST',
    body: JSON.stringify({ student_ids: studentIds, course_id: courseId, semester: semester || null }),
  })
}

export function importStudents(token, file, defaultPassword, dryRun) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('default_password', defaultPassword || '')
  fd.append('dry_run', dryRun ? 'true' : 'false')
  return authedRequest('/admin/students/import', token, { method: 'POST', body: fd })
}

export function seedDemoStudents(token) {
  return authedRequest('/admin/students/demo-seed', token, { method: 'POST' })
}

async function _downloadCsv(path, token, filename) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('erp_session')
      window.location.reload()
    }
    const d = await res.json().catch(() => ({}))
    throw new Error(typeof d.detail === 'string' ? d.detail : 'Download nahi ho paya.')
  }
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function downloadStudentsCsv(token, { q = '', status = '', course = '', semester = '' } = {}) {
  const qs = new URLSearchParams()
  if (q) qs.set('q', q)
  if (status) qs.set('status', status)
  if (course) qs.set('course', course)
  if (semester) qs.set('semester', semester)
  return _downloadCsv(`/admin/students/export?${qs.toString()}`, token, 'students.csv')
}

export function downloadStudentTemplate(token) {
  return _downloadCsv('/admin/students/import-template', token, 'students_template.csv')
}


export function listAcademicYears(token) {
  return authedRequest('/admin/academic/years', token)
}

export function createAcademicYear(token, payload) {
  return authedRequest('/admin/academic/years', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function updateAcademicYear(token, id, payload) {
  return authedRequest(`/admin/academic/years/${id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
}

export function setCurrentAcademicYear(token, id) {
  return authedRequest(`/admin/academic/years/${id}/set-current`, token, { method: 'POST' })
}

export function deleteAcademicYear(token, id) {
  return authedRequest(`/admin/academic/years/${id}`, token, { method: 'DELETE' })
}

export function listTerms(token, { course = '', academicYear = '', status = '', page = 1, pageSize = 10 } = {}) {
  const qs = new URLSearchParams({ page, page_size: pageSize })
  if (course) qs.set('course', course)
  if (academicYear) qs.set('academic_year', academicYear)
  if (status) qs.set('status', status)
  return authedRequest(`/admin/academic/terms?${qs.toString()}`, token)
}

export function saveTerm(token, payload) {
  return authedRequest('/admin/academic/terms', token, { method: 'PUT', body: JSON.stringify(payload) })
}

export function deleteTerm(token, id) {
  return authedRequest(`/admin/academic/terms/${id}`, token, { method: 'DELETE' })
}

export function seedDemoAcademic(token) {
  return authedRequest('/admin/academic/demo-seed', token, { method: 'POST' })
}

export function listClassTimetable(token, courseId, semester) {
  const qs = new URLSearchParams({ course_id: courseId, semester })
  return authedRequest(`/admin/timetable/class?${qs.toString()}`, token)
}

export function timetableSummary(token) {
  return authedRequest('/admin/timetable/summary', token)
}

export function createSlot(token, payload) {
  return authedRequest('/admin/timetable', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function updateSlot(token, id, payload) {
  return authedRequest(`/admin/timetable/${id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
}

export function deleteSlot(token, id) {
  return authedRequest(`/admin/timetable/${id}`, token, { method: 'DELETE' })
}

export function seedDemoAdminTimetable(token) {
  return authedRequest('/admin/timetable/demo-seed', token, { method: 'POST' })
}

export function listExams(token, { courseId = '', semester = '', status = '', page = 1, pageSize = 10 } = {}) {
  const qs = new URLSearchParams({ page, page_size: pageSize })
  if (courseId) qs.set('course_id', courseId)
  if (semester) qs.set('semester', semester)
  if (status) qs.set('status', status)
  return authedRequest(`/admin/exams?${qs.toString()}`, token)
}

export function createExam(token, payload) {
  return authedRequest('/admin/exams', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function updateExam(token, id, payload) {
  return authedRequest(`/admin/exams/${id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
}

export function deleteExam(token, id) {
  return authedRequest(`/admin/exams/${id}`, token, { method: 'DELETE' })
}

export function seedDemoExams(token) {
  return authedRequest('/admin/exams/demo-seed', token, { method: 'POST' })
}

export function resultSubjects(token, courseId, semester) {
  const qs = new URLSearchParams({ course_id: courseId, semester })
  return authedRequest(`/admin/results/subjects?${qs.toString()}`, token)
}

export function resultMarks(token, courseId, semester, subject) {
  const qs = new URLSearchParams({ course_id: courseId, semester, subject })
  return authedRequest(`/admin/results/marks?${qs.toString()}`, token)
}

export function saveMarks(token, payload) {
  return authedRequest('/admin/results/marks', token, { method: 'PUT', body: JSON.stringify(payload) })
}

export function publishResults(token, payload) {
  return authedRequest('/admin/results/publish', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function seedAdminDemoResults(token) {
  return authedRequest('/admin/results/demo-seed', token, { method: 'POST' })
}

export function feeSummary(token) {
  return authedRequest('/admin/fees/summary', token)
}

export function feeStructure(token, courseId, semester) {
  const qs = new URLSearchParams({ course_id: courseId, semester })
  return authedRequest(`/admin/fees/structure?${qs.toString()}`, token)
}

export function saveFeeItem(token, id, payload) {
  return id
    ? authedRequest(`/admin/fees/structure/${id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
    : authedRequest('/admin/fees/structure', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function deleteFeeItem(token, id) {
  return authedRequest(`/admin/fees/structure/${id}`, token, { method: 'DELETE' })
}

export function feeCollection(token, { courseId, semester, search = '', status = '', page = 1, pageSize = 10 }) {
  const qs = new URLSearchParams({ course_id: courseId, semester, page, page_size: pageSize })
  if (search) qs.set('search', search)
  if (status) qs.set('status', status)
  return authedRequest(`/admin/fees/collection?${qs.toString()}`, token)
}

export function feeStudent(token, studentId) {
  return authedRequest(`/admin/fees/student/${studentId}`, token)
}

export function recordPayment(token, payload) {
  return authedRequest('/admin/fees/payments', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function listFeePayments(token, { search = '', page = 1, pageSize = 10 } = {}) {
  const qs = new URLSearchParams({ page, page_size: pageSize })
  if (search) qs.set('search', search)
  return authedRequest(`/admin/fees/payments?${qs.toString()}`, token)
}

export function seedDemoAdminFees(token) {
  return authedRequest('/admin/fees/demo-seed', token, { method: 'POST' })
}

export function attendanceOverview(token, { courseId, semester, threshold = 75, start = '', end = '', search = '', status = '', page = 1, pageSize = 10 }) {
  const qs = new URLSearchParams({ course_id: courseId, semester, threshold, page, page_size: pageSize })
  if (start) qs.set('start', start)
  if (end) qs.set('end', end)
  if (search) qs.set('search', search)
  if (status) qs.set('status', status)
  return authedRequest(`/admin/attendance/overview?${qs.toString()}`, token)
}

export function attendanceStudent(token, studentId, { start = '', end = '' } = {}) {
  const qs = new URLSearchParams()
  if (start) qs.set('start', start)
  if (end) qs.set('end', end)
  return authedRequest(`/admin/attendance/student/${studentId}?${qs.toString()}`, token)
}

export function seedDemoAdminAttendance(token) {
  return authedRequest('/admin/attendance/demo-seed', token, { method: 'POST' })
}

export function listAdminNotices(token, { q = '', category = '', important = '', page = 1, pageSize = 8 } = {}) {
  const qs = new URLSearchParams({ page, page_size: pageSize })
  if (q) qs.set('q', q)
  if (category) qs.set('category', category)
  if (important !== '') qs.set('important', important)
  return authedRequest(`/admin/notices?${qs.toString()}`, token)
}

export function saveAdminNotice(token, id, payload) {
  return id
    ? authedRequest(`/admin/notices/${id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
    : authedRequest('/admin/notices', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function deleteAdminNotice(token, id) {
  return authedRequest(`/admin/notices/${id}`, token, { method: 'DELETE' })
}

export function seedDemoAdminNotices(token) {
  return authedRequest('/admin/notices/demo-seed', token, { method: 'POST' })
}

export function syllabusOverview(token, courseId, semester) {
  const qs = new URLSearchParams({ course_id: courseId, semester })
  return authedRequest(`/admin/syllabus/overview?${qs.toString()}`, token)
}

export function syllabusGet(token, subjectId) {
  return authedRequest(`/admin/syllabus/${subjectId}`, token)
}

export function syllabusSave(token, subjectId, payload) {
  return authedRequest(`/admin/syllabus/${subjectId}`, token, { method: 'PUT', body: JSON.stringify(payload) })
}

export function syllabusDelete(token, subjectId) {
  return authedRequest(`/admin/syllabus/${subjectId}`, token, { method: 'DELETE' })
}

export function seedDemoAdminSyllabus(token) {
  return authedRequest('/admin/syllabus/demo-seed', token, { method: 'POST' })
}

export function librarySummary(token) {
  return authedRequest('/admin/library/summary', token)
}

export function listAdminBooks(token, { q = '', category = '', availability = '', page = 1, pageSize = 10 } = {}) {
  const qs = new URLSearchParams({ page, page_size: pageSize })
  if (q) qs.set('q', q)
  if (category) qs.set('category', category)
  if (availability) qs.set('availability', availability)
  return authedRequest(`/admin/library/books?${qs.toString()}`, token)
}

export function saveAdminBook(token, id, payload) {
  return id
    ? authedRequest(`/admin/library/books/${id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
    : authedRequest('/admin/library/books', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function toggleAdminBook(token, id) {
  return authedRequest(`/admin/library/books/${id}/toggle`, token, { method: 'POST' })
}

export function deleteAdminBook(token, id) {
  return authedRequest(`/admin/library/books/${id}`, token, { method: 'DELETE' })
}

export function findLibraryStudents(token, q) {
  return authedRequest(`/admin/library/students?q=${encodeURIComponent(q)}`, token)
}

export function listLibraryIssues(token, { status = '', q = '', page = 1, pageSize = 10 } = {}) {
  const qs = new URLSearchParams({ page, page_size: pageSize })
  if (status) qs.set('status', status)
  if (q) qs.set('q', q)
  return authedRequest(`/admin/library/issues?${qs.toString()}`, token)
}

export function issueBook(token, payload) {
  return authedRequest('/admin/library/issues', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function returnBook(token, id, fine) {
  return authedRequest(`/admin/library/issues/${id}/return`, token, {
    method: 'POST',
    body: JSON.stringify({ fine: fine === '' || fine === null || fine === undefined ? null : Number(fine) }),
  })
}

export function seedDemoAdminLibrary(token) {
  return authedRequest('/admin/library/demo-seed', token, { method: 'POST' })
}

export function placementSummary(token) {
  return authedRequest('/admin/placement/summary', token)
}

export function listPlacementCompanies(token, { q = '', page = 1, pageSize = 10 } = {}) {
  const qs = new URLSearchParams({ page, page_size: pageSize })
  if (q) qs.set('q', q)
  return authedRequest(`/admin/placement/companies?${qs.toString()}`, token)
}

export function savePlacementCompany(token, id, payload) {
  return id
    ? authedRequest(`/admin/placement/companies/${id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
    : authedRequest('/admin/placement/companies', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function deletePlacementCompany(token, id) {
  return authedRequest(`/admin/placement/companies/${id}`, token, { method: 'DELETE' })
}

export function listPlacementDrives(token, { q = '', status = '', page = 1, pageSize = 10 } = {}) {
  const qs = new URLSearchParams({ page, page_size: pageSize })
  if (q) qs.set('q', q)
  if (status) qs.set('status', status)
  return authedRequest(`/admin/placement/drives?${qs.toString()}`, token)
}

export function savePlacementDrive(token, id, payload) {
  return id
    ? authedRequest(`/admin/placement/drives/${id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
    : authedRequest('/admin/placement/drives', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function deletePlacementDrive(token, id) {
  return authedRequest(`/admin/placement/drives/${id}`, token, { method: 'DELETE' })
}

export function placementApplicants(token, driveId, status = '') {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  return authedRequest(`/admin/placement/drives/${driveId}/applications${qs}`, token)
}

export function setApplicationStatus(token, id, status) {
  return authedRequest(`/admin/placement/applications/${id}/status`, token, { method: 'POST', body: JSON.stringify({ status }) })
}

export function scheduleInterview(token, id, payload) {
  return authedRequest(`/admin/placement/applications/${id}/interviews`, token, { method: 'POST', body: JSON.stringify(payload) })
}

export function updateInterview(token, id, status, result) {
  return authedRequest(`/admin/placement/interviews/${id}/update`, token, { method: 'POST', body: JSON.stringify({ status, result: result || null }) })
}

export function makeOffer(token, id, joiningDate) {
  return authedRequest(`/admin/placement/applications/${id}/offer`, token, { method: 'POST', body: JSON.stringify({ joining_date: joiningDate || null }) })
}

export function listPlacementStats(token) {
  return authedRequest('/admin/placement/statistics', token)
}

export function savePlacementStat(token, payload) {
  return authedRequest('/admin/placement/statistics', token, { method: 'PUT', body: JSON.stringify(payload) })
}

export function deletePlacementStat(token, id) {
  return authedRequest(`/admin/placement/statistics/${id}`, token, { method: 'DELETE' })
}

export function listRecruiters(token, academicYear) {
  return authedRequest(`/admin/placement/recruiters?academic_year=${encodeURIComponent(academicYear)}`, token)
}

export function addRecruiter(token, payload) {
  return authedRequest('/admin/placement/recruiters', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function deleteRecruiter(token, id) {
  return authedRequest(`/admin/placement/recruiters/${id}`, token, { method: 'DELETE' })
}

export function seedDemoAdminPlacement(token) {
  return authedRequest('/admin/placement/demo-seed', token, { method: 'POST' })
}

export function complaintsSummary(token) {
  return authedRequest('/admin/complaints/summary', token)
}

export function listAdminComplaints(token, { q = '', status = '', category = '', page = 1, pageSize = 10 } = {}) {
  const qs = new URLSearchParams({ page, page_size: pageSize })
  if (q) qs.set('q', q)
  if (status) qs.set('status', status)
  if (category) qs.set('category', category)
  return authedRequest(`/admin/complaints?${qs.toString()}`, token)
}

export function getAdminComplaint(token, id) {
  return authedRequest(`/admin/complaints/${id}`, token)
}

export function updateAdminComplaint(token, id, payload) {
  return authedRequest(`/admin/complaints/${id}/update`, token, { method: 'POST', body: JSON.stringify(payload) })
}

export function downloadAdminComplaintFile(token, complaintId, attachment) {
  return downloadAuthed(`/admin/complaints/${complaintId}/attachments/${attachment.id}`, token, attachment.file_name)
}

export function seedDemoAdminComplaints(token) {
  return authedRequest('/admin/complaints/demo-seed', token, { method: 'POST' })
}

export function mentorSummary(token) {
  return authedRequest('/admin/mentor/summary', token)
}

export function listMentors(token, { q = '', onlyActive = false } = {}) {
  const qs = new URLSearchParams({ only_active: onlyActive ? 'true' : 'false' })
  if (q) qs.set('q', q)
  return authedRequest(`/admin/mentor/mentors?${qs.toString()}`, token)
}

export function listMentees(token, { mentorId = '', status = '', courseId = '', semester = '', q = '', page = 1, pageSize = 10 } = {}) {
  const qs = new URLSearchParams({ page, page_size: pageSize })
  if (mentorId) qs.set('mentor_id', mentorId)
  if (status) qs.set('status', status)
  if (courseId) qs.set('course_id', courseId)
  if (semester) qs.set('semester', semester)
  if (q) qs.set('q', q)
  return authedRequest(`/admin/mentor/mentees?${qs.toString()}`, token)
}

export function assignMentees(token, facultyId, studentIds) {
  return authedRequest('/admin/mentor/assign', token, { method: 'POST', body: JSON.stringify({ faculty_id: facultyId, student_ids: studentIds }) })
}

export function assignMentorClass(token, facultyId, courseId, semester, onlyUnassigned = true) {
  return authedRequest('/admin/mentor/assign-class', token, {
    method: 'POST',
    body: JSON.stringify({ faculty_id: facultyId, course_id: courseId, semester: Number(semester), only_unassigned: onlyUnassigned }),
  })
}

export function unassignMentees(token, studentIds) {
  return authedRequest('/admin/mentor/unassign', token, { method: 'POST', body: JSON.stringify({ student_ids: studentIds }) })
}

export function saveMentorDetails(token, facultyId, payload) {
  return authedRequest(`/admin/mentor/mentors/${facultyId}/details`, token, { method: 'PUT', body: JSON.stringify(payload) })
}

export function seedDemoAdminMentor(token) {
  return authedRequest('/admin/mentor/demo-seed', token, { method: 'POST' })
}

export function gallerySummary(token) {
  return authedRequest('/admin/gallery/summary', token)
}

export function listAdminAlbums(token, { q = '', category = '', page = 1, pageSize = 9 } = {}) {
  const qs = new URLSearchParams({ page, page_size: pageSize })
  if (q) qs.set('q', q)
  if (category) qs.set('category', category)
  return authedRequest(`/admin/gallery/albums?${qs.toString()}`, token)
}

export function getAdminAlbum(token, id) {
  return authedRequest(`/admin/gallery/albums/${id}`, token)
}

export function saveAdminAlbum(token, id, payload) {
  return id
    ? authedRequest(`/admin/gallery/albums/${id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
    : authedRequest('/admin/gallery/albums', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function deleteAdminAlbum(token, id) {
  return authedRequest(`/admin/gallery/albums/${id}`, token, { method: 'DELETE' })
}

export function uploadGalleryPhotos(token, albumId, files, caption = '') {
  const form = new FormData()
  files.forEach((f) => form.append('files', f))
  if (caption) form.append('caption', caption)
  return authedRequest(`/admin/gallery/albums/${albumId}/photos`, token, { method: 'POST', body: form })
}

export function updateGalleryPhoto(token, id, caption) {
  return authedRequest(`/admin/gallery/photos/${id}`, token, { method: 'PUT', body: JSON.stringify({ caption: caption || null }) })
}

export function moveGalleryPhoto(token, id, direction) {
  return authedRequest(`/admin/gallery/photos/${id}/move?direction=${direction}`, token, { method: 'POST' })
}

export function deleteGalleryPhoto(token, id) {
  return authedRequest(`/admin/gallery/photos/${id}`, token, { method: 'DELETE' })
}

// Returns a temporary browser URL of a gallery photo (the login token cannot be sent by a plain <img>), or null.
export async function adminGalleryPhotoUrl(token, photoId) {
  try {
    const res = await fetch(`${BASE_URL}/admin/gallery/photos/${photoId}/file`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    return URL.createObjectURL(await res.blob())
  } catch {
    return null
  }
}

export function seedDemoAdminGallery(token) {
  return authedRequest('/admin/gallery/demo-seed', token, { method: 'POST' })
}

export function reportCatalog(token) {
  return authedRequest('/admin/reports/catalog', token)
}

function reportQuery({ courseId = '', semester = '', threshold = '', start = '', end = '' } = {}) {
  const qs = new URLSearchParams()
  if (threshold) qs.set('threshold', threshold)
  if (courseId) qs.set('course_id', courseId)
  if (semester) qs.set('semester', semester)
  if (start) qs.set('start', start)
  if (end) qs.set('end', end)
  return qs.toString()
}

export function runReport(token, key, params) {
  return authedRequest(`/admin/reports/${key}?${reportQuery(params)}`, token)
}

export function downloadReportCsv(token, key, params) {
  return _downloadCsv(`/admin/reports/${key}/export?${reportQuery(params)}`, token, `${key}-report.csv`)
}

export function getAdminSettings(token) {
  return authedRequest('/admin/settings', token)
}
export function saveAdminSettings(token, values) {
  return authedRequest('/admin/settings', token, { method: 'PUT', body: JSON.stringify({ values }) })
}

export function resetAdminSettings(token, group = null) {
  return authedRequest('/admin/settings/reset', token, { method: 'POST', body: JSON.stringify({ group }) })
}

export function facultyOverview(token) {
  return authedRequest('/faculty/dashboard/overview', token)
}

export function getFacultyProfile(token) {
  return authedRequest('/faculty/profile', token)
}

export function saveFacultyProfile(token, payload) {
  return authedRequest('/faculty/profile', token, { method: 'PUT', body: JSON.stringify(payload) })
}

export function uploadFacultyPhoto(token, file) {
  const fd = new FormData()
  fd.append('file', file)
  return authedRequest('/faculty/profile/photo', token, { method: 'POST', body: fd })
}

export function deleteFacultyPhoto(token) {
  return authedRequest('/faculty/profile/photo', token, { method: 'DELETE' })
}

// returns a blob URL (or null when there is no photo)
export async function fetchFacultyPhoto(token) {
  const res = await fetch('/api/faculty/profile/photo', { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  return URL.createObjectURL(await res.blob())
}

export function listFacultyClasses(token) {
  return authedRequest('/faculty/classes', token)
}

export function facultyClassStudents(token, id, { q = '', page = 1, pageSize = 10 } = {}) {
  const qs = new URLSearchParams({ q, page, page_size: pageSize })
  return authedRequest(`/faculty/classes/${id}/students?${qs.toString()}`, token)
}

export function seedDemoFacultyClasses(token) {
  return authedRequest('/faculty/classes/demo-seed', token, { method: 'POST' })
}
export function facultyAttendanceSheet(token, assignmentId, day) {
  const qs = new URLSearchParams({ assignment_id: assignmentId, day })
  return authedRequest(`/faculty/attendance/sheet?${qs.toString()}`, token)
}

export function saveFacultyAttendance(token, payload) {
  return authedRequest('/faculty/attendance/mark', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function facultyAttendanceHistory(token, assignmentId, page = 1) {
  const qs = new URLSearchParams({ assignment_id: assignmentId, page, page_size: 10 })
  return authedRequest(`/faculty/attendance/history?${qs.toString()}`, token)
}

export function facultyAttendanceReport(token, assignmentId, month) {
  const qs = new URLSearchParams({ assignment_id: assignmentId, month })
  return authedRequest(`/faculty/attendance/report?${qs.toString()}`, token)
}

export function downloadFacultyAttendanceCsv(token, assignmentId, month) {
  const qs = new URLSearchParams({ assignment_id: assignmentId, month })
  return _downloadCsv(`/faculty/attendance/report/export?${qs.toString()}`, token, `attendance-${month}.csv`)
}

export function facultyMarksSheet(token, assignmentId) {
  return authedRequest(`/faculty/marks/sheet?assignment_id=${encodeURIComponent(assignmentId)}`, token)
}

export function saveFacultyMarks(token, payload) {
  return authedRequest('/faculty/marks/save', token, { method: 'PUT', body: JSON.stringify(payload) })
}

export function publishFacultyMarks(token, assignmentId) {
  return authedRequest('/faculty/marks/publish', token, { method: 'POST', body: JSON.stringify({ assignment_id: assignmentId }) })
}

export function unpublishFacultyMarks(token, assignmentId) {
  return authedRequest('/faculty/marks/unpublish', token, { method: 'POST', body: JSON.stringify({ assignment_id: assignmentId }) })
}

export function downloadFacultyMarksCsv(token, assignmentId) {
  return _downloadCsv(`/faculty/marks/export?assignment_id=${encodeURIComponent(assignmentId)}`, token, 'marks.csv')
}

function boardQuery(assignmentId, { scope = 'subject', start = '', end = '' } = {}) {
  const qs = new URLSearchParams({ assignment_id: assignmentId, scope })
  if (start) qs.set('start', start)
  if (end) qs.set('end', end)
  return qs.toString()
}

export function facultyAttendanceLeaderboard(token, assignmentId, params) {
  return authedRequest(`/faculty/attendance/leaderboard?${boardQuery(assignmentId, params)}`, token)
}

export function downloadFacultyLeaderboardCsv(token, assignmentId, params) {
  return _downloadCsv(`/faculty/attendance/leaderboard/export?${boardQuery(assignmentId, params)}`, token, 'attendance-leaderboard.csv')
}

export function facultyFaceStatus(token, assignmentId) {
  return authedRequest(`/faculty/face/status?assignment_id=${encodeURIComponent(assignmentId)}`, token)
}

export function facultyFaceEnroll(token, payload) {
  return authedRequest('/faculty/face/enroll', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function facultyFaceRemove(token, assignmentId, studentId) {
  return authedRequest(`/faculty/face/enroll/${studentId}?assignment_id=${encodeURIComponent(assignmentId)}`, token, { method: 'DELETE' })
}

export function facultyFaceMatch(token, payload) {
  return authedRequest('/faculty/face/match', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function listFacultyTasks(token, classId = '') {
  const qs = classId ? `?class_id=${encodeURIComponent(classId)}` : ''
  return authedRequest(`/faculty/assignments${qs}`, token)
}

export function createFacultyTask(token, payload) {
  return authedRequest('/faculty/assignments', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function updateFacultyTask(token, id, payload) {
  return authedRequest(`/faculty/assignments/${id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
}

export function deleteFacultyTask(token, id) {
  return authedRequest(`/faculty/assignments/${id}`, token, { method: 'DELETE' })
}

export function getFacultyTask(token, id) {
  return authedRequest(`/faculty/assignments/${id}`, token)
}

export function gradeFacultyTask(token, id, payload) {
  return authedRequest(`/faculty/assignments/${id}/grade`, token, { method: 'PUT', body: JSON.stringify(payload) })
}

export function downloadFacultySubmission(token, id, studentId, fileName) {
  return downloadAuthed(`/faculty/assignments/${id}/file/${studentId}`, token, fileName || 'submission')
}

export function downloadFacultyTaskCsv(token, id) {
  return _downloadCsv(`/faculty/assignments/${id}/export`, token, 'assignment.csv')
}

export function facultyNoticeMeta(token) {
  return authedRequest('/faculty/notices/meta', token)
}

export function listFacultyNotices(token, { scope = 'all', category = '', q = '', page = 1 } = {}) {
  const qs = new URLSearchParams({ scope, q, page, page_size: 10 })
  if (category) qs.set('category', category)
  return authedRequest(`/faculty/notices?${qs.toString()}`, token)
}

export function createFacultyNotice(token, payload) {
  return authedRequest('/faculty/notices', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function updateFacultyNotice(token, id, payload) {
  return authedRequest(`/faculty/notices/${id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
}

export function deleteFacultyNotice(token, id) {
  return authedRequest(`/faculty/notices/${id}`, token, { method: 'DELETE' })
}

export function sendFacultyAnnouncement(token, payload) {
  return authedRequest('/faculty/notices/announce', token, { method: 'POST', body: JSON.stringify(payload) })
}

export function listFacultyAnnouncements(token, page = 1) {
  return authedRequest(`/faculty/notices/announcements?page=${page}&page_size=10`, token)
}

export function facultyMentees(token, q = '') {
  return authedRequest(`/faculty/mentor/mentees?q=${encodeURIComponent(q)}`, token)
}

export function facultyMentorMessages(token, studentId) {
  return authedRequest(`/faculty/mentor/students/${studentId}/messages`, token)
}

export function sendFacultyMentorMessage(token, studentId, body) {
  return authedRequest(`/faculty/mentor/students/${studentId}/messages`, token, { method: 'POST', body: JSON.stringify({ body }) })
}

export function downloadFacultyMentorFile(token, attachmentId, name) {
  return downloadAuthed(`/faculty/mentor/attachments/${attachmentId}`, token, name || 'attachment')
}

export function facultyMentorNotes(token, studentId) {
  return authedRequest(`/faculty/mentor/students/${studentId}/notes`, token)
}

export function addFacultyMentorNote(token, studentId, payload) {
  return authedRequest(`/faculty/mentor/students/${studentId}/notes`, token, { method: 'POST', body: JSON.stringify(payload) })
}

export function deleteFacultyMentorNote(token, noteId) {
  return authedRequest(`/faculty/mentor/notes/${noteId}`, token, { method: 'DELETE' })
}

export function listFacultyMeetings(token, { status = 'pending', page = 1 } = {}) {
  return authedRequest(`/faculty/mentor/meetings?status=${status}&page=${page}&page_size=10`, token)
}

export function respondFacultyMeeting(token, id, payload) {
  return authedRequest(`/faculty/mentor/meetings/${id}/respond`, token, { method: 'POST', body: JSON.stringify(payload) })
}

export function facultyComplaintsSummary(token) {
  return authedRequest('/faculty/complaints/summary', token)
}

export function listFacultyComplaints(token, { q = '', status = '', page = 1 } = {}) {
  const qs = new URLSearchParams({ page, page_size: 10 })
  if (q) qs.set('q', q)
  if (status) qs.set('status', status)
  return authedRequest(`/faculty/complaints?${qs.toString()}`, token)
}

export function getFacultyComplaint(token, id) {
  return authedRequest(`/faculty/complaints/${id}`, token)
}

export function updateFacultyComplaint(token, id, payload) {
  return authedRequest(`/faculty/complaints/${id}/update`, token, { method: 'POST', body: JSON.stringify(payload) })
}

export function downloadFacultyComplaintFile(token, complaintId, attachment) {
  return downloadAuthed(`/faculty/complaints/${complaintId}/attachments/${attachment.id}`, token, attachment.file_name)
}

function matQuery(params = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v) })
  return qs.toString()
}

export function facultyMaterialsMeta(token) {
  return authedRequest('/faculty/materials/meta', token)
}
export function facultyMaterialsList(token, params) {
  return authedRequest(`/faculty/materials?${matQuery(params)}`, token)
}
export function uploadFacultyMaterial(token, formData) {
  return authedRequest('/faculty/materials', token, { method: 'POST', body: formData })
}
export function updateFacultyMaterial(token, id, values) {
  return authedRequest(`/faculty/materials/${id}`, token, { method: 'PUT', body: JSON.stringify(values) })
}
export function deleteFacultyMaterial(token, id) {
  return authedRequest(`/faculty/materials/${id}`, token, { method: 'DELETE' })
}
export function downloadFacultyMaterial(token, id, fileName) {
  return downloadAuthed(`/faculty/materials/${id}/file`, token, fileName)
}

export function studentMaterialsList(token, params) {
  return authedRequest(`/student/materials?${matQuery(params)}`, token)
}
export function downloadStudentMaterial(token, id, fileName) {
  return downloadAuthed(`/student/materials/${id}/file`, token, fileName)
}

export function facultyQrStart(token, payload) {
  return authedRequest('/faculty/qr/start', token, { method: 'POST', body: JSON.stringify(payload) })
}
export function facultyQrCurrent(token, assignmentId) {
  return authedRequest(`/faculty/qr/current?assignment_id=${encodeURIComponent(assignmentId)}`, token)
}
export function facultyQrHistory(token, assignmentId) {
  return authedRequest(`/faculty/qr/history?assignment_id=${encodeURIComponent(assignmentId)}`, token)
}
export function facultyQrCode(token, sessionId) {
  return authedRequest(`/faculty/qr/${sessionId}/code`, token)
}
export function facultyQrScans(token, sessionId) {
  return authedRequest(`/faculty/qr/${sessionId}/scans`, token)
}
export function facultyQrClose(token, sessionId) {
  return authedRequest(`/faculty/qr/${sessionId}/close`, token, { method: 'POST' })
}
export function facultyQrFinalize(token, sessionId) {
  return authedRequest(`/faculty/qr/${sessionId}/finalize`, token, { method: 'POST' })
}

export function studentQrScan(token, payload) {
  return authedRequest('/student/qr-attendance/scan', token, { method: 'POST', body: JSON.stringify(payload) })
}
export function studentQrHistory(token) {
  return authedRequest('/student/qr-attendance/history', token)
}

export function facultyExamCopyMeta(token) {
  return authedRequest('/faculty/exam-copies/meta', token)
}
export function facultyExamCopyList(token, assignmentId, examName) {
  const qs = new URLSearchParams({ assignment_id: assignmentId, exam_name: examName })
  return authedRequest(`/faculty/exam-copies?${qs}`, token)
}
export function facultyExamCopyUpload(token, formData) {
  return authedRequest('/faculty/exam-copies', token, { method: 'POST', body: formData })
}
export function facultyExamCopyVisibility(token, id, isVisible) {
  return authedRequest(`/faculty/exam-copies/${id}`, token, { method: 'PUT', body: JSON.stringify({ is_visible: isVisible }) })
}
export function facultyExamCopyDelete(token, id) {
  return authedRequest(`/faculty/exam-copies/${id}`, token, { method: 'DELETE' })
}
export function downloadFacultyExamCopy(token, id, fileName) {
  return downloadAuthed(`/faculty/exam-copies/${id}/file`, token, fileName)
}

export function facultyTaskFileTasks(token, classId) {
  return authedRequest(`/faculty/task-files/assignments?class_id=${encodeURIComponent(classId)}`, token)
}
export function facultyTaskFileUpload(token, formData) {
  return authedRequest('/faculty/task-files', token, { method: 'POST', body: formData })
}
export function facultyTaskFileDelete(token, id) {
  return authedRequest(`/faculty/task-files/${id}`, token, { method: 'DELETE' })
}
export function downloadFacultyTaskFile(token, id, fileName) {
  return downloadAuthed(`/faculty/task-files/${id}/file`, token, fileName)
}

export function studentExamCopies(token) {
  return authedRequest('/student/files/exam-copies', token)
}
export function downloadStudentExamCopy(token, id, fileName) {
  return downloadAuthed(`/student/files/exam-copies/${id}/file`, token, fileName)
}
export function studentAssignmentFiles(token) {
  return authedRequest('/student/files/assignment-files', token)
}
export function downloadStudentAssignmentFile(token, id, fileName) {
  return downloadAuthed(`/student/files/assignment-files/${id}/file`, token, fileName)
}





export function facultyExamMeta(token) {
  return authedRequest('/faculty/exams/meta', token)
}
export function facultyExamList(token, classId) {
  return authedRequest(`/faculty/exams?assignment_id=${encodeURIComponent(classId)}`, token)
}
export function facultyExamCreate(token, values) {
  return authedRequest('/faculty/exams', token, { method: 'POST', body: JSON.stringify(values) })
}
export function facultyExamUpdate(token, id, values) {
  return authedRequest(`/faculty/exams/${id}`, token, { method: 'PUT', body: JSON.stringify(values) })
}
export function facultyExamDelete(token, id) {
  return authedRequest(`/faculty/exams/${id}`, token, { method: 'DELETE' })
}
export function facultyExamMarks(token, id) {
  return authedRequest(`/faculty/exams/${id}/marks`, token)
}
export function facultyExamSaveMarks(token, id, rows) {
  return authedRequest(`/faculty/exams/${id}/marks`, token, { method: 'PUT', body: JSON.stringify({ rows }) })
}
export function facultyExamPublish(token, id, publish) {
  return authedRequest(`/faculty/exams/${id}/publish`, token, { method: 'POST', body: JSON.stringify({ publish }) })
}
export function facultyExamPaperUpload(token, id, formData) {
  return authedRequest(`/faculty/exams/${id}/paper`, token, { method: 'POST', body: formData })
}
export function facultyExamPaperRelease(token, id, released) {
  return authedRequest(`/faculty/exams/${id}/paper/release`, token, { method: 'PUT', body: JSON.stringify({ released }) })
}
export function facultyExamPaperDelete(token, id) {
  return authedRequest(`/faculty/exams/${id}/paper`, token, { method: 'DELETE' })
}
export function downloadFacultyExamPaper(token, id, fileName) {
  return downloadAuthed(`/faculty/exams/${id}/paper/file`, token, fileName)
}
export function facultyExamReport(token, id) {
  return authedRequest(`/faculty/exams/${id}/report`, token)
}
export function downloadFacultyExamReportCsv(token, id) {
  return _downloadCsv(`/faculty/exams/${id}/report/export`, token, 'exam-report.csv')
}
export function studentExams(token) {
  return authedRequest('/student/exams', token)
}
export function downloadStudentExamPaper(token, id, fileName) {
  return downloadAuthed(`/student/exams/${id}/paper`, token, fileName)
}

export function facultyPlanner(token, assignmentId) {
  return authedRequest(`/faculty/planner?assignment_id=${encodeURIComponent(assignmentId)}`, token)
}
export function facultyPlannerLink(token, payload) {
  return authedRequest('/faculty/planner/link', token, { method: 'POST', body: JSON.stringify(payload) })
}
export function facultyPlannerUnlink(token, assignmentId) {
  return authedRequest(`/faculty/planner/link?assignment_id=${encodeURIComponent(assignmentId)}`, token, { method: 'DELETE' })
}
export function facultyPlannerUnitPlan(token, payload) {
  return authedRequest('/faculty/planner/unit-plan', token, { method: 'PUT', body: JSON.stringify(payload) })
}
export function facultyPlannerTopics(token, payload) {
  return authedRequest('/faculty/planner/topics', token, { method: 'POST', body: JSON.stringify(payload) })
}
export function downloadFacultyPlannerCsv(token, assignmentId) {
  return _downloadCsv(`/faculty/planner/export?assignment_id=${encodeURIComponent(assignmentId)}`, token, 'course-planner.csv')
}

export function facultyTimetableWeek(token) {
  return authedRequest('/faculty/timetable/week', token)
}
export function facultyExamSchedule(token, { scope = 'mine', includePast = false } = {}) {
  const qs = new URLSearchParams({ scope, include_past: includePast ? 'true' : 'false' })
  return authedRequest(`/faculty/timetable/exams?${qs}`, token)
}

export function facultyAnalyticsClass(token, assignmentId) {
  return authedRequest(`/faculty/analytics/class?assignment_id=${encodeURIComponent(assignmentId)}`, token)
}
export function facultyAnalyticsSubjects(token) {
  return authedRequest('/faculty/analytics/subjects', token)
}
export function facultyAnalyticsStudent(token, assignmentId, studentId) {
  const qs = new URLSearchParams({ assignment_id: assignmentId, student_id: studentId })
  return authedRequest(`/faculty/analytics/student?${qs}`, token)
}
export function downloadFacultyAnalyticsCsv(token, assignmentId) {
  return _downloadCsv(`/faculty/analytics/export?assignment_id=${encodeURIComponent(assignmentId)}`, token, 'student-performance.csv')
}