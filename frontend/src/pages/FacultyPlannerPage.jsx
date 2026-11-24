import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Download } from 'lucide-react'
import {
  listFacultyClasses, facultyPlanner, facultyPlannerLink, facultyPlannerUnlink, facultyPlannerUnitPlan,
  facultyPlannerTopics, downloadFacultyPlannerCsv,
} from '../api.js'

const INPUT =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const PRIMARY = 'rounded-md bg-green-600 px-4 py-2 font-body text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60'

const todayStr = () => new Date().toLocaleDateString('en-CA')
const fmtDay = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '')
const STATUS = {
  done: { label: 'Complete', cls: 'bg-green-100 text-green-700' },
  in_progress: { label: 'Chal raha hai', cls: 'bg-blue-100 text-blue-700' },
  pending: { label: 'Baaki', cls: 'bg-slate-100 text-slate-600' },
  behind: { label: 'Behind', cls: 'bg-red-100 text-red-700' },
}

export default function FacultyPlannerPage({ session }) {
  const token = session.access_token
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [open, setOpen] = useState({})
  const [plan, setPlan] = useState({})
  const [doneOn, setDoneOn] = useState(todayStr())
  const [pick, setPick] = useState('')

  useEffect(() => {
    listFacultyClasses(token)
      .then((d) => { setClasses(d.items); if (d.items.length) setClassId(d.items[0].id) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  const load = useCallback(() => {
    if (!classId) return Promise.resolve()
    return facultyPlanner(token, classId)
      .then((d) => { setData(d); setError(''); if (!d.matched && d.available.length) setPick((p) => p || d.available[0].id) })
      .catch((e) => { setData(null); setError(e.message) })
  }, [token, classId])

  useEffect(() => { setData(null); setOpen({}); setPlan({}); setPick(''); setOk(''); load() }, [load])

  async function run(fn, msg) {
    setError(''); setOk(''); setBusy(true)
    try { await fn(); if (msg) setOk(msg); await load() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const setTopics = (unit, keys, done) => run(() => facultyPlannerTopics(token, { assignment_id: classId, unit_id: unit.id, keys, done, done_on: doneOn }))

  function savePlan(unit) {
    const p = plan[unit.id] || {}
    const start = p.start !== undefined ? p.start : unit.planned_start || ''
    const end = p.end !== undefined ? p.end : unit.planned_end || ''
    run(async () => {
      await facultyPlannerUnitPlan(token, { assignment_id: classId, unit_id: unit.id, planned_start: start || null, planned_end: end || null })
      setPlan((x) => { const n = { ...x }; delete n[unit.id]; return n })
    }, 'Plan save ho gaya.')
  }

  async function csv() {
    setError('')
    try { await downloadFacultyPlannerCsv(token, classId) } catch (e) { setError(e.message) }
  }

  if (loading) return <p className="font-body text-sm text-slate-500">Loading...</p>
  if (classes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-xl mx-auto">
        <p className="font-display text-base text-slate-900 mb-1">Abhi koi class assign nahi hai</p>
        <p className="font-body text-sm text-slate-500">Pehle Dashboard ya My Classes se sample classes banao.</p>
      </div>
    )
  }

  const s = data && data.matched ? data.summary : null

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-body text-xs text-slate-500 mb-1">Class aur subject</p>
          <select className={`${INPUT} w-80 max-w-full`} value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.course} · Sem {c.semester} · {c.subject}{c.is_sample ? ' (SAMPLE)' : ''}</option>)}
          </select>
        </div>
        {s && <button className={`${OUTLINE} flex items-center gap-1.5`} onClick={csv}><Download size={15} /> CSV download</button>}
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700 mb-3">{ok}</p>}

      {data && !data.matched && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <p className="font-display text-base text-slate-900 mb-1">Is class ka syllabus abhi juda nahi hai</p>
          {data.available.length === 0 ? (
            <p className="font-body text-sm text-slate-500">
              {data.class.course} · Sem {data.class.semester} ka syllabus Admin ne abhi daala nahi hai. Admin → Syllabus me daalne ke baad yahan aayega.
            </p>
          ) : (
            <>
              <p className="font-body text-sm text-slate-500 mb-4">
                "{data.class.subject}" naam ka koi syllabus subject nahi mila. Neeche se is class ka sahi subject chuno.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <select className={`${INPUT} w-80 max-w-full`} value={pick} onChange={(e) => setPick(e.target.value)}>
                  {data.available.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
                </select>
                <button className={PRIMARY} disabled={busy || !pick} onClick={() => run(() => facultyPlannerLink(token, { assignment_id: classId, subject_id: pick }), 'Syllabus jud gaya.')}>Syllabus jodo</button>
              </div>
            </>
          )}
        </div>
      )}

      {s && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg text-slate-900">{data.subject.name}</p>
                <p className="font-body text-xs text-slate-500">{data.subject.code} · {data.how === 'manual' ? 'Khud juda hua' : 'Apne aap match hua'}</p>
              </div>
              {data.how === 'manual' && (
                <button className={OUTLINE} disabled={busy} onClick={() => run(() => facultyPlannerUnlink(token, classId), 'Link hata diya.')}>Link hatao</button>
              )}
            </div>
            <div className="mt-4 flex items-end justify-between">
              <p className="font-display text-4xl text-slate-900">{s.pct}%<span className="font-body text-sm text-slate-500"> syllabus complete</span></p>
              {s.expected_pct !== null && <p className="font-body text-xs text-slate-500">Plan ke hisaab se aaj tak {s.expected_pct}% hona chahiye</p>}
            </div>
            <div className="relative mt-2 h-3 rounded-full bg-slate-100 overflow-hidden">
              <span className="block h-full bg-green-500 transition-all" style={{ width: `${Math.min(100, s.pct)}%` }} />
            </div>
            <div className="mt-4 flex flex-wrap gap-3 font-body text-sm">
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700">Topics: {s.topics_done} / {s.topics_total}</span>
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700">Hours: {s.hours_done} / {s.hours_total}</span>
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700">Units: {s.units_done} / {s.units_total}</span>
              {s.behind.length > 0 && <span className="rounded-lg bg-red-50 px-3 py-1.5 text-red-700">Behind: Unit {s.behind.join(', ')}</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-3 font-body text-sm text-slate-600">
            <span>Tick karne par topic ki date:</span>
            <input className={INPUT} type="date" max={todayStr()} value={doneOn} onChange={(e) => e.target.value && setDoneOn(e.target.value)} />
          </div>

          <div className="space-y-3">
            {data.units.length === 0 && <div className="bg-white rounded-xl border border-slate-200 p-8 text-center font-body text-sm text-slate-500">Is subject me abhi koi unit nahi hai.</div>}
            {data.units.map((u) => {
              const st = STATUS[u.status]
              const isOpen = !!open[u.id]
              const p = plan[u.id] || {}
              const start = p.start !== undefined ? p.start : u.planned_start || ''
              const end = p.end !== undefined ? p.end : u.planned_end || ''
              const changed = start !== (u.planned_start || '') || end !== (u.planned_end || '')
              const pct = u.total ? (u.done * 100) / u.total : 0
              return (
                <div key={u.id} className="bg-white rounded-xl border border-slate-200 shadow-sm">
                  <button className="w-full flex flex-wrap items-center justify-between gap-3 p-4 text-left" onClick={() => setOpen({ ...open, [u.id]: !isOpen })}>
                    <div className="min-w-0">
                      <p className="font-display text-base text-slate-900">Unit {u.unit_no}: {u.title}</p>
                      <p className="font-body text-xs text-slate-500 mt-0.5">
                        {u.hours ? `${u.hours} hrs · ` : ''}{u.done}/{u.total} topics
                        {(u.planned_start || u.planned_end) && ` · Plan: ${fmtDay(u.planned_start) || '?'} se ${fmtDay(u.planned_end) || '?'}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="hidden sm:block w-28 h-2 rounded-full bg-slate-100 overflow-hidden"><span className="block h-full bg-green-500" style={{ width: `${pct}%` }} /></span>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
                      {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 p-4">
                      <div className="flex flex-wrap items-end gap-3 mb-4">
                        <div><p className="font-body text-xs text-slate-500 mb-1">Plan: shuru</p><input className={INPUT} type="date" value={start} onChange={(e) => setPlan({ ...plan, [u.id]: { ...p, start: e.target.value } })} /></div>
                        <div><p className="font-body text-xs text-slate-500 mb-1">Plan: khatam</p><input className={INPUT} type="date" value={end} onChange={(e) => setPlan({ ...plan, [u.id]: { ...p, end: e.target.value } })} /></div>
                        {changed && <button className={PRIMARY} disabled={busy} onClick={() => savePlan(u)}>Plan save karo</button>}
                        <div className="ml-auto flex gap-2">
                          <button className={OUTLINE} disabled={busy || u.total === 0 || u.done === u.total} onClick={() => setTopics(u, u.topics.filter((t) => !t.done).map((t) => t.key), true)}>Pura unit complete</button>
                          <button className={OUTLINE} disabled={busy || u.done === 0} onClick={() => setTopics(u, u.topics.filter((t) => t.done).map((t) => t.key), false)}>Reset</button>
                        </div>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {u.topics.length === 0 && <p className="font-body text-sm text-slate-500">Is unit me topics nahi likhe hain.</p>}
                        {u.topics.map((t) => (
                          <label key={t.key} className="flex items-start gap-3 py-2.5 cursor-pointer">
                            <input type="checkbox" className="mt-1 h-4 w-4 accent-green-600" checked={t.done} disabled={busy} onChange={() => setTopics(u, [t.key], !t.done)} />
                            <span className={`font-body text-sm flex-1 ${t.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{t.text}</span>
                            {t.done && <span className="font-body text-xs text-green-700 shrink-0">{fmtDay(t.done_on)}</span>}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}