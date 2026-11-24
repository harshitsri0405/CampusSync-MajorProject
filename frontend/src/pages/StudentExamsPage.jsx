import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { studentExams, downloadStudentExamPaper } from '../api.js'

export default function StudentExamsPage({ session }) {
  const token = session.access_token
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { studentExams(token).then((d) => setItems(d.items)).catch((e) => setError(e.message)) }, [token])

  if (error) return <p className="font-body text-sm text-red-600">{error}</p>
  if (!items) return <p className="font-body text-sm text-slate-500">Loading...</p>

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="font-display text-2xl text-slate-900 mb-1">Internal Exams</h2>
      <p className="font-body text-sm text-slate-500 mb-5">Exam details, question papers and published results for your class.</p>
      {items.length === 0 && <p className="font-body text-sm text-slate-500">No exams have been created for your class yet.</p>}
      <div className="space-y-3">
        {items.map((e) => (
          <div key={e.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-display text-base text-slate-900">{e.name}</p>
                <p className="font-body text-xs text-slate-500">{e.subject} · {e.exam_type} · {e.max_marks} marks{e.exam_date ? ` · ${e.exam_date}` : ''}{e.duration_min ? ` · ${e.duration_min} min` : ''}</p>
              </div>
              {e.paper && (
                <button className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => downloadStudentExamPaper(token, e.id, e.paper.file_name).catch((x) => setError(x.message))}>
                  <Download size={15} /> Question paper
                </button>
              )}
            </div>
            {e.instructions && <p className="font-body text-sm text-slate-600 mt-2">{e.instructions}</p>}
            {e.result && (
              <div className="mt-3 rounded-lg bg-slate-50 p-3 font-body text-sm">
                {e.result.absent ? (
                  <p className="text-slate-700">You were marked absent for this exam.</p>
                ) : (
                  <p className="text-slate-800">
                    Your marks: <b>{e.result.marks} / {e.max_marks}</b> ({e.result.percent}%) ·{' '}
                    <span className={e.result.passed ? 'text-green-700' : 'text-red-600'}>{e.result.passed ? 'Pass' : 'Fail'}</span>
                  </p>
                )}
                {e.result.class_average !== null && <p className="text-xs text-slate-500 mt-1">Class average: {e.result.class_average} · Highest: {e.result.class_highest}</p>}
                {e.result.remarks && <p className="text-xs text-slate-500 mt-1">Remarks: {e.result.remarks}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}