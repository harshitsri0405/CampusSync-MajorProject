import { useCallback, useEffect, useState } from 'react'
import { Search, Plus, Users, UserCheck, UserX, KeyRound, Pencil, Ban, Database, Mail, Phone, X } from 'lucide-react'
import {
  listFaculty, createFaculty, updateFaculty, toggleFaculty, resetFacultyPassword, seedDemoFaculty, listDepartments,
} from '../api.js'

const ACCENT = '#2563EB'
const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const PRIMARY = 'rounded-lg px-4 py-2 font-body text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const EMPTY = {
  faculty_id: '', faculty_name: '', password: '', department_id: '', designation: '', email: '', phone: '',
  qualification: '', joining_date: '',
}
const PAGE_SIZE = 10
const TINTS = ['#2563EB', '#7C3AED', '#0891B2', '#059669', '#D97706', '#DB2777']

function Avatar({ name }) {
  const initials = (name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
  const color = TINTS[(name || '').length % TINTS.length]
  return (
    <span className="w-10 h-10 rounded-full flex items-center justify-center text-white font-body text-sm font-medium shrink-0" style={{ background: color }}>
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

export default function AdminFacultyPage({ session }) {
  const token = session.access_token
  const [data, setData] = useState({ items: [], total: 0, stats: { total: 0, active: 0, blocked: 0, with_department: 0 } })
  const [depts, setDepts] = useState([])
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [pwTarget, setPwTarget] = useState(null)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    listDepartments(token, { page: 1, pageSize: 100 })
      .then((d) => setDepts(d.items))
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
    return listFaculty(token, { q: search, status, departmentId: deptFilter, page, pageSize: PAGE_SIZE })
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, search, status, deptFilter, page])

  useEffect(() => {
    load()
  }, [load])

  const formDepts = depts.filter((d) => d.is_active || (form && d.id === form.department_id))
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function save(e) {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      const body = {
        faculty_name: form.faculty_name, department_id: form.department_id || null, designation: form.designation,
        email: form.email, phone: form.phone, qualification: form.qualification, joining_date: form.joining_date || null,
      }
      if (form.id) await updateFaculty(token, form.id, body)
      else await createFaculty(token, { ...body, faculty_id: form.faculty_id, password: form.password })
      setInfo(form.id ? 'Faculty update ho gaya.' : 'Faculty add ho gaya.')
      setForm(null)
      await load()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggle(f) {
    const blocking = f.is_active
    if (blocking && !window.confirm(`${f.faculty_name} ko block karna hai? Ye login nahi kar payenge.`)) return
    setInfo('')
    try {
      await toggleFaculty(token, f.id)
      setInfo(blocking ? 'Faculty block ho gaya.' : 'Faculty activate ho gaya.')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function doReset(e) {
    e.preventDefault()
    setPwError('')
    try {
      await resetFacultyPassword(token, pwTarget.id, pw)
      setInfo(`${pwTarget.faculty_name} ka password reset ho gaya.`)
      setPwTarget(null)
      setPw('')
    } catch (err) {
      setPwError(err.message)
    }
  }

  async function seed() {
    setSeeding(true)
    setError('')
    setInfo('')
    try {
      const r = await seedDemoFaculty(token)
      setInfo(r.added ? `${r.added} sample faculty add hue. Sample password: ${r.password}` : 'Sample faculty pehle se maujood hain.')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSeeding(false)
    }
  }

  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const s = data.stats

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat icon={Users} label="Total faculty" value={s.total} color="#2563EB" />
        <Stat icon={UserCheck} label="Active" value={s.active} color="#059669" />
        <Stat icon={UserX} label="Blocked" value={s.blocked} color="#DC2626" />
        <Stat icon={Database} label="Department assigned" value={s.with_department} color="#7C3AED" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${INPUT} pl-9 w-60`} placeholder="Search name, ID, email" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className={`${INPUT} w-48`} value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(1) }}>
              <option value="">All departments</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select className={`${INPUT} w-32`} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button className={`${OUTLINE} flex items-center gap-1.5`} onClick={seed} disabled={seeding}>
              <Database size={15} /> {seeding ? 'Loading...' : 'Load sample data'}
            </button>
            <button className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: ACCENT }} onClick={() => { setFormError(''); setInfo(''); setForm({ ...EMPTY }) }}>
              <Plus size={16} /> Add Faculty
            </button>
          </div>
        </div>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {info && <p className="font-body text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{info}</p>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Faculty</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>}
            {!loading && data.items.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                {search || status || deptFilter ? 'Koi faculty match nahi hua.' : 'Abhi koi faculty nahi hai. "Add Faculty" dabao ya "Load sample data" se test data lo.'}
              </td></tr>
            )}
            {!loading && data.items.map((f) => (
              <tr key={f.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={f.faculty_name} />
                    <div>
                      <p className="text-slate-900 font-medium">{f.faculty_name}</p>
                      <p className="text-xs text-slate-500">{f.faculty_id}{f.designation ? ` · ${f.designation}` : ''}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {f.department_name
                    ? <span className="inline-flex rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 text-xs font-medium">{f.department_name}</span>
                    : <span className="text-slate-400">Not assigned</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <p className="flex items-center gap-1.5"><Mail size={13} className="text-slate-400" />{f.email || '-'}</p>
                  <p className="flex items-center gap-1.5"><Phone size={13} className="text-slate-400" />{f.phone || '-'}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${f.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${f.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                    {f.is_active ? 'Active' : 'Blocked'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button className={`${OUTLINE} flex items-center gap-1`} onClick={() => { setFormError(''); setInfo(''); setForm({ id: f.id, faculty_id: f.faculty_id, faculty_name: f.faculty_name, password: '', department_id: f.department_id || '', designation: f.designation || '', email: f.email || '', phone: f.phone || '', qualification: f.qualification || '', joining_date: f.joining_date || '' }) }}>
                      <Pencil size={13} /> Edit
                    </button>
                    <button className={`${OUTLINE} flex items-center gap-1`} onClick={() => { setPw(''); setPwError(''); setPwTarget(f) }}>
                      <KeyRound size={13} /> Password
                    </button>
                    <button
                      className={`rounded-lg border bg-white px-3 py-1.5 font-body text-sm flex items-center gap-1 ${f.is_active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-700 hover:bg-green-50'}`}
                      onClick={() => toggle(f)}
                    >
                      {f.is_active ? <><Ban size={13} /> Block</> : <><UserCheck size={13} /> Activate</>}
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
        <Modal title={form.id ? 'Edit Faculty' : 'Add Faculty'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-4">
            {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Faculty ID * {form.id && <span className="text-slate-400">(login ID, change nahi hota)</span>}</Label>
                <input className={INPUT} maxLength={30} value={form.faculty_id} disabled={!!form.id} onChange={(e) => set('faculty_id', e.target.value)} />
              </div>
              <div>
                <Label>Full name *</Label>
                <input className={INPUT} maxLength={120} value={form.faculty_name} onChange={(e) => set('faculty_name', e.target.value)} />
              </div>
              {!form.id && (
                <div className="sm:col-span-2">
                  <Label>Password * (8+ characters)</Label>
                  <input className={INPUT} type="password" autoComplete="new-password" maxLength={64} value={form.password} onChange={(e) => set('password', e.target.value)} />
                </div>
              )}
              <div>
                <Label>Department</Label>
                <select className={INPUT} value={form.department_id} onChange={(e) => set('department_id', e.target.value)}>
                  <option value="">Not assigned</option>
                  {formDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Designation</Label>
                <input className={INPUT} maxLength={80} value={form.designation} onChange={(e) => set('designation', e.target.value)} placeholder="e.g. Assistant Professor" />
              </div>
              <div>
                <Label>Email</Label>
                <input className={INPUT} type="email" maxLength={120} value={form.email} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div>
                <Label>Phone</Label>
                <input className={INPUT} maxLength={20} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              </div>
              <div>
                <Label>Qualification</Label>
                <input className={INPUT} maxLength={120} value={form.qualification} onChange={(e) => set('qualification', e.target.value)} />
              </div>
              <div>
                <Label>Joining date</Label>
                <input className={INPUT} type="date" value={form.joining_date} onChange={(e) => set('joining_date', e.target.value)} />
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
        <Modal title={`Reset password - ${pwTarget.faculty_name}`} onClose={() => setPwTarget(null)}>
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
    </div>
  )
}