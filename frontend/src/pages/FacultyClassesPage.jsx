import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Search, Users } from 'lucide-react'
import { listFacultyClasses, facultyClassStudents, seedDemoFacultyClasses } from '../api.js'

const INPUT =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'

function StudentList({ token, cls, onBack }) {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    return facultyClassStudents(token, cls.id, { q, page, pageSize: 10 })
      .then((d) => { setData(d); setError('') })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, cls.id, q, page])

  useEffect(() => { load() }, [load])

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1

  return (
    <div className="max-w-5xl mx-auto">
      <button className={`${OUTLINE} flex items-center gap-1.5 mb-4`} onClick={onBack}><ArrowLeft size={15} /> My classes</button>
      <div className="mb-4">
        <h2 className="font-display text-xl text-slate-900">{cls.subject}</h2>
        <p className="font-body text-sm text-slate-500">{cls.course} · Semester {cls.semester}{cls.is_sample ? ' · SAMPLE class' : ''}</p>
      </div>
      <div className="relative mb-3 w-72">
        <Search size={15} className="absolute left-3 top-3 text-slate-400" />
        <input className={`${INPUT} w-full pl-9`} placeholder="Naam ya College ID" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
      </div>
      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">#</th><th className="px-4 py-3 font-medium">Student</th>
              <th className="px-4 py-3 font-medium">College ID</th><th className="px-4 py-3 font-medium">Course</th><th className="px-4 py-3 font-medium">Semester</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>}
            {!loading && data && data.items.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Koi student nahi mila.</td></tr>}
            {!loading && data && data.items.map((s, i) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3 text-slate-400">{(page - 1) * 10 + i + 1}</td>
                <td className="px-4 py-3 text-slate-900">{s.name}</td>
                <td className="px-4 py-3 text-slate-700">{s.college_id}</td>
                <td className="px-4 py-3 text-slate-700">{s.course}</td>
                <td className="px-4 py-3 text-slate-700">{s.semester}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && (
        <div className="flex items-center justify-between mt-3 font-body text-sm text-slate-500">
          <span>Total: {data.total}</span>
          <div className="flex items-center gap-2">
            <button className={OUTLINE} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page} / {pages}</span>
            <button className={OUTLINE} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function FacultyClassesPage({ session }) {
  const token = session.access_token
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    return listFacultyClasses(token).then((d) => setItems(d.items)).catch((e) => setError(e.message))
  }, [token])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  async function seed() {
    setBusy(true); setError(''); setMsg('')
    try { setMsg((await seedDemoFacultyClasses(token)).message); await load() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (open) return <StudentList token={token} cls={open} onBack={() => setOpen(null)} />
  if (loading) return <p className="font-body text-sm text-slate-500">Loading...</p>

  return (
    <div className="max-w-5xl mx-auto">
      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {msg && <p className="font-body text-sm text-green-700 mb-3">{msg}</p>}

      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="font-display text-base text-slate-900 mb-1">Abhi koi class assign nahi hai</p>
          <p className="font-body text-sm text-slate-500 mb-4">Admin classes assign karta hai. Testing ke liye sample classes bana sakte ho.</p>
          <button className="rounded-md bg-green-600 px-4 py-2 font-body text-sm text-white hover:bg-green-700 disabled:opacity-60" disabled={busy} onClick={seed}>
            {busy ? 'Ban rahi hain...' : 'Load sample classes'}
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((c) => (
            <button key={c.id} onClick={() => setOpen(c)} className="text-left bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition">
              <p className="font-display text-base text-slate-900">{c.subject}</p>
              <p className="font-body text-sm text-slate-500 mb-3">{c.course} · Semester {c.semester}</p>
              <div className="flex items-center justify-between">
                <span className="font-body text-sm text-green-700 flex items-center gap-1.5"><Users size={15} /> {c.students} students</span>
                {c.is_sample && <span className="rounded bg-amber-50 px-1.5 py-0.5 font-body text-xs text-amber-700">SAMPLE</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}