import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Download, FileText, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  listFacultyClasses, listFacultyTasks, createFacultyTask, updateFacultyTask, deleteFacultyTask, getFacultyTask,
  gradeFacultyTask, downloadFacultySubmission, downloadFacultyTaskCsv,
} from '../api.js'

const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const GREEN = 'rounded-lg bg-green-600 px-4 py-2 font-body text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60'

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-')

function toLocalInput(iso) {
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const STATUS = {
  pending: ['bg-slate-100 text-slate-600', 'Pending'],
  overdue: ['bg-red-50 text-red-600', 'Overdue'],
  submitted: ['bg-blue-50 text-blue-700', 'Submitted'],
  graded: ['bg-green-50 text-green-700', 'Graded'],
}

function TaskForm({ token, classes, task, onDone, onCancel }) {
  const editing = Boolean(task)
  const [f, setF] = useState({
    class_id: task ? task.class_id : classes[0] ? classes[0].id : '',
    title: task ? task.title : '', description: task ? task.description || '' : '',
    max_marks: task ? String(task.max_marks) : '10', due: task ? toLocalInput(task.due_at) : '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (f.title.trim().length < 3) return setError('Title kam se kam 3 akshar ka ho.')
    if (!/^\d+$/.test(f.max_marks) || Number(f.max_marks) < 1 || Number(f.max_marks) > 100) return setError('Max marks 1 se 100 ke beech ho.')
    if (!f.due) return setError('Deadline chuno.')
    const payload = { title: f.title, description: f.description, max_marks: Number(f.max_marks), due_at: new Date(f.due).toISOString() }
    setBusy(true)
    try {
      if (editing) await updateFacultyTask(token, task.id, payload)
      else await createFacultyTask(token, { ...payload, class_id: f.class_id })
      onDone(editing ? 'Assignment update ho gayi.' : 'Assignment ban gayi aur students ko notification gayi.')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base text-slate-900">{editing ? 'Assignment edit karo' : 'Nayi assignment'}</h3>
        <button type="button" className="text-slate-400 hover:text-slate-700" onClick={onCancel} aria-label="Close"><X size={18} /></button>
      </div>
      {error && <p className="font-body text-sm text-red-600">{error}</p>}
      {!editing && (
        <div>
          <label className="font-body text-sm text-slate-600 mb-1 block">Class aur subject</label>
          <select className={INPUT} value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value })}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.course} · Sem {c.semester} · {c.subject}{c.is_sample ? ' (SAMPLE)' : ''}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="font-body text-sm text-slate-600 mb-1 block">Title</label>
        <input className={INPUT} maxLength={150} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </div>
      <div>
        <label className="font-body text-sm text-slate-600 mb-1 block">Description / instructions</label>
        <textarea className={INPUT} rows={4} maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="font-body text-sm text-slate-600 mb-1 block">Max marks</label>
          <input className={INPUT} inputMode="numeric" value={f.max_marks} onChange={(e) => setF({ ...f, max_marks: e.target.value })} />
        </div>
        <div>
          <label className="font-body text-sm text-slate-600 mb-1 block">Deadline</label>
          <input className={INPUT} type="datetime-local" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
        </div>
      </div>
      <div className="flex gap-3">
        <button type="submit" className={GREEN} disabled={busy}>{busy ? 'Saving...' : editing ? 'Update' : 'Assignment banao'}</button>
        <button type="button" className={OUTLINE} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function Detail({ token, id, onBack }) {
  const [data, setData] = useState(null)
  const [grading, setGrading] = useState(null)
  const [marks, setMarks] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const load = useCallback(() => getFacultyTask(token, id).then((d) => { setData(d); setError('') }).catch((e) => setError(e.message)), [token, id])
  useEffect(() => { load() }, [load])

  function open(r) {
    setGrading(r); setMarks(r.marks === null ? '' : String(r.marks)); setFeedback(r.feedback || ''); setError(''); setOk('')
  }

  async function saveGrade() {
    const max = data.task.max_marks
    if (!/^\d+$/.test(marks) || Number(marks) > max) return setError(`Marks 0 se ${max} ke beech ke poore number hone chahiye.`)
    setBusy(true); setError('')
    try {
      await gradeFacultyTask(token, id, { student_id: grading.student_id, marks: Number(marks), feedback })
      setOk(`${grading.name} ke marks save ho gaye.`)
      setGrading(null)
      await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function file(r) {
    setError('')
    try { await downloadFacultySubmission(token, id, r.student_id, r.file_name) } catch (e) { setError(e.message) }
  }

  async function csv() {
    setError('')
    try { await downloadFacultyTaskCsv(token, id) } catch (e) { setError(e.message) }
  }

  if (!data) return <p className="font-body text-sm text-slate-500">{error || 'Loading...'}</p>
  const t = data.task
  const s = data.summary

  return (
    <div className="max-w-6xl mx-auto">
      <button className={`${OUTLINE} flex items-center gap-1.5 mb-4`} onClick={onBack}><ArrowLeft size={15} /> Assignments</button>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-xl text-slate-900">{t.title}</h2>
          <p className="font-body text-sm text-slate-500">{t.course} · Sem {t.semester} · {t.subject} · Max {t.max_marks}</p>
          <p className="font-body text-sm text-slate-500">Deadline: {fmt(t.due_at)} {t.closed && <span className="ml-1 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600">Band</span>}</p>
        </div>
        <button className={`${OUTLINE} flex items-center gap-1.5`} onClick={csv}><Download size={15} /> CSV</button>
      </div>
      {t.description && <p className="font-body text-sm text-slate-700 bg-white rounded-xl border border-slate-200 p-4 mb-4 whitespace-pre-line">{t.description}</p>}

      <div className="flex flex-wrap gap-3 mb-4 font-body text-sm">
        <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700">Students: {s.students}</span>
        <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-blue-700">Submitted: {s.submitted}</span>
        <span className="rounded-lg bg-green-50 px-3 py-1.5 text-green-700">Graded: {s.graded}</span>
        <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-amber-700">Late: {s.late}</span>
        <span className="rounded-lg bg-red-50 px-3 py-1.5 text-red-600">Baaki: {s.pending}</span>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700 mb-3">{ok}</p>}

      {grading && (
        <div className="bg-white rounded-xl border border-green-300 shadow-sm p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-display text-base text-slate-900">{grading.name} ({grading.college_id})</p>
            <button className="text-slate-400 hover:text-slate-700" onClick={() => setGrading(null)} aria-label="Close"><X size={18} /></button>
          </div>
          {grading.note && <p className="font-body text-sm text-slate-600 mb-3">Student ka note: {grading.note}</p>}
          <div className="grid sm:grid-cols-4 gap-4">
            <div>
              <label className="font-body text-sm text-slate-600 mb-1 block">Marks (max {t.max_marks})</label>
              <input className={INPUT} inputMode="numeric" value={marks} onChange={(e) => /^\d{0,3}$/.test(e.target.value) && setMarks(e.target.value)} />
            </div>
            <div className="sm:col-span-3">
              <label className="font-body text-sm text-slate-600 mb-1 block">Feedback</label>
              <textarea className={INPUT} rows={2} maxLength={1000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            </div>
          </div>
          <button className={`${GREEN} mt-4`} disabled={busy} onClick={saveGrade}>{busy ? 'Saving...' : 'Marks save karo'}</button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Student</th><th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Submitted</th><th className="px-4 py-3 font-medium">File</th>
              <th className="px-4 py-3 font-medium text-right">Marks</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Is class me koi student nahi hai.</td></tr>}
            {data.items.map((r) => {
              const [cls, label] = STATUS[r.status]
              return (
                <tr key={r.student_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-slate-900">{r.name}<span className="block text-xs text-slate-400">{r.college_id}</span></td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{label}</span>
                    {r.is_late && <span className="ml-1 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">Late</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{fmt(r.submitted_at)}</td>
                  <td className="px-4 py-3">
                    {r.file_name ? <button className="flex items-center gap-1.5 text-green-700 hover:underline" onClick={() => file(r)}><FileText size={14} /> {r.file_name}</button> : <span className="text-slate-400">-</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-900">{r.marks === null ? '-' : `${r.marks}/${t.max_marks}`}</td>
                  <td className="px-4 py-3 text-right">
                    {r.status === 'submitted' || r.status === 'graded' ? <button className={OUTLINE} onClick={() => open(r)}>{r.status === 'graded' ? 'Edit marks' : 'Grade'}</button> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function FacultyAssignmentsPage({ session }) {
  const token = session.access_token
  const [classes, setClasses] = useState([])
  const [filter, setFilter] = useState('')
  const [items, setItems] = useState([])
  const [form, setForm] = useState(null) // null | 'new' | task
  const [openId, setOpenId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    listFacultyClasses(token).then((d) => setClasses(d.items)).catch((e) => setError(e.message))
  }, [token])

  const load = useCallback(() => {
    return listFacultyTasks(token, filter).then((d) => { setItems(d.items); setError('') }).catch((e) => setError(e.message))
  }, [token, filter])

  useEffect(() => { setLoading(true); load().finally(() => setLoading(false)) }, [load])

  async function remove(t) {
    if (!window.confirm(`"${t.title}" delete karni hai?`)) return
    setError(''); setOk('')
    try { await deleteFacultyTask(token, t.id); setOk('Assignment delete ho gayi.'); await load() } catch (e) { setError(e.message) }
  }

  if (openId) return <Detail token={token} id={openId} onBack={() => { setOpenId(null); load() }} />

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <select className={`${INPUT} w-80 max-w-full`} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Saari classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.course} · Sem {c.semester} · {c.subject}</option>)}
        </select>
        <button className={`${GREEN} flex items-center gap-1.5`} disabled={classes.length === 0} onClick={() => { setForm('new'); setOk('') }}><Plus size={16} /> Nayi assignment</button>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700 mb-3">{ok}</p>}
      {classes.length === 0 && !loading && <p className="font-body text-sm text-slate-500 mb-3">Pehle Dashboard ya My Classes se sample classes banao.</p>}

      {form && (
        <TaskForm token={token} classes={classes} task={form === 'new' ? null : form} onCancel={() => setForm(null)}
          onDone={(m) => { setForm(null); setOk(m); load() }} />
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Assignment</th><th className="px-4 py-3 font-medium">Class</th>
              <th className="px-4 py-3 font-medium">Deadline</th><th className="px-4 py-3 font-medium text-right">Submitted</th>
              <th className="px-4 py-3 font-medium text-right">Graded</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Abhi koi assignment nahi hai.</td></tr>}
            {!loading && items.map((t) => (
              <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <button className="text-left text-slate-900 hover:text-green-700" onClick={() => setOpenId(t.id)}>{t.title}</button>
                  <span className="block text-xs text-slate-400">{t.subject} · Max {t.max_marks}</span>
                </td>
                <td className="px-4 py-3 text-slate-700">{t.course} · Sem {t.semester}{t.is_sample && <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">SAMPLE</span>}</td>
                <td className="px-4 py-3 text-slate-700">{fmt(t.due_at)}{t.closed && <span className="ml-1 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600">Band</span>}</td>
                <td className="px-4 py-3 text-right text-slate-700">{t.submitted}/{t.students}</td>
                <td className="px-4 py-3 text-right text-slate-700">{t.graded}/{t.submitted}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button className={OUTLINE} onClick={() => setOpenId(t.id)}>Dekho</button>
                    <button className={OUTLINE} aria-label="Edit" onClick={() => { setForm(t); setOk('') }}><Pencil size={14} /></button>
                    <button className={`${OUTLINE} text-red-600`} aria-label="Delete" onClick={() => remove(t)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}