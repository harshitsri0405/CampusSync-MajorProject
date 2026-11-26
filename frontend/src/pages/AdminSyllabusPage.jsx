import { useCallback, useEffect, useState } from 'react'
import { BookOpen, CheckCircle2, AlertCircle, Layers, Pencil, Trash2, Plus, X, Database, FilePlus2 } from 'lucide-react'
import { listCourses, syllabusOverview, syllabusGet, syllabusSave, syllabusDelete, seedDemoAdminSyllabus } from '../api.js'

const ACCENT = '#2563EB'
const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const PRIMARY = 'rounded-lg px-4 py-2 font-body text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'

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

const Label = ({ children }) => <label className="font-body text-sm text-slate-600 mb-1 block">{children}</label>
const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

export default function AdminSyllabusPage({ session }) {
  const token = session.access_token
  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState('')
  const [semester, setSemester] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listCourses(token, { page: 1, pageSize: 100, status: 'active' }).then((d) => setCourses(d.items)).catch((e) => setError(e.message))
  }, [token])

  const load = useCallback(() => {
    if (!courseId) { setData(null); return Promise.resolve() }
    setLoading(true)
    return syllabusOverview(token, courseId, semester)
      .then((d) => { setData(d); setError('') })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, courseId, semester])

  useEffect(() => { load() }, [load])

  async function openEditor(subjectId) {
    setFormError(''); setInfo(''); setError('')
    try {
      const d = await syllabusGet(token, subjectId)
      setForm({
        subjectId, title: `${d.subject.name} (${d.subject.code})`, exists: d.exists, subject_type: d.subject_type, credits: d.credits,
        internal_marks: d.internal_marks ?? '', external_marks: d.external_marks ?? '', overview: d.overview, books: d.books,
        units: d.units.length ? d.units.map((u) => ({ title: u.title, topics: u.topics, hours: u.hours ?? '' })) : [{ title: '', topics: '', hours: '' }],
      })
    } catch (e) { setError(e.message) }
  }

  const setUnit = (i, patch) => setForm((f) => ({ ...f, units: f.units.map((u, idx) => (idx === i ? { ...u, ...patch } : u)) }))
  const moveUnit = (i, d) => setForm((f) => {
    const j = i + d
    if (j < 0 || j >= f.units.length) return f
    const units = [...f.units]
    ;[units[i], units[j]] = [units[j], units[i]]
    return { ...f, units }
  })

  async function save(e) {
    e.preventDefault()
    setFormError(''); setSaving(true)
    try {
      await syllabusSave(token, form.subjectId, {
        subject_type: form.subject_type, credits: Number(form.credits), internal_marks: numOrNull(form.internal_marks), external_marks: numOrNull(form.external_marks),
        overview: form.overview || null, books: form.books || null,
        units: form.units.map((u) => ({ title: u.title, topics: u.topics, hours: numOrNull(u.hours) })),
      })
      setInfo('Syllabus save ho gaya. Students ko ab dikhega.')
      setForm(null)
      await load()
    } catch (err) { setFormError(err.message) } finally { setSaving(false) }
  }

  async function run(fn, ok) {
    setBusy(true); setError(''); setInfo('')
    try { const r = await fn(); setInfo(typeof ok === 'function' ? ok(r) : ok); await load() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const course = courses.find((c) => c.id === courseId)
  const st = data && data.stats

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select className={`${INPUT} w-72`} value={courseId} onChange={(e) => { setCourseId(e.target.value); setSemester(1) }}>
            <option value="">Select course</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.department_name})</option>)}
          </select>
          <select className={`${INPUT} w-36`} value={semester} onChange={(e) => setSemester(Number(e.target.value))}>
            {Array.from({ length: course ? course.semesters : 8 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Semester {n}</option>)}
          </select>
        </div>
        <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy} onClick={() => run(() => seedDemoAdminSyllabus(token), (r) => r.message)}><Database size={15} /> Sample data</button>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {info && <p className="font-body text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{info}</p>}

      {!courseId ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center font-body text-sm text-slate-500">Syllabus banane ke liye course aur semester chuno.</div>
      ) : loading || !data ? (
        <p className="font-body text-sm text-slate-500">Loading...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Stat icon={BookOpen} label="Active subjects" value={st.subjects} color="#2563EB" />
            <Stat icon={CheckCircle2} label={`Syllabus bana (${st.coverage}%)`} value={st.with_syllabus} color="#16A34A" />
            <Stat icon={AlertCircle} label="Pending" value={st.missing} color="#D97706" />
            <Stat icon={Layers} label="Total units" value={st.units} color="#7C3AED" />
          </div>
          {data.items.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center font-body text-sm text-slate-500">Is semester me koi subject nahi hai. Pehle Subjects section me subject banao.</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {data.items.map((s) => (
                <div key={s.subject_id} className={`bg-white rounded-xl border shadow-sm p-4 ${s.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-base text-slate-900">{s.name}</p>
                      <p className="font-body text-xs text-slate-500">{s.code} · {s.credits} credits{!s.is_active ? ' · inactive' : ''}</p>
                    </div>
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.has_syllabus ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{s.has_syllabus ? 'Syllabus ready' : 'Pending'}</span>
                  </div>
                  {s.has_syllabus && <p className="font-body text-sm text-slate-600 mt-2 capitalize">{s.subject_type} · {s.units} units{s.hours ? ` · ${s.hours} hours` : ''}</p>}
                  <div className="flex gap-2 mt-3">
                    <button className={`${s.has_syllabus ? OUTLINE : PRIMARY} flex items-center gap-1`} style={s.has_syllabus ? undefined : { background: ACCENT }} disabled={!s.is_active} onClick={() => openEditor(s.subject_id)}>
                      {s.has_syllabus ? <><Pencil size={13} /> Edit syllabus</> : <><FilePlus2 size={14} /> Syllabus banao</>}
                    </button>
                    {s.has_syllabus && (
                      <button className="rounded-lg border border-red-200 bg-white px-3 py-1.5 font-body text-sm text-red-600 hover:bg-red-50 flex items-center gap-1" disabled={busy}
                        onClick={() => window.confirm(`${s.name} ka syllabus delete karna hai? Students se hat jayega.`) && run(() => syllabusDelete(token, s.subject_id), 'Syllabus delete ho gaya.')}><Trash2 size={13} /> Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-lg text-slate-900">{form.exists ? 'Edit' : 'New'} syllabus · {form.title}</h3>
              <button onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={20} /></button>
            </div>
            <form onSubmit={save} className="p-6 space-y-4">
              {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <Label>Type</Label>
                  <select className={INPUT} value={form.subject_type} onChange={(e) => setForm({ ...form, subject_type: e.target.value })}>
                    <option value="theory">Theory</option><option value="practical">Practical</option>
                  </select>
                </div>
                <div><Label>Credits *</Label><input className={INPUT} type="number" min={1} max={10} value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} /></div>
                <div><Label>Internal marks</Label><input className={INPUT} type="number" min={0} max={100} value={form.internal_marks} onChange={(e) => setForm({ ...form, internal_marks: e.target.value })} /></div>
                <div><Label>External marks</Label><input className={INPUT} type="number" min={0} max={100} value={form.external_marks} onChange={(e) => setForm({ ...form, external_marks: e.target.value })} /></div>
              </div>
              <div>
                <Label>Overview</Label>
                <textarea className={INPUT} rows={3} maxLength={2000} value={form.overview} onChange={(e) => setForm({ ...form, overview: e.target.value })} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-display text-base text-slate-900">{form.subject_type === 'practical' ? 'Experiments' : 'Units'} ({form.units.length})</p>
                  <button type="button" className={`${OUTLINE} flex items-center gap-1`} disabled={form.units.length >= 20} onClick={() => setForm({ ...form, units: [...form.units, { title: '', topics: '', hours: '' }] })}><Plus size={14} /> Add</button>
                </div>
                <div className="space-y-3">
                  {form.units.map((u, i) => (
                    <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-body text-sm font-medium text-slate-700 w-16">#{i + 1}</span>
                        <input className={INPUT} maxLength={120} placeholder="Title" value={u.title} onChange={(e) => setUnit(i, { title: e.target.value })} />
                        <input className={`${INPUT} w-24`} type="number" min={1} max={100} placeholder="Hours" value={u.hours} onChange={(e) => setUnit(i, { hours: e.target.value })} />
                        <button type="button" className="text-slate-500 hover:text-slate-800 px-1" disabled={i === 0} onClick={() => moveUnit(i, -1)} aria-label="Up">↑</button>
                        <button type="button" className="text-slate-500 hover:text-slate-800 px-1" disabled={i === form.units.length - 1} onClick={() => moveUnit(i, 1)} aria-label="Down">↓</button>
                        <button type="button" className="text-red-500 hover:text-red-700" disabled={form.units.length === 1} onClick={() => setForm({ ...form, units: form.units.filter((_, idx) => idx !== i) })} aria-label="Remove"><Trash2 size={15} /></button>
                      </div>
                      <textarea className={INPUT} rows={3} placeholder="Topics (ek line me ek topic)" value={u.topics} onChange={(e) => setUnit(i, { topics: e.target.value })} />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label>Reference books (ek line me ek book)</Label>
                <textarea className={INPUT} rows={3} maxLength={2000} value={form.books} onChange={(e) => setForm({ ...form, books: e.target.value })} />
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={saving} className={PRIMARY} style={{ background: ACCENT }}>{saving ? 'Saving...' : 'Save syllabus'}</button>
                <button type="button" className={OUTLINE} onClick={() => setForm(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}