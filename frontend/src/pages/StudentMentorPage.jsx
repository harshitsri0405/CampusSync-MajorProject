import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Clock, Download, Mail, MapPin, Paperclip, Phone, Send, X } from 'lucide-react'
import {
  getMentorOverview,
  getMentorMessages,
  sendMentorMessage,
  sendMentorMessageWithFile,
  downloadMentorFile,
  markMentorMessagesRead,
  requestMentorMeeting,
  cancelMentorMeeting,
  seedDemoMentor,
} from '../api.js'

const TABS = [
  { key: 'chat', label: 'Chat with Mentor' },
  { key: 'meeting', label: 'Request Meeting' },
  { key: 'progress', label: 'Progress Discussion' },
  { key: 'guidance', label: 'Academic Guidance' },
]

const TOPICS = [
  'Academic guidance',
  'Progress discussion',
  'Attendance',
  'Exams and marks',
  'Career guidance',
  'Personal matter',
  'Other',
]

const MODES = ['In person', 'Online']

const MEETING_STATUS = {
  pending: { label: 'Waiting for reply', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Not possible', cls: 'bg-red-100 text-red-700' },
  completed: { label: 'Completed', cls: 'bg-slate-100 text-slate-600' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500' },
}

const INPUT =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500'

const ATTACH_EXT = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.png', '.jpg', '.jpeg', '.zip']
const ATTACH_ACCEPT = ATTACH_EXT.join(',')
const MAX_ATTACH_BYTES = 10 * 1024 * 1024

function fileSize(n) {
  return n < 1024 * 1024
    ? `${Math.max(1, Math.round(n / 1024))} KB`
    : `${(n / 1048576).toFixed(1)} MB`
}

function extOf(name) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toInputDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function fmtDate(s) {
  return parseDate(s).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function fmtTime(t) {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

function msgTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function sameDay(aIso, bIso) {
  return new Date(aIso).toDateString() === new Date(bIso).toDateString()
}

function dayLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'

  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function pctTone(p) {
  if (p >= 75) return 'text-green-700'
  if (p >= 65) return 'text-amber-700'
  return 'text-red-700'
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-6 ${className}`}>
      {children}
    </div>
  )
}

function Stat({ label, value, tone = 'text-slate-900', hint }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="font-body text-xs text-slate-400">{label}</p>
      <p className={`font-display text-3xl mt-1 ${tone}`}>{value}</p>
      {hint && <p className="font-body text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

function NoteList({ notes, emptyText }) {
  if (notes.length === 0) {
    return (
      <Card className="text-center">
        <p className="font-body text-sm text-slate-500">{emptyText}</p>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {notes.map((n) => (
        <div key={n.id} className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-display text-base text-slate-900">{n.title}</h3>
            <span className="font-body text-xs text-slate-500">
              {fmtDate(n.created_on)}
              {n.created_by ? ` · ${n.created_by}` : ''}
            </span>
          </div>

          <p className="font-body text-sm text-slate-700 mt-2 whitespace-pre-line">
            {n.body}
          </p>

          {n.action_points.length > 0 && (
            <div className="mt-3 rounded-lg border border-purple-100 bg-purple-50 p-3">
              <p className="font-body text-xs text-purple-700 font-medium">
                What to do next
              </p>
              <ul className="mt-1 list-disc pl-5 font-body text-sm text-slate-700 space-y-0.5">
                {n.action_points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function StudentMentorPage({ session, onBack }) {
  const token = session.access_token

  const [data, setData] = useState(null)
  const [messages, setMessages] = useState([])
  const [tab, setTab] = useState('chat')
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState('')
  const [attachFile, setAttachFile] = useState(null)

  const attachRef = useRef(null)

  // Chat
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef(null)

  // Meeting form
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const todayStr = toInputDate(new Date())

  const [form, setForm] = useState({
    topic: 'Academic guidance',
    agenda: '',
    date: toInputDate(tomorrow),
    time: '15:00',
    mode: 'In person',
  })

  const [meetingBusy, setMeetingBusy] = useState(false)
  const [meetingError, setMeetingError] = useState('')
  const [meetingOk, setMeetingOk] = useState('')

  async function load() {
    const d = await getMentorOverview(token)
    setData(d)
    setMessages(d.messages)
  }

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const hasMentor = !!(data && data.has_mentor)

  // Keep the chat fresh: ask for new messages every 15 seconds while the chat is open
  useEffect(() => {
    if (!hasMentor || tab !== 'chat') return undefined

    const id = setInterval(() => {
      getMentorMessages(token)
        .then(setMessages)
        .catch(() => {})
    }, 15000)

    return () => clearInterval(id)
  }, [hasMentor, tab, token])

  // Opening the chat or receiving a new reply marks mentor messages as read
  useEffect(() => {
    if (tab !== 'chat') return
    if (!messages.some((m) => m.sender === 'mentor' && !m.is_read)) return

    markMentorMessagesRead(token)
      .then(() => setMessages((ms) => ms.map((m) => ({ ...m, is_read: true }))))
      .catch(() => {})
  }, [tab, messages, token])

  // Always show the newest message
  useEffect(() => {
    if (tab === 'chat' && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages.length, tab, hasMentor])

  async function handleSeed() {
    setSeeding(true)
    setError('')

    try {
      await seedDemoMentor(token)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSeeding(false)
    }
  }

  async function handleSend(e) {
    if (e) e.preventDefault()

    const body = draft.trim()
    if ((!body && !attachFile) || sending) return

    setSending(true)
    setError('')

    try {
      const m = attachFile
        ? await sendMentorMessageWithFile(token, body, attachFile)
        : await sendMentorMessage(token, body)

      setMessages((ms) => [...ms, m])
      setDraft('')
      setAttachFile(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  function pickAttachment(e) {
    setError('')

    const f = e.target.files && e.target.files[0]
      ? e.target.files[0]
      : null

    e.target.value = ''

    if (!f) return

    if (!ATTACH_EXT.includes(extOf(f.name))) {
      setError(
        'This file type is not allowed. Use PDF, Word, PowerPoint, Excel, TXT, PNG, JPG or ZIP.'
      )
      return
    }

    if (f.size > MAX_ATTACH_BYTES) {
      setError('The file is larger than 10 MB.')
      return
    }

    setAttachFile(f)
  }

  async function handleDownload(m) {
    setError('')

    try {
      await downloadMentorFile(token, m)
    } catch (err) {
      setError(err.message)
    }
  }

  function onDraftKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleMeeting(e) {
    e.preventDefault()
    setMeetingError('')
    setMeetingOk('')

    if (!form.agenda.trim()) {
      setMeetingError('Write what you want to discuss.')
      return
    }

    if (!form.date || !form.time) {
      setMeetingError('Choose a date and a time.')
      return
    }

    if (form.date < todayStr) {
      setMeetingError('Choose today or a later date.')
      return
    }

    setMeetingBusy(true)

    try {
      const m = await requestMentorMeeting(token, {
        topic: form.topic,
        agenda: form.agenda.trim(),
        requested_date: form.date,
        requested_time: form.time,
        mode: form.mode,
      })

      setData((d) => ({ ...d, meetings: [m, ...d.meetings] }))
      setForm((f) => ({ ...f, agenda: '' }))
      setMeetingOk('Meeting request sent. Your mentor will reply here.')
    } catch (err) {
      setMeetingError(err.message)
    } finally {
      setMeetingBusy(false)
    }
  }

  async function handleCancel(id) {
    if (!window.confirm('Cancel this meeting?')) return

    setMeetingError('')
    setMeetingOk('')

    try {
      const m = await cancelMentorMeeting(token, id)
      setData((d) => ({
        ...d,
        meetings: d.meetings.map((x) => (x.id === id ? m : x)),
      }))
    } catch (err) {
      setMeetingError(err.message)
    }
  }

  function askForProgressDiscussion() {
    const points = data ? data.snapshot.talking_points : []

    setForm((f) => ({
      ...f,
      topic: 'Progress discussion',
      agenda: points.length
        ? `Points to discuss:\n- ${points.join('\n- ')}`.slice(0, 500)
        : f.agenda,
    }))

    setMeetingOk('')
    setMeetingError('')
    setTab('meeting')
  }

  const mentor = data ? data.mentor : null
  const unreadCount = messages.filter((m) => m.sender === 'mentor' && !m.is_read).length
  const snap = data ? data.snapshot : null

  const meetings = data ? data.meetings : []
  const isUpcoming = (x) =>
    (x.status === 'pending' || x.status === 'approved') &&
    x.requested_date >= todayStr

  const upcomingMeetings = meetings
    .filter(isUpcoming)
    .sort((a, b) =>
      (a.requested_date + a.requested_time).localeCompare(
        b.requested_date + b.requested_time
      )
    )

  const pastMeetings = meetings
    .filter((x) => !isUpcoming(x))
    .sort((a, b) =>
      (b.requested_date + b.requested_time).localeCompare(
        a.requested_date + a.requested_time
      )
    )

  const waiting = meetings.filter((x) => x.status === 'pending').length

  function meetingCard(x) {
    const st = MEETING_STATUS[x.status] || MEETING_STATUS.pending
    const canCancel = x.status === 'pending' || x.status === 'approved'

    return (
      <div key={x.id} className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-base text-slate-900">{x.topic}</p>
            <p className="font-body text-xs text-slate-500 mt-0.5">
              {fmtDate(x.requested_date)} · {fmtTime(x.requested_time)} · {x.mode}
            </p>
          </div>

          <span className={`rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}>
            {st.label}
          </span>
        </div>

        <p className="font-body text-sm text-slate-700 mt-3 whitespace-pre-line">
          {x.agenda}
        </p>

        {x.mentor_response && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="font-body text-xs text-slate-400">Reply from your mentor</p>
            <p className="font-body text-sm text-slate-800 mt-0.5">
              {x.mentor_response}
            </p>
          </div>
        )}

        {canCancel && (
          <button
            onClick={() => handleCancel(x.id)}
            className="mt-3 font-body text-sm text-red-600 hover:text-red-800"
          >
            Cancel this meeting
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="w-full bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-body text-sm"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <h1 className="font-display text-lg text-slate-900 ml-2">
          Mentor Communication
        </h1>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {loading && (
          <p className="font-body text-slate-400">Loading…</p>
        )}

        {error && (
          <p className="font-body text-sm text-red-600">{error}</p>
        )}

        {!loading && data && !hasMentor && (
          <Card className="text-center p-8">
            <p className="font-display text-lg text-slate-900">
              No mentor assigned yet
            </p>

            <p className="font-body text-sm text-slate-500 mt-2 max-w-md mx-auto">
              Your college will assign a faculty mentor to you. After that you can chat with your mentor, request
              meetings and read guidance notes here. Until then you can load a sample mentor to try this screen.
            </p>

            <button
              onClick={handleSeed}
              disabled={seeding}
              className="mt-5 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-5 py-2.5 disabled:opacity-60"
            >
              {seeding ? 'Loading…' : 'Load sample data'}
            </button>
          </Card>
        )}

        {hasMentor && (
          <>
            {/* Mentor card */}
            <Card>
              <div className="flex flex-wrap items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-purple-100 text-purple-700 font-display text-2xl flex items-center justify-center shrink-0">
                  {mentor.name
                    .replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s*/i, '')
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-body text-xs text-purple-700 font-medium">
                    Your mentor
                  </p>

                  <h2 className="font-display text-xl text-slate-900">
                    {mentor.name}
                  </h2>

                  <p className="font-body text-sm text-slate-500">
                    {[mentor.designation, mentor.department].filter(Boolean).join(' · ')}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-body text-sm text-slate-600">
                    {mentor.availability && (
                      <span className="flex items-center gap-1.5">
                        <Clock size={13} /> {mentor.availability}
                      </span>
                    )}

                    {mentor.cabin && (
                      <span className="flex items-center gap-1.5">
                        <MapPin size={13} /> {mentor.cabin}
                      </span>
                    )}

                    {mentor.email && (
                      <a
                        href={`mailto:${mentor.email}`}
                        className="flex items-center gap-1.5 text-purple-700 hover:underline"
                      >
                        <Mail size={13} /> {mentor.email}
                      </a>
                    )}

                    {mentor.phone && (
                      <a
                        href={`tel:${mentor.phone.replace(/\s+/g, '')}`}
                        className="flex items-center gap-1.5 text-purple-700 hover:underline"
                      >
                        <Phone size={13} /> {mentor.phone}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            <div className="flex flex-wrap gap-1 border-b border-slate-200">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-2.5 font-body text-sm -mb-px border-b-2 flex items-center gap-2 ${
                    tab === t.key
                      ? 'border-purple-600 text-purple-700 font-medium'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t.label}

                  {t.key === 'chat' && unreadCount > 0 && tab !== 'chat' && (
                    <span className="rounded-full bg-purple-600 text-white px-1.5 py-0.5 text-[10px] leading-none">
                      {unreadCount}
                    </span>
                  )}

                  {t.key === 'meeting' && waiting > 0 && (
                    <span className="rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[10px] leading-none">
                      {waiting}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ---------------- Chat ---------------- */}
            {tab === 'chat' && (
              <Card className="p-4">
                <div
                  ref={listRef}
                  className="h-96 overflow-y-auto rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-3"
                >
                  {messages.length === 0 && (
                    <p className="font-body text-sm text-slate-500 text-center mt-10">
                      No messages yet. Say hello to your mentor below.
                    </p>
                  )}

                  {messages.map((m, i) => {
                    const mine = m.sender === 'student'
                    const newDay =
                      i === 0 || !sameDay(messages[i - 1].created_at, m.created_at)

                    return (
                      <div key={m.id}>
                        {newDay && (
                          <p className="text-center font-body text-[11px] text-slate-400 my-2">
                            {dayLabel(m.created_at)}
                          </p>
                        )}

                        {/* Updated message bubble with attachment download */}
                        <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                              mine
                                ? 'bg-purple-600 text-white rounded-br-sm'
                                : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                            }`}
                          >
                            {m.body && (
                              <p className="font-body text-sm whitespace-pre-line break-words">
                                {m.body}
                              </p>
                            )}

                            {m.attachment && (
                              <button
                                type="button"
                                onClick={() => handleDownload(m)}
                                className={`mt-1 w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left font-body text-sm ${
                                  mine
                                    ? 'bg-purple-500 text-white hover:bg-purple-400'
                                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                                }`}
                              >
                                <Paperclip size={14} className="shrink-0" />

                                <span className="min-w-0 flex-1">
                                  <span className="block truncate">
                                    {m.attachment.file_name}
                                  </span>
                                  <span className="block text-[11px] opacity-70">
                                    {fileSize(m.attachment.size_bytes)} · Download
                                  </span>
                                </span>

                                <Download size={14} className="shrink-0" />
                              </button>
                            )}

                            <p
                              className={`font-body text-[10px] mt-1 ${
                                mine ? 'text-purple-200' : 'text-slate-400'
                              }`}
                            >
                              {msgTime(m.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Updated chat composer with file attachment */}
                <form onSubmit={handleSend} className="mt-3">
                  {attachFile && (
                    <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5">
                      <span className="font-body text-sm text-slate-700 truncate">
                        <Paperclip size={12} className="inline mr-1.5" />
                        {attachFile.name}{' '}
                        <span className="text-slate-400 text-xs">
                          ({fileSize(attachFile.size)})
                        </span>
                      </span>

                      <button
                        type="button"
                        onClick={() => setAttachFile(null)}
                        aria-label="Remove the document"
                        className="text-slate-400 hover:text-red-600"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    <input
                      ref={attachRef}
                      type="file"
                      accept={ATTACH_ACCEPT}
                      onChange={pickAttachment}
                      className="hidden"
                    />

                    <button
                      type="button"
                      onClick={() => attachRef.current && attachRef.current.click()}
                      aria-label="Attach a document"
                      className="rounded-md border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50"
                    >
                      <Paperclip size={16} />
                    </button>

                    <textarea
                      rows={2}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={onDraftKeyDown}
                      maxLength={1000}
                      placeholder="Write a message (Enter to send, Shift+Enter for a new line)"
                      className={`${INPUT} resize-none`}
                    />

                    <button
                      type="submit"
                      disabled={sending || (!draft.trim() && !attachFile)}
                      className="flex items-center gap-1.5 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-4 py-2.5 disabled:opacity-50"
                    >
                      <Send size={14} /> {sending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                </form>

                <p className="font-body text-xs text-slate-400 mt-2">
                  Your messages and documents are saved. You can send PDF, Word, PowerPoint, Excel, image, ZIP or TXT
                  files up to 10 MB. Replies and documents from your mentor appear here, and the chat refreshes by
                  itself.
                </p>
              </Card>
            )}

            {/* ---------------- Request meeting ---------------- */}
            {tab === 'meeting' && (
              <>
                <Card>
                  <h2 className="font-display text-lg text-slate-900 mb-4">
                    Request a meeting
                  </h2>

                  <form onSubmit={handleMeeting} className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="font-body text-sm text-slate-600 mb-1 block">
                          What is it about?
                        </label>

                        <select
                          value={form.topic}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, topic: e.target.value }))
                          }
                          className={INPUT}
                        >
                          {TOPICS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="font-body text-sm text-slate-600 mb-1 block">
                          How
                        </label>

                        <select
                          value={form.mode}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, mode: e.target.value }))
                          }
                          className={INPUT}
                        >
                          {MODES.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="font-body text-sm text-slate-600 mb-1 block">
                          Preferred date
                        </label>

                        <input
                          type="date"
                          min={todayStr}
                          value={form.date}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, date: e.target.value }))
                          }
                          className={INPUT}
                        />
                      </div>

                      <div>
                        <label className="font-body text-sm text-slate-600 mb-1 block">
                          Preferred time
                        </label>

                        <input
                          type="time"
                          value={form.time}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, time: e.target.value }))
                          }
                          className={INPUT}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="font-body text-sm text-slate-600 mb-1 block">
                        What do you want to discuss?
                      </label>

                      <textarea
                        rows={4}
                        maxLength={500}
                        value={form.agenda}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, agenda: e.target.value }))
                        }
                        className={INPUT}
                      />

                      <p className="font-body text-xs text-slate-400 mt-1">
                        {form.agenda.length} / 500
                      </p>
                    </div>

                    {meetingError && (
                      <p className="font-body text-sm text-red-600">
                        {meetingError}
                      </p>
                    )}

                    {meetingOk && (
                      <p className="font-body text-sm text-green-700">
                        {meetingOk}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={meetingBusy}
                      className="rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-5 py-2.5 disabled:opacity-60"
                    >
                      {meetingBusy ? 'Sending…' : 'Send request'}
                    </button>
                  </form>
                </Card>

                <div>
                  <h2 className="font-display text-lg text-slate-900 mb-3">
                    Upcoming meetings
                  </h2>

                  {upcomingMeetings.length === 0 ? (
                    <Card className="text-center">
                      <p className="font-body text-sm text-slate-500">
                        You have no upcoming meetings.
                      </p>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {upcomingMeetings.map(meetingCard)}
                    </div>
                  )}
                </div>

                {pastMeetings.length > 0 && (
                  <div>
                    <h2 className="font-display text-lg text-slate-900 mb-3">
                      Earlier requests
                    </h2>
                    <div className="space-y-3">
                      {pastMeetings.map(meetingCard)}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ---------------- Progress discussion ---------------- */}
            {tab === 'progress' && snap && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <Stat
                    label="Attendance"
                    value={
                      snap.attendance_percentage === null
                        ? '—'
                        : `${snap.attendance_percentage}%`
                    }
                    tone={
                      snap.attendance_percentage === null
                        ? 'text-slate-900'
                        : pctTone(snap.attendance_percentage)
                    }
                    hint={
                      snap.attendance_classes
                        ? `${snap.attendance_classes} classes counted`
                        : 'No data yet'
                    }
                  />

                  <Stat
                    label="CGPA"
                    value={snap.cgpa === null ? '—' : snap.cgpa}
                    tone={
                      snap.cgpa !== null && snap.cgpa < 6
                        ? 'text-red-700'
                        : 'text-slate-900'
                    }
                    hint="out of 10"
                  />

                  <Stat
                    label="Subjects to clear"
                    value={snap.backlog_subjects.length}
                    tone={
                      snap.backlog_subjects.length > 0
                        ? 'text-red-700'
                        : 'text-green-700'
                    }
                  />
                </div>

                <Card>
                  <h2 className="font-display text-lg text-slate-900">
                    Points worth discussing with your mentor
                  </h2>

                  <ul className="mt-3 list-disc pl-5 font-body text-sm text-slate-700 space-y-1">
                    {snap.talking_points.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>

                  <p className="font-body text-xs text-slate-400 mt-3">
                    These points come from your attendance and results in CampusSync.
                  </p>

                  <button
                    onClick={askForProgressDiscussion}
                    className="mt-4 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-4 py-2"
                  >
                    Request a progress discussion
                  </button>
                </Card>

                <div>
                  <h2 className="font-display text-lg text-slate-900 mb-3">
                    Notes from past discussions
                  </h2>

                  <NoteList
                    notes={data.progress_notes}
                    emptyText="No progress notes yet. Your mentor adds a note after every progress discussion."
                  />
                </div>
              </>
            )}

            {/* ---------------- Academic guidance ---------------- */}
            {tab === 'guidance' && (
              <>
                <NoteList
                  notes={data.guidance_notes}
                  emptyText="No guidance notes yet. Your mentor will share advice and study plans here."
                />

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => setTab('chat')}
                    className="rounded-md border border-slate-200 bg-white px-4 py-2 font-body text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Ask your mentor in chat
                  </button>

                  <button
                    onClick={() => {
                      setForm((f) => ({ ...f, topic: 'Academic guidance' }))
                      setTab('meeting')
                    }}
                    className="rounded-md border border-slate-200 bg-white px-4 py-2 font-body text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Request a guidance meeting
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}