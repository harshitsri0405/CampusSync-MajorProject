import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Camera, CheckCircle2, Clock, MapPin, Trash2 } from 'lucide-react'
import * as api from '../api.js'
import StudentAvatar from '../components/StudentAvatar.jsx'

// every card of the Home page is filled from an existing endpoint of that feature
const LOADERS = {
  profile: 'getStudentProfile',
  attendance: 'getAttendanceSummary',
  results: 'getResultsOverview',
  timetable: 'getTimetableOverview',
  assignments: 'getAssignments',
  notices: 'getNotices',
  fees: 'getFeesOverview',
  library: 'getLibraryOverview',
  mentor: 'getMentorOverview',
  placement: 'getPlacement',
}

const PROFILE_FIELDS = [
  'date_of_birth', 'gender', 'blood_group', 'course', 'department', 'semester',
  'admission_year', 'father_name', 'mother_name', 'parent_contact', 'phone', 'address',
]
const PHOTO_EXT = ['.png', '.jpg', '.jpeg', '.webp']
const MAX_PHOTO_BYTES = 2 * 1024 * 1024

const CATEGORY = {
  college: { label: 'College', cls: 'bg-slate-100 text-slate-600' },
  department: { label: 'Department', cls: 'bg-blue-100 text-blue-700' },
  event: { label: 'Event', cls: 'bg-purple-100 text-purple-700' },
}
const APP_STATUS = {
  applied: { label: 'Applied', cls: 'bg-blue-100 text-blue-700' },
  shortlisted: { label: 'Shortlisted', cls: 'bg-purple-100 text-purple-700' },
  interview: { label: 'Interview stage', cls: 'bg-indigo-100 text-indigo-700' },
  selected: { label: 'Selected', cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Not selected', cls: 'bg-red-100 text-red-700' },
}
const STAGE = { applied: 1, shortlisted: 2, interview: 3, selected: 4 }
const STAGE_ORDER = { interview: 0, shortlisted: 1, applied: 2, selected: 3, rejected: 4 }

// ---------------------------------------------------------------- small helpers
const pad = (n) => String(n).padStart(2, '0')

function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function startOfToday() {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

function shortDate(s) {
  return parseDate(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function minutesOf(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function fmtTime(t) {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${pad(m)} ${suffix}`
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function inr(n) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}

function lpa(n) {
  return `₹${Number(n).toFixed(1).replace(/\.0$/, '')} LPA`
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function dueText(iso) {
  const ms = new Date(iso) - new Date()
  const abs = Math.abs(ms)
  const days = Math.floor(abs / 86400000)
  const hours = Math.floor((abs % 86400000) / 3600000)
  const span = days > 0 ? plural(days, 'day') : hours > 0 ? plural(hours, 'hour') : 'less than an hour'
  return ms >= 0 ? `Due in ${span}` : `Overdue by ${span}`
}

function pctTone(p) {
  if (p >= 75) return 'text-green-700'
  if (p >= 65) return 'text-amber-700'
  return 'text-red-700'
}

function pctBar(p) {
  if (p >= 75) return 'bg-green-500'
  if (p >= 65) return 'bg-amber-500'
  return 'bg-red-500'
}

// ---------------------------------------------------------------- small components
function Chip({ cls, children }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>{children}</span>
}

function Prompt({ text, action, onClick }) {
  return (
    <div>
      <p className="font-body text-sm text-slate-500">{text}</p>
      {action && (
        <button type="button" onClick={onClick} className="mt-2 font-body text-sm text-purple-700 hover:text-purple-900">
          {action} →
        </button>
      )}
    </div>
  )
}

function SectionCard({ title, state, onMore, moreLabel = 'View all', children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-5 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-lg text-slate-900">{title}</h2>
        {onMore && (
          <button type="button" onClick={onMore} className="font-body text-xs text-purple-700 hover:text-purple-900">
            {moreLabel} →
          </button>
        )}
      </div>
      {state.loading ? (
        <p className="font-body text-sm text-slate-400">Loading…</p>
      ) : state.error ? (
        <p className="font-body text-sm text-slate-500">This section could not be loaded. {state.error}</p>
      ) : (
        children(state.data)
      )}
    </div>
  )
}

function StatCard({ label, value, hint, tone = 'text-slate-900', onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-purple-300 hover:shadow-sm transition"
    >
      <p className="font-body text-xs text-slate-400">{label}</p>
      <p className={`font-display text-2xl mt-1 ${tone}`}>{value}</p>
      {hint && <p className="font-body text-xs text-slate-500 mt-1">{hint}</p>}
    </button>
  )
}

function DetailCard({ title, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-purple-300 hover:shadow-sm transition"
    >
      <p className="font-body text-xs text-slate-400">{title}</p>
      {children}
    </button>
  )
}

// ---------------------------------------------------------------- page
export default function StudentHome({ session, photoUrl, onPhotoChange, onNavigate }) {
  const token = session.access_token
  const [sections, setSections] = useState({})
  const [now, setNow] = useState(new Date())
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const fileRef = useRef(null)

  // refresh "ongoing class" and "due in" texts every minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  // load every section on its own, so one failing section never breaks the page
  useEffect(() => {
    let alive = true
    Object.entries(LOADERS).forEach(([key, fnName]) => {
      const fn = api[fnName]
      if (typeof fn !== 'function') {
        setSections((s) => ({ ...s, [key]: { error: 'It is not installed in this project.' } }))
        return
      }
      fn(token)
        .then((data) => alive && setSections((s) => ({ ...s, [key]: { data } })))
        .catch((e) => alive && setSections((s) => ({ ...s, [key]: { error: e.message } })))
    })
    return () => {
      alive = false
    }
  }, [token])

  const get = (key) => sections[key] || { loading: true }
  const dataOf = (key) => (sections[key] && sections[key].data) || null

  async function handlePhoto(e) {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null
    e.target.value = ''
    if (!file) return
    setPhotoError('')
    const dot = file.name.lastIndexOf('.')
    const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''
    if (!PHOTO_EXT.includes(ext)) {
      setPhotoError('Choose a PNG, JPG or WEBP picture.')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('The picture is larger than 2 MB.')
      return
    }
    setPhotoBusy(true)
    try {
      await api.uploadStudentPhoto(token, file)
      onPhotoChange(await api.fetchStudentPhotoUrl(token))
    } catch (err) {
      setPhotoError(err.message)
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleRemovePhoto() {
    if (!window.confirm('Remove your profile photo?')) return
    setPhotoError('')
    setPhotoBusy(true)
    try {
      await api.deleteStudentPhoto(token)
      onPhotoChange(null)
    } catch (err) {
      setPhotoError(err.message)
    } finally {
      setPhotoBusy(false)
    }
  }

  const profile = dataOf('profile')
  const att = dataOf('attendance')
  const res = dataOf('results')
  const asg = dataOf('assignments')
  const fee = dataOf('fees')

  const today = startOfToday()
  const todayStr = toDateStr(today)
  const todayIndex = (now.getDay() + 6) % 7 // Monday = 0
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const name = (profile && profile.name) || session.display_name
  const firstName = (name || '').replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s*/i, '').split(' ')[0]
  const filledFields = profile ? PROFILE_FIELDS.filter((f) => profile[f] && String(profile[f]).trim()).length : 0
  const completeness = profile
    ? Math.round(((filledFields + (photoUrl ? 1 : 0)) * 100) / (PROFILE_FIELDS.length + 1))
    : null

  const pendingAssignments =
    asg && asg.class_known ? asg.assignments.filter((a) => a.status === 'pending' || a.status === 'overdue') : null
  const overdueCount = pendingAssignments ? pendingAssignments.filter((a) => a.status === 'overdue').length : 0

  // ---------------------------------------------------------------- card contents
  function renderAttendance(a) {
    if (!a.total_classes) {
      return <Prompt text="No attendance has been recorded yet." action="Open Attendance" onClick={() => onNavigate('attendance')} />
    }
    const low = a.subjects.filter((s) => s.percentage < a.required_percentage)
    return (
      <div>
        <div className="flex items-end justify-between gap-3">
          <p className={`font-display text-4xl ${pctTone(a.percentage)}`}>{a.percentage}%</p>
          <p className="font-body text-sm text-slate-500 text-right">
            {a.present} of {a.total_classes} classes attended
            <br />
            {a.absent} missed
          </p>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full ${pctBar(a.percentage)}`} style={{ width: `${Math.min(a.percentage, 100)}%` }} />
        </div>
        <div
          className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 ${
            a.at_risk ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
          }`}
        >
          {a.at_risk ? (
            <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
          )}
          <p className={`font-body text-xs ${a.at_risk ? 'text-red-700' : 'text-green-700'}`}>
            {a.at_risk
              ? `Below the required ${a.required_percentage}%. Attend regularly to avoid a shortage.`
              : `You meet the required ${a.required_percentage}% attendance.`}
          </p>
        </div>
        {low.length > 0 && (
          <div className="mt-3">
            <p className="font-body text-xs text-slate-400 mb-1">Subjects below {a.required_percentage}%</p>
            <ul className="space-y-1">
              {low.slice(0, 3).map((s) => (
                <li key={s.subject} className="flex justify-between font-body text-sm">
                  <span className="text-slate-700">{s.subject}</span>
                  <span className="text-red-700">{s.percentage}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  function renderToday(t) {
    if (!t.class_known) {
      return (
        <Prompt
          text="Fill your Course and Semester in Student Profile to see your classes."
          action="Open Student Profile"
          onClick={() => onNavigate('profile')}
        />
      )
    }
        if (t.term && t.term.status === 'ended') {
      return (
        <p className="font-body text-sm text-slate-500">
          Your semester ended on {shortDate(t.term.end_date)}. The next timetable will appear here once it is
          published.
        </p>
      )
    }
    if (t.entries.length === 0 && t.exams.length === 0) {
      return <Prompt text="The timetable has not been published yet." action="Open Timetable" onClick={() => onNavigate('timetable')} />
    }

    const list = t.entries
      .filter((e) => e.day === todayIndex)
      .sort((a, b) => minutesOf(a.start_time) - minutesOf(b.start_time))
    const nextIndex = list.findIndex((e) => minutesOf(e.start_time) > nowMin)
    const examsToday = t.exams.filter((x) => x.exam_date === todayStr)
    const nextExam = t.exams
      .filter((x) => x.exam_date >= todayStr)
      .sort((a, b) => a.exam_date.localeCompare(b.exam_date))[0]
    const examDays = nextExam ? Math.round((parseDate(nextExam.exam_date) - today) / 86400000) : null

    return (
      <div className="space-y-3">
        {examsToday.map((x, i) => (
          <div key={`${x.subject}-${i}`} className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
            <p className="font-body text-xs text-purple-700 font-medium">Exam today</p>
            <p className="font-body text-sm text-slate-900">
              {x.subject} · {x.exam_type} · {fmtTime(x.start_time)}
              {x.venue ? ` · ${x.venue}` : ''}
            </p>
          </div>
        ))}

        {list.length === 0 ? (
          <p className="font-body text-sm text-slate-500">
            {todayIndex >= 5 ? 'No classes today. Enjoy your weekend.' : 'No classes are scheduled for today.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {list.map((e, i) => {
              const ongoing = nowMin >= minutesOf(e.start_time) && nowMin < minutesOf(e.end_time)
              const done = nowMin >= minutesOf(e.end_time)
              return (
                <li
                  key={`${e.subject}-${e.start_time}-${i}`}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
                    ongoing ? 'border-purple-300 bg-purple-50' : 'border-slate-200 bg-white'
                  } ${done ? 'opacity-50' : ''}`}
                >
                  <div className="w-20 shrink-0 font-body text-xs text-slate-500 leading-snug">
                    {fmtTime(e.start_time)}
                    <br />
                    {fmtTime(e.end_time)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-sm text-slate-900 font-medium leading-snug">{e.subject}</p>
                    <p className="font-body text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                      {e.faculty_name && <span>{e.faculty_name}</span>}
                      {e.room && (
                        <span className="flex items-center gap-1">
                          <MapPin size={10} /> {e.room}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {ongoing && <Chip cls="bg-purple-600 text-white">Now</Chip>}
                    {!ongoing && i === nextIndex && <Chip cls="bg-blue-100 text-blue-700">Next</Chip>}
                    {e.kind === 'practical' && <Chip cls="bg-orange-100 text-orange-700">Lab</Chip>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {nextExam && examsToday.length === 0 && (
          <p className="font-body text-xs text-slate-500 pt-1">
            Next exam: <strong className="text-slate-800">{nextExam.subject}</strong> ({nextExam.exam_type}),{' '}
            {examDays === 0 ? 'today' : examDays === 1 ? 'tomorrow' : `in ${plural(examDays, 'day')}`} on{' '}
            {shortDate(nextExam.exam_date)}
          </p>
        )}
      </div>
    )
  }

  function renderAssignments(a) {
    if (!a.class_known) {
      return (
        <Prompt
          text="Fill your Course and Semester in Student Profile to see assignments."
          action="Open Student Profile"
          onClick={() => onNavigate('profile')}
        />
      )
    }
    if (a.assignments.length === 0) {
      return <Prompt text="No assignments have been posted yet." action="Open Assignments" onClick={() => onNavigate('assignments')} />
    }
    const count = (s) => a.assignments.filter((x) => x.status === s).length
    const open = a.assignments
      .filter((x) => x.status === 'pending' || x.status === 'overdue')
      .sort((x, y) => (x.status === 'overdue' ? 0 : 1) - (y.status === 'overdue' ? 0 : 1) || new Date(x.due_at) - new Date(y.due_at))
      .slice(0, 4)

    return (
      <div>
        <p className="font-body text-xs text-slate-500">
          {count('pending')} pending · {count('overdue')} overdue · {count('submitted')} submitted · {count('graded')} graded
        </p>
        {open.length === 0 ? (
          <p className="font-body text-sm text-green-700 mt-3">You are all caught up. No pending assignments.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {open.map((x) => (
              <li key={x.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="font-body text-xs text-purple-700 font-medium">{x.subject}</p>
                  <p className="font-body text-sm text-slate-900 leading-snug">{x.title}</p>
                </div>
                <Chip cls={x.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}>
                  {dueText(x.due_at)}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  function renderNotices(n) {
    const all = n.notices || []
    if (all.length === 0) {
      return <Prompt text="There are no notices yet." action="Open Notices" onClick={() => onNavigate('notices')} />
    }
    const unread = all.filter((x) => !x.is_read).length
    const important = all.filter((x) => x.is_important && x.category !== 'event')
    const others = all.filter((x) => !x.is_important && x.category !== 'event' && !x.is_read)
    const shown = [...important, ...others].slice(0, 4)
    const events = all
      .filter((x) => x.category === 'event' && x.event_date && x.event_date >= todayStr)
      .sort((a, b) => a.event_date.localeCompare(b.event_date))
      .slice(0, 2)

    return (
      <div className="space-y-4">
        {unread > 0 && (
          <p className="font-body text-xs text-purple-700">
            {plural(unread, 'unread notice')}
          </p>
        )}

        {shown.length === 0 ? (
          <p className="font-body text-sm text-slate-500">No important or new notices right now.</p>
        ) : (
          <ul className="space-y-2">
            {shown.map((x) => {
              const cat = CATEGORY[x.category] || CATEGORY.college
              return (
                <li key={x.id} className={`rounded-lg border px-3 py-2 ${x.is_important ? 'border-red-200' : 'border-slate-200'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    {x.is_important && <Chip cls="bg-red-100 text-red-700">Important</Chip>}
                    {!x.is_read && <Chip cls="bg-purple-100 text-purple-700">New</Chip>}
                    <Chip cls={cat.cls}>{cat.label}</Chip>
                  </div>
                  <p className="font-body text-sm text-slate-900 font-medium leading-snug mt-1">{x.title}</p>
                  <p className="font-body text-xs text-slate-500 mt-0.5">
                    {x.posted_by ? `${x.posted_by} · ` : ''}
                    {shortDate(x.posted_on)}
                  </p>
                </li>
              )
            })}
          </ul>
        )}

        {events.length > 0 && (
          <div>
            <p className="font-body text-xs text-slate-400 mb-2">Upcoming events</p>
            <ul className="space-y-2">
              {events.map((x) => {
                const d = parseDate(x.event_date)
                return (
                  <li key={x.id} className="flex items-center gap-3">
                    <div className="shrink-0 w-12 rounded-lg border border-purple-200 bg-purple-50 text-center py-1">
                      <p className="font-body text-[10px] uppercase text-purple-700">
                        {d.toLocaleDateString('en-IN', { month: 'short' })}
                      </p>
                      <p className="font-display text-lg text-slate-900 leading-none">{d.getDate()}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="font-body text-sm text-slate-900 leading-snug">{x.title}</p>
                      <p className="font-body text-xs text-slate-500 flex flex-wrap gap-x-3">
                        {x.event_time && (
                          <span className="flex items-center gap-1">
                            <Clock size={10} /> {fmtTime(x.event_time)}
                          </span>
                        )}
                        {x.venue && (
                          <span className="flex items-center gap-1">
                            <MapPin size={10} /> {x.venue}
                          </span>
                        )}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    )
  }

  function renderPlacement(p) {
    const drives = p.drives || []
    const apps = (p.applications || []).filter((a) => a.status !== 'withdrawn')
    const offers = p.offers || []
    if (drives.length === 0 && apps.length === 0) {
      return <Prompt text="No placement drives have been posted yet." action="Open Placement" onClick={() => onNavigate('placement')} />
    }
    const applicable = drives.filter(
      (d) => d.phase === 'open' && d.eligible && !(d.application_status && d.application_status !== 'withdrawn')
    )
    const upcoming = (p.interviews || [])
      .filter((i) => i.status === 'scheduled' && new Date(i.scheduled_at) >= now)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    const shown = [...apps].sort((a, b) => (STAGE_ORDER[a.status] ?? 9) - (STAGE_ORDER[b.status] ?? 9)).slice(0, 3)
    const stats = [
      ['Drives for you', applicable.length],
      ['Applications', apps.length],
      ['Interviews ahead', upcoming.length],
      ['Offers', offers.length],
    ]

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-200 px-3 py-2">
              <p className="font-body text-xs text-slate-400">{label}</p>
              <p className="font-display text-2xl text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        {upcoming[0] && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
            <p className="font-body text-xs text-blue-700 font-medium">Your next interview</p>
            <p className="font-body text-sm text-slate-900">
              {upcoming[0].company} · {upcoming[0].round_name}
            </p>
            <p className="font-body text-xs text-slate-600">
              {fmtDateTime(upcoming[0].scheduled_at)} · {upcoming[0].mode}
            </p>
          </div>
        )}

        {offers[0] && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
            <p className="font-body text-xs text-green-700 font-medium">
              {offers.length === 1 ? 'You have an offer' : `You have ${offers.length} offers`}
            </p>
            <p className="font-body text-sm text-slate-900">
              {offers[0].company_name} · {offers[0].role_title} · {lpa(offers[0].package_lpa)}
            </p>
          </div>
        )}

        {shown.length > 0 && (
          <div>
            <p className="font-body text-xs text-slate-400 mb-2">Your applications</p>
            <ul className="space-y-2">
              {shown.map((a) => {
                const st = APP_STATUS[a.status] || APP_STATUS.applied
                const reached = STAGE[a.status] || 0
                return (
                  <li key={a.id} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-body text-sm text-slate-900">
                        {a.company} <span className="text-slate-500">· {a.role_title}</span>
                      </p>
                      <Chip cls={st.cls}>{st.label}</Chip>
                    </div>
                    <div className="flex gap-1 mt-2">
                      {[1, 2, 3, 4].map((step) => (
                        <span
                          key={step}
                          className={`h-1.5 flex-1 rounded-full ${
                            reached >= step ? (a.status === 'selected' ? 'bg-green-500' : 'bg-purple-500') : 'bg-slate-200'
                          }`}
                        />
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {p.resume && !p.resume.has_resume && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="font-body text-sm text-amber-900">You have not uploaded your resume yet. You need it to apply.</p>
            <button
              type="button"
              onClick={() => onNavigate('placement')}
              className="mt-1 font-body text-sm text-purple-700 hover:text-purple-900"
            >
              Upload resume →
            </button>
          </div>
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------- "important details" row
  const lastSemester = res && res.semesters ? [...res.semesters].reverse().find((s) => s.sgpa !== null) : null
  const feeSummary = fee && fee.class_known ? fee.summary : null
  const libSummary = dataOf('library') ? dataOf('library').summary : null
  const nearestBook = dataOf('library') && dataOf('library').issued.length ? dataOf('library').issued[0] : null
  const mentorData = dataOf('mentor')
  const nextMeeting =
    mentorData && mentorData.meetings
      ? mentorData.meetings
          .filter((m) => (m.status === 'pending' || m.status === 'approved') && m.requested_date >= todayStr)
          .sort((a, b) => (a.requested_date + a.requested_time).localeCompare(b.requested_date + b.requested_time))[0]
      : null

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* ---------------- profile header ---------------- */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <StudentAvatar name={name} photoUrl={photoUrl} size={96} />
              <button
                type="button"
                onClick={() => fileRef.current && fileRef.current.click()}
                disabled={photoBusy}
                aria-label="Change profile photo"
                className="absolute -bottom-1 -right-1 rounded-full bg-purple-600 hover:bg-purple-700 text-white p-2 border-2 border-white disabled:opacity-60"
              >
                <Camera size={14} />
              </button>
              <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp" onChange={handlePhoto} className="hidden" />
            </div>
            {photoUrl && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                disabled={photoBusy}
                className="flex items-center gap-1 font-body text-xs text-slate-400 hover:text-red-600"
              >
                <Trash2 size={11} /> Remove photo
              </button>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-body text-sm text-slate-500">
              {greeting()}, {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h2 className="font-display text-2xl sm:text-3xl text-slate-900 leading-tight">
              Welcome, {firstName || 'Student'}
            </h2>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 font-body text-sm">
              <div>
                <p className="text-xs text-slate-400">Full name</p>
                <p className="text-slate-900">{name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Roll no / College ID</p>
                <p className="text-slate-900 font-mono text-xs sm:text-sm">{(profile && profile.college_id) || '…'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Semester</p>
                <p className="text-slate-900">{profile ? profile.semester || 'Not filled' : '…'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Course</p>
                <p className="text-slate-900">{profile ? profile.course || 'Not filled' : '…'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Department</p>
                <p className="text-slate-900">{profile ? profile.department || 'Not filled' : '…'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Admission year</p>
                <p className="text-slate-900">{profile ? profile.admission_year || 'Not filled' : '…'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Phone</p>
                <p className="text-slate-900">{profile ? profile.phone || 'Not filled' : '…'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Profile complete</p>
                <p className="text-slate-900">{completeness === null ? '…' : `${completeness}%`}</p>
              </div>
            </div>

            {completeness !== null && completeness < 100 && (
              <div className="mt-4">
                <div className="h-1.5 w-full max-w-sm rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-purple-500" style={{ width: `${completeness}%` }} />
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('profile')}
                  className="mt-2 font-body text-sm text-purple-700 hover:text-purple-900"
                >
                  Complete your profile →
                </button>
              </div>
            )}
            {photoError && <p className="font-body text-sm text-red-600 mt-2">{photoError}</p>}
          </div>
        </div>
      </div>

      {/* ---------------- quick numbers ---------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Attendance"
          value={att ? (att.total_classes ? `${att.percentage}%` : '—') : '…'}
          tone={att && att.total_classes ? pctTone(att.percentage) : 'text-slate-900'}
          hint={att && att.total_classes ? `${att.present} of ${att.total_classes} classes` : 'No data yet'}
          onClick={() => onNavigate('attendance')}
        />
        <StatCard
          label="CGPA"
          value={res ? (res.cgpa === null ? '—' : res.cgpa) : '…'}
          hint={lastSemester ? `Latest SGPA ${lastSemester.sgpa} (Sem ${lastSemester.semester})` : 'out of 10'}
          onClick={() => onNavigate('results')}
        />
        <StatCard
          label="Assignments to do"
          value={pendingAssignments ? pendingAssignments.length : asg ? '—' : '…'}
          tone={overdueCount > 0 ? 'text-red-700' : 'text-slate-900'}
          hint={pendingAssignments ? (overdueCount > 0 ? `${overdueCount} overdue` : 'None overdue') : ''}
          onClick={() => onNavigate('assignments')}
        />
        <StatCard
          label="Fee due"
          value={feeSummary ? inr(feeSummary.total_due) : fee ? '—' : '…'}
          tone={feeSummary && feeSummary.overdue_amount > 0 ? 'text-red-700' : 'text-slate-900'}
          hint={feeSummary ? (feeSummary.overdue_amount > 0 ? `${inr(feeSummary.overdue_amount)} overdue` : 'Nothing overdue') : ''}
          onClick={() => onNavigate('fees')}
        />
      </div>

      {/* ---------------- today and attendance ---------------- */}
      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard title="Today's classes" state={get('timetable')} onMore={() => onNavigate('timetable')} moreLabel="Timetable">
          {renderToday}
        </SectionCard>
        <SectionCard title="Current attendance" state={get('attendance')} onMore={() => onNavigate('attendance')} moreLabel="Details">
          {renderAttendance}
        </SectionCard>
      </div>

      {/* ---------------- assignments and notices ---------------- */}
      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard title="Current assignments" state={get('assignments')} onMore={() => onNavigate('assignments')}>
          {renderAssignments}
        </SectionCard>
        <SectionCard title="Important notices" state={get('notices')} onMore={() => onNavigate('notices')}>
          {renderNotices}
        </SectionCard>
      </div>

      {/* ---------------- placement tracker ---------------- */}
      <SectionCard title="Placement tracker" state={get('placement')} onMore={() => onNavigate('placement')} moreLabel="Placement">
        {renderPlacement}
      </SectionCard>

      {/* ---------------- important details ---------------- */}
      <div>
        <h2 className="font-display text-lg text-slate-900 mb-3">Other important details</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <DetailCard title="Results" onClick={() => onNavigate('results')}>
            <p className="font-display text-2xl text-slate-900 mt-1">{res ? (res.cgpa === null ? '—' : `CGPA ${res.cgpa}`) : '…'}</p>
            <p className="font-body text-xs text-slate-500 mt-1">
              {res
                ? res.semesters.length
                  ? `${res.semesters.filter((s) => s.status !== 'in_progress').length} of ${res.semesters.length} semesters declared`
                  : 'No results published yet'
                : ''}
            </p>
          </DetailCard>

          <DetailCard title="Fees" onClick={() => onNavigate('fees')}>
            <p className="font-display text-2xl text-slate-900 mt-1">
              {feeSummary ? (feeSummary.total_due > 0 ? `${inr(feeSummary.total_due)} due` : 'All paid') : fee ? '—' : '…'}
            </p>
            <p className="font-body text-xs text-slate-500 mt-1">
              {feeSummary
                ? feeSummary.next_due_date
                  ? `Next: ${feeSummary.next_due_name} by ${shortDate(feeSummary.next_due_date)}`
                  : feeSummary.overdue_amount > 0
                  ? 'Some fees are overdue'
                  : 'No payment pending'
                : fee && !fee.class_known
                ? 'Set Course and Semester in profile'
                : ''}
            </p>
          </DetailCard>

          <DetailCard title="Library" onClick={() => onNavigate('library')}>
            <p className="font-display text-2xl text-slate-900 mt-1">
              {libSummary ? plural(libSummary.currently_issued, 'book') : '…'}
            </p>
            <p className={`font-body text-xs mt-1 ${libSummary && libSummary.overdue > 0 ? 'text-red-600' : 'text-slate-500'}`}>
              {libSummary
                ? libSummary.overdue > 0
                  ? `${libSummary.overdue} overdue · fine ${inr(libSummary.fine_pending)}`
                  : nearestBook
                  ? `Next return: ${shortDate(nearestBook.due_on)}`
                  : 'No book issued'
                : ''}
            </p>
          </DetailCard>

          <DetailCard title="Mentor" onClick={() => onNavigate('mentor')}>
            <p className="font-display text-2xl text-slate-900 mt-1">
              {mentorData ? (mentorData.has_mentor ? mentorData.mentor.name : 'Not assigned') : '…'}
            </p>
            <p className="font-body text-xs text-slate-500 mt-1">
              {mentorData && mentorData.has_mentor
                ? mentorData.unread_messages > 0
                  ? `${plural(mentorData.unread_messages, 'unread message')}`
                  : nextMeeting
                  ? `Meeting on ${shortDate(nextMeeting.requested_date)}, ${fmtTime(nextMeeting.requested_time)}`
                  : 'No upcoming meeting'
                : ''}
            </p>
          </DetailCard>
        </div>
      </div>
    </div>
  )
}