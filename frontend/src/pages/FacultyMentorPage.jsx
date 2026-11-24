import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarClock, FileText, MessageCircle, Search, Send, Trash2, UserRound } from 'lucide-react'
import {
  facultyMentees, facultyMentorMessages, sendFacultyMentorMessage, downloadFacultyMentorFile, facultyMentorNotes,
  addFacultyMentorNote, deleteFacultyMentorNote, listFacultyMeetings, respondFacultyMeeting,
} from '../api.js'

const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const GREEN = 'rounded-lg bg-green-600 px-4 py-2 font-body text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60'

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '')
const fmtDay = (iso) => (iso ? new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const pretty = (k) => k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
const looksDate = (v) => /^\d{4}-\d{2}-\d{2}/.test(String(v))

const MEET_STATUS = {
  pending: 'bg-amber-50 text-amber-700', approved: 'bg-blue-50 text-blue-700', rejected: 'bg-red-50 text-red-600',
  completed: 'bg-green-50 text-green-700', cancelled: 'bg-slate-100 text-slate-500',
}

function Chat({ token, student }) {
  const [msgs, setMsgs] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef(null)

  const load = useCallback(() => {
    return facultyMentorMessages(token, student.id).then((d) => { setMsgs(d.items); setError('') }).catch((e) => setError(e.message))
  }, [token, student.id])

  useEffect(() => {
    setMsgs(null)
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: 'end' }) }, [msgs])

  async function send(e) {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true); setError('')
    try { await sendFacultyMentorMessage(token, student.id, text); setText(''); await load() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function file(a) {
    try { await downloadFacultyMentorFile(token, a.id, a.name) } catch (e) { setError(e.message) }
  }

  return (
    <div className="flex flex-col h-[28rem]">
      <div className="flex-1 overflow-y-auto rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
        {msgs === null && <p className="font-body text-sm text-slate-500">Loading...</p>}
        {msgs && msgs.length === 0 && <p className="font-body text-sm text-slate-500 text-center mt-8">Abhi koi message nahi. Pehla message bhejo.</p>}
        {msgs && msgs.map((m) => {
          const mine = m.sender === 'mentor'
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-xl px-3 py-2 font-body text-sm ${mine ? 'bg-green-600 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
                <p className="whitespace-pre-line break-words">{m.body}</p>
                {m.attachments.map((a) => (
                  <button key={a.id} onClick={() => file(a)} className={`mt-1 flex items-center gap-1 text-xs underline ${mine ? 'text-green-100' : 'text-green-700'}`}><FileText size={12} /> {a.name}</button>
                ))}
                <p className={`mt-1 text-[11px] ${mine ? 'text-green-100' : 'text-slate-400'}`}>{fmt(m.created_at)}</p>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      {error && <p className="font-body text-sm text-red-600 mt-2">{error}</p>}
      <form onSubmit={send} className="flex gap-2 mt-3">
        <textarea className={INPUT} rows={2} maxLength={1000} placeholder="Message likho..." value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e) }} />
        <button type="submit" className={`${GREEN} flex items-center gap-1.5 self-end`} disabled={busy || !text.trim()}><Send size={15} /> Bhejo</button>
      </form>
      <p className="font-body text-xs text-slate-400 mt-1">Ctrl + Enter se bhi bhej sakte ho. Naye messages 15 second me apne aap aate hain.</p>
    </div>
  )
}

function Notes({ token, student }) {
  const [items, setItems] = useState(null)
  const [f, setF] = useState({ note_type: 'progress', title: '', body: '', action_points: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const load = useCallback(() => facultyMentorNotes(token, student.id).then((d) => setItems(d.items)).catch((e) => setError(e.message)), [token, student.id])
  useEffect(() => { setItems(null); setOk(''); load() }, [load])

  async function add(e) {
    e.preventDefault()
    setError(''); setOk('')
    if (f.title.trim().length < 3) return setError('Title kam se kam 3 akshar ka ho.')
    if (f.body.trim().length < 3) return setError('Note ka matter likho.')
    setBusy(true)
    try {
      await addFacultyMentorNote(token, student.id, f)
      setF({ note_type: f.note_type, title: '', body: '', action_points: '' })
      setOk('Note joda gaya, student ko notification gayi.')
      await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function remove(n) {
    if (!window.confirm(`"${n.title}" delete karna hai?`)) return
    setError(''); setOk('')
    try { await deleteFacultyMentorNote(token, n.id); await load() } catch (err) { setError(err.message) }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="rounded-lg border border-slate-200 p-4 space-y-3">
        {error && <p className="font-body text-sm text-red-600">{error}</p>}
        {ok && <p className="font-body text-sm text-green-700">{ok}</p>}
        <div className="grid sm:grid-cols-3 gap-3">
          <select className={INPUT} value={f.note_type} onChange={(e) => setF({ ...f, note_type: e.target.value })}>
            <option value="progress">Progress note</option><option value="guidance">Academic guidance</option>
          </select>
          <input className={`${INPUT} sm:col-span-2`} maxLength={150} placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </div>
        <textarea className={INPUT} rows={3} maxLength={2000} placeholder="Note / guidance" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        <textarea className={INPUT} rows={3} maxLength={1000} placeholder="Action points (ek line me ek)" value={f.action_points} onChange={(e) => setF({ ...f, action_points: e.target.value })} />
        <button type="submit" className={GREEN} disabled={busy}>{busy ? 'Saving...' : 'Note jodo'}</button>
      </form>

      {items === null && <p className="font-body text-sm text-slate-500">Loading...</p>}
      {items && items.length === 0 && <p className="font-body text-sm text-slate-500">Abhi koi note nahi hai.</p>}
      {items && items.map((n) => (
        <div key={n.id} className="rounded-lg border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className={`mr-2 rounded px-2 py-0.5 text-xs ${n.note_type === 'guidance' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>{n.note_type === 'guidance' ? 'Guidance' : 'Progress'}</span>
              <span className="font-body text-sm text-slate-900">{n.title}</span>
            </div>
            <button className="text-slate-400 hover:text-red-600" aria-label="Delete" onClick={() => remove(n)}><Trash2 size={15} /></button>
          </div>
          <p className="font-body text-sm text-slate-600 mt-2 whitespace-pre-line">{n.body}</p>
          {n.action_points.length > 0 && (
            <ul className="mt-2 list-disc pl-5 font-body text-sm text-slate-700">{n.action_points.map((a, i) => <li key={i}>{a}</li>)}</ul>
          )}
          <p className="font-body text-xs text-slate-400 mt-2">{n.created_by} · {fmtDay(n.created_on)}</p>
        </div>
      ))}
    </div>
  )
}

function Mentees({ token }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState(null)
  const [sel, setSel] = useState(null)
  const [tab, setTab] = useState('chat')
  const [error, setError] = useState('')

  const load = useCallback(() => facultyMentees(token, q).then((d) => { setList(d.items); setError('') }).catch((e) => setError(e.message)), [token, q])
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [load])

  if (error) return <p className="font-body text-sm text-red-600">{error}</p>

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 self-start">
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-3 text-slate-400" />
          <input className={`${INPUT} pl-9`} placeholder="Mentee search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {list === null && <p className="font-body text-sm text-slate-500 p-2">Loading...</p>}
        {list && list.length === 0 && (
          <p className="font-body text-sm text-slate-500 p-2">Abhi koi mentee nahi hai. Admin → Mentor me students aapko assign karwao.</p>
        )}
        <ul className="space-y-1 max-h-[32rem] overflow-y-auto">
          {list && list.map((s) => (
            <li key={s.id}>
              <button onClick={() => { setSel(s); setTab('chat') }} className={`w-full text-left rounded-lg px-3 py-2 flex items-center justify-between gap-2 ${sel && sel.id === s.id ? 'bg-green-50' : 'hover:bg-slate-50'}`}>
                <span className="min-w-0">
                  <span className="block font-body text-sm text-slate-900 truncate">{s.name}</span>
                  <span className="block font-body text-xs text-slate-400 truncate">{s.college_id} · Sem {s.semester}</span>
                </span>
                <span className="flex gap-1 shrink-0">
                  {s.pending_meetings > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{s.pending_meetings} mtg</span>}
                  {s.unread > 0 && <span className="rounded-full bg-green-600 px-2 py-0.5 text-xs text-white">{s.unread}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        {!sel ? (
          <div className="text-center py-16 text-slate-500 font-body text-sm"><UserRound className="mx-auto mb-2 text-slate-300" size={36} />Left se koi mentee chuno.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <p className="font-display text-lg text-slate-900">{sel.name}</p>
                <p className="font-body text-xs text-slate-500">{sel.college_id} · {sel.course} · Sem {sel.semester}</p>
              </div>
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {[['chat', 'Chat'], ['notes', 'Notes & Guidance']].map(([k, label]) => (
                  <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 font-body text-sm ${tab === k ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600'}`}>{label}</button>
                ))}
              </div>
            </div>
            {tab === 'chat' ? <Chat key={sel.id} token={token} student={sel} /> : <Notes key={sel.id} token={token} student={sel} />}
          </>
        )}
      </div>
    </div>
  )
}

function MeetingCard({ token, m, onDone }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function act(action) {
    setError('')
    if (action === 'reject' && !text.trim()) return setError('Reject karne ki wajah likho.')
    setBusy(true)
    try { await respondFacultyMeeting(token, m.id, { action, response: text }); onDone() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-body text-sm text-slate-900">{m.student_name} <span className="text-xs text-slate-400">{m.college_id}</span></p>
        </div>
        <span className={`rounded px-2 py-0.5 text-xs ${MEET_STATUS[m.status] || 'bg-slate-100 text-slate-600'}`}>{m.status}</span>
      </div>
      <dl className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 font-body text-sm">
        {Object.entries(m.fields).map(([k, v]) => (
          <div key={k} className="flex gap-2"><dt className="text-slate-400">{pretty(k)}:</dt><dd className="text-slate-700 break-words">{looksDate(v) ? fmtDay(v) : String(v)}</dd></div>
        ))}
      </dl>
      {m.mentor_response && <p className="font-body text-sm text-slate-600 mt-2">Aapka jawab: {m.mentor_response}</p>}
      {(m.status === 'pending' || m.status === 'approved') && (
        <div className="mt-3 space-y-2">
          {error && <p className="font-body text-sm text-red-600">{error}</p>}
          <input className={INPUT} maxLength={500} placeholder={m.status === 'pending' ? 'Jawab / wajah (reject ke liye zaroori)' : 'Meeting ka summary (optional)'} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-2">
            {m.status === 'pending' && (
              <>
                <button className={GREEN} disabled={busy} onClick={() => act('approve')}>Approve</button>
                <button className={`${OUTLINE} text-red-600`} disabled={busy} onClick={() => act('reject')}>Reject</button>
              </>
            )}
            {m.status === 'approved' && <button className={GREEN} disabled={busy} onClick={() => act('complete')}>Completed mark karo</button>}
          </div>
        </div>
      )}
    </div>
  )
}

function Meetings({ token }) {
  const [status, setStatus] = useState('pending')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    return listFacultyMeetings(token, { status, page }).then((d) => { setData(d); setError('') }).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [token, status, page])
  useEffect(() => { load() }, [load])

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1

  return (
    <div>
      <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 w-fit mb-4">
        {['pending', 'approved', 'completed', 'rejected', 'cancelled', 'all'].map((s) => (
          <button key={s} onClick={() => { setStatus(s); setPage(1) }} className={`rounded-md px-3 py-1.5 font-body text-sm capitalize ${status === s ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600'}`}>{s}</button>
        ))}
      </div>
      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {loading && <p className="font-body text-sm text-slate-500">Loading...</p>}
      {data && !loading && data.items.length === 0 && <div className="bg-white rounded-xl border border-slate-200 p-8 text-center font-body text-sm text-slate-500">Is status me koi meeting nahi hai.</div>}
      <div className="space-y-3">
        {data && !loading && data.items.map((m) => <MeetingCard key={m.id} token={token} m={m} onDone={load} />)}
      </div>
      {data && data.total > 0 && (
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

export default function FacultyMentorPage({ session }) {
  const token = session.access_token
  const [tab, setTab] = useState('mentees')
  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit mb-5">
        {[['mentees', 'Mentees & Chat', MessageCircle], ['meetings', 'Meeting Requests', CalendarClock]].map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 font-body text-sm ${tab === k ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600'}`}><Icon size={15} /> {label}</button>
        ))}
      </div>
      {tab === 'mentees' ? <Mentees token={token} /> : <Meetings token={token} />}
    </div>
  )
}