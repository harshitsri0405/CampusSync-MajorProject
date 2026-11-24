import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Download, Trophy, X } from 'lucide-react'
import {
  listFacultyClasses, facultyAnalyticsClass, facultyAnalyticsSubjects, facultyAnalyticsStudent, downloadFacultyAnalyticsCsv,
} from '../api.js'

const INPUT =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const TABS = [['overview', 'Overview'], ['students', 'Students'], ['subjects', 'Subject Comparison']]

const RISK = {
  high: { label: 'High risk', cls: 'bg-red-100 text-red-700' },
  medium: { label: 'Needs attention', cls: 'bg-amber-100 text-amber-700' },
  low: { label: 'On track', cls: 'bg-green-100 text-green-700' },
  no_data: { label: 'No data', cls: 'bg-slate-100 text-slate-500' },
}
const RISK_ORDER = { high: 0, medium: 1, low: 2, no_data: 3 }
const pct = (v) => (v === null || v === undefined ? '-' : `${v}%`)
const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
const dueLabel = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

function Kpi({ label, value, hint, tone = 'text-slate-900' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
      <p className={`font-display text-2xl ${tone}`}>{value}</p>
      <p className="font-body text-xs text-slate-500 mt-0.5">{label}</p>
      {hint && <p className="font-body text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  )
}

function Bar({ value, tone = 'bg-green-500' }) {
  return (
    <span className="block h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
      <span className={`block h-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }} />
    </span>
  )
}

function Distribution({ title, items, total, tone }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <p className="font-display text-base text-slate-900 mb-3">{title}</p>
      <div className="space-y-2.5">
        {items.map((b) => (
          <div key={b.label} className="flex items-center gap-3 font-body text-sm">
            <span className="w-24 shrink-0 text-slate-600">{b.label}</span>
            <Bar value={total ? (b.count * 100) / total : 0} tone={tone} />
            <span className="w-8 text-right text-slate-800">{b.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Trend({ items }) {
  const has = items.some((m) => m.pct !== null)
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <p className="font-display text-base text-slate-900 mb-3">Attendance trend (last 6 months)</p>
      {!has ? <p className="font-body text-sm text-slate-500">No attendance has been recorded in this period.</p> : (
        <div className="flex items-end gap-3 h-40">
          {items.map((m) => (
            <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full">
              <span className="font-body text-xs text-slate-600 mb-1">{pct(m.pct)}</span>
              <span className="w-full max-w-[44px] rounded-t-md bg-green-500" style={{ height: `${m.pct ? Math.max(4, m.pct * 0.95) : 2}%`, opacity: m.pct === null ? 0.2 : 1 }} />
              <span className="font-body text-xs text-slate-500 mt-1">{monthLabel(m.month)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StudentPanel({ token, classId, student, onClose }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    facultyAnalyticsStudent(token, classId, student.id).then(setD).catch((e) => setError(e.message))
  }, [token, classId, student.id])

  const s = d ? d.student : student
  const ST = { graded: 'text-green-700', submitted: 'text-blue-700', missing: 'text-red-600', pending: 'text-slate-500' }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display text-lg text-slate-900">{s.name}</p>
            <p className="font-body text-xs text-slate-500">{s.college_id}</p>
          </div>
          <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <span className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-medium ${RISK[s.level].cls}`}>{RISK[s.level].label}</span>
        {error && <p className="font-body text-sm text-red-600 mt-3">{error}</p>}

        <div className="grid grid-cols-2 gap-3 mt-4">
          <Kpi label="Overall score" value={s.score === null ? '-' : s.score} />
          <Kpi label="Attendance" value={pct(s.attendance.pct)} hint={`${s.attendance.present} of ${s.attendance.total} classes`} />
          <Kpi label="Internal marks" value={s.internal.marks === null ? '-' : `${s.internal.marks}/${d ? d.settings.internal_max : 40}`} />
          <Kpi label="Assignment score" value={pct(s.assignment.score)} hint={`${s.assignment.submitted} of ${s.assignment.expected} submitted`} />
        </div>

        {s.flags.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="font-body text-xs font-medium text-amber-800 mb-1">Areas of concern</p>
            <ul className="list-disc pl-4 font-body text-sm text-amber-800 space-y-0.5">{s.flags.map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        )}

        {d && (
          <>
            <p className="font-display text-base text-slate-900 mt-6 mb-2">Monthly attendance</p>
            <div className="space-y-2">
              {d.attendance_trend.map((m) => (
                <div key={m.month} className="flex items-center gap-3 font-body text-sm">
                  <span className="w-16 text-slate-600">{monthLabel(m.month)}</span>
                  <Bar value={m.pct} tone={m.pct !== null && m.pct < d.settings.min_attendance_pct ? 'bg-red-500' : 'bg-green-500'} />
                  <span className="w-14 text-right text-slate-800">{pct(m.pct)}</span>
                </div>
              ))}
            </div>

            <p className="font-display text-base text-slate-900 mt-6 mb-2">Assignments</p>
            {d.assignments.length === 0 ? <p className="font-body text-sm text-slate-500">No assignments have been created for this class.</p> : (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {d.assignments.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5 font-body text-sm">
                    <div className="min-w-0">
                      <p className="text-slate-900 truncate">{t.title}</p>
                      <p className="text-xs text-slate-400">Due {dueLabel(t.due_at)}{t.late ? ' - submitted late' : ''}</p>
                    </div>
                    <span className={`shrink-0 text-xs font-medium capitalize ${ST[t.status]}`}>
                      {t.status === 'graded' ? `${t.marks}/${t.max_marks}` : t.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function OverviewTab({ data }) {
  const s = data.summary
  const set = data.settings
  const scored = data.students.filter((r) => r.score !== null).sort((a, b) => b.score - a.score)
  const attention = data.students.filter((r) => r.level === 'high' || r.level === 'medium')
    .sort((a, b) => RISK_ORDER[a.level] - RISK_ORDER[b.level] || (a.score ?? 0) - (b.score ?? 0)).slice(0, 6)
  const withAtt = data.students.filter((r) => r.attendance.pct !== null).length
  const withInt = data.students.filter((r) => r.internal.pct !== null).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Average attendance" value={pct(s.avg_attendance)} hint={`Minimum: ${set.min_attendance_pct}%`} />
        <Kpi label="Average internal marks" value={pct(s.avg_internal)} hint={`Out of ${set.internal_max}`} />
        <Kpi label="Average assignment score" value={pct(s.avg_assignment)} hint={`${s.assignments_due} assignments due`} />
        <Kpi label="Overall class score" value={s.avg_score === null ? '-' : s.avg_score} hint={`${s.with_data} of ${s.students} students have data`} />
        <Kpi label="High-risk students" value={s.high_risk} tone={s.high_risk ? 'text-red-600' : 'text-slate-900'} hint={`${s.attention} need attention`} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Distribution title="Attendance distribution" items={data.distribution.attendance} total={withAtt} tone="bg-green-500" />
        <Distribution title="Internal marks distribution" items={data.distribution.internal} total={withInt} tone="bg-blue-500" />
      </div>

      <Trend items={data.trend} />

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="font-display text-base text-slate-900 mb-3 flex items-center gap-2"><Trophy size={16} className="text-amber-500" /> Top performers</p>
          {scored.length === 0 ? <p className="font-body text-sm text-slate-500">No performance data is available yet.</p> : (
            <ol className="space-y-2">
              {scored.slice(0, 5).map((r, i) => (
                <li key={r.id} className="flex items-center justify-between gap-3 font-body text-sm">
                  <span className="flex items-center gap-3 min-w-0"><span className="w-5 text-slate-400">{i + 1}.</span><span className="truncate text-slate-900">{r.name}</span></span>
                  <span className="font-medium text-green-700">{r.score}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="font-display text-base text-slate-900 mb-3">Students needing attention</p>
          {attention.length === 0 ? <p className="font-body text-sm text-slate-500">No student is currently flagged.</p> : (
            <ul className="space-y-3">
              {attention.map((r) => (
                <li key={r.id} className="font-body text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-900">{r.name}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${RISK[r.level].cls}`}>{RISK[r.level].label}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{r.flags.join(' / ') || `Overall score ${r.score}`}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="font-body text-xs text-slate-400">
        Overall score = attendance 30% + internal marks 50% + assignments 20%. Components without data are excluded and the weights are re-balanced.
        Pass level is {set.pass_pct}%.
      </p>
    </div>
  )
}

function StudentsTab({ data, onOpen }) {
  const [q, setQ] = useState('')
  const [risk, setRisk] = useState('')
  const [sort, setSort] = useState({ key: 'name', dir: 1 })

  const val = (r, k) => ({ name: r.name.toLowerCase(), attendance: r.attendance.pct, internal: r.internal.pct, assignment: r.assignment.score, score: r.score, level: RISK_ORDER[r.level] })[k]
  const rows = useMemo(() => {
    const list = data.students.filter((r) => (!risk || r.level === risk) && `${r.name} ${r.college_id}`.toLowerCase().includes(q.trim().toLowerCase()))
    return [...list].sort((a, b) => {
      const x = val(a, sort.key), y = val(b, sort.key)
      if (x === null || x === undefined) return 1
      if (y === null || y === undefined) return -1
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir
    })
  }, [data, q, risk, sort]) // eslint-disable-line react-hooks/exhaustive-deps

  const Th = ({ k, children, right }) => (
    <th className={`px-4 py-3 font-medium cursor-pointer select-none ${right ? 'text-right' : ''}`} onClick={() => setSort({ key: k, dir: sort.key === k ? -sort.dir : 1 })}>
      <span className="inline-flex items-center gap-1">{children}{sort.key === k && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</span>
    </th>
  )

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input className={`${INPUT} w-64`} placeholder="Search by name or ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={INPUT} value={risk} onChange={(e) => setRisk(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(RISK).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="font-body text-sm text-slate-500 ml-auto">{rows.length} students</span>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
              <Th k="name">Student</Th><Th k="attendance" right>Attendance</Th><Th k="internal" right>Internal</Th>
              <Th k="assignment" right>Assignments</Th><Th k="score" right>Score</Th><Th k="level">Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No students match your filters.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(r)}>
                <td className="px-4 py-2.5 text-slate-900">{r.name}<span className="block text-xs text-slate-400">{r.college_id}</span></td>
                <td className={`px-4 py-2.5 text-right ${r.attendance.pct !== null && r.attendance.pct < data.settings.min_attendance_pct ? 'text-red-600 font-medium' : 'text-slate-700'}`}>{pct(r.attendance.pct)}</td>
                <td className="px-4 py-2.5 text-right text-slate-700">{r.internal.marks === null ? '-' : `${r.internal.marks}/${data.settings.internal_max}`}</td>
                <td className="px-4 py-2.5 text-right text-slate-700">{pct(r.assignment.score)}</td>
                <td className="px-4 py-2.5 text-right font-medium text-slate-900">{r.score === null ? '-' : r.score}</td>
                <td className="px-4 py-2.5"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${RISK[r.level].cls}`}>{RISK[r.level].label}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-body text-xs text-slate-400 mt-2">Select a student to see a detailed breakdown.</p>
    </div>
  )
}

function SubjectsTab({ token }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { facultyAnalyticsSubjects(token).then((d) => setItems(d.items)).catch((e) => setError(e.message)) }, [token])

  if (error) return <p className="font-body text-sm text-red-600">{error}</p>
  if (!items) return <p className="font-body text-sm text-slate-500">Loading...</p>

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
      <table className="w-full font-body text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
            <th className="px-4 py-3 font-medium">Subject</th><th className="px-4 py-3 font-medium text-right">Students</th>
            <th className="px-4 py-3 font-medium">Avg attendance</th><th className="px-4 py-3 font-medium">Avg internal</th>
            <th className="px-4 py-3 font-medium">Avg assignments</th><th className="px-4 py-3 font-medium text-right">Overall</th>
            <th className="px-4 py-3 font-medium text-right">High risk</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No classes are assigned to you yet.</td></tr>}
          {items.map((x) => (
            <tr key={x.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-2.5 text-slate-900">{x.subject}<span className="block text-xs text-slate-400">{x.label}</span></td>
              <td className="px-4 py-2.5 text-right text-slate-700">{x.students}</td>
              {[x.avg_attendance, x.avg_internal, x.avg_assignment].map((v, i) => (
                <td key={i} className="px-4 py-2.5 w-44">
                  <div className="flex items-center gap-2"><Bar value={v} /><span className="w-12 text-right text-slate-800">{pct(v)}</span></div>
                </td>
              ))}
              <td className="px-4 py-2.5 text-right font-medium text-slate-900">{x.avg_score === null ? '-' : x.avg_score}</td>
              <td className={`px-4 py-2.5 text-right ${x.high_risk ? 'font-medium text-red-600' : 'text-slate-700'}`}>{x.high_risk}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function FacultyAnalyticsPage({ session }) {
  const token = session.access_token
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listFacultyClasses(token)
      .then((d) => { setClasses(d.items); if (d.items.length) setClassId(d.items[0].id) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (!classId) return
    setData(null); setError('')
    facultyAnalyticsClass(token, classId).then(setData).catch((e) => setError(e.message))
  }, [token, classId])

  async function download() {
    setBusy(true); setError('')
    try { await downloadFacultyAnalyticsCsv(token, classId) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (loading) return <p className="font-body text-sm text-slate-500">Loading...</p>
  if (classes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-xl mx-auto">
        <p className="font-display text-base text-slate-900 mb-1">No classes assigned yet</p>
        <p className="font-body text-sm text-slate-500">Create sample classes from the Dashboard or My Classes to see analytics.</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-body text-xs text-slate-500 mb-1">Class and subject</p>
          <select className={`${INPUT} w-80 max-w-full`} value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.course} - Sem {c.semester} - {c.subject}{c.is_sample ? ' (SAMPLE)' : ''}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {TABS.map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 font-body text-sm ${tab === k ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600'}`}>{label}</button>
            ))}
          </div>
          {tab === 'students' && (
            <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy || !data} onClick={download}>
              <Download size={15} /> {busy ? 'Preparing...' : 'Download CSV'}
            </button>
          )}
        </div>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {tab !== 'subjects' && !data && !error && <p className="font-body text-sm text-slate-500">Loading analytics...</p>}

      {tab === 'overview' && data && <OverviewTab data={data} />}
      {tab === 'students' && data && <StudentsTab data={data} onOpen={setOpen} />}
      {tab === 'subjects' && <SubjectsTab token={token} />}
      {open && <StudentPanel token={token} classId={classId} student={open} onClose={() => setOpen(null)} />}
    </div>
  )
}