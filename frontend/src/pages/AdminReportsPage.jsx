import { useCallback, useEffect, useState } from 'react'
import { BarChart3, Users, CalendarCheck, IndianRupee, AlertTriangle, GraduationCap, Briefcase, Library, MessageSquareWarning, Download, FileText } from 'lucide-react'
import { listCourses, reportCatalog, runReport, downloadReportCsv } from '../api.js'

const ACCENT = '#2563EB'
const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const ICONS = {
  students: Users, attendance: CalendarCheck, fees: IndianRupee, defaulters: AlertTriangle,
  results: GraduationCap, placement: Briefcase, library: Library, complaints: MessageSquareWarning,
}
const PAGE_SIZE = 15

function fmtCell(value, type) {
  if (value === null || value === undefined || value === '') return '-'
  if (type === 'money') return `₹${Number(value).toLocaleString('en-IN')}`
  if (type === 'percent') return `${value}%`
  if (type === 'number' && typeof value === 'number') return value.toLocaleString('en-IN')
  return value
}

const barColor = (v) => (v >= 75 ? '#16A34A' : v >= 50 ? '#D97706' : '#DC2626')

export default function AdminReportsPage({ session }) {
  const token = session.access_token
  const [catalog, setCatalog] = useState([])
  const [courses, setCourses] = useState([])
  const [key, setKey] = useState('')
  const [courseId, setCourseId] = useState('')
  const [semester, setSemester] = useState('')
  const [threshold, setThreshold] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    reportCatalog(token).then((d) => setCatalog(d.items)).catch((e) => setError(e.message))
    listCourses(token, { page: 1, pageSize: 100 }).then((d) => setCourses(d.items)).catch(() => setCourses([]))
  }, [token])

  const current = catalog.find((c) => c.key === key)
  const has = (f) => current && current.filters.includes(f)
  const th = threshold === '' ? '' : Math.min(100, Math.max(1, Number(threshold) || 1))
  const params = {
    courseId: has('course') ? courseId : '', semester: has('semester') ? semester : '',
    threshold: th, start: has('dates') ? start : '', end: has('dates') ? end : '',
  }

  const load = useCallback(() => {
    if (!key) { setData(null); return Promise.resolve() }
    setLoading(true)
    return runReport(token, key, params)
      .then((d) => { setData(d); setPage(1); setError('') })
      .catch((e) => { setData(null); setError(e.message) })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, key, courseId, semester, th, start, end])

  useEffect(() => { load() }, [load])

  async function download() {
    setBusy(true); setError('')
    try { await downloadReportCsv(token, key, params) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const course = courses.find((c) => c.id === courseId)
  const rows = data ? data.rows : []
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const view = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {catalog.map((c) => {
          const Icon = ICONS[c.key] || BarChart3
          const on = c.key === key
          return (
            <button key={c.key} onClick={() => { setKey(c.key); setError('') }}
              className={`text-left rounded-xl border p-4 shadow-sm transition ${on ? 'border-blue-400 ring-1 ring-blue-200 bg-blue-50/40' : 'border-slate-200 bg-white hover:shadow-md'}`}>
              <span className="w-10 h-10 rounded-xl flex items-center justify-center mb-2" style={{ background: on ? ACCENT : '#2563EB1A', color: on ? '#fff' : ACCENT }}><Icon size={19} /></span>
              <p className="font-display text-base text-slate-900">{c.title}</p>
              <p className="font-body text-xs text-slate-500 mt-0.5">{c.description}</p>
            </button>
          )
        })}
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}

      {!key ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center font-body text-sm text-slate-500">Upar se koi report chuno.</div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-2">
              {has('course') && (
                <select className={`${INPUT} w-60`} value={courseId} onChange={(e) => { setCourseId(e.target.value); setSemester('') }}>
                  <option value="">All courses</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {has('semester') && (
                <select className={`${INPUT} w-36`} value={semester} onChange={(e) => setSemester(e.target.value === '' ? '' : Number(e.target.value))}>
                  <option value="">All sem</option>
                  {Array.from({ length: course ? course.semesters : 8 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Semester {n}</option>)}
                </select>
              )}
              {has('threshold') && <div><p className="font-body text-xs text-slate-500 mb-1">Minimum %</p><input className={`${INPUT} w-24`} type="number" min={1} max={100} value={threshold} onChange={(e) => setThreshold(e.target.value)} /></div>}
              {has('dates') && (
                <>
                  <div><p className="font-body text-xs text-slate-500 mb-1">From</p><input className={`${INPUT} w-40`} type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
                  <div><p className="font-body text-xs text-slate-500 mb-1">To</p><input className={`${INPUT} w-40`} type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
                </>
              )}
              {current && current.filters.length === 0 && <span className="font-body text-sm text-slate-500">Is report me koi filter nahi hai.</span>}
            </div>
            <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy || !data || rows.length === 0} onClick={download}><Download size={15} /> {busy ? 'Downloading...' : 'CSV download'}</button>
          </div>

          {loading && <p className="font-body text-sm text-slate-500">Report ban rahi hai...</p>}
          {data && !loading && (
            <>
              <div className="flex flex-wrap gap-3 mb-4">
                {data.summary.map((s) => (
                  <div key={s.label} className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-3">
                    <p className="font-display text-xl text-slate-900">{fmtCell(s.value, s.type)}</p>
                    <p className="font-body text-xs text-slate-500">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full font-body text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                    {data.columns.map((c) => <th key={c.key} className={`px-4 py-3 font-medium ${['number', 'money', 'percent'].includes(c.type) ? 'text-right' : ''}`}>{c.label}</th>)}
                  </tr></thead>
                  <tbody>
                    {rows.length === 0 && <tr><td colSpan={data.columns.length} className="px-4 py-10 text-center text-slate-500"><FileText className="inline mr-1.5" size={16} />Is filter ke liye koi data nahi mila.</td></tr>}
                    {view.map((r, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                        {data.columns.map((c) => (
                          <td key={c.key} className={`px-4 py-3 text-slate-800 ${['number', 'money', 'percent'].includes(c.type) ? 'text-right' : ''}`}>
                            {c.type === 'percent' && typeof r[c.key] === 'number' ? (
                              <span className="inline-flex items-center gap-2 justify-end">
                                <span className="inline-block w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden"><span className="block h-full" style={{ width: `${Math.min(100, r[c.key])}%`, background: barColor(r[c.key]) }} /></span>{r[c.key]}%
                              </span>
                            ) : fmtCell(r[c.key], c.type)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between mt-3 font-body text-sm text-slate-500">
                <span>{rows.length} rows · {data.generated_on}</span>
                <div className="flex items-center gap-2">
                  <button className={OUTLINE} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                  <span>Page {page} / {pages}</span>
                  <button className={OUTLINE} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}