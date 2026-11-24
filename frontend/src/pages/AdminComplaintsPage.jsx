import { useCallback, useEffect, useState } from 'react'
import { MessageSquareWarning, Clock, Loader, CheckCircle2, Star, Search, X, Database, Paperclip, Download, Send } from 'lucide-react'
import {
  complaintsSummary, listAdminComplaints, getAdminComplaint, updateAdminComplaint, downloadAdminComplaintFile, seedDemoAdminComplaints,
} from '../api.js'

const ACCENT = '#2563EB'
const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const PRIMARY = 'rounded-lg px-4 py-2 font-body text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const STATUS = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: '#D97706' },
  in_progress: { label: 'In progress', cls: 'bg-blue-50 text-blue-700 border-blue-200', dot: '#2563EB' },
  resolved: { label: 'Resolved', cls: 'bg-green-50 text-green-700 border-green-200', dot: '#16A34A' },
}
const OFFICES = ['Academic Office', 'Accounts Office', 'Hostel Office', 'Library', 'IT Support', 'Maintenance', 'Transport', 'Placement Cell']
const PAGE_SIZE = 10

const fmtDT = (s) => {
  if (!s) return '-'
  const [d, t] = s.split(' ')
  const [y, m, day] = d.split('-').map(Number)
  const [h, min] = t.split(':').map(Number)
  const date = new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${date}, ${h % 12 === 0 ? 12 : h % 12}:${String(min).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

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
const Stars = ({ n }) => <span className="inline-flex gap-0.5">{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={14} className={i <= n ? 'text-amber-500 fill-amber-400' : 'text-slate-300'} />)}</span>

export default function AdminComplaintsPage({ session }) {
  const token = session.access_token
  const [summary, setSummary] = useState(null)
  const [data, setData] = useState({ items: [], total: 0, categories: [] })
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState({ assigned_to: '', status: '', note: '' })
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const loadSummary = useCallback(() => complaintsSummary(token).then(setSummary).catch((e) => setError(e.message)), [token])
  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { setPage(1) }, [q, status, category])

  const load = useCallback(() => {
    setLoading(true)
    return listAdminComplaints(token, { q, status, category, page, pageSize: PAGE_SIZE })
      .then((d) => { setData(d); setError('') })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, q, status, category, page])
  useEffect(() => { load() }, [load])

  async function open(id) {
    setError(''); setFormError('')
    try {
      const d = await getAdminComplaint(token, id)
      setDetail(d)
      setForm({ assigned_to: d.assigned_to || '', status: '', note: '' })
    } catch (e) { setError(e.message) }
  }

  async function submit(e) {
    e.preventDefault()
    setFormError(''); setSaving(true)
    try {
      await updateAdminComplaint(token, detail.id, { status: form.status || null, assigned_to: form.assigned_to || null, note: form.note || null })
      setInfo('Complaint update ho gayi. Student ko timeline me dikhega.')
      await open(detail.id)
      await Promise.all([load(), loadSummary()])
    } catch (err) { setFormError(err.message) } finally { setSaving(false) }
  }

  async function seed() {
    setBusy(true); setError(''); setInfo('')
    try { const r = await seedDemoAdminComplaints(token); setInfo(r.message); await Promise.all([load(), loadSummary()]) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function download(a) {
    setError('')
    try { await downloadAdminComplaintFile(token, detail.id, a) } catch (e) { setError(e.message) }
  }

  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  return (
    <div className="max-w-6xl mx-auto">
      {summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <Stat icon={MessageSquareWarning} label="Total complaints" value={summary.total} color="#2563EB" />
            <Stat icon={Clock} label="Pending" value={summary.pending} color="#D97706" />
            <Stat icon={Loader} label="In progress" value={summary.in_progress} color="#7C3AED" />
            <Stat icon={CheckCircle2} label={summary.avg_resolution_hours !== null ? `Resolved · avg ${summary.avg_resolution_hours}h` : 'Resolved'} value={summary.resolved} color="#16A34A" />
            <Stat icon={Star} label="Average rating" value={summary.avg_rating === null ? '-' : `${summary.avg_rating} / 5`} color="#DC2626" />
          </div>
          {summary.categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {summary.categories.map((c) => (
                <button key={c.category} onClick={() => setCategory(category === c.category ? '' : c.category)}
                  className={`rounded-full border px-3 py-1 font-body text-xs ${category === c.category ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>{c.category}: {c.count}</button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input className={`${INPUT} pl-9 w-72`} placeholder="Ticket, subject ya student" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className={`${INPUT} w-40`} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All status</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className={`${INPUT} w-44`} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {data.categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy} onClick={seed}><Database size={15} /> Sample data</button>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {info && <p className="font-body text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{info}</p>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
            <th className="px-4 py-3 font-medium">Ticket</th><th className="px-4 py-3 font-medium">Complaint</th><th className="px-4 py-3 font-medium">Student</th><th className="px-4 py-3 font-medium">Forwarded to</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Pending</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>}
            {!loading && data.items.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{q || status || category ? 'Koi complaint match nahi hui.' : 'Abhi koi complaint nahi hai.'}</td></tr>}
            {!loading && data.items.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 cursor-pointer" onClick={() => open(c.id)}>
                <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{c.ticket_no}</td>
                <td className="px-4 py-3"><p className="text-slate-900 font-medium">{c.subject}</p><p className="text-xs text-slate-500">{c.category}{c.attachments ? ` · ${c.attachments} file` : ''}</p></td>
                <td className="px-4 py-3"><p className="text-slate-800">{c.student}</p><p className="text-xs text-slate-500">{c.college_id}</p></td>
                <td className="px-4 py-3 text-slate-700">{c.assigned_to || '-'}</td>
                <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span></td>
                <td className="px-4 py-3">{c.status === 'resolved' ? (c.rating ? <Stars n={c.rating} /> : <span className="text-slate-400">-</span>) : <span className={c.age_days >= 7 ? 'text-red-600 font-medium' : 'text-slate-700'}>{c.age_days} din</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-3 font-body text-sm text-slate-500">
        <span>Total: {data.total} · Pending pehle</span>
        <div className="flex items-center gap-2">
          <button className={OUTLINE} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} / {pages}</span>
          <button className={OUTLINE} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-4">
            <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200">
              <div>
                <p className="font-body text-xs text-slate-500">{detail.ticket_no} · {detail.category}</p>
                <h3 className="font-display text-lg text-slate-900">{detail.subject}</h3>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS[detail.status].cls}`}>{STATUS[detail.status].label}</span>
                <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={20} /></button>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 font-body text-sm">
                <p className="text-slate-700"><b>{detail.student.name}</b> ({detail.student.college_id}) · {detail.student.course} · Sem {detail.student.semester}</p>
                <p className="text-xs text-slate-500 mt-0.5">Submitted {fmtDT(detail.created_at)}{detail.status !== 'resolved' ? ` · ${detail.age_days} din se pending` : ''}</p>
                <p className="mt-3 text-slate-800 whitespace-pre-line">{detail.description}</p>
                {detail.attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detail.attachments.map((a) => (
                      <button key={a.id} className={`${OUTLINE} flex items-center gap-1.5`} onClick={() => download(a)}><Paperclip size={13} /> {a.file_name} <span className="text-xs text-slate-400">({size(a.size_bytes)})</span><Download size={13} /></button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="font-display text-base text-slate-900 mb-3">Timeline</p>
                <div className="space-y-3 border-l-2 border-slate-200 pl-4 ml-1">
                  {detail.events.map((ev, i) => (
                    <div key={i} className="relative">
                      <span className="absolute -left-[22px] top-1 w-3 h-3 rounded-full" style={{ background: ev.status ? STATUS[ev.status]?.dot || '#94A3B8' : '#94A3B8' }} />
                      <p className="font-body text-sm text-slate-800">{ev.message}</p>
                      <p className="font-body text-xs text-slate-500">{ev.by} · {fmtDT(ev.at)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {detail.status === 'resolved' && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 font-body text-sm">
                  <p className="text-green-800"><b>Resolved</b> {fmtDT(detail.resolved_at)}</p>
                  {detail.rating ? <p className="mt-2 flex items-center gap-2 text-slate-700">Student rating: <Stars n={detail.rating} />{detail.feedback ? ` · "${detail.feedback}"` : ''}</p> : <p className="mt-2 text-slate-500">Student ne abhi rating nahi di.</p>}
                </div>
              )}

              {detail.status !== 'resolved' && (
                <form onSubmit={submit} className="rounded-xl border border-slate-200 p-4 space-y-4">
                  <p className="font-display text-base text-slate-900">Update karo</p>
                  {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Forward to (department / office)</Label>
                      <input className={INPUT} list="complaint-offices" maxLength={80} value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} />
                      <datalist id="complaint-offices">{OFFICES.map((o) => <option key={o} value={o} />)}</datalist>
                    </div>
                    <div>
                      <Label>Status</Label>
                      <select className={INPUT} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                        <option value="">Badalna nahi hai</option>
                        {detail.status === 'pending' && <option value="in_progress">In progress</option>}
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label>{form.status === 'resolved' ? 'Resolution note * (student ko dikhega)' : 'Note (student ko timeline me dikhega)'}</Label>
                    <textarea className={INPUT} rows={3} maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                  </div>
                  <button type="submit" disabled={saving} className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: ACCENT }}><Send size={14} /> {saving ? 'Saving...' : 'Update'}</button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}