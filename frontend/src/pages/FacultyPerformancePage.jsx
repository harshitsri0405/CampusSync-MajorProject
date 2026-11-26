import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { listFacultyClasses, facultyAnalyticsClass, facultyPlanner, facultyExamList } from '../api.js'

const avg = (list) => {
  const v = list.filter((x) => typeof x === 'number' && !Number.isNaN(x))
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null
}
const show = (v, suffix = '') => (v === null || v === undefined ? '-' : `${v}${suffix}`)

function Bar({ value, tone = 'bg-green-500' }) {
  const w = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div className="h-2 rounded bg-slate-100">
      <div className={`h-2 rounded ${tone}`} style={{ width: `${w}%` }} />
    </div>
  )
}

export default function FacultyPerformancePage({ session }) {
  const token = session.access_token
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const classes = (await listFacultyClasses(token)).items || []
      const out = await Promise.all(
        classes.map(async (c) => {
          // Each source is optional: one failing call must not break the dashboard.
          const [an, pl, ex] = await Promise.allSettled([
            facultyAnalyticsClass(token, c.id),
            facultyPlanner(token, c.id),
            facultyExamList(token, c.id),
          ])
          const s = an.status === 'fulfilled' ? an.value?.summary || null : null
          const p = pl.status === 'fulfilled' && pl.value?.matched ? pl.value.summary || null : null
          const exams = ex.status === 'fulfilled' ? ex.value?.items || [] : null
          return { c, s, p, exams, planner_ok: pl.status === 'fulfilled', analytics_ok: an.status === 'fulfilled' }
        }),
      )
      setRows(out)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  if (loading) return <p className="font-body text-sm text-slate-500">Loading...</p>
  if (error) return <p className="font-body text-sm text-red-600">{error}</p>
  if (!rows || rows.length === 0) return <p className="font-body text-sm text-slate-500">No classes are assigned to you yet.</p>

  const totalStudents = rows.reduce((n, r) => n + (r.s?.students || 0), 0)
  const atRisk = rows.reduce((n, r) => n + (r.s?.high_risk || 0), 0)
  const kpis = [
    { label: 'Classes', value: rows.length },
    { label: 'Students', value: totalStudents },
    { label: 'Avg attendance', value: show(avg(rows.map((r) => r.s?.avg_attendance)), '%') },
    { label: 'Avg internal marks', value: show(avg(rows.map((r) => r.s?.avg_internal)), '%') },
    { label: 'Avg assignment score', value: show(avg(rows.map((r) => r.s?.avg_assignment)), '%') },
    { label: 'Syllabus completed', value: show(avg(rows.map((r) => r.p?.pct)), '%') },
    { label: 'High-risk students', value: atRisk },
  ]

  // Items that need the faculty's attention, derived only from real data.
  const actions = []
  rows.forEach(({ c, s, p, exams }) => {
    const label = `${c.subject} (${c.course}, Sem ${c.semester})`
    if (s?.high_risk > 0) actions.push(`${label}: ${s.high_risk} high-risk student(s) need attention.`)
    if (p && p.behind > 0) actions.push(`${label}: ${p.behind} unit(s) behind the expected syllabus pace.`)
    ;(exams || []).forEach((e) => {
      if (e.entered < e.total) actions.push(`${label}: marks pending for "${e.name}" (${e.entered}/${e.total} entered).`)
      else if (!e.results_published) actions.push(`${label}: results for "${e.name}" are ready to publish.`)
    })
  })

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h2 className="font-display text-2xl text-slate-900">Performance Dashboard</h2>
          <p className="font-body text-sm text-slate-500">A live summary of your classes, built from attendance, marks, assignments, syllabus progress and exams.</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 font-body text-sm text-slate-700 hover:bg-slate-50">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="font-display text-2xl text-slate-900">{k.value}</p>
            <p className="font-body text-xs text-slate-500">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5">
        <h3 className="font-display text-base text-slate-900 mb-3 flex items-center gap-2">
          {actions.length ? <AlertTriangle size={16} className="text-amber-500" /> : <CheckCircle2 size={16} className="text-green-600" />} Action needed
        </h3>
        {actions.length === 0 ? (
          <p className="font-body text-sm text-slate-500">Nothing needs your attention right now.</p>
        ) : (
          <ul className="list-disc pl-5 space-y-1 font-body text-sm text-slate-700">
            {actions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rows.map(({ c, s, p, exams, planner_ok, analytics_ok }) => {
          const published = exams ? exams.filter((e) => e.results_published).length : null
          return (
            <div key={c.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="font-display text-base text-slate-900">{c.subject}</p>
              <p className="font-body text-xs text-slate-500 mb-4">{c.course} · Semester {c.semester} · {s?.students ?? 0} students</p>

              {!analytics_ok && <p className="font-body text-xs text-amber-700 mb-2">Student analytics are unavailable for this class.</p>}
              {[
                ['Attendance', s?.avg_attendance],
                ['Internal marks', s?.avg_internal],
                ['Assignments', s?.avg_assignment],
              ].map(([l, v]) => (
                <div key={l} className="mb-3">
                  <div className="flex justify-between font-body text-xs text-slate-600 mb-1"><span>{l}</span><span>{show(v, '%')}</span></div>
                  <Bar value={v} />
                </div>
              ))}

              <div className="mb-3">
                <div className="flex justify-between font-body text-xs text-slate-600 mb-1">
                  <span>Syllabus completed</span>
                  <span>{p ? `${p.pct}%${p.expected_pct !== undefined ? ` (expected ${p.expected_pct}%)` : ''}` : planner_ok ? 'Not linked' : '-'}</span>
                </div>
                <Bar value={p?.pct} tone={p && p.behind > 0 ? 'bg-amber-500' : 'bg-green-500'} />
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-1 font-body text-xs text-slate-600 pt-2 border-t border-slate-100">
                <span>High risk: <b className={s?.high_risk ? 'text-red-600' : 'text-slate-800'}>{show(s?.high_risk)}</b></span>
                <span>Needs attention: <b className="text-slate-800">{show(s?.attention)}</b></span>
                <span>Exams: <b className="text-slate-800">{exams ? `${published}/${exams.length} published` : '-'}</b></span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
