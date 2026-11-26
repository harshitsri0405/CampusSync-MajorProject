import { useCallback, useEffect, useState } from 'react'
import { Check, X, Download, Pencil, Trophy } from 'lucide-react'
import FacultyFaceAttendance from './FacultyFaceAttendance.jsx'
import {
  listFacultyClasses, facultyAttendanceSheet, saveFacultyAttendance, facultyAttendanceHistory,
  facultyAttendanceReport, downloadFacultyAttendanceCsv, facultyAttendanceLeaderboard, downloadFacultyLeaderboardCsv,
} from '../api.js'

const INPUT =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const TABS = [['mark', 'Mark Attendance'], ['face', 'Face Attendance'], ['history', 'History'], ['report', 'Monthly Report'], ['board', 'Leaderboard']]

const todayStr = () => new Date().toLocaleDateString('en-CA')
const monthStr = () => todayStr().slice(0, 7)
const fmtDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' })

function MarkTab({ token, cls, day, setDay }) {
  const [sheet, setSheet] = useState(null)
  const [status, setStatus] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    return facultyAttendanceSheet(token, cls.id, day)
      .then((d) => {
        setSheet(d)
        setStatus(Object.fromEntries(d.items.map((s) => [s.id, s.status || null])))
        setError('')
      })
      .catch((e) => { setSheet(null); setError(e.message) })
      .finally(() => setLoading(false))
  }, [token, cls.id, day])

  useEffect(() => { setOk(''); load() }, [load])

  const items = sheet ? sheet.items : []
  const present = items.filter((s) => status[s.id] === 'present').length
  const absent = items.filter((s) => status[s.id] === 'absent').length
  const left = items.length - present - absent

  function setAll(v) { setStatus(Object.fromEntries(items.map((s) => [s.id, v]))) }

  async function save() {
    if (left > 0) return setError(`Attendance is pending for ${left} student(s).`)
    setBusy(true); setError(''); setOk('')
    try {
      const r = await saveFacultyAttendance(token, {
        assignment_id: cls.id, day,
        records: items.map((s) => ({ student_id: s.id, status: status[s.id] })),
      })
      setOk(`Saved: ${r.present} present, ${r.absent} absent.`)
      await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const locked = sheet && !sheet.editable

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <p className="font-body text-xs text-slate-500 mb-1">Date</p>
          <input className={INPUT} type="date" max={todayStr()} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </div>
        {sheet && !locked && (
          <div className="flex gap-2">
            <button className={OUTLINE} onClick={() => setAll('present')}>Sab present</button>
            <button className={OUTLINE} onClick={() => setAll('absent')}>Sab absent</button>
          </div>
        )}
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700 mb-3">{ok}</p>}
      {sheet && sheet.marked && !locked && <p className="font-body text-sm text-amber-700 mb-3">Attendance for this day has already been taken. You can edit it and save again.</p>}
      {locked && <p className="font-body text-sm text-amber-700 mb-3">Attendance older than {sheet.edit_days} days is read-only and cannot be changed.</p>}

      {loading && <p className="font-body text-sm text-slate-500">Loading...</p>}
      {sheet && !loading && (
        <>
          <div className="flex flex-wrap gap-3 mb-3 font-body text-sm">
            <span className="rounded-lg bg-green-50 px-3 py-1.5 text-green-700">Present: {present}</span>
            <span className="rounded-lg bg-red-50 px-3 py-1.5 text-red-700">Absent: {absent}</span>
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-600">Pending: {left}</span>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full font-body text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">#</th><th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">College ID</th><th className="px-4 py-3 font-medium text-right">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">This class has no students.</td></tr>}
                {items.map((s, i) => {
                  const v = status[s.id]
                  return (
                    <tr key={s.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5 text-slate-400">{i + 1}</td>
                      <td className="px-4 py-2.5 text-slate-900">{s.name}</td>
                      <td className="px-4 py-2.5 text-slate-700">{s.college_id}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-2">
                          <button disabled={locked} onClick={() => setStatus({ ...status, [s.id]: 'present' })}
                            className={`flex items-center gap-1 rounded-md border px-3 py-1 text-xs ${v === 'present' ? 'bg-green-600 border-green-600 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'} disabled:opacity-60`}>
                            <Check size={13} /> P
                          </button>
                          <button disabled={locked} onClick={() => setStatus({ ...status, [s.id]: 'absent' })}
                            className={`flex items-center gap-1 rounded-md border px-3 py-1 text-xs ${v === 'absent' ? 'bg-red-600 border-red-600 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'} disabled:opacity-60`}>
                            <X size={13} /> A
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!locked && items.length > 0 && (
            <button className="mt-4 rounded-md bg-green-600 px-5 py-2.5 font-body text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60" disabled={busy} onClick={save}>
              {busy ? 'Saving...' : sheet.marked ? 'Update attendance' : 'Save attendance'}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function HistoryTab({ token, cls, onEdit }) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    facultyAttendanceHistory(token, cls.id, page).then((d) => { setData(d); setError('') }).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [token, cls.id, page])

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1

  return (
    <div>
      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium text-right">Present</th>
              <th className="px-4 py-3 font-medium text-right">Absent</th><th className="px-4 py-3 font-medium text-right">Total</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>}
            {!loading && data && data.items.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Attendance has not been taken for this class yet.</td></tr>}
            {!loading && data && data.items.map((r) => (
              <tr key={r.day} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3 text-slate-900">{fmtDay(r.day)}</td>
                <td className="px-4 py-3 text-right text-green-700">{r.present}</td>
                <td className="px-4 py-3 text-right text-red-700">{r.absent}</td>
                <td className="px-4 py-3 text-right text-slate-700">{r.total}</td>
                <td className="px-4 py-3 text-right">
                  <button className={`${OUTLINE} inline-flex items-center gap-1.5`} onClick={() => onEdit(r.day)}>
                    <Pencil size={13} /> {r.editable ? 'Edit' : 'View'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && (
        <div className="flex items-center justify-between mt-3 font-body text-sm text-slate-500">
          <span>Total: {data.total} days</span>
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

function ReportTab({ token, cls }) {
  const [month, setMonth] = useState(monthStr())
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!month) return
    setLoading(true)
    facultyAttendanceReport(token, cls.id, month).then((d) => { setData(d); setError('') }).catch((e) => { setData(null); setError(e.message) }).finally(() => setLoading(false))
  }, [token, cls.id, month])

  async function download() {
    setBusy(true); setError('')
    try { await downloadFacultyAttendanceCsv(token, cls.id, month) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p className="font-body text-xs text-slate-500 mb-1">Month</p>
          <input className={INPUT} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy || !data || data.days.length === 0} onClick={download}>
          <Download size={15} /> {busy ? 'Downloading...' : 'CSV download'}
        </button>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {loading && <p className="font-body text-sm text-slate-500">Loading...</p>}
      {data && !loading && (
        <>
          <div className="flex flex-wrap gap-3 mb-4">
            {[
              ['Classes held', data.summary.classes_held],
              ['Students', data.summary.students],
              ['Average attendance', `${data.summary.avg_pct}%`],
              [`Below ${data.summary.threshold}%`, data.summary.below_threshold],
            ].map(([label, value]) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-3">
                <p className="font-display text-xl text-slate-900">{value}</p>
                <p className="font-body text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full font-body text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-3 font-medium">Student</th>
                  {data.days.map((d) => <th key={d} className="px-2 py-3 font-medium text-center">{d.slice(8)}</th>)}
                  <th className="px-3 py-3 font-medium text-right">P</th><th className="px-3 py-3 font-medium text-right">A</th><th className="px-3 py-3 font-medium text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && <tr><td colSpan={data.days.length + 4} className="px-4 py-8 text-center text-slate-500">This class has no students.</td></tr>}
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2.5 text-slate-900 whitespace-nowrap">{r.name}<span className="block text-xs text-slate-400">{r.college_id}</span></td>
                    {data.days.map((d) => {
                      const v = r.marks[d]
                      return <td key={d} className={`px-2 py-2.5 text-center text-xs font-medium ${v === 'P' ? 'text-green-700' : v === 'A' ? 'text-red-600' : 'text-slate-300'}`}>{v || '-'}</td>
                    })}
                    <td className="px-3 py-2.5 text-right text-green-700">{r.present}</td>
                    <td className="px-3 py-2.5 text-right text-red-700">{r.absent}</td>
                    <td className={`px-3 py-2.5 text-right font-medium ${r.low ? 'text-red-600' : 'text-slate-800'}`}>{r.pct === null ? '-' : `${r.pct}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.days.length === 0 && <p className="font-body text-sm text-slate-500 mt-3">No attendance has been taken this month yet.</p>}
        </>
      )}
    </div>
  )
}

function rangeFor(period, from, to) {
  const now = new Date()
  const iso = (d) => d.toLocaleDateString('en-CA')
  if (period === 'month') return { start: iso(new Date(now.getFullYear(), now.getMonth(), 1)), end: iso(now) }
  if (period === '30') { const s = new Date(now); s.setDate(s.getDate() - 29); return { start: iso(s), end: iso(now) } }
  if (period === 'custom') return { start: from, end: to }
  return { start: '', end: '' }
}

const PODIUM = [
  { ring: 'border-amber-300 bg-amber-50', icon: 'text-amber-500' },
  { ring: 'border-slate-300 bg-slate-50', icon: 'text-slate-400' },
  { ring: 'border-orange-300 bg-orange-50', icon: 'text-orange-500' },
]

function LeaderboardTab({ token, cls }) {
  const [scope, setScope] = useState('subject')
  const [period, setPeriod] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(todayStr())
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const range = rangeFor(period, from, to)
  const params = { scope, start: range.start, end: range.end }

  useEffect(() => {
    if (period === 'custom' && (!from || !to)) return
    setLoading(true)
    facultyAttendanceLeaderboard(token, cls.id, params)
      .then((d) => { setData(d); setError('') })
      .catch((e) => { setData(null); setError(e.message) })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, cls.id, scope, period, from, to])

  async function download() {
    setBusy(true); setError('')
    try { await downloadFacultyLeaderboardCsv(token, cls.id, params) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const items = data ? data.items : []
  const ranked = items.filter((r) => r.rank !== null)
  const top = ranked.slice(0, 3)
  const s = data ? data.summary : null

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="font-body text-xs text-slate-500 mb-1">Kiski attendance</p>
            <select className={INPUT} value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="subject">My subject only ({cls.subject})</option>
              <option value="class">Poori class (saare subjects)</option>
            </select>
          </div>
          <div>
            <p className="font-body text-xs text-slate-500 mb-1">Period</p>
            <select className={INPUT} value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="all">All time</option>
              <option value="month">This month</option>
              <option value="30">Last 30 days</option>
              <option value="custom">Custom date range</option>
            </select>
          </div>
          {period === 'custom' && (
            <>
              <div><p className="font-body text-xs text-slate-500 mb-1">From</p><input className={INPUT} type="date" max={todayStr()} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><p className="font-body text-xs text-slate-500 mb-1">To</p><input className={INPUT} type="date" max={todayStr()} value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </>
          )}
        </div>
        <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy || !data || items.length === 0} onClick={download}>
          <Download size={15} /> {busy ? 'Downloading...' : 'CSV download'}
        </button>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {loading && <p className="font-body text-sm text-slate-500">Loading...</p>}

      {data && !loading && (
        <>
          {s.with_data === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center font-body text-sm text-slate-500 mb-4">
              No attendance has been recorded for this filter yet, so the leaderboard cannot be generated.
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-3 gap-3 mb-4">
                {top.map((r, i) => (
                  <div key={r.id} className={`rounded-xl border p-4 ${PODIUM[i].ring}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-body text-xs text-slate-500">Rank {r.rank}</span>
                      <Trophy size={20} className={PODIUM[i].icon} />
                    </div>
                    <p className="font-display text-base text-slate-900 mt-1 truncate">{r.name}</p>
                    <p className="font-body text-xs text-slate-500">{r.college_id}</p>
                    <p className="font-display text-2xl text-slate-900 mt-2">{r.pct}%</p>
                    <p className="font-body text-xs text-slate-500">{r.present}/{r.total} classes</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3 mb-4 font-body text-sm">
                <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700">Class average: {s.avg_pct}%</span>
                <span className="rounded-lg bg-green-50 px-3 py-1.5 text-green-700">Highest: {s.highest.name} ({s.highest.pct}%)</span>
                <span className="rounded-lg bg-red-50 px-3 py-1.5 text-red-700">Lowest: {s.lowest.name} ({s.lowest.pct}%)</span>
                <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-amber-700">Below {s.threshold}%: {s.below_threshold} students</span>
              </div>
            </>
          )}

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full font-body text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">Rank</th><th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium text-right">Present</th><th className="px-4 py-3 font-medium text-right">Absent</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th><th className="px-4 py-3 font-medium">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">This class has no students.</td></tr>}
                {items.map((r) => (
                  <tr key={r.id} className={`border-b border-slate-100 last:border-0 ${r.low ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-2.5 text-slate-700 font-medium">{r.rank === null ? '-' : `#${r.rank}`}</td>
                    <td className="px-4 py-2.5 text-slate-900">{r.name}<span className="block text-xs text-slate-400">{r.college_id}</span></td>
                    <td className="px-4 py-2.5 text-right text-green-700">{r.present}</td>
                    <td className="px-4 py-2.5 text-right text-red-700">{r.absent}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{r.total}</td>
                    <td className="px-4 py-2.5 w-64">
                      {r.pct === null ? (
                        <span className="text-xs text-slate-400">No data</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="block flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                            <span className={`block h-full ${r.low ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, r.pct)}%` }} />
                          </span>
                          <span className={`w-12 text-right font-medium ${r.low ? 'text-red-600' : 'text-slate-800'}`}>{r.pct}%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default function FacultyAttendancePage({ session }) {
  const token = session.access_token
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [tab, setTab] = useState('mark')
  const [day, setDay] = useState(todayStr())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listFacultyClasses(token)
      .then((d) => { setClasses(d.items); if (d.items.length) setClassId(d.items[0].id) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  const cls = classes.find((c) => c.id === classId)

  if (loading) return <p className="font-body text-sm text-slate-500">Loading...</p>
  if (error) return <p className="font-body text-sm text-red-600">{error}</p>
  if (classes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-xl mx-auto">
        <p className="font-display text-base text-slate-900 mb-1">No classes are assigned yet</p>
        <p className="font-body text-sm text-slate-500">First create sample classes from the Dashboard or My Classes.</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-body text-xs text-slate-500 mb-1">Class and subject</p>
          <select className={`${INPUT} w-80 max-w-full`} value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.course} · Sem {c.semester} · {c.subject}{c.is_sample ? ' (SAMPLE)' : ''}</option>)}
          </select>
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 font-body text-sm ${tab === k ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600'}`}>{label}</button>
          ))}
        </div>
      </div>

      {cls && tab === 'mark' && <MarkTab key={`${cls.id}-${day}`} token={token} cls={cls} day={day} setDay={setDay} />}
      {cls && tab === 'history' && <HistoryTab token={token} cls={cls} onEdit={(d) => { setDay(d); setTab('mark') }} />}
      {cls && tab === 'report' && <ReportTab token={token} cls={cls} />}
      {cls && tab === 'board' && <LeaderboardTab key={`${cls.id}-board`} token={token} cls={cls} />}
            {cls && tab === 'face' && <FacultyFaceAttendance key={`${cls.id}-face`} token={token} cls={cls} />}
    </div>
  )
}