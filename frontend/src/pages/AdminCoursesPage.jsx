import { useCallback, useEffect, useState } from 'react'
import { Search, Plus } from 'lucide-react'
import { listCourses, createCourse, updateCourse, toggleCourse, deleteCourse, listDepartments } from '../api.js'

const INPUT =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const PRIMARY = 'rounded-md px-4 py-2 font-body text-sm font-medium text-white disabled:opacity-60'
const OUTLINE = 'rounded-md border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const EMPTY = { name: '', code: '', department_id: '', duration_years: 4, semesters: 8, description: '' }
const PAGE_SIZE = 10

export default function AdminCoursesPage({ session }) {
  const token = session.access_token
  const [data, setData] = useState({ items: [], total: 0 })
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
    return listCourses(token, { q: search, status, departmentId: deptFilter, page, pageSize: PAGE_SIZE })
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

  function openNew() {
    setFormError('')
    setInfo('')
    setForm({ ...EMPTY })
  }

  function setYears(v) {
    const years = Number(v)
    setForm((f) => ({ ...f, duration_years: years, semesters: years * 2 }))
  }

  async function save(e) {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      const body = {
        name: form.name,
        code: form.code,
        department_id: form.department_id,
        duration_years: Number(form.duration_years),
        semesters: Number(form.semesters),
        description: form.description,
      }
      if (form.id) await updateCourse(token, form.id, body)
      else await createCourse(token, body)
      setInfo(form.id ? 'Course update ho gaya.' : 'Course add ho gaya.')
      setForm(null)
      await load()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggle(c) {
    setInfo('')
    try {
      await toggleCourse(token, c.id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(c) {
    if (!window.confirm(`"${c.name}" delete karna hai? Ye wapas nahi aayega.`)) return
    setInfo('')
    try {
      await deleteCourse(token, c.id)
      setInfo('Course delete ho gaya.')
      if (data.items.length === 1 && page > 1) setPage(page - 1)
      else await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const activeDepts = depts.filter((d) => d.is_active || (form && d.id === form.department_id))

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${INPUT} pl-9 w-56`} placeholder="Search name or code" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={`${INPUT} w-48`} value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(1) }}>
            <option value="">All departments</option>
            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className={`${INPUT} w-32`} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <button className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: '#2563EB' }} onClick={openNew}>
          <Plus size={16} /> Add Course
        </button>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {info && <p className="font-body text-sm text-green-600 mb-3">{info}</p>}

      {form && (
        <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-5 mb-4 space-y-4">
          <h3 className="font-display text-base text-slate-900">{form.id ? 'Edit Course' : 'New Course'}</h3>
          {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
          {activeDepts.length === 0 && (
            <p className="font-body text-sm text-amber-700">Pehle Departments section me kam se kam ek active department banao.</p>
          )}
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="font-body text-sm text-slate-600 mb-1 block">Course name *</label>
              <input className={INPUT} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="font-body text-sm text-slate-600 mb-1 block">Code *</label>
              <input className={INPUT} maxLength={20} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="sm:col-span-3">
              <label className="font-body text-sm text-slate-600 mb-1 block">Department *</label>
              <select className={INPUT} value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                <option value="">Select department</option>
                {activeDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="font-body text-sm text-slate-600 mb-1 block">Duration (years) *</label>
              <select className={INPUT} value={form.duration_years} onChange={(e) => setYears(e.target.value)}>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="font-body text-sm text-slate-600 mb-1 block">Total semesters *</label>
              <input className={INPUT} type="number" min={1} max={12} value={form.semesters} onChange={(e) => setForm({ ...form, semesters: e.target.value })} />
            </div>
            <div className="sm:col-span-3">
              <label className="font-body text-sm text-slate-600 mb-1 block">Description</label>
              <textarea className={INPUT} rows={2} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className={PRIMARY} style={{ background: '#2563EB' }}>{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" className={OUTLINE} onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Course</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">Students</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">Loading...</td></tr>}
            {!loading && data.items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                {search || status || deptFilter ? 'Koi course match nahi hua.' : 'Abhi koi course nahi hai. "Add Course" se pehla banao.'}
              </td></tr>
            )}
            {!loading && data.items.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-900">{c.name}</td>
                <td className="px-4 py-3 text-slate-700">{c.code}</td>
                <td className="px-4 py-3 text-slate-700">{c.department_name || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{c.duration_years} yr / {c.semesters} sem</td>
                <td className="px-4 py-3 text-slate-700">{c.students}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${c.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                    {c.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button className={OUTLINE} onClick={() => { setFormError(''); setInfo(''); setForm({ id: c.id, name: c.name, code: c.code, department_id: c.department_id, duration_years: c.duration_years, semesters: c.semesters, description: c.description || '' }) }}>Edit</button>
                    <button className={OUTLINE} onClick={() => toggle(c)}>{c.is_active ? 'Deactivate' : 'Activate'}</button>
                    <button className="rounded-md border border-red-200 bg-white px-3 py-1.5 font-body text-sm text-red-600 hover:bg-red-50" onClick={() => remove(c)}>Delete</button>
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
    </div>
  )
}
