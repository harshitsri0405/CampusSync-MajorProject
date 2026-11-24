import { useEffect, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { studentMaterialsList, downloadStudentMaterial } from '../api.js'

const INPUT =
  'rounded-lg border border-purple-200 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-400'
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export default function StudentMaterialsPage({ session }) {
  const token = session.access_token
  const [items, setItems] = useState([])
  const [subjects, setSubjects] = useState([])
  const [categories, setCategories] = useState([])
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      studentMaterialsList(token, { subject, category, q })
        .then((d) => { setItems(d.items); setSubjects(d.subjects); setCategories(d.categories); setError('') })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [token, subject, category, q])

  async function download(m) {
    setError('')
    try {
      await downloadStudentMaterial(token, m.id, m.file_name)
      setItems((list) => list.map((x) => (x.id === m.id ? { ...x, downloads: x.downloads + 1 } : x)))
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-4">
        <h1 className="font-display text-2xl text-slate-900">Study Materials</h1>
        <p className="font-body text-sm text-slate-500">Tumhare course aur semester ke notes, PPT aur previous year papers.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input className={`${INPUT} w-64`} placeholder="Title se search karo" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={INPUT} value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">Saare subjects</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={INPUT} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Saari categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {loading && <p className="font-body text-sm text-slate-500">Loading...</p>}

      {!loading && items.length === 0 && (
        <div className="bg-white rounded-xl border border-purple-100 p-8 text-center font-body text-sm text-slate-500">
          Abhi koi study material available nahi hai.
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {items.map((m) => (
          <div key={m.id} className="bg-white rounded-xl border border-purple-100 shadow-sm p-4 flex flex-col">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-purple-50 text-[10px] font-medium uppercase text-purple-700">
                <FileText size={16} />{m.ext}
              </span>
              <div className="min-w-0">
                <p className="font-display text-base text-slate-900">{m.title}</p>
                <p className="font-body text-xs text-slate-500 mt-0.5">{m.subject} · {m.category}</p>
              </div>
            </div>
            {m.description && <p className="font-body text-sm text-slate-600 mt-2">{m.description}</p>}
            <div className="mt-auto pt-3 flex items-center justify-between">
              <span className="font-body text-xs text-slate-400">{fmtSize(m.size)} · {fmtDate(m.created_at)}</span>
              <button onClick={() => download(m)} className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 font-body text-sm text-white hover:bg-purple-700">
                <Download size={14} /> Download
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}