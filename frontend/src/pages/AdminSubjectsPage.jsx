import { useCallback, useEffect, useState } from 'react'
import { Search, Plus } from 'lucide-react'
import { listSubjects, createSubject, updateSubject, toggleSubject, deleteSubject, listCourses } from '../api.js'

const INPUT =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const PRIMARY = 'rounded-md px-4 py-2 font-body text-sm font-medium text-white disabled:opacity-60'
const OUTLINE = 'rounded-md border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const EMPTY = { name: '', code: '', course_id: '', semester: 1, credits: 3, subject_type: 'theory' }
const TYPES = { theory: 'Theory', practical: 'Practical', elective: 'Elective' }
const PAGE_SIZE = 10

export default function AdminSubjectsPage({ session }) {
  const token = session.access_token
  const [data, setData] = useState({ items: [], total: 0 })
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
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

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
    return listSubjects(token, { q: search, status, courseId: courseFilter, semester: semFilter, page, pageSize: PAGE_SIZE })
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

  const courseById = (id) => courses.find((c) => c.id === id)
  const semOptions = (courseId) => {
    const c = courseById(courseId)
    return Array.from({ length: c ? c.semesters : 8 }, (_, i) => i + 1)
  }
  const formCourses = courses.filter((c) => c.is_active || (form && c.id === form.course_id))

  async function save(e) {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      const body = {
        course_id: form.course_id,
        semester: Number(form.semester),
        name: form.name,
        code: form.code,
        credits: Number(form.credits),
        subject_type: form.subject_type,
      }
      if (form.id) await updateSubject(token, form.id, body)
      else await createSubject(token, body)
      setInfo(form.id ? 'Subject update ho gaya.' : 'Subject add ho gaya.')
      setForm(null)
      await load()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggle(s) {
    setInfo('')
    try {
      await toggleSubject(token, s.id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(s) {
    if (!window.confirm(`"${s.name}" delete karna hai? Ye wapas nahi aayega.`)) return
    setInfo('')
    try {
      await deleteSubject(token, s.id)
      setInfo('Subject delete ho gaya.')
      if (data.items.length === 1 && page > 1) setPage(page - 1)
      else await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${INPUT} pl-9 w-52`} placeholder="Search name or code" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={`${INPUT} w-48`} value={courseFilter} onChange={(e) => { setCourseFilter(e.target.value); setPage(1) }}>
            <option value="">All courses</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={`${INPUT} w-32`} value={semFilter} onChange={(e) => { setSemFilter(e.target.value); setPage(1) }}>
            <option value="">All sem</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Sem {n}</option>)}
          </select>
          <select className={`${INPUT} w-32`} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <button
          className={`${PRIMARY} flex items-center gap-1.5`}
          style={{ background: '#2563EB' }}
          onClick={() => { setFormError(''); setInfo(''); setForm({ ...EMPTY }) }}
        >
          <Plus size={16} /> Add Subject
        </button>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {info && <p className="font-body text-sm text-green-600 mb-3">{info}</p>}

      {form && (
        <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-5 mb-4 space-y-4">
          <h3 className="font-display text-base text-slate-900">{form.id ? 'Edit Subject' : 'New Subject'}</h3>
          {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
          {formCourses.length === 0 && (
            <p className="font-body text-sm text-amber-700">Pehle Courses section me kam se kam ek active course banao.</p>
          )}
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="font-body text-sm text-slate-600 mb-1 block">Subject name *</label>
              <input className={INPUT} maxLength={150} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="font-body text-sm text-slate-600 mb-1 block">Code *</label>
              <input className={INPUT} maxLength={20} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="font-body text-sm text-slate-600 mb-1 block">Course *</label>
              <select
                className={INPUT}
                value={form.course_id}
                onChange={(e) => setForm({ ...form, course_id: e.target.value, semester: 1 })}
              >
                <option value="">Select course</option>
                {formCourses.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.department_name})</option>)}
              </select>
            </div>
            <div>
              <label className="font-body text-sm text-slate-600 mb-1 block">Semester *</label>
              <select className={INPUT} value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })}>
                {semOptions(form.course_id).map((n) => <option key={n} value={n}>Semester {n}</option>)}
              </select>
            </div>
            <div>
              <label className="font-body text-sm text-slate-600 mb-1 block">Credits</label>
              <input className={INPUT} type="number" min={0} max={10} value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} />
            </div>
            <div>
              <label className="font-body text-sm text-slate-600 mb-1 block">Type</label>
              <select className={INPUT} value={form.subject_type} onChange={(e) => setForm({ ...form, subject_type: e.target.value })}>
                {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
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
              <th className="px-4 py-3 font-medium">Subject</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Course</th>
              <th className="px-4 py-3 font-medium">Sem</th>
              <th className="px-4 py-3 font-medium">Credits</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">Loading...</td></tr>}
            {!loading && data.items.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                {search || status || courseFilter || semFilter ? 'Koi subject match nahi hua.' : 'Abhi koi subject nahi hai. "Add Subject" se pehla banao.'}
              </td></tr>
            )}
            {!loading && data.items.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-900">{s.name}</td>
                <td className="px-4 py-3 text-slate-700">{s.code}</td>
                <td className="px-4 py-3 text-slate-700">{s.course_name || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{s.semester}</td>
                <td className="px-4 py-3 text-slate-700">{s.credits}</td>
                <td className="px-4 py-3 text-slate-700">{TYPES[s.subject_type] || s.subject_type}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button className={OUTLINE} onClick={() => { setFormError(''); setInfo(''); setForm({ id: s.id, name: s.name, code: s.code, course_id: s.course_id, semester: s.semester, credits: s.credits, subject_type: s.subject_type }) }}>Edit</button>
                    <button className={OUTLINE} onClick={() => toggle(s)}>{s.is_active ? 'Deactivate' : 'Activate'}</button>
                    <button className="rounded-md border border-red-200 bg-white px-3 py-1.5 font-body text-sm text-red-600 hover:bg-red-50" onClick={() => remove(s)}>Delete</button>
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
