import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Upload, Download, Eye, EyeOff, Send, Save, Pencil, X } from 'lucide-react'
import {
  listFacultyClasses, facultyExamMeta, facultyExamList, facultyExamCreate, facultyExamUpdate, facultyExamDelete,
  facultyExamMarks, facultyExamSaveMarks, facultyExamPublish, facultyExamPaperUpload, facultyExamPaperRelease,
  facultyExamPaperDelete, downloadFacultyExamPaper, facultyExamReport, downloadFacultyExamReportCsv,
} from '../api.js'

const EMPTY = { name: '', exam_type: 'Internal Test', max_marks: 20, pass_percent: 40, exam_date: '', duration_min: 60, instructions: '' }
const input = 'w-full rounded-md border border-slate-300 px-3 py-2 font-body text-sm focus:outline-none focus:ring-2 focus:ring-green-500'
const btn = 'inline-flex items-center gap-1.5 rounded-md px-3 py-2 font-body text-sm disabled:opacity-60'

function ExamForm({ initial, types, onSave, onCancel, busy }) {
  const [f, setF] = useState(initial)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  return (
    <form
      className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ ...f, max_marks: Number(f.max_marks), pass_percent: Number(f.pass_percent), duration_min: Number(f.duration_min), exam_date: f.exam_date || null })
      }}
    >
      <h3 className="font-display text-base text-slate-900 mb-3">{initial.id ? 'Edit exam' : 'Create internal exam'}</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="font-body text-xs text-slate-600">Exam name
          <input className={input} required minLength={2} maxLength={120} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Internal Test 1" />
        </label>
        <label className="font-body text-xs text-slate-600">Type
          <select className={input} value={f.exam_type} onChange={(e) => set('exam_type', e.target.value)}>
            {types.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="font-body text-xs text-slate-600">Exam date
          <input type="date" className={input} value={f.exam_date || ''} onChange={(e) => set('exam_date', e.target.value)} />
        </label>
        <label className="font-body text-xs text-slate-600">Maximum marks
          <input type="number" step="0.5" min="1" max="1000" required className={input} value={f.max_marks} onChange={(e) => set('max_marks', e.target.value)} />
        </label>
        <label className="font-body text-xs text-slate-600">Pass percentage
          <input type="number" min="0" max="100" required className={input} value={f.pass_percent} onChange={(e) => set('pass_percent', e.target.value)} />
        </label>
        <label className="font-body text-xs text-slate-600">Duration (minutes)
          <input type="number" min="0" max="600" className={input} value={f.duration_min} onChange={(e) => set('duration_min', e.target.value)} />
        </label>
      </div>
      <label className="block font-body text-xs text-slate-600 mt-3">Instructions for students (optional)
        <textarea className={input} rows={2} maxLength={2000} value={f.instructions} onChange={(e) => set('instructions', e.target.value)} />
      </label>
      <div className="flex gap-2 mt-4">
        <button type="submit" disabled={busy} className={`${btn} bg-green-600 text-white hover:bg-green-700`}><Save size={15} /> {busy ? 'Saving...' : 'Save exam'}</button>
        <button type="button" onClick={onCancel} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>Cancel</button>
      </div>
    </form>
  )
}

function MarksTab({ token, exam, onChanged, setError, setOk }) {
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const locked = exam.results_published

  const load = useCallback(() => {
    return facultyExamMarks(token, exam.id).then((d) => setRows(d.rows)).catch((e) => setError(e.message))
  }, [token, exam.id, setError])
  useEffect(() => { load() }, [load])

  const patch = (id, v) => setRows((rs) => rs.map((r) => (r.student_id === id ? { ...r, ...v } : r)))

  async function save() {
    setBusy(true); setError(''); setOk('')
    try {
      const payload = rows.map((r) => ({
        student_id: r.student_id, absent: r.absent, remarks: r.remarks || '',
        marks: r.absent || r.marks === '' || r.marks === null ? null : Number(r.marks),
      }))
      const res = await facultyExamSaveMarks(token, exam.id, payload)
      setOk(res.message)
      await load(); onChanged()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (!rows) return <p className="font-body text-sm text-slate-500">Loading...</p>
  return (
    <div>
      {locked && <p className="font-body text-xs text-amber-700 mb-2">Results are published. Unpublish them to edit marks.</p>}
      <div className="overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
            <th className="py-2 pr-3">Student</th><th className="pr-3">College ID</th><th className="pr-3">Marks / {exam.max_marks}</th><th className="pr-3">Absent</th><th>Remarks</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.student_id} className="border-b border-slate-100">
                <td className="py-2 pr-3 text-slate-800">{r.name}</td>
                <td className="pr-3 text-slate-500">{r.college_id}</td>
                <td className="pr-3">
                  <input type="number" step="0.5" min="0" max={exam.max_marks} disabled={locked || r.absent} className="w-24 rounded-md border border-slate-300 px-2 py-1 disabled:bg-slate-100"
                    value={r.marks ?? ''} onChange={(e) => patch(r.student_id, { marks: e.target.value })} />
                </td>
                <td className="pr-3"><input type="checkbox" disabled={locked} checked={r.absent} onChange={(e) => patch(r.student_id, { absent: e.target.checked, marks: e.target.checked ? null : r.marks })} /></td>
                <td><input className="w-full min-w-[8rem] rounded-md border border-slate-300 px-2 py-1 disabled:bg-slate-100" maxLength={200} disabled={locked} value={r.remarks || ''} onChange={(e) => patch(r.student_id, { remarks: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="font-body text-sm text-slate-500 py-3">No students in this class.</p>}
      {!locked && rows.length > 0 && (
        <button onClick={save} disabled={busy} className={`${btn} mt-4 bg-green-600 text-white hover:bg-green-700`}><Save size={15} /> {busy ? 'Saving...' : 'Save marks'}</button>
      )}
    </div>
  )
}

function PaperTab({ token, exam, meta, onChanged, setError, setOk }) {
  const [busy, setBusy] = useState(false)
  const paper = exam.paper

  async function run(fn) {
    setBusy(true); setError(''); setOk('')
    try { const r = await fn(); if (r?.message) setOk(r.message); await onChanged() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  function pick(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    if (file.size > meta.max_mb * 1048576) return setError(`The file is larger than ${meta.max_mb} MB.`)
    const fd = new FormData()
    fd.append('file', file)
    run(() => facultyExamPaperUpload(token, exam.id, fd))
  }

  return (
    <div>
      <p className="font-body text-sm text-slate-600 mb-3">Upload the question paper as PDF or DOCX (max {meta.max_mb} MB). It stays hidden from students until you release it.</p>
      {paper ? (
        <div className="rounded-lg border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-body text-sm text-slate-800">{paper.file_name}</p>
            <p className="font-body text-xs text-slate-500">{(paper.size / 1024).toFixed(0)} KB · {paper.released ? 'Visible to students' : 'Hidden from students'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`} onClick={() => downloadFacultyExamPaper(token, exam.id, paper.file_name).catch((e) => setError(e.message))}><Download size={15} /> Download</button>
            <button disabled={busy} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`} onClick={() => run(() => facultyExamPaperRelease(token, exam.id, !paper.released))}>
              {paper.released ? <><EyeOff size={15} /> Hide</> : <><Eye size={15} /> Release to students</>}
            </button>
            <label className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer`}><Upload size={15} /> Replace
              <input type="file" accept=".pdf,.docx" className="hidden" onChange={pick} />
            </label>
            <button disabled={busy} className={`${btn} border border-red-200 text-red-600 hover:bg-red-50`} onClick={() => window.confirm('Delete this question paper?') && run(() => facultyExamPaperDelete(token, exam.id))}><Trash2 size={15} /> Delete</button>
          </div>
        </div>
      ) : (
        <label className={`${btn} bg-green-600 text-white hover:bg-green-700 cursor-pointer`}><Upload size={15} /> {busy ? 'Uploading...' : 'Upload question paper'}
          <input type="file" accept=".pdf,.docx" className="hidden" onChange={pick} />
        </label>
      )}
    </div>
  )
}

function ReportTab({ token, exam, setError }) {
  const [r, setR] = useState(null)
  useEffect(() => { facultyExamReport(token, exam.id).then(setR).catch((e) => setError(e.message)) }, [token, exam.id, exam.entered, exam.results_published, setError])
  if (!r) return <p className="font-body text-sm text-slate-500">Loading...</p>
  const s = r.summary
  const f = (v, suffix = '') => (v === null || v === undefined ? '-' : `${v}${suffix}`)
  const stats = [
    ['Students', s.total], ['Appeared', s.appeared], ['Absent', s.absent], ['Not entered', s.not_entered],
    ['Passed', s.passed], ['Failed', s.failed], ['Pass rate', f(s.pass_rate, '%')], ['Average', f(s.average)],
    ['Highest', f(s.highest)], ['Lowest', f(s.lowest)],
  ]
  const maxCount = Math.max(1, ...r.distribution.map((d) => d.count))
  return (
    <div>
      <div className="flex justify-end mb-3">
        <button className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`} onClick={() => downloadFacultyExamReportCsv(token, exam.id).catch((e) => setError(e.message))}><Download size={15} /> Export CSV</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {stats.map(([l, v]) => (
          <div key={l} className="rounded-lg border border-slate-200 p-3"><p className="font-display text-xl text-slate-900">{v}</p><p className="font-body text-xs text-slate-500">{l}</p></div>
        ))}
      </div>
      <h4 className="font-display text-sm text-slate-900 mb-2">Score distribution</h4>
      <div className="space-y-1.5 mb-5">
        {r.distribution.map((d) => (
          <div key={d.label} className="flex items-center gap-3 font-body text-xs text-slate-600">
            <span className="w-24">{d.label}</span>
            <div className="flex-1 h-3 rounded bg-slate-100"><div className="h-3 rounded bg-green-500" style={{ width: `${(d.count / maxCount) * 100}%` }} /></div>
            <span className="w-6 text-right">{d.count}</span>
          </div>
        ))}
      </div>
      {r.toppers.length > 0 && (
        <>
          <h4 className="font-display text-sm text-slate-900 mb-2">Top performers</h4>
          <ol className="list-decimal pl-5 font-body text-sm text-slate-700 mb-5">
            {r.toppers.map((t) => <li key={t.student_id}>{t.name} - {t.marks} / {r.exam.max_marks} ({t.percent}%)</li>)}
          </ol>
        </>
      )}
      <h4 className="font-display text-sm text-slate-900 mb-2">All students</h4>
      <div className="overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200"><th className="py-2 pr-3">Student</th><th className="pr-3">College ID</th><th className="pr-3">Marks</th><th className="pr-3">Percent</th><th>Status</th></tr></thead>
          <tbody>
            {r.rows.map((x) => (
              <tr key={x.student_id} className="border-b border-slate-100">
                <td className="py-2 pr-3">{x.name}</td><td className="pr-3 text-slate-500">{x.college_id}</td>
                <td className="pr-3">{f(x.marks)}</td><td className="pr-3">{f(x.percent, '%')}</td>
                <td className={x.status === 'Pass' ? 'text-green-700' : x.status === 'Fail' ? 'text-red-600' : 'text-slate-500'}>{x.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function FacultyExamsPage({ session }) {
  const token = session.access_token
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [meta, setMeta] = useState({ types: ['Internal Test'], max_mb: 10 })
  const [exams, setExams] = useState([])
  const [selId, setSelId] = useState('')
  const [tab, setTab] = useState('marks')
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    Promise.all([listFacultyClasses(token), facultyExamMeta(token)])
      .then(([c, m]) => { setClasses(c.items); setMeta(m); if (c.items.length) setClassId(c.items[0].id) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  const load = useCallback(() => {
    if (!classId) return Promise.resolve()
    return facultyExamList(token, classId).then((d) => { setExams(d.items); setError('') }).catch((e) => setError(e.message))
  }, [token, classId])
  useEffect(() => { setSelId(''); setForm(null); load() }, [load])

  const exam = exams.find((e) => e.id === selId)

  async function save(values) {
    setBusy(true); setError(''); setOk('')
    try {
      if (form.id) await facultyExamUpdate(token, form.id, values)
      else { const created = await facultyExamCreate(token, { ...values, assignment_id: classId }); setSelId(created.id); setTab('marks') }
      setOk('Exam saved.'); setForm(null); await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function togglePublish() {
    setBusy(true); setError(''); setOk('')
    try { const r = await facultyExamPublish(token, exam.id, !exam.results_published); setOk(r.message); await load() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function remove() {
    if (!window.confirm(`Delete "${exam.name}" along with all its marks and question paper?`)) return
    setBusy(true); setError(''); setOk('')
    try { await facultyExamDelete(token, exam.id); setSelId(''); setOk('Exam deleted.'); await load() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (loading) return <p className="font-body text-sm text-slate-500">Loading...</p>
  if (!classes.length) return <p className="font-body text-sm text-slate-500">No classes are assigned to you yet.</p>

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h2 className="font-display text-2xl text-slate-900">Examination Management</h2>
          <p className="font-body text-sm text-slate-500">Create internal exams, upload question papers, publish results and review exam reports.</p>
        </div>
        <div className="flex gap-2">
          <select className="rounded-md border border-slate-300 px-3 py-2 font-body text-sm" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.subject} · {c.course} · Sem {c.semester}</option>)}
          </select>
          <button className={`${btn} bg-green-600 text-white hover:bg-green-700`} onClick={() => setForm({ ...EMPTY })}><Plus size={15} /> New exam</button>
        </div>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700 mb-3">{ok}</p>}

      {form && <ExamForm initial={form} types={meta.types} busy={busy} onSave={save} onCancel={() => setForm(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="space-y-2">
          {exams.length === 0 && <p className="font-body text-sm text-slate-500">No exams created for this class yet.</p>}
          {exams.map((e) => (
            <button key={e.id} onClick={() => { setSelId(e.id); setTab('marks'); setError(''); setOk('') }}
              className={`w-full text-left rounded-xl border p-4 transition ${e.id === selId ? 'border-green-500 bg-green-50' : 'border-slate-200 bg-white hover:shadow-sm'}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-sm text-slate-900">{e.name}</p>
                <span className={`rounded px-1.5 py-0.5 text-xs ${e.results_published ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{e.results_published ? 'Published' : 'Draft'}</span>
              </div>
              <p className="font-body text-xs text-slate-500 mt-1">{e.exam_type} · {e.max_marks} marks{e.exam_date ? ` · ${e.exam_date}` : ''}</p>
              <p className="font-body text-xs text-slate-500">Marks entered: {e.entered} / {e.total}</p>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          {!exam ? (
            <p className="font-body text-sm text-slate-500">Select an exam to enter marks, manage the question paper or view its report.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h3 className="font-display text-lg text-slate-900">{exam.name}</h3>
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`} onClick={() => setForm({ ...exam, exam_date: exam.exam_date || '' })}><Pencil size={15} /> Edit</button>
                  <button disabled={busy} className={`${btn} ${exam.results_published ? 'border border-amber-300 text-amber-700 hover:bg-amber-50' : 'bg-green-600 text-white hover:bg-green-700'}`} onClick={togglePublish}>
                    {exam.results_published ? <><X size={15} /> Unpublish results</> : <><Send size={15} /> Publish results</>}
                  </button>
                  <button disabled={busy} className={`${btn} border border-red-200 text-red-600 hover:bg-red-50`} onClick={remove}><Trash2 size={15} /> Delete</button>
                </div>
              </div>
              <div className="flex gap-1 border-b border-slate-200 mb-4">
                {[['marks', 'Marks entry'], ['paper', 'Question paper'], ['report', 'Report']].map(([k, l]) => (
                  <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 font-body text-sm border-b-2 -mb-px ${tab === k ? 'border-green-600 text-green-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{l}</button>
                ))}
              </div>
              {tab === 'marks' && <MarksTab key={exam.id + String(exam.results_published)} token={token} exam={exam} onChanged={load} setError={setError} setOk={setOk} />}
              {tab === 'paper' && <PaperTab token={token} exam={exam} meta={meta} onChanged={load} setError={setError} setOk={setOk} />}
              {tab === 'report' && <ReportTab token={token} exam={exam} setError={setError} />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}