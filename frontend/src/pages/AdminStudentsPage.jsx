import { useCallback, useEffect, useState } from 'react'
import {
  Search, Plus, Users, UserCheck, UserX, KeyRound, Pencil, Ban, Database, X, Upload, Download,
  TrendingUp, ArrowRightLeft, GraduationCap,
} from 'lucide-react'
import {
  listStudents, createStudent, updateStudent, toggleStudent, resetStudentPassword, promoteStudents,
  transferStudents, importStudents, downloadStudentsCsv, downloadStudentTemplate, seedDemoStudents, listCourses,
} from '../api.js'

const ACCENT = '#2563EB'
const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const PRIMARY = 'rounded-lg px-4 py-2 font-body text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const EMPTY = {
  college_id: '', name: '', password: '', course_id: '', semester: '', admission_year: '', gender: '',
  phone: '', parent_contact: '', father_name: '',
}
const PAGE_SIZE = 10
const TINTS = ['#2563EB', '#7C3AED', '#0891B2', '#059669', '#D97706', '#DB2777']

function Avatar({ name }) {
  const initials = (name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
  return (
    <span className="w-10 h-10 rounded-full flex items-center justify-center text-white font-body text-sm font-medium shrink-0" style={{ background: TINTS[(name || '').length % TINTS.length] }}>
      {initials}
    </span>
  )
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
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

export default function AdminStudentsPage({ session }) {
  const token = session.access_token
  const [data, setData] = useState({ items: [], total: 0, stats: { total: 0, active: 0, suspended: 0, without_course: 0 } })
  const [courses, setCourses] = useState([])
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [courseFilter, setCourseFilter] = useState('')
  const [semFilter, setSemFilter] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [selected, setSelected] = useState([])
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [pwTarget, setPwTarget] = useState(null)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [transfer, setTransfer] = useState(null) // { course_id, semester }
  const [transferError, setTransferError] = useState('')
  const [imp, setImp] = useState(null) // { file, password, result, error, busy }
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listCourses(token, { page: 1, pageSize: 100 })
      .then((d) => setCourses(d.items))
      .catch((e) => setError(e.message))
  }, [token])

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q)
      setPage(1)
    }, 400)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(() => {
    setLoading(true)
    return listStudents(token, { q: search, status, course: courseFilter, semester: semFilter, page, pageSize: PAGE_SIZE })
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, search, status, courseFilter, semFilter, page])

  useEffect(() => {
    load()
  }, [load])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const activeCourses = courses.filter((c) => c.is_active)
  const pageIds = data.items.map((s) => s.id)
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.includes(id))
  const toggleSel = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const togglePage = () => setSelected((s) => (allOnPage ? s.filter((id) => !pageIds.includes(id)) : [...new Set([...s, ...pageIds])]))

  async function run(fn, okMsg) {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      const r = await fn()
      if (okMsg) setInfo(typeof okMsg === 'function' ? okMsg(r) : okMsg)
      return r
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function save(e) {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      const body = {
        name: form.name, course_id: form.course_id || null, semester: form.semester, admission_year: form.admission_year,
        gender: form.gender, phone: form.phone, parent_contact: form.parent_contact, father_name: form.father_name,
      }
      if (form.id) await updateStudent(token, form.id, body)
      else await createStudent(token, { ...body, college_id: form.college_id, password: form.password })
      setInfo(form.id ? 'Student update ho gaya.' : 'Student add ho gaya.')
      setForm(null)
      await load()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggle(s) {
    let reason = ''
    if (s.is_active) {
      const r = window.prompt(`${s.name} ko suspend karna hai? Ye login nahi kar payega.\nReason (optional):`, '')
      if (r === null) return
      reason = r
    }
    await run(() => toggleStudent(token, s.id, reason), s.is_active ? 'Student suspend ho gaya.' : 'Student reactivate ho gaya.')
    await load()
  }

  async function doReset(e) {
    e.preventDefault()
    setPwError('')
    try {
      await resetStudentPassword(token, pwTarget.id, pw)
      setInfo(`${pwTarget.name} ka password reset ho gaya.`)
      setPwTarget(null)
      setPw('')
    } catch (err) {
      setPwError(err.message)
    }
  }

  async function doPromote() {
    if (!window.confirm(`${selected.length} selected students ko agle semester me promote karna hai?`)) return
    const r = await run(() => promoteStudents(token, selected))
    if (r) {
      const why = r.skipped.length ? ` Skip hue (${r.skipped.length}): ${r.skipped.slice(0, 3).map((x) => `${x.name} - ${x.reason}`).join('; ')}${r.skipped.length > 3 ? '...' : ''}` : ''
      setInfo(`${r.promoted} students promote hue.${why}`)
      setSelected([])
      await load()
    }
  }

  async function doTransfer(e) {
    e.preventDefault()
    setTransferError('')
    if (!transfer.course_id) return setTransferError('Naya course chuno.')
    try {
      const r = await transferStudents(token, selected, transfer.course_id, transfer.semester)
      setInfo(`${r.transferred} students transfer ho gaye.`)
      setTransfer(null)
      setSelected([])
      await load()
    } catch (err) {
      setTransferError(err.message)
    }
  }

  async function checkOrImport(dry) {
    setImp((i) => ({ ...i, busy: true, error: '' }))
    try {
      const r = await importStudents(token, imp.file, imp.password, dry)
      setImp((i) => ({ ...i, result: r, busy: false }))
      if (!dry) {
        setInfo(`${r.created} students import hue, ${r.errors.length} rows skip hui.`)
        await load()
      }
    } catch (err) {
      setImp((i) => ({ ...i, error: err.message, busy: false }))
    }
  }

  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const s = data.stats
  const exportParams = { q: search, status, course: courseFilter, semester: semFilter }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat icon={Users} label="Total students" value={s.total} color="#2563EB" />
        <Stat icon={UserCheck} label="Active" value={s.active} color="#059669" />
        <Stat icon={UserX} label="Suspended" value={s.suspended} color="#DC2626" />
        <Stat icon={GraduationCap} label="Course not set" value={s.without_course} color="#D97706" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${INPUT} pl-9 w-56`} placeholder="Search name or college ID" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className={`${INPUT} w-48`} value={courseFilter} onChange={(e) => { setCourseFilter(e.target.value); setPage(1) }}>
              <option value="">All courses</option>
              {courses.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <select className={`${INPUT} w-28`} value={semFilter} onChange={(e) => { setSemFilter(e.target.value); setPage(1) }}>
              <option value="">All sem</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Sem {n}</option>)}
            </select>
            <select className={`${INPUT} w-36`} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy} onClick={() => run(() => seedDemoStudents(token).then(async (r) => { await load(); return r }), (r) => (r.added ? `${r.added} sample students add hue. Sample password: ${r.password}` : 'Sample students pehle se maujood hain.'))}>
              <Database size={15} /> Sample data
            </button>
            <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy} onClick={() => run(() => downloadStudentsCsv(token, exportParams), 'students.csv download ho gayi.')}>
              <Download size={15} /> Export
            </button>
            <button className={`${OUTLINE} flex items-center gap-1.5`} onClick={() => setImp({ file: null, password: '', result: null, error: '', busy: false })}>
              <Upload size={15} /> Import
            </button>
            <button className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: ACCENT }} onClick={() => { setFormError(''); setInfo(''); setForm({ ...EMPTY }) }}>
              <Plus size={16} /> Add Student
            </button>
          </div>
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
            <span className="font-body text-sm text-blue-800">{selected.length} selected</span>
            <button className={`${OUTLINE} flex items-center gap-1`} disabled={busy} onClick={doPromote}><TrendingUp size={14} /> Promote to next semester</button>
            <button className={`${OUTLINE} flex items-center gap-1`} onClick={() => { setTransferError(''); setTransfer({ course_id: '', semester: '' }) }}><ArrowRightLeft size={14} /> Transfer course</button>
            <button className="font-body text-sm text-blue-700 underline ml-auto" onClick={() => setSelected([])}>Clear</button>
          </div>
        )}
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {info && <p className="font-body text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{info}</p>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 w-8"><input type="checkbox" checked={allOnPage} onChange={togglePage} aria-label="Select page" /></th>
              <th className="px-4 py-3 font-medium">Student</th>
              <th className="px-4 py-3 font-medium">Course</th>
              <th className="px-4 py-3 font-medium">Sem</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>}
            {!loading && data.items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                {search || status || courseFilter || semFilter ? 'Koi student match nahi hua.' : 'Abhi koi student nahi hai. "Add Student", "Import" ya "Sample data" use karo.'}
              </td></tr>
            )}
            {!loading && data.items.map((st) => (
              <tr key={st.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3"><input type="checkbox" checked={selected.includes(st.id)} onChange={() => toggleSel(st.id)} aria-label={`Select ${st.name}`} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={st.name} />
                    <div>
                      <p className="text-slate-900 font-medium">{st.name}</p>
                      <p className="text-xs text-slate-500">{st.college_id}{st.phone ? ` · ${st.phone}` : ''}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {st.course
                    ? <><p className="text-slate-800">{st.course}</p><p className="text-xs text-slate-500">{st.department || ''}</p></>
                    : <span className="text-slate-400">Not set</span>}
                </td>
                <td className="px-4 py-3 text-slate-700">{st.semester || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${st.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${st.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                    {st.is_active ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button className={`${OUTLINE} flex items-center gap-1`} onClick={() => { setFormError(''); setInfo(''); setForm({ id: st.id, college_id: st.college_id, name: st.name, password: '', course_id: '', course_text: st.course || '', semester: st.semester || '', admission_year: st.admission_year || '', gender: st.gender || '', phone: st.phone || '', parent_contact: st.parent_contact || '', father_name: st.father_name || '' }) }}>
                      <Pencil size={13} /> Edit
                    </button>
                    <button className={`${OUTLINE} flex items-center gap-1`} onClick={() => { setPw(''); setPwError(''); setPwTarget(st) }}>
                      <KeyRound size={13} /> Password
                    </button>
                    <button
                      className={`rounded-lg border bg-white px-3 py-1.5 font-body text-sm flex items-center gap-1 ${st.is_active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-700 hover:bg-green-50'}`}
                      onClick={() => toggle(st)}
                    >
                      {st.is_active ? <><Ban size={13} /> Suspend</> : <><UserCheck size={13} /> Activate</>}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 font-body text-sm text-slate-500">
        <span>Total: {data.total}</span>
        <div className="flex items-center gap-2">
          <button className={OUTLINE} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} / {pages}</span>
          <button className={OUTLINE} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>

      {form && (
        <Modal title={form.id ? 'Edit Student' : 'Add Student'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-4">
            {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>College ID * {form.id && <span className="text-slate-400">(login ID, change nahi hota)</span>}</Label>
                <input className={INPUT} maxLength={30} value={form.college_id} disabled={!!form.id} onChange={(e) => set('college_id', e.target.value)} />
              </div>
              <div>
                <Label>Full name *</Label>
                <input className={INPUT} maxLength={120} value={form.name} onChange={(e) => set('name', e.target.value)} />
              </div>
              {!form.id && (
                <div className="sm:col-span-2">
                  <Label>Password * (8+ characters)</Label>
                  <input className={INPUT} type="password" autoComplete="new-password" maxLength={64} value={form.password} onChange={(e) => set('password', e.target.value)} />
                </div>
              )}
              <div className="sm:col-span-2">
                <Label>Course {form.id && form.course_text && <span className="text-slate-400">(abhi: {form.course_text} - badalna ho to naya chuno)</span>}</Label>
                <select className={INPUT} value={form.course_id} onChange={(e) => set('course_id', e.target.value)}>
                  <option value="">{form.id ? 'Keep current' : 'Not set'}</option>
                  {activeCourses.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.department_name})</option>)}
                </select>
              </div>
              <div>
                <Label>Semester</Label>
                <input className={INPUT} maxLength={20} value={form.semester} onChange={(e) => set('semester', e.target.value)} placeholder="e.g. 3" />
              </div>
              <div>
                <Label>Admission year</Label>
                <input className={INPUT} maxLength={4} value={form.admission_year} onChange={(e) => set('admission_year', e.target.value)} placeholder="e.g. 2025" />
              </div>
              <div>
                <Label>Gender</Label>
                <select className={INPUT} value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                  <option value="">Not set</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <Label>Phone</Label>
                <input className={INPUT} maxLength={20} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              </div>
              <div>
                <Label>Father / guardian name</Label>
                <input className={INPUT} maxLength={120} value={form.father_name} onChange={(e) => set('father_name', e.target.value)} />
              </div>
              <div>
                <Label>Parent contact</Label>
                <input className={INPUT} maxLength={20} value={form.parent_contact} onChange={(e) => set('parent_contact', e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving} className={PRIMARY} style={{ background: ACCENT }}>{saving ? 'Saving...' : 'Save'}</button>
              <button type="button" className={OUTLINE} onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {pwTarget && (
        <Modal title={`Reset password - ${pwTarget.name}`} onClose={() => setPwTarget(null)}>
          <form onSubmit={doReset} className="space-y-4 max-w-md">
            {pwError && <p className="font-body text-sm text-red-600">{pwError}</p>}
            <div>
              <Label>New password (8+ characters)</Label>
              <input className={INPUT} type="password" autoComplete="new-password" maxLength={64} value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
            <div className="flex gap-3">
              <button type="submit" className={PRIMARY} style={{ background: ACCENT }}>Reset password</button>
              <button type="button" className={OUTLINE} onClick={() => setPwTarget(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {transfer && (
        <Modal title={`Transfer ${selected.length} students`} onClose={() => setTransfer(null)}>
          <form onSubmit={doTransfer} className="space-y-4 max-w-md">
            {transferError && <p className="font-body text-sm text-red-600">{transferError}</p>}
            <div>
              <Label>New course *</Label>
              <select className={INPUT} value={transfer.course_id} onChange={(e) => setTransfer({ ...transfer, course_id: e.target.value })}>
                <option value="">Select course</option>
                {activeCourses.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.department_name})</option>)}
              </select>
            </div>
            <div>
              <Label>Semester (optional, khali = same rahega)</Label>
              <input className={INPUT} maxLength={20} value={transfer.semester} onChange={(e) => setTransfer({ ...transfer, semester: e.target.value })} />
            </div>
            <div className="flex gap-3">
              <button type="submit" className={PRIMARY} style={{ background: ACCENT }}>Transfer</button>
              <button type="button" className={OUTLINE} onClick={() => setTransfer(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {imp && (
        <Modal title="Import students (CSV)" onClose={() => setImp(null)}>
          <div className="space-y-4">
            <p className="font-body text-sm text-slate-600">
              Columns: <code>college_id, name</code> zaroori; <code>course, semester, admission_year, gender, phone, parent_contact, father_name, password</code> optional.
              Course ka naam admin ke active course se match hona chahiye. Ek file me max 200 rows.{' '}
              <button type="button" className="text-blue-600 underline" onClick={() => downloadStudentTemplate(token).catch((e) => setImp((i) => ({ ...i, error: e.message })))}>Sample CSV download karo</button>
            </p>
            {imp.error && <p className="font-body text-sm text-red-600">{imp.error}</p>}
            <div>
              <Label>CSV file</Label>
              <input type="file" accept=".csv" className="font-body text-sm" onChange={(e) => setImp({ ...imp, file: e.target.files[0] || null, result: null, error: '' })} />
            </div>
            <div>
              <Label>Default password (jin rows me password nahi hai unke liye, 8+ characters)</Label>
              <input className={INPUT} type="password" autoComplete="new-password" maxLength={64} value={imp.password} onChange={(e) => setImp({ ...imp, password: e.target.value })} />
            </div>
            {imp.result && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-body text-sm">
                <p className="text-slate-800">
                  {imp.result.dry_run
                    ? `Check complete: ${imp.result.total_rows} rows, ${imp.result.valid} sahi, ${imp.result.errors.length} me error.`
                    : `Import complete: ${imp.result.created} add hue, ${imp.result.errors.length} skip.`}
                </p>
                {imp.result.errors.length > 0 && (
                  <ul className="mt-2 max-h-40 overflow-y-auto text-red-600 space-y-0.5">
                    {imp.result.errors.map((er, i) => <li key={i}>Row {er.row}{er.college_id ? ` (${er.college_id})` : ''}: {er.message}</li>)}
                  </ul>
                )}
              </div>
            )}
            <div className="flex gap-3">
              <button className={OUTLINE} disabled={!imp.file || imp.busy} onClick={() => checkOrImport(true)}>{imp.busy ? 'Please wait...' : 'Check file'}</button>
              <button className={PRIMARY} style={{ background: ACCENT }} disabled={!imp.file || !imp.result || !imp.result.dry_run || imp.result.valid === 0 || imp.busy} onClick={() => checkOrImport(false)}>
                Import {imp.result && imp.result.dry_run ? `${imp.result.valid} students` : ''}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}