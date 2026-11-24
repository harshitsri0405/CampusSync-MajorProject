import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Layers, Play, Clock, CheckCircle2, Star, Pencil, Trash2, Plus, X, Database } from 'lucide-react'
import {
  listAcademicYears, createAcademicYear, updateAcademicYear, setCurrentAcademicYear, deleteAcademicYear,
  listTerms, saveTerm, deleteTerm, seedDemoAcademic, listCourses,
} from '../api.js'

const ACCENT = '#2563EB'
const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500'
const PRIMARY = 'rounded-lg px-4 py-2 font-body text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const PAGE_SIZE = 10
const STATUS = {
  running: { label: 'Running', cls: 'bg-green-50 text-green-700 border-green-200', bar: '#16A34A' },
  upcoming: { label: 'Upcoming', cls: 'bg-blue-50 text-blue-700 border-blue-200', bar: '#2563EB' },
  ended: { label: 'Ended', cls: 'bg-slate-100 text-slate-600 border-slate-200', bar: '#94A3B8' },
}

function fmt(d) {
  if (!d) return '-'
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Pill({ status }) {
  const s = STATUS[status] || STATUS.ended
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
}

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
      <span className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${color}1A`, color }}>
        <Icon size={20} />
      </span>
      <div>
        <p className="font-display text-2xl text-slate-900 leading-tight">{value}</p>
        <p className="font-body text-xs text-slate-500">{label}</p>
      </div>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-display text-lg text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function Label({ children }) {
  return <label className="font-body text-sm text-slate-600 mb-1 block">{children}</label>
}

export default function AdminAcademicPage({ session }) {
  const token = session.access_token
  const [tab, setTab] = useState('years')
  const [years, setYears] = useState([])
  const [courses, setCourses] = useState([])
  const [terms, setTerms] = useState({ items: [], total: 0, stats: { total: 0, running: 0, upcoming: 0, ended: 0 } })
  const [courseFilter, setCourseFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [yForm, setYForm] = useState(null)
  const [tForm, setTForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadYears = useCallback(
    () => listAcademicYears(token).then((d) => setYears(d)).catch((e) => setError(e.message)),
    [token]
  )

  const loadTerms = useCallback(() => {
    return listTerms(token, { course: courseFilter, academicYear: yearFilter, status: statusFilter, page, pageSize: PAGE_SIZE })
      .then((d) => {
        setTerms(d)
        setError('')
      })
      .catch((e) => setError(e.message))
  }, [token, courseFilter, yearFilter, statusFilter, page])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadYears(), loadTerms()]).finally(() => setLoading(false))
  }, [loadYears, loadTerms])

  useEffect(() => {
    listCourses(token, { page: 1, pageSize: 100 })
      .then((d) => setCourses(d.items))
      .catch((e) => setError(e.message))
  }, [token])

  const reloadAll = () => Promise.all([loadYears(), loadTerms()])
  const current = years.find((y) => y.is_current)

  async function act(fn, okMsg) {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      const r = await fn()
      setInfo(typeof okMsg === 'function' ? okMsg(r) : okMsg)
      await reloadAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveYear(e) {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      const body = { name: yForm.name, start_date: yForm.start_date, end_date: yForm.end_date }
      if (yForm.id) await updateAcademicYear(token, yForm.id, body)
      else await createAcademicYear(token, body)
      setInfo(yForm.id ? 'Academic year update ho gaya.' : 'Academic year add ho gaya.')
      setYForm(null)
      await reloadAll()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveTermForm(e) {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      await saveTerm(token, {
        course_id: tForm.course_id, semester: Number(tForm.semester), start_date: tForm.start_date,
        end_date: tForm.end_date, academic_year: tForm.academic_year,
      })
      setInfo('Semester term save ho gaya.')
      setTForm(null)
      await reloadAll()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const selCourse = tForm && courses.find((c) => c.id === tForm.course_id)
  const pages = Math.max(1, Math.ceil(terms.total / PAGE_SIZE))
  const st = terms.stats

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat icon={CalendarDays} label="Current year" value={current ? current.name : '-'} color="#2563EB" />
        <Stat icon={Play} label="Running terms" value={st.running} color="#16A34A" />
        <Stat icon={Clock} label="Upcoming terms" value={st.upcoming} color="#D97706" />
        <Stat icon={CheckCircle2} label="Ended terms" value={st.ended} color="#64748B" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
          {[['years', 'Academic Years', CalendarDays], ['terms', 'Semester Terms', Layers]].map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => { setTab(k); setInfo(''); setError('') }}
              className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 font-body text-sm ${tab === k ? 'text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              style={tab === k ? { background: ACCENT } : undefined}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy} onClick={() => act(() => seedDemoAcademic(token), (r) => (r.years || r.terms ? `Sample data: ${r.years} years, ${r.terms} terms add hue.` : 'Sample data pehle se maujood hai.'))}>
            <Database size={15} /> Sample data
          </button>
          {tab === 'years' ? (
            <button className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: ACCENT }} onClick={() => { setFormError(''); setInfo(''); setYForm({ name: '', start_date: '', end_date: '' }) }}>
              <Plus size={16} /> Add Academic Year
            </button>
          ) : (
            <button className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: ACCENT }} onClick={() => { setFormError(''); setInfo(''); setTForm({ course_id: '', semester: 1, academic_year: current ? current.name : '', start_date: '', end_date: '' }) }}>
              <Plus size={16} /> Set Semester Term
            </button>
          )}
        </div>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {info && <p className="font-body text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{info}</p>}

      {tab === 'years' && (
        loading ? <p className="font-body text-sm text-slate-500">Loading...</p> : years.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center font-body text-sm text-slate-500">
            Abhi koi academic year nahi hai. "Add Academic Year" se pehla banao (jaise 2026-27).
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {years.map((y) => (
              <div key={y.id} className={`bg-white rounded-xl border shadow-sm p-5 ${y.is_current ? 'border-blue-400 ring-1 ring-blue-200' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-xl text-slate-900 flex items-center gap-2">
                      {y.name}
                      {y.is_current && <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 text-white px-2 py-0.5 text-xs font-body"><Star size={11} /> Current</span>}
                    </p>
                    <p className="font-body text-sm text-slate-500 mt-1">{fmt(y.start_date)} - {fmt(y.end_date)}</p>
                  </div>
                  <Pill status={y.status} />
                </div>
                <p className="font-body text-sm text-slate-600 mt-3">{y.terms} semester term{y.terms === 1 ? '' : 's'}</p>
                <div className="flex flex-wrap gap-2 mt-4">
                  {!y.is_current && <button className={`${OUTLINE} flex items-center gap-1`} disabled={busy} onClick={() => act(() => setCurrentAcademicYear(token, y.id), `${y.name} ab current year hai.`)}><Star size={13} /> Make current</button>}
                  <button className={`${OUTLINE} flex items-center gap-1`} onClick={() => { setFormError(''); setInfo(''); setYForm({ id: y.id, name: y.name, start_date: y.start_date, end_date: y.end_date }) }}><Pencil size={13} /> Edit</button>
                  <button
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 font-body text-sm text-red-600 hover:bg-red-50 flex items-center gap-1"
                    onClick={() => window.confirm(`${y.name} delete karna hai?`) && act(() => deleteAcademicYear(token, y.id), 'Academic year delete ho gaya.')}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'terms' && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap gap-2">
            <select className={`${INPUT} w-52`} value={courseFilter} onChange={(e) => { setCourseFilter(e.target.value); setPage(1) }}>
              <option value="">All courses</option>
              {courses.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <select className={`${INPUT} w-40`} value={yearFilter} onChange={(e) => { setYearFilter(e.target.value); setPage(1) }}>
              <option value="">All years</option>
              {years.map((y) => <option key={y.id} value={y.name}>{y.name}</option>)}
            </select>
            <select className={`${INPUT} w-40`} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
              <option value="">All status</option>
              <option value="running">Running</option>
              <option value="upcoming">Upcoming</option>
              <option value="ended">Ended</option>
            </select>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full font-body text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Sem</th>
                  <th className="px-4 py-3 font-medium">Year</th>
                  <th className="px-4 py-3 font-medium">Dates</th>
                  <th className="px-4 py-3 font-medium">Progress</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>}
                {!loading && terms.items.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    {courseFilter || yearFilter || statusFilter ? 'Koi term match nahi hua.' : 'Abhi koi semester term nahi hai. Pehle academic year banao, phir "Set Semester Term" dabao.'}
                  </td></tr>
                )}
                {!loading && terms.items.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-slate-900">{t.course}</td>
                    <td className="px-4 py-3 text-slate-700">{t.semester}</td>
                    <td className="px-4 py-3 text-slate-700">{t.academic_year || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{fmt(t.start_date)} - {fmt(t.end_date)}</td>
                    <td className="px-4 py-3 w-48">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${t.status === 'ended' ? 100 : t.status === 'upcoming' ? 0 : t.progress}%`, background: STATUS[t.status].bar }} />
                        </div>
                        <Pill status={t.status} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          className={`${OUTLINE} flex items-center gap-1`}
                          onClick={() => {
                            const c = courses.find((x) => x.name === t.course)
                            setFormError('')
                            setInfo('')
                            setTForm({ edit: true, course_id: c ? c.id : '', course_name: t.course, semester: Number(t.semester) || t.semester, academic_year: t.academic_year || '', start_date: t.start_date, end_date: t.end_date })
                          }}
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 font-body text-sm text-red-600 hover:bg-red-50 flex items-center gap-1"
                          onClick={() => window.confirm(`${t.course} semester ${t.semester} ka term delete karna hai?`) && act(() => deleteTerm(token, t.id), 'Semester term delete ho gaya.')}
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3 font-body text-sm text-slate-500">
            <span>Total: {terms.total}</span>
            <div className="flex items-center gap-2">
              <button className={OUTLINE} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page} / {pages}</span>
              <button className={OUTLINE} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        </>
      )}

      {yForm && (
        <Modal title={yForm.id ? 'Edit Academic Year' : 'Add Academic Year'} onClose={() => setYForm(null)}>
          <form onSubmit={saveYear} className="space-y-4">
            {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
            <div>
              <Label>Name * (jaise 2026-27)</Label>
              <input className={INPUT} maxLength={7} value={yForm.name} onChange={(e) => setYForm({ ...yForm, name: e.target.value })} placeholder="2026-27" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start date *</Label>
                <input className={INPUT} type="date" value={yForm.start_date} onChange={(e) => setYForm({ ...yForm, start_date: e.target.value })} />
              </div>
              <div>
                <Label>End date *</Label>
                <input className={INPUT} type="date" value={yForm.end_date} onChange={(e) => setYForm({ ...yForm, end_date: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className={PRIMARY} style={{ background: ACCENT }}>{saving ? 'Saving...' : 'Save'}</button>
              <button type="button" className={OUTLINE} onClick={() => setYForm(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {tForm && (
        <Modal title={tForm.edit ? 'Edit Semester Term' : 'Set Semester Term'} onClose={() => setTForm(null)}>
          <form onSubmit={saveTermForm} className="space-y-4">
            {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
            {tForm.edit && !tForm.course_id && (
              <p className="font-body text-sm text-amber-700">"{tForm.course_name}" admin ke courses me nahi mila, isliye ise yahan edit nahi kar sakte. Delete karke naya set karo.</p>
            )}
            <div>
              <Label>Course *</Label>
              <select className={INPUT} disabled={tForm.edit} value={tForm.course_id} onChange={(e) => setTForm({ ...tForm, course_id: e.target.value, semester: 1 })}>
                <option value="">Select course</option>
                {courses.filter((c) => c.is_active || c.id === tForm.course_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Semester *</Label>
                <select className={INPUT} disabled={tForm.edit} value={tForm.semester} onChange={(e) => setTForm({ ...tForm, semester: e.target.value })}>
                  {Array.from({ length: selCourse ? selCourse.semesters : 8 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Semester {n}</option>)}
                </select>
              </div>
              <div>
                <Label>Academic year *</Label>
                <select className={INPUT} value={tForm.academic_year} onChange={(e) => setTForm({ ...tForm, academic_year: e.target.value })}>
                  <option value="">Select year</option>
                  {years.map((y) => <option key={y.id} value={y.name}>{y.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Start date *</Label>
                <input className={INPUT} type="date" value={tForm.start_date} onChange={(e) => setTForm({ ...tForm, start_date: e.target.value })} />
              </div>
              <div>
                <Label>End date *</Label>
                <input className={INPUT} type="date" value={tForm.end_date} onChange={(e) => setTForm({ ...tForm, end_date: e.target.value })} />
              </div>
            </div>
            <p className="font-body text-xs text-slate-500">Student ki timetable is end date tak dikhti hai. Dates academic year ke andar honi chahiye.</p>
            <div className="flex gap-3">
              <button type="submit" disabled={saving || (tForm.edit && !tForm.course_id)} className={PRIMARY} style={{ background: ACCENT }}>{saving ? 'Saving...' : 'Save'}</button>
              <button type="button" className={OUTLINE} onClick={() => setTForm(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}