import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Clock, Download, Loader, Paperclip, Search, Star } from 'lucide-react'
import {
  facultyComplaintsSummary, listFacultyComplaints, getFacultyComplaint, updateFacultyComplaint, downloadFacultyComplaintFile,
} from '../api.js'

const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const GREEN = 'rounded-lg bg-green-600 px-4 py-2 font-body text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60'
const STATUS = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  in_progress: { label: 'In progress', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  resolved: { label: 'Resolved', cls: 'bg-green-50 text-green-700 border-green-200' },
}
const TABS = [['', 'Saari'], ['pending', 'Pending'], ['in_progress', 'In progress'], ['resolved', 'Resolution history']]

function fmtDT(s) {
  if (!s) return '-'
  const [d, t] = s.split(' ')
  const [y, m, day] = d.split('-').map(Number)
  const [h, min] = t.split(':').map(Number)
  const date = new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${date}, ${h % 12 === 0 ? 12 : h % 12}:${String(min).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function Badge({ status }) {
  const s = STATUS[status] || STATUS.pending
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 font-body text-xs ${s.cls}`}>{s.label}</span>
}

function Detail({ token, id, onBack }) {
  const [d, setD] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const load = useCallback(() => getFacultyComplaint(token, id).then((x) => { setD(x); setError('') }).catch((e) => setError(e.message)), [token, id])
  useEffect(() => { load() }, [load])

  async function act(status) {
    setError(''); setOk('')
    if (status === 'resolved' && !note.trim()) return setError('Resolve karne ke liye resolution note likhna zaroori hai.')
    if (!status && !note.trim()) return setError('Note likho.')
    if (status === 'resolved' && !window.confirm('Complaint resolve karni hai? Iske baad badal nahi sakte.')) return
    setBusy(true)
    try {
      await updateFacultyComplaint(token, id, { status, note })
      setNote('')
      setOk('Update ho gaya, student ko notification gayi.')
      await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function file(a) {
    setError('')
    try { await downloadFacultyComplaintFile(token, id, a) } catch (e) { setError(e.message) }
  }

  if (!d) return <p className="font-body text-sm text-slate-500">{error || 'Loading...'}</p>

  return (
    <div className="max-w-4xl mx-auto">
      <button className={`${OUTLINE} flex items-center gap-1.5 mb-4`} onClick={onBack}><ArrowLeft size={15} /> Complaints</button>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-body text-xs text-slate-400">{d.ticket_no} · {d.category}</p>
            <h2 className="font-display text-xl text-slate-900">{d.subject}</h2>
            <p className="font-body text-sm text-slate-500 mt-1">{d.student.name} ({d.student.college_id}) · {d.student.course} · Sem {d.student.semester}</p>
            <p className="font-body text-xs text-slate-400 mt-1">Aaya: {fmtDT(d.created_at)}{d.status !== 'resolved' ? ` · ${d.age_days} din purani` : ''} · Assigned: {d.assigned_to}</p>
          </div>
          <Badge status={d.status} />
        </div>
        <p className="font-body text-sm text-slate-700 mt-4 whitespace-pre-line">{d.description}</p>
        {d.attachments.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {d.attachments.map((a) => (
              <button key={a.id} className={`${OUTLINE} flex items-center gap-1.5`} onClick={() => file(a)}><Paperclip size={13} /> {a.file_name} <Download size={13} /></button>
            ))}
          </div>
        )}
      </div>

      {d.status === 'resolved' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-4">
          <p className="font-body text-sm text-green-800"><b>Resolution</b> ({fmtDT(d.resolved_at)}): {d.resolution_note}</p>
          {d.rating ? (
            <p className="font-body text-sm text-slate-700 mt-2 flex items-center gap-1"><Star size={14} className="text-amber-500" /> Student ki rating: {d.rating}/5{d.feedback ? ` · "${d.feedback}"` : ''}</p>
          ) : <p className="font-body text-xs text-slate-500 mt-2">Student ne abhi rating nahi di.</p>}
        </div>
      )}

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700 mb-3">{ok}</p>}

      {d.status !== 'resolved' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
          <h3 className="font-display text-base text-slate-900 mb-2">Update karo</h3>
          <textarea className={INPUT} rows={3} maxLength={1000} placeholder="Note / resolution (resolve karne ke liye zaroori)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2 mt-3">
            {d.status === 'pending' && <button className={GREEN} disabled={busy} onClick={() => act('in_progress')}>Kaam shuru karo (In progress)</button>}
            <button className={OUTLINE} disabled={busy} onClick={() => act(null)}>Sirf note jodo</button>
            <button className="rounded-lg bg-slate-800 px-4 py-2 font-body text-sm text-white hover:bg-slate-900 disabled:opacity-60" disabled={busy} onClick={() => act('resolved')}>Resolve karo</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-display text-base text-slate-900 mb-3">Timeline</h3>
        <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
          {d.events.map((e, i) => (
            <li key={i}>
              <p className="font-body text-sm text-slate-800">{e.message}</p>
              <p className="font-body text-xs text-slate-400">{e.by} · {fmtDT(e.at)}{e.status ? ` · ${STATUS[e.status] ? STATUS[e.status].label : e.status}` : ''}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

export default function FacultyComplaintsPage({ session }) {
  const token = session.access_token
  const [sum, setSum] = useState(null)
  const [tab, setTab] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    return Promise.all([facultyComplaintsSummary(token), listFacultyComplaints(token, { q, status: tab, page })])
      .then(([s, d]) => { setSum(s); setData(d); setError('') })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, q, tab, page])

  useEffect(() => { load() }, [load])

  if (openId) return <Detail token={token} id={openId} onBack={() => { setOpenId(null); load() }} />

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1
  const cards = sum ? [
    { label: 'Pending', value: sum.pending, icon: Clock, tone: 'bg-amber-50 text-amber-600' },
    { label: 'In progress', value: sum.in_progress, icon: Loader, tone: 'bg-blue-50 text-blue-600' },
    { label: 'Resolved', value: sum.resolved, icon: CheckCircle2, tone: 'bg-green-50 text-green-600' },
    { label: 'Avg rating', value: sum.avg_rating === null ? '-' : `${sum.avg_rating}/5`, icon: Star, tone: 'bg-slate-100 text-slate-500' },
  ] : []

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${c.tone}`}><Icon size={18} /></span>
              <p className="font-display text-2xl text-slate-900">{c.value}</p>
              <p className="font-body text-xs text-slate-500">{c.label}</p>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => { setTab(k); setPage(1) }} className={`rounded-md px-3 py-1.5 font-body text-sm ${tab === k ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600'}`}>{label}</button>
          ))}
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-3 text-slate-400" />
          <input className={`${INPUT} w-64 pl-9`} placeholder="Ticket, subject ya student" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        </div>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Ticket</th><th className="px-4 py-3 font-medium">Subject</th>
              <th className="px-4 py-3 font-medium">Student</th><th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Aaya</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>}
            {!loading && data && data.items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Aapko koi complaint assign nahi hui hai. Admin se Complaints page me complaint aapke naam ya Faculty ID par forward karwao.</td></tr>
            )}
            {!loading && data && data.items.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{c.ticket_no}</td>
                <td className="px-4 py-3 text-slate-900">{c.subject}<span className="block text-xs text-slate-400">{c.category}</span></td>
                <td className="px-4 py-3 text-slate-700">{c.student}<span className="block text-xs text-slate-400">{c.college_id}</span></td>
                <td className="px-4 py-3"><Badge status={c.status} /></td>
                <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{fmtDT(c.created_at)}{c.status !== 'resolved' && c.age_days >= 3 && <span className="block text-xs text-red-600">{c.age_days} din</span>}</td>
                <td className="px-4 py-3 text-right"><button className={OUTLINE} onClick={() => setOpenId(c.id)}>Kholo</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && (
        <div className="flex items-center justify-between mt-3 font-body text-sm text-slate-500">
          <span>Total: {data.total}</span>
          <div className="flex items-center gap-2">
            <button className={OUTLINE} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page} / {pages}</span>
            <button className={OUTLINE} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  )
}