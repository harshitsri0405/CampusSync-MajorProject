import { useCallback, useEffect, useState } from 'react'
import { Users, BookOpen, GraduationCap, CalendarCheck, ClipboardList, FileText, Clock, Bell } from 'lucide-react'
import { facultyOverview, seedDemoFacultyClasses, facultyTimetableWeek, facultyExamSchedule } from '../api.js'

export default function FacultyHomePage({ session, onNavigate }) {
  const token = session.access_token
  const [data, setData] = useState(null)
  const [today, setToday] = useState(null)
  const [exams, setExams] = useState(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await facultyOverview(token))
      setError('')
    } catch (e) {
      setError(e.message)
    }
    // Optional cards: a failure here must never break the page.
    const [t, x] = await Promise.allSettled([facultyTimetableWeek(token), facultyExamSchedule(token, { scope: 'class' })])
    setToday(t.status === 'fulfilled' ? t.value.items.filter((s) => s.day === t.value.today.day).length : null)
    setExams(x.status === 'fulfilled' ? x.value.total : null)
  }, [token])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  async function seed() {
    setBusy(true); setMsg(''); setError('')
    try {
      const r = await seedDemoFacultyClasses(token)
      setMsg(r.message)
      await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (loading) return <p className="font-body text-sm text-slate-500">Loading...</p>
  if (!data) return <p className="font-body text-sm text-red-600">{error || 'Unable to load the dashboard.'}</p>

  const counts = data.counts || {}
  const notices = data.recent_notices || data.notices || []
  const dash = (v) => (v === null || v === undefined ? '-' : v)

  const cards = [
    { label: 'My classes', value: counts.classes ?? 0, icon: Users, to: 'classes' },
    { label: 'My subjects', value: counts.subjects ?? 0, icon: BookOpen, to: 'classes' },
    { label: 'My students', value: counts.students ?? 0, icon: GraduationCap, to: 'classes' },
    { label: 'Attendance pending today', value: counts.pending_attendance ?? 0, icon: CalendarCheck, to: 'attendance' },
    { label: 'Assignments to grade', value: counts.pending_grading ?? 0, icon: ClipboardList, to: 'assignments' },
    { label: "Today's classes", value: dash(today), icon: Clock, to: 'timetable' },
    { label: 'Upcoming exams', value: dash(exams), icon: FileText, to: 'timetable' },
  ]

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-5">
        <h2 className="font-display text-2xl text-slate-900">Welcome, {data.name}</h2>
        <p className="font-body text-sm text-slate-500">
          {[data.designation, data.department, data.faculty_id ? `ID ${data.faculty_id}` : null].filter(Boolean).join(' · ')}
        </p>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {msg && <p className="font-body text-sm text-green-700 mb-3">{msg}</p>}

      {(counts.classes ?? 0) === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5">
          <p className="font-display text-base text-slate-900 mb-1">No classes assigned yet</p>
          <p className="font-body text-sm text-slate-500 mb-3">
            Classes are assigned by the administrator. For testing, you can generate sample classes.
          </p>
          <button className="rounded-md bg-green-600 px-4 py-2 font-body text-sm text-white hover:bg-green-700 disabled:opacity-60" disabled={busy} onClick={seed}>
            {busy ? 'Creating...' : 'Load sample classes'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <button key={c.label} onClick={() => onNavigate && onNavigate(c.to)} className="text-left bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition">
              <span className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 bg-green-50 text-green-600"><Icon size={18} /></span>
              <p className="font-display text-2xl text-slate-900">{c.value}</p>
              <p className="font-body text-xs text-slate-500">{c.label}</p>
            </button>
          )
        })}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-display text-base text-slate-900 mb-3 flex items-center gap-2"><Bell size={16} className="text-green-600" /> Recent notices</h3>
        {notices.length === 0 ? (
          <p className="font-body text-sm text-slate-500">There are no notices yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {notices.map((n) => (
              <li key={n.id} className="py-2.5 flex items-start justify-between gap-3">
                <p className="font-body text-sm text-slate-700">
                  {n.is_important && <span className="mr-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600">Important</span>}
                  {n.title}
                </p>
                <span className="font-body text-xs text-slate-400 whitespace-nowrap">{n.posted_on || ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}