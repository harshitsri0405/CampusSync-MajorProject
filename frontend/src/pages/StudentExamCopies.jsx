import { useEffect, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { studentExamCopies, downloadStudentExamCopy } from '../api.js'

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export default function StudentExamCopies({ token, semester }) {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    studentExamCopies(token).then((d) => setItems(d.items)).catch((e) => setError(e.message))
  }, [token])

  async function open(c) {
    setError('')
    try { await downloadStudentExamCopy(token, c.id, c.file_name) } catch (e) { setError(e.message) }
  }

  const list = items.filter((c) => c.semester === semester)

  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <p className="font-display text-base text-slate-900 mb-1">Exam copies</p>
      <p className="font-body text-xs text-slate-400 mb-3">Evaluated copies uploaded by your faculty appear here.</p>
      {error && <p className="font-body text-sm text-red-600 mb-2">{error}</p>}
      {list.length === 0 && <p className="font-body text-sm text-slate-500">No exam copies have been uploaded for this semester yet.</p>}
      <div className="space-y-2">
        {list.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-purple-100 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <FileText size={18} className="text-purple-600 shrink-0" />
              <div className="min-w-0">
                <p className="font-body text-sm text-slate-900">{c.subject} · {c.exam_name}</p>
                <p className="font-body text-xs text-slate-400">{fmtDate(c.uploaded_at)}</p>
              </div>
            </div>
            <button onClick={() => open(c)} className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 font-body text-sm text-white hover:bg-purple-700">
              <Download size={14} /> View copy
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}