import { useCallback, useEffect, useState } from 'react'
import { Clock, Layers, CalendarDays, Pencil, Trash2, Plus, X, Database, MapPin, User } from 'lucide-react'
import {
  listCourses, listSubjects, listFaculty, listClassTimetable, timetableSummary, createSlot, updateSlot, deleteSlot,
  seedDemoTimetable,
} from '../api.js'

const ACCENT = '#2563EB'
const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500'
const PRIMARY = 'rounded-lg px-4 py-2 font-body text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const KIND = {
  lecture: { label: 'Lecture', bg: '#EFF4FF', border: '#BFD3FF', text: '#1D4ED8' },
  practical: { label: 'Practical', bg: '#F5F3FF', border: '#DDD6FE', text: '#6D28D9' },
}

function clock(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
      <span className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${color}1A`, color }}>
        <Icon size={20} />
      </span>
      <div>
        <p className="font-display text-2xl text-slate-900 leading-tight">{value}</p>
        <p className="font-body text-xs text-slate-500">{label}</p>
      </div>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-display text-lg text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function Label({ children }) {
  return <label className="font-body text-sm text-slate-600 mb-1 block">{children}</label>
}

export default function AdminTimetablePage({ session }) {
  const token = session.access_token
  const [courses, setCourses] = useState([])
  const [faculty, setFaculty] = useState([])
  const [courseId, setCourseId] = useState('')
  const [semester, setSemester] = useState(1)
  const [slots, setSlots] = useState([])
  const [summary, setSummary] = useState({ total: 0, classes: [] })
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const course = courses.find((c) => c.id === courseId)

  useEffect(() => {
    listCourses(token, { page: 1, pageSize: 100, status: 'active' })
      .then((d) => setCourses(d.items))
      .catch((e) => setError(e.message))
    listFaculty(token, { status: 'active', page: 1, pageSize: 100 })
      .then((d) => setFaculty(d.items))
      .catch((e) => setError(e.message))
  }, [token])

  const loadSummary = useCallback(() => timetableSummary(token).then(setSummary).catch((e) => setError(e.message)), [token])

  const loadClass = useCallback(() => {
    if (!courseId) {
      setSlots([])
      return Promise.resolve()
    }
    setLoading(true)
    return listClassTimetable(token, courseId, semester)
      .then((d) => {
        setSlots(d)
        setError('')
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, courseId, semester])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  useEffect(() => {
    loadClass()
  }, [loadClass])

  // subjects of the selected class (for the dropdown in the form)
  useEffect(() => {
    if (!courseId) return setSubjects([])
    listSubjects(token, { courseId, semester, status: 'active', page: 1, pageSize: 100 })
      .then((d) => setSubjects(d.items))
      .catch(() => setSubjects([]))
  }, [token, courseId, semester])

  const reload = () => Promise.all([loadClass(), loadSummary()])

  function openForm(day, slot) {
    setFormError('')
    setInfo('')
    setForm(
      slot
        ? { id: slot.id, day_of_week: slot.day_of_week, start_time: slot.start_time, end_time: slot.end_time, subject: slot.subject, faculty_name: slot.faculty_name || '', room: slot.room || '', kind: slot.kind }
        : { day_of_week: day, start_time: '09:00', end_time: '10:00', subject: '', faculty_name: '', room: '', kind: 'lecture' }
    )
  }

  async function save(e) {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      const body = {
        course_id: courseId, semester: Number(semester), day_of_week: Number(form.day_of_week), start_time: form.start_time,
        end_time: form.end_time, subject: form.subject, faculty_name: form.faculty_name || null, room: form.room, kind: form.kind,
      }
      if (form.id) await updateSlot(token, form.id, body)
      else await createSlot(token, body)
      setInfo(form.id ? 'Slot update ho gaya.' : 'Slot add ho gaya.')
      setForm(null)
      await reload()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(s) {
    if (!window.confirm(`${DAYS[s.day_of_week]} ${clock(s.start_time)} ka "${s.subject}" slot delete karna hai?`)) return
    setBusy(true)
    setError('')
    setInfo('')
    try {
      await deleteSlot(token, s.id)
      setInfo('Slot delete ho gaya.')
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function seed() {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      const r = await seedDemoTimetable(token)
      setInfo(r.message)
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const hasSunday = slots.some((s) => s.day_of_week === 6)
  const dayCount = hasSunday ? 7 : 6
  const maxSem = course ? course.semesters : 8
  const lectures = slots.filter((s) => s.kind !== 'practical').length

  return (
    <div className="max-w-7xl mx-auto">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat icon={Layers} label="Classes with timetable" value={summary.classes.length} color="#2563EB" />
        <Stat icon={Clock} label="Total slots (all classes)" value={summary.total} color="#7C3AED" />
        <Stat icon={CalendarDays} label="Slots in this class" value={slots.length} color="#0891B2" />
        <Stat icon={CalendarDays} label="Lectures / Practicals" value={`${lectures} / ${slots.length - lectures}`} color="#D97706" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div>
            <Label>Course</Label>
            <select className={`${INPUT} w-64`} value={courseId} onChange={(e) => { setCourseId(e.target.value); setSemester(1); setInfo('') }}>
              <option value="">Select course</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.department_name})</option>)}
            </select>
          </div>
          <div>
            <Label>Semester</Label>
            <select className={`${INPUT} w-36`} value={semester} onChange={(e) => setSemester(Number(e.target.value))}>
              {Array.from({ length: maxSem }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Semester {n}</option>)}
            </select>
          </div>
        </div>
        <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy} onClick={seed}>
          <Database size={15} /> Sample data
        </button>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {info && <p className="font-body text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{info}</p>}

      {!courseId ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center font-body text-sm text-slate-500 mb-5">
          Timetable dekhne ya banane ke liye upar se course aur semester chuno.
        </div>
      ) : loading ? (
        <p className="font-body text-sm text-slate-500 mb-5">Loading...</p>
      ) : (
        <div className="overflow-x-auto mb-5">
          <div className="grid gap-3 min-w-[900px]" style={{ gridTemplateColumns: `repeat(${dayCount}, minmax(0, 1fr))` }}>
            {DAYS.slice(0, dayCount).map((dayName, d) => {
              const list = slots.filter((s) => s.day_of_week === d)
              return (
                <div key={d} className="bg-slate-100/70 rounded-xl p-2 min-h-[200px]">
                  <div className="flex items-center justify-between px-1 py-1 mb-2">
                    <p className="font-display text-sm text-slate-800">{dayName}</p>
                    <button className="w-6 h-6 rounded-md flex items-center justify-center text-white" style={{ background: ACCENT }} onClick={() => openForm(d)} aria-label={`Add slot on ${dayName}`}>
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {list.length === 0 && <p className="font-body text-xs text-slate-400 px-1">No class</p>}
                    {list.map((s) => {
                      const k = KIND[s.kind] || KIND.lecture
                      return (
                        <div key={s.id} className="rounded-lg border p-2.5 bg-white shadow-sm" style={{ borderColor: k.border, borderLeft: `4px solid ${k.text}` }}>
                          <p className="font-body text-xs font-medium" style={{ color: k.text }}>{clock(s.start_time)} - {clock(s.end_time)}</p>
                          <p className="font-body text-sm text-slate-900 font-medium mt-0.5">{s.subject}</p>
                          {s.faculty_name && <p className="font-body text-xs text-slate-500 flex items-center gap-1 mt-1"><User size={11} />{s.faculty_name}</p>}
                          {s.room && <p className="font-body text-xs text-slate-500 flex items-center gap-1"><MapPin size={11} />{s.room}</p>}
                          <div className="flex items-center justify-between mt-2">
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: k.bg, color: k.text }}>{k.label}</span>
                            <span className="flex gap-1">
                              <button className="p-1 rounded hover:bg-slate-100 text-slate-500" onClick={() => openForm(d, s)} aria-label="Edit"><Pencil size={13} /></button>
                              <button className="p-1 rounded hover:bg-red-50 text-red-500" disabled={busy} onClick={() => remove(s)} aria-label="Delete"><Trash2 size={13} /></button>
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-display text-base text-slate-900 mb-3">Classes with timetable</h3>
        {summary.classes.length === 0 ? (
          <p className="font-body text-sm text-slate-500">Abhi kisi class ka timetable nahi hai.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {summary.classes.map((c) => {
              const match = courses.find((x) => x.name === c.course)
              return (
                <button
                  key={`${c.course}-${c.semester}`}
                  disabled={!match}
                  onClick={() => { setCourseId(match.id); setSemester(Number(c.semester) || 1) }}
                  className="rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 px-3 py-2 font-body text-sm text-slate-700 disabled:opacity-50 text-left"
                >
                  <span className="text-slate-900">{c.course}</span> · Sem {c.semester} <span className="text-slate-400">· {c.slots} slots</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {form && (
        <Modal title={form.id ? 'Edit slot' : `Add slot - ${DAYS[form.day_of_week]}`} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-4">
            {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
            {subjects.length === 0 && (
              <p className="font-body text-sm text-amber-700">Is course ke semester {semester} me abhi koi active subject nahi hai. Pehle Subjects section me banao.</p>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Subject *</Label>
                <select className={INPUT} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
                  <option value="">Select subject</option>
                  {subjects.map((s) => <option key={s.id} value={s.name}>{s.name} ({s.code})</option>)}
                </select>
              </div>
              <div>
                <Label>Day</Label>
                <select className={INPUT} value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: Number(e.target.value) })}>
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
              <div>
                <Label>Type</Label>
                <select className={INPUT} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  <option value="lecture">Lecture</option>
                  <option value="practical">Practical</option>
                </select>
              </div>
              <div>
                <Label>Start time *</Label>
                <input className={INPUT} type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div>
                <Label>End time *</Label>
                <input className={INPUT} type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
              <div>
                <Label>Faculty</Label>
                <select className={INPUT} value={form.faculty_name} onChange={(e) => setForm({ ...form, faculty_name: e.target.value })}>
                  <option value="">Not assigned</option>
                  {faculty.map((f) => <option key={f.id} value={f.faculty_name}>{f.faculty_name}</option>)}
                </select>
              </div>
              <div>
                <Label>Room</Label>
                <input className={INPUT} maxLength={40} value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="e.g. Room 101" />
              </div>
            </div>
            <p className="font-body text-xs text-slate-500">Same class, same room ya same faculty ka time overlap hone par save nahi hoga.</p>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className={PRIMARY} style={{ background: ACCENT }}>{saving ? 'Saving...' : 'Save'}</button>
              <button type="button" className={OUTLINE} onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}