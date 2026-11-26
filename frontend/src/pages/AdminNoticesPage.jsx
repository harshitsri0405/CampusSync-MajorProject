import { useCallback, useEffect, useState } from 'react'
import { Megaphone, Star, CalendarDays, CalendarClock, Plus, Pencil, Trash2, Search, X, Database, Users, MapPin } from 'lucide-react'
import { listAdminNotices, saveAdminNotice, deleteAdminNotice, seedDemoAdminNotices, listDepartments } from '../api.js'

const ACCENT = '#2563EB'
const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const PRIMARY = 'rounded-lg px-4 py-2 font-body text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const CATS = {
  college: { label: 'College', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  department: { label: 'Department', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  event: { label: 'Event', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
}
const PAGE_SIZE = 8

const fmt = (d) => {
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
const clock = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

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

export default function AdminNoticesPage({ session }) {
  const token = session.access_token
  const [data, setData] = useState({ items: [], total: 0, stats: { total: 0, important: 0, upcoming_events: 0, this_month: 0, students: 0 } })
  const [departments, setDepartments] = useState([])
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [important, setImportant] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listDepartments(token, { status: 'active', page: 1, pageSize: 100 }).then((d) => setDepartments(d.items)).catch(() => setDepartments([]))
  }, [token])

  useEffect(() => { setPage(1) }, [q, category, important])

  const load = useCallback(() => {
    setLoading(true)
    return listAdminNotices(token, { q, category, important, page, pageSize: PAGE_SIZE })
      .then((d) => { setData(d); setError('') })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, q, category, important, page])

  useEffect(() => { load() }, [load])

  function openNew() {
    setFormError(''); setInfo('')
    setForm({ category: 'college', title: '', body: '', department_id: '', is_important: false, event_date: '', event_time: '', venue: '' })
  }

  function openEdit(n) {
    setFormError(''); setInfo('')
    const dept = departments.find((d) => d.name === n.department)
    setForm({ id: n.id, category: n.category, title: n.title, body: n.body, department_id: dept ? dept.id : '', is_important: n.is_important, event_date: n.event_date || '', event_time: n.event_time || '', venue: n.venue || '' })
  }

  async function save(e) {
    e.preventDefault()
    setFormError(''); setSaving(true)
    try {
      await saveAdminNotice(token, form.id, {
        category: form.category, title: form.title, body: form.body, is_important: form.is_important,
        department_id: form.category === 'department' ? form.department_id || null : null,
        event_date: form.category === 'event' ? form.event_date || null : null,
        event_time: form.category === 'event' ? form.event_time || null : null,
        venue: form.category === 'event' ? form.venue || null : null,
      })
      setInfo(form.id ? 'Notice update ho gaya.' : 'Notice post ho gaya. Students ko ab dikhega.')
      setForm(null)
      await load()
    } catch (err) { setFormError(err.message) } finally { setSaving(false) }
  }

  async function run(fn, ok) {
    setBusy(true); setError(''); setInfo('')
    try { const r = await fn(); setInfo(typeof ok === 'function' ? ok(r) : ok); await load() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const s = data.stats

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat icon={Megaphone} label="Total notices" value={s.total} color="#2563EB" />
        <Stat icon={Star} label="Important" value={s.important} color="#DC2626" />
        <Stat icon={CalendarDays} label="Upcoming events" value={s.upcoming_events} color="#D97706" />
        <Stat icon={CalendarClock} label="This month post hue" value={s.this_month} color="#7C3AED" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-3 text-slate-400" />
            <input className={`${INPUT} pl-9 w-64`} placeholder="Title ya message search" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={`${INPUT} w-40`} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className={`${INPUT} w-40`} value={important} onChange={(e) => setImportant(e.target.value)}>
            <option value="">All priority</option>
            <option value="true">Important</option>
            <option value="false">Normal</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy} onClick={() => run(() => seedDemoAdminNotices(token), (r) => r.message)}><Database size={15} /> Sample data</button>
          <button className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: ACCENT }} onClick={openNew}><Plus size={16} /> New Notice</button>
        </div>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {info && <p className="font-body text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{info}</p>}

      {loading ? (
        <p className="font-body text-sm text-slate-500">Loading...</p>
      ) : data.items.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center font-body text-sm text-slate-500">
          {q || category || important ? 'Koi notice match nahi hua.' : 'Abhi koi notice nahi hai. "New Notice" dabao.'}
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map((n) => {
            const pct = n.audience ? Math.round((n.reads * 100) / n.audience) : 0
            return (
              <div key={n.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${CATS[n.category].cls}`}>{CATS[n.category].label}{n.department ? ` · ${n.department}` : ''}</span>
                      {n.is_important && <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700"><Star size={11} /> Important</span>}
                    </div>
                    <h3 className="font-display text-base text-slate-900">{n.title}</h3>
                    <p className="font-body text-sm text-slate-600 mt-1 whitespace-pre-line line-clamp-3">{n.body}</p>
                    {n.category === 'event' && (
                      <p className="font-body text-sm text-amber-700 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="flex items-center gap-1"><CalendarDays size={14} /> {fmt(n.event_date)}{n.event_time ? `, ${clock(n.event_time)}` : ''}</span>
                        {n.venue && <span className="flex items-center gap-1"><MapPin size={14} /> {n.venue}</span>}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button className={`${OUTLINE} flex items-center gap-1`} onClick={() => openEdit(n)}><Pencil size={13} /> Edit</button>
                    <button className="rounded-lg border border-red-200 bg-white px-3 py-1.5 font-body text-sm text-red-600 hover:bg-red-50 flex items-center gap-1" disabled={busy}
                      onClick={() => window.confirm(`"${n.title}" delete karna hai? Students se bhi hat jayega.`) && run(() => deleteAdminNotice(token, n.id), 'Notice delete ho gaya.')}><Trash2 size={13} /> Delete</button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-slate-100 font-body text-xs text-slate-500">
                  <span>Posted {fmt(n.posted_on)} · {n.posted_by || 'Admin'}</span>
                  <span className="flex items-center gap-2"><Users size={13} /> {n.reads} / {n.audience} students ne dekha
                    <span className="inline-block w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: ACCENT }} /></span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center justify-between mt-3 font-body text-sm text-slate-500">
        <span>Total: {data.total}</span>
        <div className="flex items-center gap-2">
          <button className={OUTLINE} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} / {pages}</span>
          <button className={OUTLINE} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-lg text-slate-900">{form.id ? 'Edit Notice' : 'New Notice'}</h3>
              <button onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={20} /></button>
            </div>
            <form onSubmit={save} className="p-6 space-y-4">
              {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Category *</Label>
                  <select className={INPUT} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                {form.category === 'department' ? (
                  <div>
                    <Label>Department *</Label>
                    <select className={INPUT} value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                      <option value="">Select department</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 mt-7 font-body text-sm text-slate-700">
                    <input type="checkbox" checked={form.is_important} onChange={(e) => setForm({ ...form, is_important: e.target.checked })} /> Important mark karo
                  </label>
                )}
              </div>
              {form.category === 'department' && (
                <label className="flex items-center gap-2 font-body text-sm text-slate-700">
                  <input type="checkbox" checked={form.is_important} onChange={(e) => setForm({ ...form, is_important: e.target.checked })} /> Important mark karo
                </label>
              )}
              <div>
                <Label>Title *</Label>
                <input className={INPUT} maxLength={150} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <Label>Message *</Label>
                <textarea className={INPUT} rows={5} maxLength={5000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
              </div>
              {form.category === 'event' && (
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Event date *</Label><input className={INPUT} type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} /></div>
                  <div><Label>Time</Label><input className={INPUT} type="time" value={form.event_time} onChange={(e) => setForm({ ...form, event_time: e.target.value })} /></div>
                  <div className="col-span-2"><Label>Venue</Label><input className={INPUT} maxLength={100} value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="e.g. Main Auditorium" /></div>
                </div>
              )}
              <p className="font-body text-xs text-slate-500">
                {form.category === 'department' ? 'Ye notice sirf chune hue department ke students ko dikhega.' : 'Ye notice saare students ko dikhega.'}
              </p>
              <div className="flex gap-3">
                <button type="submit" disabled={saving} className={PRIMARY} style={{ background: ACCENT }}>{saving ? 'Saving...' : form.id ? 'Save changes' : 'Post notice'}</button>
                <button type="button" className={OUTLINE} onClick={() => setForm(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}