import { useCallback, useEffect, useState } from 'react'
import { Megaphone, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import {
  facultyNoticeMeta, listFacultyNotices, createFacultyNotice, updateFacultyNotice, deleteFacultyNotice,
  listFacultyClasses, sendFacultyAnnouncement, listFacultyAnnouncements,
} from '../api.js'

const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const GREEN = 'rounded-lg bg-green-600 px-4 py-2 font-body text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60'
const BADGE = {
  college: 'bg-blue-50 text-blue-700',
  department: 'bg-green-50 text-green-700',
  event: 'bg-amber-50 text-amber-700',
}

const fmtDate = (v) => (v ? new Date(v.length <= 10 ? `${v}T00:00:00` : v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-')
const fmtDateTime = (v) => new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const todayStr = () => new Date().toLocaleDateString('en-CA')

function Pager({ page, total, size = 10, onPage }) {
  const pages = Math.max(1, Math.ceil(total / size))
  return (
    <div className="flex items-center justify-between mt-3 font-body text-sm text-slate-500">
      <span>Total: {total}</span>
      <div className="flex items-center gap-2">
        <button className={OUTLINE} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span>Page {page} / {pages}</span>
        <button className={OUTLINE} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  )
}

function NoticeForm({ token, dept, item, onDone, onCancel }) {
  const editing = Boolean(item)
  const [f, setF] = useState({
    kind: item ? item.category : 'department', title: item ? item.title : '', body: item ? item.body : '',
    is_important: item ? item.is_important : false, event_date: item && item.event_date ? item.event_date : '',
    event_time: item && item.event_time ? item.event_time : '', venue: item && item.venue ? item.venue : '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (f.title.trim().length < 3) return setError('Title kam se kam 3 akshar ka ho.')
    if (f.body.trim().length < 3) return setError('Notice ka matter likho.')
    if (f.kind === 'event' && !f.event_date) return setError('Event ki date chuno.')
    const payload = {
      kind: f.kind, title: f.title, body: f.body, is_important: f.is_important,
      event_date: f.kind === 'event' ? f.event_date : null, event_time: f.kind === 'event' ? f.event_time : null, venue: f.kind === 'event' ? f.venue : null,
    }
    setBusy(true)
    try {
      if (editing) { await updateFacultyNotice(token, item.id, payload); onDone('Notice update ho gaya.') }
      else { const r = await createFacultyNotice(token, payload); onDone(`Notice post ho gaya, ${r.notified} students ko notification gayi.`) }
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base text-slate-900">{editing ? 'Notice edit karo' : 'Naya notice'}</h3>
        <button type="button" className="text-slate-400 hover:text-slate-700" onClick={onCancel} aria-label="Close"><X size={18} /></button>
      </div>
      {error && <p className="font-body text-sm text-red-600">{error}</p>}
      <p className="font-body text-sm text-slate-500">Kisko dikhega: <span className="text-slate-800">{dept} ke students</span></p>
      {!editing && (
        <div className="flex gap-4 font-body text-sm text-slate-700">
          {[['department', 'Department notice'], ['event', 'Event']].map(([k, label]) => (
            <label key={k} className="flex items-center gap-2"><input type="radio" checked={f.kind === k} onChange={() => setF({ ...f, kind: k })} /> {label}</label>
          ))}
        </div>
      )}
      <div>
        <label className="font-body text-sm text-slate-600 mb-1 block">Title</label>
        <input className={INPUT} maxLength={150} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </div>
      <div>
        <label className="font-body text-sm text-slate-600 mb-1 block">Matter</label>
        <textarea className={INPUT} rows={4} maxLength={2000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      </div>
      {f.kind === 'event' && (
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="font-body text-sm text-slate-600 mb-1 block">Event date</label>
            <input className={INPUT} type="date" min={editing ? undefined : todayStr()} value={f.event_date} onChange={(e) => setF({ ...f, event_date: e.target.value })} />
          </div>
          <div>
            <label className="font-body text-sm text-slate-600 mb-1 block">Time</label>
            <input className={INPUT} type="time" value={f.event_time} onChange={(e) => setF({ ...f, event_time: e.target.value })} />
          </div>
          <div>
            <label className="font-body text-sm text-slate-600 mb-1 block">Venue</label>
            <input className={INPUT} maxLength={150} value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} />
          </div>
        </div>
      )}
      <label className="flex items-center gap-2 font-body text-sm text-slate-700">
        <input type="checkbox" checked={f.is_important} onChange={(e) => setF({ ...f, is_important: e.target.checked })} /> Important mark karo
      </label>
      <div className="flex gap-3">
        <button type="submit" className={GREEN} disabled={busy}>{busy ? 'Saving...' : editing ? 'Update' : 'Post karo'}</button>
        <button type="button" className={OUTLINE} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function NoticesTab({ token }) {
  const [dept, setDept] = useState(null)
  const [scope, setScope] = useState('all')
  const [category, setCategory] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => { facultyNoticeMeta(token).then((d) => setDept(d.department)).catch(() => setDept(null)) }, [token])

  const load = useCallback(() => {
    setLoading(true)
    return listFacultyNotices(token, { scope, category, q, page })
      .then((d) => { setData(d); setError('') })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, scope, category, q, page])

  useEffect(() => { load() }, [load])

  async function remove(n) {
    if (!window.confirm(`"${n.title}" delete karna hai? Students ko ye dikhna band ho jayega.`)) return
    setError(''); setOk('')
    try { await deleteFacultyNotice(token, n.id); setOk('Notice delete ho gaya.'); await load() } catch (e) { setError(e.message) }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {[['all', 'Saare notices'], ['mine', 'Mere notices']].map(([k, label]) => (
              <button key={k} onClick={() => { setScope(k); setPage(1) }} className={`rounded-md px-3 py-1.5 font-body text-sm ${scope === k ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600'}`}>{label}</button>
            ))}
          </div>
          <select className={`${INPUT} w-40`} value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }}>
            <option value="">Sab type</option><option value="college">College</option><option value="department">Department</option><option value="event">Event</option>
          </select>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-3 text-slate-400" />
            <input className={`${INPUT} w-56 pl-9`} placeholder="Search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
          </div>
        </div>
        <button className={`${GREEN} flex items-center gap-1.5`} disabled={!dept} onClick={() => { setForm('new'); setOk('') }}><Plus size={16} /> Naya notice</button>
      </div>

      {dept === null && <p className="font-body text-sm text-amber-700 mb-3">Aapka department set nahi hai, isliye notice post nahi ho sakta. Admin se Faculty page me department set karwao.</p>}
      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700 mb-3">{ok}</p>}

      {form && dept && (
        <NoticeForm token={token} dept={dept} item={form === 'new' ? null : form} onCancel={() => setForm(null)}
          onDone={(m) => { setForm(null); setOk(m); load() }} />
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Notice</th><th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Department</th><th className="px-4 py-3 font-medium">Posted</th>
              <th className="px-4 py-3 font-medium text-right">Read</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>}
            {!loading && data && data.items.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Koi notice nahi mila.</td></tr>}
            {!loading && data && data.items.map((n) => (
              <tr key={n.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 align-top">
                <td className="px-4 py-3">
                  <p className="text-slate-900">{n.is_important && <span className="mr-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600">Important</span>}{n.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 max-w-md line-clamp-2">{n.body}</p>
                  {n.category === 'event' && <p className="text-xs text-amber-700 mt-0.5">{fmtDate(n.event_date)}{n.event_time ? `, ${n.event_time}` : ''}{n.venue ? ` · ${n.venue}` : ''}</p>}
                </td>
                <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs ${BADGE[n.category] || 'bg-slate-100 text-slate-600'}`}>{n.category}</span></td>
                <td className="px-4 py-3 text-slate-700">{n.department || '-'}<span className="block text-xs text-slate-400">{n.posted_by}</span></td>
                <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{fmtDate(n.posted_on)}</td>
                <td className="px-4 py-3 text-right text-slate-700">{n.mine ? (n.read_count ?? '-') : ''}</td>
                <td className="px-4 py-3">
                  {n.mine && (
                    <div className="flex justify-end gap-2">
                      <button className={OUTLINE} aria-label="Edit" onClick={() => { setForm(n); setOk('') }}><Pencil size={14} /></button>
                      <button className={`${OUTLINE} text-red-600`} aria-label="Delete" onClick={() => remove(n)}><Trash2 size={14} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <Pager page={page} total={data.total} onPage={setPage} />}
    </div>
  )
}

function AnnounceTab({ token }) {
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [hist, setHist] = useState(null)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    listFacultyClasses(token).then((d) => { setClasses(d.items); if (d.items.length) setClassId(d.items[0].id) }).catch((e) => setError(e.message))
  }, [token])

  const loadHist = useCallback(() => listFacultyAnnouncements(token, page).then(setHist).catch((e) => setError(e.message)), [token, page])
  useEffect(() => { loadHist() }, [loadHist])

  async function send(e) {
    e.preventDefault()
    setError(''); setOk('')
    if (title.trim().length < 3) return setError('Title kam se kam 3 akshar ka ho.')
    if (body.trim().length < 3) return setError('Message likho.')
    const c = classes.find((x) => x.id === classId)
    if (!window.confirm(`${c.course} Sem ${c.semester} ke ${c.students} students ko ye announcement bhejni hai?`)) return
    setBusy(true)
    try {
      const r = await sendFacultyAnnouncement(token, { class_id: classId, title, body })
      setOk(`${r.sent} students ko bhej di gayi.`)
      setTitle(''); setBody(''); setPage(1)
      await loadHist()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <form onSubmit={send} className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 self-start">
        <h3 className="font-display text-base text-slate-900 flex items-center gap-2"><Megaphone size={16} className="text-green-600" /> Class announcement</h3>
        <p className="font-body text-xs text-slate-500">Sirf us class ke students ko notification (bell) jayegi. Ye Notices page par nahi dikhti.</p>
        {error && <p className="font-body text-sm text-red-600">{error}</p>}
        {ok && <p className="font-body text-sm text-green-700">{ok}</p>}
        <div>
          <label className="font-body text-sm text-slate-600 mb-1 block">Class</label>
          <select className={INPUT} value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.course} · Sem {c.semester} · {c.subject}{c.is_sample ? ' (SAMPLE)' : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="font-body text-sm text-slate-600 mb-1 block">Title</label>
          <input className={INPUT} maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="font-body text-sm text-slate-600 mb-1 block">Message <span className="text-slate-400">({body.length}/400)</span></label>
          <textarea className={INPUT} rows={4} maxLength={400} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <button type="submit" className={GREEN} disabled={busy || !classId}>{busy ? 'Bhej rahe hain...' : 'Bhejo'}</button>
      </form>

      <div className="lg:col-span-3">
        <h3 className="font-display text-base text-slate-900 mb-3">Bheji hui announcements</h3>
        <div className="space-y-3">
          {hist && hist.items.length === 0 && <p className="font-body text-sm text-slate-500">Abhi koi announcement nahi bheji.</p>}
          {hist && hist.items.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-body text-sm text-slate-900">{a.title}</p>
                <span className="font-body text-xs text-slate-400 whitespace-nowrap">{fmtDateTime(a.created_at)}</span>
              </div>
              <p className="font-body text-sm text-slate-600 mt-1 whitespace-pre-line">{a.body}</p>
              <p className="font-body text-xs text-slate-400 mt-2">{a.class_label} · {a.recipients} students</p>
            </div>
          ))}
        </div>
        {hist && hist.total > 0 && <Pager page={page} total={hist.total} onPage={setPage} />}
      </div>
    </div>
  )
}

export default function FacultyNoticesPage({ session }) {
  const token = session.access_token
  const [tab, setTab] = useState('notices')
  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit mb-5">
        {[['notices', 'Notices'], ['announce', 'Class Announcements']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-4 py-1.5 font-body text-sm ${tab === k ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600'}`}>{label}</button>
        ))}
      </div>
      {tab === 'notices' ? <NoticesTab token={token} /> : <AnnounceTab token={token} />}
    </div>
  )
}