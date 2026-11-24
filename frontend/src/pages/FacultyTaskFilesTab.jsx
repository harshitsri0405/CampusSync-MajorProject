import { useCallback, useEffect, useState } from 'react'
import { Download, Paperclip, Trash2, Upload } from 'lucide-react'
import { listFacultyClasses, facultyTaskFileTasks, facultyTaskFileUpload, facultyTaskFileDelete, downloadFacultyTaskFile } from '../api.js'

const INPUT =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
const fmtDue = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')

export default function FacultyTaskFilesTab({ session }) {
  const token = session.access_token
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    listFacultyClasses(token)
      .then((c) => { setClasses(c.items); if (c.items.length) setClassId(c.items[0].id) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  const load = useCallback(() => {
    if (!classId) return Promise.resolve()
    return facultyTaskFileTasks(token, classId).then((d) => { setData(d); setError('') }).catch((e) => { setData(null); setError(e.message) })
  }, [token, classId])

  useEffect(() => { load() }, [load])

  async function upload(task, file) {
    if (!file) return
    setError(''); setOk('')
    if (data && file.size > data.max_mb * 1048576) return setError(`File ${data.max_mb} MB se badi hai.`)
    setBusyId(task.id)
    try {
      const fd = new FormData()
      fd.append('assignment_id', task.id)
      fd.append('file', file)
      await facultyTaskFileUpload(token, fd)
      setOk('File attach ho gayi. Students ko notification bhej diya.')
      await load()
    } catch (e) { setError(e.message) } finally { setBusyId('') }
  }

  async function remove(f) {
    if (!window.confirm(`"${f.file_name}" hata dein?`)) return
    setError(''); setOk('')
    try { await facultyTaskFileDelete(token, f.id); await load() } catch (e) { setError(e.message) }
  }

  async function download(f) {
    setError('')
    try { await downloadFacultyTaskFile(token, f.id, f.file_name) } catch (e) { setError(e.message) }
  }

  if (loading) return <p className="font-body text-sm text-slate-500">Loading...</p>
  if (classes.length === 0) {
    return <div className="bg-white rounded-xl border border-slate-200 p-8 text-center font-body text-sm text-slate-500">Abhi koi class assign nahi hai.</div>
  }

  return (
    <div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <p className="font-body text-xs text-slate-500 mb-1">Class aur subject</p>
        <select className={`${INPUT} w-80 max-w-full`} value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.course} · Sem {c.semester} · {c.subject}{c.is_sample ? ' (SAMPLE)' : ''}</option>)}
        </select>
      </div>

      <p className="font-body text-xs text-slate-500 mb-3">
        Apni banayi hui assignment me question paper ya reference file attach karo (PDF, DOC, PPT, XLS, TXT, image; max {data ? data.max_mb : 10} MB,
        ek assignment me {data ? data.max_files : 3} files tak). Students ko ye Assignments page me dikhegi.
      </p>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700 mb-3">{ok}</p>}

      <div className="space-y-3">
        {data && data.items.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center font-body text-sm text-slate-500">
            Is class me abhi aapne koi assignment nahi banayi. Pehle "Assignments" tab me banao.
          </div>
        )}
        {data && data.items.map((t) => (
          <div key={t.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-base text-slate-900">{t.title}</p>
                <p className="font-body text-xs text-slate-500 mt-0.5">Deadline: {fmtDue(t.due_at)}</p>
              </div>
              {busyId === t.id ? <span className="text-xs text-slate-500">Upload ho raha hai...</span> : (
                data.items && t.files.length < data.max_files && (
                  <label className={`${OUTLINE} inline-flex items-center gap-1.5 cursor-pointer`}>
                    <Upload size={14} /> File attach karo
                    <input type="file" className="hidden" onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; upload(t, f) }} />
                  </label>
                )
              )}
            </div>
            {t.files.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {t.files.map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 font-body text-sm">
                    <span className="flex items-center gap-2 text-slate-700"><Paperclip size={14} /> {f.file_name} <span className="text-xs text-slate-400">{fmtSize(f.size)}</span></span>
                    <span className="flex gap-2">
                      <button className={`${OUTLINE} inline-flex items-center gap-1.5`} onClick={() => download(f)}><Download size={14} /> Dekho</button>
                      <button className={`${OUTLINE} inline-flex items-center gap-1.5 text-red-600`} onClick={() => remove(f)}><Trash2 size={14} /> Hatao</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}