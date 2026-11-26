import { useCallback, useEffect, useState } from 'react'
import { Download, Eye, EyeOff, Trash2, Upload } from 'lucide-react'
import {
  listFacultyClasses, facultyExamCopyMeta, facultyExamCopyList, facultyExamCopyUpload,
  facultyExamCopyVisibility, facultyExamCopyDelete, downloadFacultyExamCopy,
} from '../api.js'

const INPUT =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export default function FacultyExamCopiesTab({ session }) {
  const token = session.access_token
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [meta, setMeta] = useState({ exams: [], max_mb: 10 })
  const [exam, setExam] = useState('Internal Test 1')
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    Promise.all([listFacultyClasses(token), facultyExamCopyMeta(token)])
      .then(([c, m]) => { setClasses(c.items); setMeta(m); if (c.items.length) setClassId(c.items[0].id) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  const load = useCallback(() => {
    if (!classId || !exam.trim()) return Promise.resolve()
    return facultyExamCopyList(token, classId, exam.trim())
      .then((d) => { setData(d); setError('') })
      .catch((e) => { setData(null); setError(e.message) })
  }, [token, classId, exam])

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [load])

  async function upload(student, file) {
    if (!file) return
    setError(''); setOk('')
    if (file.size > meta.max_mb * 1048576) return setError(`The file is larger than ${meta.max_mb} MB.`)
    setBusyId(student.id)
    try {
      const fd = new FormData()
      fd.append('assignment_id', classId)
      fd.append('student_id', student.id)
      fd.append('exam_name', exam.trim())
      fd.append('file', file)
      await facultyExamCopyUpload(token, fd)
      setOk(`The copy for ${student.name} was uploaded.`)
      await load()
    } catch (e) { setError(e.message) } finally { setBusyId('') }
  }

  async function toggle(student) {
    setError(''); setOk(''); setBusyId(student.id)
    try { await facultyExamCopyVisibility(token, student.copy.id, !student.copy.is_visible); await load() } catch (e) { setError(e.message) } finally { setBusyId('') }
  }

  async function remove(student) {
    if (!window.confirm(`Remove the copy for ${student.name}?`)) return
    setError(''); setOk(''); setBusyId(student.id)
    try { await facultyExamCopyDelete(token, student.copy.id); await load() } catch (e) { setError(e.message) } finally { setBusyId('') }
  }

  async function view(student) {
    setError('')
    try { await downloadFacultyExamCopy(token, student.copy.id, student.copy.file_name) } catch (e) { setError(e.message) }
  }

  if (loading) return <p className="font-body text-sm text-slate-500">Loading...</p>
  if (classes.length === 0) {
    return <div className="bg-white rounded-xl border border-slate-200 p-8 text-center font-body text-sm text-slate-500">No classes are assigned yet.</div>
  }

  const rows = data ? data.items.filter((s) => `${s.name} ${s.college_id}`.toLowerCase().includes(q.trim().toLowerCase())) : []

  return (
    <div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <p className="font-body text-xs text-slate-500 mb-1">Class and subject</p>
          <select className={`${INPUT} w-80 max-w-full`} value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.course} · Sem {c.semester} · {c.subject}{c.is_sample ? ' (SAMPLE)' : ''}</option>)}
          </select>
        </div>
        <div>
          <p className="font-body text-xs text-slate-500 mb-1">Exam</p>
          <input className={`${INPUT} w-56`} list="exam-names" maxLength={60} value={exam} onChange={(e) => setExam(e.target.value)} />
          <datalist id="exam-names">{meta.exams.map((x) => <option key={x} value={x} />)}</datalist>
        </div>
        <input className={`${INPUT} w-56`} placeholder="Student search" value={q} onChange={(e) => setQ(e.target.value)} />
        {data && <span className="font-body text-sm text-slate-500 ml-auto">Upload: {data.uploaded} / {data.total}</span>}
      </div>

      <p className="font-body text-xs text-slate-500 mb-3">
        Upload each student's copy as a PDF or photo (JPG/PNG, max {meta.max_mb} MB). Students will see it on their Results page.
        Uploading again replaces the previous copy.
      </p>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700 mb-3">{ok}</p>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Student</th><th className="px-4 py-3 font-medium">Copy</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">No students found.</td></tr>}
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5 text-slate-900">{s.name}<span className="block text-xs text-slate-400">{s.college_id}</span></td>
                <td className="px-4 py-2.5 text-xs">
                  {s.copy ? (
                    <span className="text-slate-700">
                      {s.copy.file_name} · {fmtSize(s.copy.size)} · {fmtDate(s.copy.uploaded_at)}
                      {!s.copy.is_visible && <span className="ml-2 text-amber-700">Hidden from student</span>}
                    </span>
                  ) : <span className="text-slate-400">Not uploaded</span>}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap justify-end gap-2">
                    {busyId === s.id ? <span className="text-xs text-slate-500 py-1.5">Ruko...</span> : (
                      <>
                        <label className={`${OUTLINE} inline-flex items-center gap-1.5 cursor-pointer`}>
                          <Upload size={14} /> {s.copy ? 'Badlo' : 'Upload'}
                          <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden"
                            onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; upload(s, f) }} />
                        </label>
                        {s.copy && (
                          <>
                            <button className={`${OUTLINE} inline-flex items-center gap-1.5`} onClick={() => view(s)}><Download size={14} /> View</button>
                            <button className={`${OUTLINE} inline-flex items-center gap-1.5`} onClick={() => toggle(s)}>
                              {s.copy.is_visible ? <><EyeOff size={14} /> Hide</> : <><Eye size={14} /> Show</>}
                            </button>
                            <button className={`${OUTLINE} inline-flex items-center gap-1.5 text-red-600`} onClick={() => remove(s)}><Trash2 size={14} /> Remove</button>
                          </>
                        )}
                      </>
                    )}
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