import { useCallback, useEffect, useState } from 'react'
import {
  CalendarDays, ClipboardList, FileText, Send, Eye, EyeOff, Save, Pencil, Trash2, Plus, X, Database, CheckCircle2,
} from 'lucide-react'
import {
  listCourses, listSubjects, listExams, createExam, updateExam, deleteExam, seedDemoExams,
  resultSubjects, resultMarks, saveMarks, publishResults, seedDemoResults,
} from '../api.js'

const ACCENT = '#2563EB'
const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500'
const PRIMARY = 'rounded-lg px-4 py-2 font-body text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const EXAM_TYPES = ['Internal Test 1', 'Internal Test 2', 'End Semester Exam', 'Practical Exam', 'Viva']
const STATUS = {
  upcoming: { label: 'Upcoming', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  today: { label: 'Today', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed: { label: 'Completed', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
}
const PAGE_SIZE = 10

function fmtDate(d) {
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
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

function ClassPicker({ courses, courseId, semester, setCourseId, setSemester, all }) {
  const course = courses.find((c) => c.id === courseId)
  return (
    <>
      <select className={`${INPUT} w-64`} value={courseId} onChange={(e) => { setCourseId(e.target.value); setSemester(all ? '' : 1) }}>
        <option value="">{all ? 'All courses' : 'Select course'}</option>
        {courses.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.department_name})</option>)}
      </select>
      <select className={`${INPUT} w-36`} value={semester} onChange={(e) => setSemester(e.target.value === '' ? '' : Number(e.target.value))}>
        {all && <option value="">All sem</option>}
        {Array.from({ length: course ? course.semesters : 8 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Semester {n}</option>)}
      </select>
    </>
  )
}

/* ------------------------------- Exam schedule ------------------------------- */
function ExamSchedule({ token, courses, setError, setInfo }) {
  const [data, setData] = useState({ items: [], total: 0, stats: { total: 0, upcoming: 0, next_7_days: 0, completed: 0 } })
  const [courseId, setCourseId] = useState('')
  const [semester, setSemester] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [formSubjects, setFormSubjects] = useState([])
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    return listExams(token, { courseId, semester, status, page, pageSize: PAGE_SIZE })
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, courseId, semester, status, page, setError])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!form || !form.course_id) return setFormSubjects([])
    listSubjects(token, { courseId: form.course_id, semester: form.semester, status: 'active', page: 1, pageSize: 100 })
      .then((d) => setFormSubjects(d.items))
      .catch(() => setFormSubjects([]))
  }, [token, form && form.course_id, form && form.semester]) // eslint-disable-line react-hooks/exhaustive-deps

  const formCourse = form && courses.find((c) => c.id === form.course_id)

  async function save(e) {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      const body = {
        course_id: form.course_id, semester: Number(form.semester), subject: form.subject, exam_type: form.exam_type,
        exam_date: form.exam_date, start_time: form.start_time, end_time: form.end_time, venue: form.venue,
      }
      if (form.id) await updateExam(token, form.id, body)
      else await createExam(token, body)
      setInfo(form.id ? 'Exam update ho gaya.' : 'Exam add ho gaya.')
      setForm(null)
      await load()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function run(fn, ok) {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      const r = await fn()
      setInfo(typeof ok === 'function' ? ok(r) : ok)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const s = data.stats

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat icon={CalendarDays} label="Total exams" value={s.total} color="#2563EB" />
        <Stat icon={ClipboardList} label="Upcoming" value={s.upcoming} color="#D97706" />
        <Stat icon={CalendarDays} label="Next 7 days" value={s.next_7_days} color="#7C3AED" />
        <Stat icon={CheckCircle2} label="Completed" value={s.completed} color="#64748B" />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <ClassPicker all courses={courses} courseId={courseId} semester={semester} setCourseId={(v) => { setCourseId(v); setPage(1) }} setSemester={(v) => { setSemester(v); setPage(1) }} />
          <select className={`${INPUT} w-40`} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="">All exams</option>
            <option value="upcoming">Upcoming</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy} onClick={() => run(() => seedDemoExams(token), (r) => r.message)}><Database size={15} /> Sample data</button>
          <button className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: ACCENT }} onClick={() => { setFormError(''); setInfo(''); setForm({ course_id: courseId, semester: semester || 1, subject: '', exam_type: 'Internal Test 1', exam_date: '', start_time: '10:00', end_time: '11:30', venue: '' }) }}>
            <Plus size={16} /> Schedule Exam
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Date & time</th>
              <th className="px-4 py-3 font-medium">Subject</th>
              <th className="px-4 py-3 font-medium">Class</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Venue</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>}
            {!loading && data.items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                {courseId || semester || status ? 'Koi exam match nahi hua.' : 'Abhi koi exam schedule nahi hai. "Schedule Exam" dabao.'}
              </td></tr>
            )}
            {!loading && data.items.map((x) => (
              <tr key={x.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3"><p className="text-slate-900">{fmtDate(x.exam_date)}</p><p className="text-xs text-slate-500">{clock(x.start_time)} - {clock(x.end_time)}</p></td>
                <td className="px-4 py-3 text-slate-900 font-medium">{x.subject}</td>
                <td className="px-4 py-3 text-slate-700">{x.course} · Sem {x.semester}</td>
                <td className="px-4 py-3 text-slate-700">{x.exam_type}</td>
                <td className="px-4 py-3 text-slate-700">{x.venue || '-'}</td>
                <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS[x.status].cls}`}>{STATUS[x.status].label}</span></td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button className={`${OUTLINE} flex items-center gap-1`} onClick={() => {
                      const c = courses.find((k) => k.name === x.course)
                      setFormError(''); setInfo('')
                      setForm({ id: x.id, course_id: c ? c.id : '', semester: Number(x.semester) || x.semester, subject: x.subject, exam_type: x.exam_type, exam_date: x.exam_date, start_time: x.start_time, end_time: x.end_time, venue: x.venue || '' })
                    }}><Pencil size={13} /> Edit</button>
                    <button className="rounded-lg border border-red-200 bg-white px-3 py-1.5 font-body text-sm text-red-600 hover:bg-red-50 flex items-center gap-1" disabled={busy}
                      onClick={() => window.confirm(`${x.subject} ka exam delete karna hai?`) && run(() => deleteExam(token, x.id), 'Exam delete ho gaya.')}>
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-3 font-body text-sm text-slate-500">
        <span>Total: {data.total}</span>
        <div className="flex items-center gap-2">
          <button className={OUTLINE} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} / {pages}</span>
          <button className={OUTLINE} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>

      {form && (
        <Modal title={form.id ? 'Edit Exam' : 'Schedule Exam'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-4">
            {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Course *</Label>
                <select className={INPUT} value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value, semester: 1, subject: '' })}>
                  <option value="">Select course</option>
                  {courses.filter((c) => c.is_active || c.id === form.course_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Semester *</Label>
                <select className={INPUT} value={form.semester} onChange={(e) => setForm({ ...form, semester: Number(e.target.value), subject: '' })}>
                  {Array.from({ length: formCourse ? formCourse.semesters : 8 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Semester {n}</option>)}
                </select>
              </div>
              <div>
                <Label>Exam type *</Label>
                <select className={INPUT} value={form.exam_type} onChange={(e) => setForm({ ...form, exam_type: e.target.value })}>
                  {EXAM_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <Label>Subject *</Label>
                <select className={INPUT} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
                  <option value="">Select subject</option>
                  {formSubjects.map((s) => <option key={s.id} value={s.name}>{s.name} ({s.code})</option>)}
                </select>
              </div>
              <div>
                <Label>Date *</Label>
                <input className={INPUT} type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} />
              </div>
              <div>
                <Label>Venue</Label>
                <input className={INPUT} maxLength={80} value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="e.g. Exam Hall A" />
              </div>
              <div>
                <Label>Start time *</Label>
                <input className={INPUT} type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div>
                <Label>End time *</Label>
                <input className={INPUT} type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
            </div>
            <p className="font-body text-xs text-slate-500">Same class ya same venue par overlapping exam save nahi hoga.</p>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className={PRIMARY} style={{ background: ACCENT }}>{saving ? 'Saving...' : 'Save'}</button>
              <button type="button" className={OUTLINE} onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

/* --------------------------------- Results --------------------------------- */
function Results({ token, courses, setError, setInfo }) {
  const [courseId, setCourseId] = useState('')
  const [semester, setSemester] = useState(1)
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(null) // subject name being edited
  const [sheet, setSheet] = useState(null) // { subject, credits, rows }
  const [edits, setEdits] = useState({})
  const [busy, setBusy] = useState(false)

  const loadOverview = useCallback(() => {
    if (!courseId) {
      setOverview(null)
      return Promise.resolve()
    }
    setLoading(true)
    return resultSubjects(token, courseId, semester)
      .then((d) => {
        setOverview(d)
        setError('')
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, courseId, semester, setError])

  useEffect(() => {
    setActive(null)
    setSheet(null)
    loadOverview()
  }, [loadOverview])

  const loadSheet = useCallback(
    (subject) =>
      resultMarks(token, courseId, semester, subject)
        .then((d) => {
          setSheet(d)
          setEdits({})
          setActive(subject)
          setError('')
        })
        .catch((e) => setError(e.message)),
    [token, courseId, semester, setError]
  )

  async function run(fn, ok) {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      const r = await fn()
      setInfo(typeof ok === 'function' ? ok(r) : ok)
      await loadOverview()
      if (active) await loadSheet(active)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const val = (row, f) => (edits[row.student_id] && f in edits[row.student_id] ? edits[row.student_id][f] : row[f] === null ? '' : row[f])
  const setVal = (row, f, v) => setEdits((e) => ({ ...e, [row.student_id]: { ...(e[row.student_id] || {}), [f]: v } }))
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

  function saveSheet() {
    const rows = sheet.rows.map((r) => ({ student_id: r.student_id, internal_marks: num(val(r, 'internal_marks')), external_marks: num(val(r, 'external_marks')) }))
    if (rows.some((r) => [r.internal_marks, r.external_marks].some((x) => x !== null && Number.isNaN(x)))) return setError('Marks me sirf number daalo.')
    return run(() => saveMarks(token, { course_id: courseId, semester: Number(semester), subject: active, rows }), (r) => `${r.saved} students ke marks save hue.`)
  }

  const publish = (subject, flag) =>
    run(() => publishResults(token, { course_id: courseId, semester: Number(semester), subject: subject || null, publish: flag }),
      (r) => `${r.changed} records ${flag ? 'publish' : 'unpublish'} hue.${r.skipped ? ` ${r.skipped} skip hue (marks poore nahi).` : ''}`)

  const dirty = Object.keys(edits).length > 0

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <ClassPicker courses={courses} courseId={courseId} semester={semester} setCourseId={setCourseId} setSemester={setSemester} />
        </div>
        <div className="flex gap-2">
          <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy} onClick={() => run(() => seedDemoResults(token), (r) => r.message)}><Database size={15} /> Sample data</button>
          {overview && overview.subjects.length > 0 && (
            <>
              <button className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: ACCENT }} disabled={busy} onClick={() => window.confirm('Is semester ke saare complete results publish karne hain? Students ko turant dikhne lagenge.') && publish(null, true)}><Send size={15} /> Publish all</button>
              <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy} onClick={() => window.confirm('Is semester ke saare results unpublish karne hain?') && publish(null, false)}><EyeOff size={15} /> Unpublish all</button>
            </>
          )}
        </div>
      </div>

      {!courseId ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center font-body text-sm text-slate-500">Results dekhne ke liye course aur semester chuno.</div>
      ) : loading ? (
        <p className="font-body text-sm text-slate-500">Loading...</p>
      ) : overview && (
        <>
          <p className="font-body text-sm text-slate-600 mb-3">Is class me <b>{overview.students}</b> active students hain.</p>
          {overview.subjects.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center font-body text-sm text-slate-500">Is semester me koi active subject nahi hai. Pehle Subjects section me banao.</div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mb-5">
              {overview.subjects.map((s) => {
                const pct = (n) => (s.students ? Math.round((n * 100) / s.students) : 0)
                return (
                  <div key={s.subject} className={`bg-white rounded-xl border shadow-sm p-4 ${active === s.subject ? 'border-blue-400 ring-1 ring-blue-200' : 'border-slate-200'}`}>
                    <p className="font-display text-base text-slate-900">{s.subject}</p>
                    <p className="font-body text-xs text-slate-500 mb-3">{s.code} · {s.credits} credits</p>
                    {[['Marks entered', s.complete, '#2563EB'], ['Published', s.published, '#16A34A']].map(([label, n, color]) => (
                      <div key={label} className="mb-2">
                        <div className="flex justify-between font-body text-xs text-slate-600 mb-1"><span>{label}</span><span>{n} / {s.students}</span></div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct(n)}%`, background: color }} /></div>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button className={`${OUTLINE} flex items-center gap-1`} onClick={() => loadSheet(s.subject)}><Pencil size={13} /> Marks</button>
                      <button className={`${OUTLINE} flex items-center gap-1`} disabled={busy} onClick={() => publish(s.subject, true)}><Eye size={13} /> Publish</button>
                      <button className={`${OUTLINE} flex items-center gap-1`} disabled={busy} onClick={() => publish(s.subject, false)}><EyeOff size={13} /> Unpublish</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {sheet && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
                <h3 className="font-display text-base text-slate-900">{sheet.subject} - marks entry</h3>
                <div className="flex gap-2">
                  <button className={OUTLINE} onClick={() => { setSheet(null); setActive(null); setEdits({}) }}>Close</button>
                  <button className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: ACCENT }} disabled={busy || !dirty} onClick={saveSheet}><Save size={15} /> Save marks</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full font-body text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 font-medium">Student</th>
                      <th className="px-4 py-3 font-medium w-36">Internal (/40)</th>
                      <th className="px-4 py-3 font-medium w-36">External (/60)</th>
                      <th className="px-4 py-3 font-medium w-24">Total</th>
                      <th className="px-4 py-3 font-medium w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Is class me koi active student nahi hai.</td></tr>}
                    {sheet.rows.map((r) => {
                      const i = num(val(r, 'internal_marks'))
                      const e = num(val(r, 'external_marks'))
                      return (
                        <tr key={r.student_id} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-2"><p className="text-slate-900">{r.name}</p><p className="text-xs text-slate-500">{r.college_id}</p></td>
                          <td className="px-4 py-2"><input className={INPUT} type="number" min={0} max={40} step="0.5" disabled={r.published} value={val(r, 'internal_marks')} onChange={(ev) => setVal(r, 'internal_marks', ev.target.value)} /></td>
                          <td className="px-4 py-2"><input className={INPUT} type="number" min={0} max={60} step="0.5" disabled={r.published} value={val(r, 'external_marks')} onChange={(ev) => setVal(r, 'external_marks', ev.target.value)} /></td>
                          <td className="px-4 py-2 text-slate-700">{i !== null && e !== null ? i + e : '-'}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${r.published ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{r.published ? 'Published' : 'Draft'}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="font-body text-xs text-slate-500 px-5 py-3">Published result ke marks badalne ke liye pehle Unpublish karo. Publish sirf unhi students ke hote hain jinke internal aur external dono marks bhare hon.</p>
            </div>
          )}
        </>
      )}
    </>
  )
}

export default function AdminExamsPage({ session }) {
  const token = session.access_token
  const [tab, setTab] = useState('exams')
  const [courses, setCourses] = useState([])
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    listCourses(token, { page: 1, pageSize: 100, status: 'active' })
      .then((d) => setCourses(d.items))
      .catch((e) => setError(e.message))
  }, [token])

  return (
    <div className="max-w-6xl mx-auto">
      <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1 mb-4">
        {[['exams', 'Exam Schedule', CalendarDays], ['results', 'Results', FileText]].map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => { setTab(k); setError(''); setInfo('') }}
            className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 font-body text-sm ${tab === k ? 'text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            style={tab === k ? { background: ACCENT } : undefined}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {info && <p className="font-body text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{info}</p>}
      {tab === 'exams'
        ? <ExamSchedule token={token} courses={courses} setError={setError} setInfo={setInfo} />
        : <Results token={token} courses={courses} setError={setError} setInfo={setInfo} />}
    </div>
  )
}