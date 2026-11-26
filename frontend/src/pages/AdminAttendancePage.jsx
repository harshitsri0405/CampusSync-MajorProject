import { useCallback, useEffect, useState } from 'react'
import { Users, Percent, AlertTriangle, BookOpen, Search, X, Database } from 'lucide-react'
import { listCourses, attendanceOverview, attendanceStudent, seedDemoAttendance } from '../api.js'

const ACCENT = '#2563EB'
const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const STATUS = {
  low: { label: 'Low', cls: 'bg-red-50 text-red-700 border-red-200' },
  ok: { label: 'OK', cls: 'bg-green-50 text-green-700 border-green-200' },
  no_data: { label: 'No data', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
}
const PAGE_SIZE = 10

const fmt = (d) => {
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}
const colorFor = (pct, th) => (pct === null || pct === undefined ? '#94A3B8' : pct < th ? '#DC2626' : '#16A34A')

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
      <span className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${color}1A`, color }}><Icon size={20} /></span>
      <div>
        <p className="font-display text-2xl text-slate-900 leading-tight">{value}</p>
        <p className="font-body text-xs text-slate-500">{label}</p>
      </div>
    </div>
  )
}

function Bar({ pct, threshold }) {
  return (
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct || 0}%`, background: colorFor(pct, threshold) }} />
    </div>
  )
}

export default function AdminAttendancePage({ session }) {
  const token = session.access_token
  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState('')
  const [semester, setSemester] = useState(1)
  const [threshold, setThreshold] = useState(75)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    listCourses(token, { page: 1, pageSize: 100, status: 'active' }).then((d) => setCourses(d.items)).catch((e) => setError(e.message))
  }, [token])

  useEffect(() => { setPage(1) }, [courseId, semester, threshold, start, end, search, status])

  const load = useCallback(() => {
    if (!courseId) { setData(null); return Promise.resolve() }
    const th = Math.min(100, Math.max(1, Number(threshold) || 75))
    setLoading(true)
    return attendanceOverview(token, { courseId, semester, threshold: th, start, end, search, status, page, pageSize: PAGE_SIZE })
      .then((d) => { setData(d); setError('') })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, courseId, semester, threshold, start, end, search, status, page])

  useEffect(() => { load() }, [load])

  async function openStudent(id) {
    setError('')
    try { setDetail(await attendanceStudent(token, id, { start, end })) } catch (e) { setError(e.message) }
  }

  async function seed() {
    setBusy(true); setError(''); setInfo('')
    try { const r = await seedDemoAttendance(token); setInfo(r.message); await load() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const course = courses.find((c) => c.id === courseId)
  const th = Math.min(100, Math.max(1, Number(threshold) || 75))
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const st = data && data.stats

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2 items-end">
          <select className={`${INPUT} w-64`} value={courseId} onChange={(e) => { setCourseId(e.target.value); setSemester(1) }}>
            <option value="">Select course</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.department_name})</option>)}
          </select>
          <select className={`${INPUT} w-36`} value={semester} onChange={(e) => setSemester(Number(e.target.value))}>
            {Array.from({ length: course ? course.semesters : 8 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Semester {n}</option>)}
          </select>
          <div><p className="font-body text-xs text-slate-500 mb-1">From</p><input className={`${INPUT} w-40`} type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><p className="font-body text-xs text-slate-500 mb-1">To</p><input className={`${INPUT} w-40`} type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <div><p className="font-body text-xs text-slate-500 mb-1">Minimum %</p><input className={`${INPUT} w-24`} type="number" min={1} max={100} value={threshold} onChange={(e) => setThreshold(e.target.value)} /></div>
        </div>
        <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy} onClick={seed}><Database size={15} /> Sample data</button>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {info && <p className="font-body text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{info}</p>}

      {!courseId ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center font-body text-sm text-slate-500">Attendance dekhne ke liye course aur semester chuno.</div>
      ) : !data ? (
        <p className="font-body text-sm text-slate-500">Loading...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Stat icon={Users} label={`Students (${st.with_data} ka data hai)`} value={st.students} color="#2563EB" />
            <Stat icon={Percent} label="Class average" value={st.avg_pct === null ? '-' : `${st.avg_pct}%`} color={colorFor(st.avg_pct, th)} />
            <Stat icon={AlertTriangle} label={`${th}% se kam`} value={st.below} color="#DC2626" />
            <Stat icon={BookOpen} label="Subjects" value={st.subjects} color="#7C3AED" />
          </div>

          {st.with_data === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center font-body text-sm text-slate-500 mb-4">
              Is class/date range ka koi attendance record nahi mila. Faculty attendance mark karegi to yahan dikhega. Test ke liye "Sample data" dabao.
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-4 mb-5">
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <p className="font-display text-base text-slate-900 mb-3">Subject-wise attendance</p>
                <div className="space-y-3">
                  {data.subjects.map((s) => (
                    <div key={s.subject}>
                      <div className="flex justify-between font-body text-sm mb-1">
                        <span className="text-slate-800">{s.subject} <span className="text-xs text-slate-400">· {s.below} students low</span></span>
                        <span className="font-medium" style={{ color: colorFor(s.pct, th) }}>{s.pct}%</span>
                      </div>
                      <Bar pct={s.pct} threshold={th} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <p className="font-display text-base text-slate-900 mb-3">Last {data.trend.length} din</p>
                <div className="flex items-end gap-1.5 h-32">
                  {data.trend.map((t) => (
                    <div key={t.date} className="flex-1 flex flex-col items-center justify-end h-full" title={`${fmt(t.date)}: ${t.pct}%`}>
                      <div className="w-full rounded-t" style={{ height: `${t.pct}%`, background: colorFor(t.pct, th) }} />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between font-body text-[11px] text-slate-400 mt-1">
                  <span>{data.trend[0] && fmt(data.trend[0].date)}</span><span>{data.trend.length > 1 && fmt(data.trend[data.trend.length - 1].date)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap gap-2">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-3 text-slate-400" />
              <input className={`${INPUT} pl-9 w-64`} placeholder="Naam ya college ID" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className={`${INPUT} w-44`} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All students</option>
              <option value="low">Low attendance</option>
              <option value="ok">OK</option>
              <option value="no_data">No data</option>
            </select>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full font-body text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 font-medium">Student</th><th className="px-4 py-3 font-medium w-56">Attendance</th><th className="px-4 py-3 font-medium">Classes</th><th className="px-4 py-3 font-medium">Sabse kam subject</th><th className="px-4 py-3 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>}
                {!loading && data.items.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No students found.</td></tr>}
                {!loading && data.items.map((r) => (
                  <tr key={r.student_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 cursor-pointer" onClick={() => openStudent(r.student_id)}>
                    <td className="px-4 py-3"><p className="text-slate-900 font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.college_id}</p></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2"><div className="flex-1"><Bar pct={r.pct} threshold={th} /></div><span className="w-12 text-right font-medium" style={{ color: colorFor(r.pct, th) }}>{r.pct === null ? '-' : `${r.pct}%`}</span></div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.present} / {r.total}</td>
                    <td className="px-4 py-3 text-slate-700">{r.lowest_subject ? `${r.lowest_subject.subject} (${r.lowest_subject.pct}%)` : '-'}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3 font-body text-sm text-slate-500">
            <span>Total: {data.total} · Sabse kam attendance pehle</span>
            <div className="flex items-center gap-2">
              <button className={OUTLINE} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page} / {pages}</span>
              <button className={OUTLINE} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        </>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-display text-lg text-slate-900">{detail.student.name}</h3>
                <p className="font-body text-xs text-slate-500">{detail.student.college_id} · {detail.student.course} · Sem {detail.student.semester}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={20} /></button>
            </div>
            <div className="p-6">
              <p className="font-body text-sm text-slate-600 mb-4">Overall: <b style={{ color: colorFor(detail.pct, th) }}>{detail.pct === null ? '-' : `${detail.pct}%`}</b> ({detail.present} / {detail.total} classes)</p>
              {detail.subjects.length === 0 && <p className="font-body text-sm text-slate-500">Is student ka koi attendance record nahi hai.</p>}
              <div className="space-y-3 mb-5">
                {detail.subjects.map((s) => (
                  <div key={s.subject}>
                    <div className="flex justify-between font-body text-sm mb-1"><span className="text-slate-800">{s.subject} <span className="text-xs text-slate-400">({s.present}/{s.total})</span></span><span className="font-medium" style={{ color: colorFor(s.pct, th) }}>{s.pct}%</span></div>
                    <Bar pct={s.pct} threshold={th} />
                  </div>
                ))}
              </div>
              {detail.recent.length > 0 && (
                <>
                  <p className="font-display text-base text-slate-900 mb-2">Recent classes</p>
                  <div className="max-h-56 overflow-y-auto">
                    {detail.recent.map((r, i) => (
                      <div key={i} className="flex items-center justify-between border-b border-slate-100 py-1.5 font-body text-sm">
                        <span className="text-slate-700">{fmt(r.date)} · {r.subject}</span>
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${r.status === 'present' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{r.status === 'present' ? 'Present' : 'Absent'}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}