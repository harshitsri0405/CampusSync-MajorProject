import { useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronUp, Download, Paperclip, Star, X } from 'lucide-react'
import {
  getComplaints,
  createComplaint,
  markComplaintSeen,
  submitComplaintFeedback,
  downloadComplaintFile,
  seedDemoComplaints,
} from '../api.js'
import { useEffect } from 'react'

const TABS = [
  { key: 'raise', label: 'Raise Complaint' },
  { key: 'track', label: 'Track Status' },
  { key: 'history', label: 'Complaint History' },
]

const STATUS = {
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'In progress', cls: 'bg-blue-100 text-blue-700' },
  resolved: { label: 'Resolved', cls: 'bg-green-100 text-green-700' },
}
const STEPS = [
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'resolved', label: 'Resolved' },
]

const ACCEPT = '.png,.jpg,.jpeg,.pdf,.doc,.docx,.txt'
const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.pdf', '.doc', '.docx', '.txt']
const MAX_FILES = 3
const MAX_BYTES = 5 * 1024 * 1024

const INPUT =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500'

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

function fileSize(n) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`
}

function extOf(name) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-xl border border-slate-200 p-6 ${className}`}>{children}</div>
}

function Stat({ label, value, tone = 'text-slate-900' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="font-body text-xs text-slate-400">{label}</p>
      <p className={`font-display text-3xl mt-1 ${tone}`}>{value}</p>
    </div>
  )
}

function Tracker({ status }) {
  const idx = STEPS.findIndex((s) => s.key === status)
  return (
    <div className="flex items-start mt-4">
      {STEPS.map((s, i) => {
        const reached = i <= idx
        const done = i < idx || (i === idx && status === 'resolved')
        return (
          <div key={s.key} className={`flex items-start ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex flex-col items-center">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium ${
                  reached ? (status === 'resolved' ? 'bg-green-500 text-white' : 'bg-purple-600 text-white') : 'bg-slate-200 text-slate-500'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className="font-body text-[11px] mt-1 text-slate-500 whitespace-nowrap">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <span className={`flex-1 h-0.5 mx-2 mt-3 ${i < idx ? 'bg-purple-500' : 'bg-slate-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function Stars({ value, size = 16 }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={n <= value ? 'text-amber-400 fill-amber-400' : 'text-slate-300'} />
      ))}
    </span>
  )
}

function ComplaintCard({ c, open, onToggle, token, onUpdated, onError }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const st = STATUS[c.status] || STATUS.pending

  async function handleDownload(a) {
    onError('')
    try {
      await downloadComplaintFile(token, c.id, a.id, a.file_name)
    } catch (e) {
      onError(e.message)
    }
  }

  async function handleFeedback(e) {
    e.preventDefault()
    onError('')
    if (!rating) {
      onError('Choose a star rating first.')
      return
    }
    setBusy(true)
    try {
      onUpdated(await submitComplaintFeedback(token, c.id, rating, comment.trim()))
    } catch (err) {
      onError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`bg-white rounded-xl border p-5 ${c.has_unseen_update ? 'border-purple-300' : 'border-slate-200'}`}>
      <button type="button" onClick={() => onToggle(c)} className="w-full text-left">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-slate-500">{c.ticket_no}</span>
              <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[10px] font-medium">
                {c.category}
              </span>
              {c.has_unseen_update && (
                <span className="rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-[10px] font-medium">
                  New update
                </span>
              )}
            </div>
            <h2 className="font-display text-lg text-slate-900 leading-snug mt-1">{c.subject}</h2>
            <p className="font-body text-xs text-slate-500 mt-1">
              Raised {timeAgo(c.created_at)} · Last update {timeAgo(c.updated_at)}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
            <span className="text-slate-400">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
          </div>
        </div>
        <Tracker status={c.status} />
      </button>

      {open && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
          <div>
            <p className="font-body text-xs text-slate-400">Your complaint</p>
            <p className="font-body text-sm text-slate-700 mt-1 whitespace-pre-line">{c.description}</p>
            <p className="font-body text-xs text-slate-500 mt-2">
              Raised on {fmtDateTime(c.created_at)}
              {c.assigned_to ? ` · Forwarded to ${c.assigned_to}` : ''}
            </p>
          </div>

          {c.attachments.length > 0 && (
            <div>
              <p className="font-body text-xs text-slate-400 mb-1">Attachments</p>
              <ul className="space-y-1">
                {c.attachments.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => handleDownload(a)}
                      className="flex items-center gap-2 font-body text-sm text-purple-700 hover:text-purple-900"
                    >
                      <Paperclip size={14} /> {a.file_name}
                      <span className="text-slate-400 text-xs">({fileSize(a.size_bytes)})</span>
                      <Download size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {c.status === 'resolved' && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="font-body text-xs text-green-700">
                Resolved{c.resolved_at ? ` on ${fmtDateTime(c.resolved_at)}` : ''}
              </p>
              <p className="font-body text-sm text-slate-800 mt-1">
                {c.resolution_note || 'The complaint has been marked as resolved.'}
              </p>
            </div>
          )}

          {c.status === 'resolved' && c.rating === null && (
            <form onSubmit={handleFeedback} className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="font-body text-sm font-medium text-slate-800">How satisfied are you with the resolution?</p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    className="p-0.5"
                  >
                    <Star size={26} className={n <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'} />
                  </button>
                ))}
              </div>
              <textarea
                rows={3}
                maxLength={500}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Anything you want to add? (optional)"
                className={INPUT}
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-4 py-2 disabled:opacity-60"
              >
                {busy ? 'Saving…' : 'Submit feedback'}
              </button>
            </form>
          )}

          {c.status === 'resolved' && c.rating !== null && (
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="font-body text-xs text-slate-400">Your feedback</p>
              <div className="mt-1">
                <Stars value={c.rating} size={18} />
              </div>
              {c.feedback && <p className="font-body text-sm text-slate-700 mt-2">{c.feedback}</p>}
            </div>
          )}

          <div>
            <p className="font-body text-xs text-slate-400 mb-2">Progress</p>
            <ol className="relative border-l border-slate-200 ml-1.5 space-y-3">
              {c.timeline.map((e, i) => (
                <li key={i} className="ml-4">
                  <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-purple-400" />
                  <p className="font-body text-sm text-slate-800">{e.message}</p>
                  <p className="font-body text-xs text-slate-500">
                    {e.by} · {fmtDateTime(e.created_at)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}

export default function StudentComplaintsPage({ session, onBack }) {
  const token = session.access_token
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('raise')
  const [openId, setOpenId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')

  // raise form
  const [category, setCategory] = useState('')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const fileRef = useRef(null)

  async function load() {
    setData(await getComplaints(token))
  }

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  function replaceComplaint(updated) {
    setData((d) => ({ ...d, complaints: d.complaints.map((x) => (x.id === updated.id ? updated : x)) }))
  }

  async function handleSeed() {
    setSeeding(true)
    setError('')
    try {
      await seedDemoComplaints(token)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSeeding(false)
    }
  }

  async function toggle(c) {
    const willOpen = openId !== c.id
    setOpenId(willOpen ? c.id : null)
    if (willOpen && c.has_unseen_update) {
      replaceComplaint({ ...c, has_unseen_update: false })
      try {
        await markComplaintSeen(token, c.id)
      } catch {
        /* the badge is only cosmetic, ignore a failed save */
      }
    }
  }

  function openFromBanner(c) {
    setTab(c.status === 'resolved' ? 'history' : 'track')
    setSearch('')
    toggle({ ...c, has_unseen_update: c.has_unseen_update })
    setOpenId(c.id)
  }

  function pickFiles(e) {
    setFormError('')
    const chosen = Array.from(e.target.files || [])
    if (fileRef.current) fileRef.current.value = ''
    const next = [...files]
    for (const f of chosen) {
      if (next.length >= MAX_FILES) {
        setFormError(`You can attach at most ${MAX_FILES} files.`)
        break
      }
      if (!ALLOWED_EXT.includes(extOf(f.name))) {
        setFormError(`"${f.name}" is not allowed. Use PNG, JPG, PDF, DOC, DOCX or TXT.`)
        continue
      }
      if (f.size > MAX_BYTES) {
        setFormError(`"${f.name}" is larger than 5 MB.`)
        continue
      }
      next.push(f)
    }
    setFiles(next)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    setNotice('')
    if (!category) {
      setFormError('Choose a category.')
      return
    }
    if (subject.trim().length < 5) {
      setFormError('Write a subject of at least 5 characters.')
      return
    }
    if (description.trim().length < 10) {
      setFormError('Describe the problem in at least 10 characters.')
      return
    }
    setSubmitting(true)
    try {
      const created = await createComplaint(token, {
        category,
        subject: subject.trim(),
        description: description.trim(),
        files,
      })
      await load()
      setCategory('')
      setSubject('')
      setDescription('')
      setFiles([])
      setTab('track')
      setOpenId(created.id)
      setNotice(`Your complaint was submitted. Ticket number: ${created.ticket_no}`)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const complaints = data ? data.complaints : []
  const categories = data ? data.categories : []
  const chosenCategory = categories.find((c) => c.name === category)

  const count = (s) => complaints.filter((c) => c.status === s).length
  const unseen = complaints.filter((c) => c.has_unseen_update)
  const feedbackPending = complaints.filter((c) => c.status === 'resolved' && c.rating === null).length

  const tracking = complaints.filter((c) => c.status !== 'resolved')
  const q = search.trim().toLowerCase()
  const history = complaints.filter(
    (c) =>
      c.status === 'resolved' &&
      (!q ||
        c.subject.toLowerCase().includes(q) ||
        c.ticket_no.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q))
  )

  function renderCard(c) {
    return (
      <ComplaintCard
        key={c.id}
        c={c}
        open={openId === c.id}
        onToggle={toggle}
        token={token}
        onUpdated={replaceComplaint}
        onError={setError}
      />
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
        <h1 className="font-display text-lg text-slate-900 ml-2">Complaint Portal</h1>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {loading && <p className="font-body text-slate-400">Loading…</p>}
        {error && <p className="font-body text-sm text-red-600">{error}</p>}

        {!loading && data && (
          <>
            {complaints.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Stat label="Total" value={complaints.length} />
                <Stat label="Pending" value={count('pending')} tone="text-amber-700" />
                <Stat label="In progress" value={count('in_progress')} tone="text-blue-700" />
                <Stat label="Resolved" value={count('resolved')} tone="text-green-700" />
              </div>
            )}

            {unseen.length > 0 && (
              <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
                <p className="font-body text-sm font-medium text-purple-800">
                  {unseen.length === 1 ? '1 complaint has a new update' : `${unseen.length} complaints have new updates`}
                </p>
                <ul className="mt-2 space-y-1">
                  {unseen.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => openFromBanner(c)}
                        className="font-body text-sm text-purple-700 hover:text-purple-900 text-left"
                      >
                        {c.ticket_no} · {c.subject}
                        {' — '}
                        {c.status === 'resolved' ? 'resolved, please rate it' : 'now in progress'}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-1 border-b border-slate-200">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setTab(t.key)
                    setNotice('')
                  }}
                  className={`px-4 py-2.5 font-body text-sm -mb-px border-b-2 flex items-center gap-2 ${
                    tab === t.key
                      ? 'border-purple-600 text-purple-700 font-medium'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t.label}
                  {t.key === 'track' && tracking.length > 0 && (
                    <span className="rounded-full bg-slate-200 text-slate-600 px-1.5 py-0.5 text-[10px] leading-none">
                      {tracking.length}
                    </span>
                  )}
                  {t.key === 'history' && feedbackPending > 0 && (
                    <span className="rounded-full bg-purple-600 text-white px-1.5 py-0.5 text-[10px] leading-none">
                      {feedbackPending}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ---------------- Raise complaint ---------------- */}
            {tab === 'raise' && (
              <Card>
                <h2 className="font-display text-lg text-slate-900 mb-4">Raise a new complaint</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="font-body text-sm text-slate-600 mb-1 block">Category</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className={INPUT}>
                      <option value="">Choose a category</option>
                      {categories.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {chosenCategory && (
                      <p className="font-body text-xs text-slate-500 mt-1">
                        This will be forwarded to <strong>{chosenCategory.department}</strong>.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="font-body text-sm text-slate-600 mb-1 block">Subject</label>
                    <input
                      type="text"
                      maxLength={100}
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="A short title of the problem"
                      className={INPUT}
                    />
                  </div>

                  <div>
                    <label className="font-body text-sm text-slate-600 mb-1 block">Describe the problem</label>
                    <textarea
                      rows={5}
                      maxLength={1000}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What happened, where and since when?"
                      className={INPUT}
                    />
                    <p className="font-body text-xs text-slate-400 mt-1">{description.length} / 1000</p>
                  </div>

                  <div>
                    <label className="font-body text-sm text-slate-600 mb-1 block">
                      Attach photos or documents (optional)
                    </label>
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      accept={ACCEPT}
                      onChange={pickFiles}
                      className="block w-full font-body text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-purple-100 file:px-3 file:py-1.5 file:text-purple-700 file:font-medium hover:file:bg-purple-200"
                    />
                    <p className="font-body text-xs text-slate-400 mt-1">
                      Up to {MAX_FILES} files, 5 MB each. PNG, JPG, PDF, DOC, DOCX or TXT.
                    </p>
                    {files.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {files.map((f, i) => (
                          <li
                            key={`${f.name}-${i}`}
                            className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5"
                          >
                            <span className="font-body text-sm text-slate-700 truncate">
                              {f.name} <span className="text-slate-400 text-xs">({fileSize(f.size)})</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setFiles((fs) => fs.filter((_, k) => k !== i))}
                              aria-label={`Remove ${f.name}`}
                              className="text-slate-400 hover:text-red-600"
                            >
                              <X size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {formError && <p className="font-body text-sm text-red-600">{formError}</p>}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-5 py-2.5 disabled:opacity-60"
                  >
                    {submitting ? 'Submitting…' : 'Submit complaint'}
                  </button>
                </form>
              </Card>
            )}

            {/* ---------------- Track status ---------------- */}
            {tab === 'track' && (
              <>
                {notice && (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                    <p className="font-body text-sm text-green-800">{notice}</p>
                  </div>
                )}

                {tracking.length === 0 && (
                  <Card className="text-center">
                    <p className="font-body text-sm text-slate-500">
                      {complaints.length === 0
                        ? 'You have not raised any complaint yet.'
                        : 'None of your complaints are open right now. Resolved ones are in Complaint History.'}
                    </p>
                    {complaints.length === 0 && (
                      <button
                        onClick={handleSeed}
                        disabled={seeding}
                        className="mt-4 rounded-md border border-slate-200 bg-white px-4 py-2 font-body text-sm text-purple-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {seeding ? 'Loading…' : 'Load sample data'}
                      </button>
                    )}
                  </Card>
                )}

                <div className="space-y-3">{tracking.map(renderCard)}</div>
              </>
            )}

            {/* ---------------- History ---------------- */}
            {tab === 'history' && (
              <>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by ticket number, subject or category"
                  className={INPUT}
                />

                {history.length === 0 && (
                  <Card className="text-center">
                    <p className="font-body text-sm text-slate-500">
                      {q ? 'No resolved complaints match your search.' : 'No complaint has been resolved yet.'}
                    </p>
                  </Card>
                )}

                <div className="space-y-3">{history.map(renderCard)}</div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}