import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronUp, Download, Paperclip, User } from 'lucide-react'
import { getAssignments, submitAssignment, seedDemoAssignments, downloadSubmission , studentAssignmentFiles, downloadStudentAssignmentFile  } from '../api.js'

const STATUS = {
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-700' },
  overdue: { label: 'Overdue', cls: 'bg-red-100 text-red-700' },
  submitted: { label: 'Submitted', cls: 'bg-blue-100 text-blue-700' },
  graded: { label: 'Graded', cls: 'bg-green-100 text-green-700' },
}
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'graded', label: 'Graded' },
]
const ORDER = { pending: 0, overdue: 1, submitted: 2, graded: 3 }
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.txt,.zip,.png,.jpg,.jpeg'

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function dueText(iso) {
  const ms = new Date(iso) - new Date()
  const abs = Math.abs(ms)
  const days = Math.floor(abs / 86400000)
  const hours = Math.floor((abs % 86400000) / 3600000)
  const span =
    days > 0 ? `${days} day${days > 1 ? 's' : ''}` : hours > 0 ? `${hours} hour${hours > 1 ? 's' : ''}` : 'less than an hour'
  return ms >= 0 ? `Due in ${span}` : `Overdue by ${span}`
}

function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-xl border border-slate-200 p-6 ${className}`}>{children}</div>
}

function SubmitForm({ assignment, token, onDone }) {
  const existing = assignment.submission
  const [file, setFile] = useState(null)
  const [note, setNote] = useState(existing?.note || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pastDue = new Date(assignment.due_at) < new Date()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!file && !note.trim()) {
      setError('Attach a file or write a note before submitting.')
      return
    }
    if (file && file.size > MAX_BYTES) {
      setError('The file is larger than 5 MB.')
      return
    }
    setBusy(true)
    try {
      await submitAssignment(token, assignment.id, file, note)
      setFile(null)
      await onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
      <p className="font-body text-sm font-medium text-slate-800">
        {existing ? 'Submit again (replaces your previous submission)' : 'Submit your work'}
      </p>

      {pastDue && (
        <p className="font-body text-xs text-amber-700">
          The deadline has passed. You can still submit, but it will be marked as late.
        </p>
      )}

      <div>
        <label className="font-body text-xs text-slate-500 block mb-1">File (PDF, DOC, PPT, TXT, ZIP, PNG, JPG · max 5 MB)</label>
        <input
          type="file"
          accept={ACCEPT}
          onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
          className="block w-full font-body text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-purple-100 file:px-3 file:py-1.5 file:text-purple-700 file:font-medium hover:file:bg-purple-200"
        />
        {existing && existing.file_name && !file && (
          <p className="font-body text-xs text-slate-400 mt-1">
            No new file chosen: your current file "{existing.file_name}" stays.
          </p>
        )}
      </div>

      <div>
        <label className="font-body text-xs text-slate-500 block mb-1">Note for your teacher (optional if a file is attached)</label>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {error && <p className="font-body text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-5 py-2 disabled:opacity-60"
      >
        {busy ? 'Submitting…' : existing ? 'Resubmit' : 'Submit assignment'}
      </button>
    </form>
  )
}

export default function StudentAssignmentsPage({ session, onBack }) {
  const token = session.access_token
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
    const [taskFiles, setTaskFiles] = useState([])
  const [error, setError] = useState('')

  async function load() {
    setData(await getAssignments(token))
  }

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

    useEffect(() => {
    studentAssignmentFiles(token).then((d) => setTaskFiles(d.items)).catch(() => {})
  }, [token])

  async function handleSeed() {
    setSeeding(true)
    setError('')
    try {
      await seedDemoAssignments(token)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSeeding(false)
    }
  }

  async function handleDownload(a) {
    setError('')
    try {
      await downloadSubmission(token, a.id, a.submission?.file_name)
    } catch (e) {
      setError(e.message)
    }
  }

  const list = data ? data.assignments : []
  const hasData = data && data.class_known && list.length > 0
  const count = (s) => list.filter((a) => a.status === s).length

  const visible = [...list]
    .filter((a) => filter === 'all' || a.status === filter)
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || new Date(a.due_at) - new Date(b.due_at))

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="w-full bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-body text-sm"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="font-display text-lg text-slate-900 ml-2">Assignments</h1>
        {data && data.class_known && (
          <span className="font-body text-sm text-slate-500 ml-auto">
            {data.course} · Semester {data.semester}
          </span>
        )}
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {loading && <p className="font-body text-slate-400">Loading assignments…</p>}
        {error && <p className="font-body text-sm text-red-600">{error}</p>}

        {!loading && data && !data.class_known && (
          <Card className="text-center p-8">
            <p className="font-display text-lg text-slate-900">Your class is not set yet</p>
            <p className="font-body text-sm text-slate-500 mt-2 max-w-md mx-auto">
              Assignments are given to a class. Open <strong>Student Profile</strong>, fill in your
              <strong> Course</strong> and <strong>Semester</strong> under Academic Information, then come back here.
            </p>
          </Card>
        )}

        {!loading && data && data.class_known && !hasData && (
          <Card className="text-center p-8">
            <p className="font-display text-lg text-slate-900">No assignments yet</p>
            <p className="font-body text-sm text-slate-500 mt-2 max-w-md mx-auto">
              Assignments for {data.course}, Semester {data.semester} will appear here once your faculty posts them.
              Until then you can load sample assignments to try this screen.
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

        {hasData && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {['pending', 'overdue', 'submitted', 'graded'].map((s) => (
                <div key={s} className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="font-body text-xs text-slate-400">{STATUS[s].label}</p>
                  <p className="font-display text-3xl mt-1 text-slate-900">{count(s)}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`rounded-full px-4 py-1.5 font-body text-sm border ${
                    filter === f.key
                      ? 'bg-purple-600 border-purple-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {visible.length === 0 && (
              <p className="font-body text-sm text-slate-500">No assignments in this filter.</p>
            )}

            <div className="space-y-4">
              {visible.map((a) => {
                const open = openId === a.id
                const st = STATUS[a.status]
                const sub = a.submission
                return (
                  <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-body text-xs text-purple-700 font-medium">{a.subject}</p>
                        <h2 className="font-display text-lg text-slate-900 leading-snug">{a.title}</h2>
                        <p className="font-body text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span>Deadline: {fmtDateTime(a.due_at)}</span>
                          {a.faculty_name && (
                            <span className="flex items-center gap-1">
                              <User size={11} /> {a.faculty_name}
                            </span>
                          )}
                          <span>{a.max_marks} marks</span>
                        </p>
                        {(a.status === 'pending' || a.status === 'overdue') && (
                          <p className={`font-body text-xs mt-1 ${a.status === 'overdue' ? 'text-red-600' : 'text-amber-700'}`}>
                            {dueText(a.due_at)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {sub && sub.is_late && (
                          <span className="rounded-full bg-orange-100 text-orange-700 px-2.5 py-0.5 text-xs font-medium">
                            Late
                          </span>
                        )}
                        {a.status === 'graded' && sub && (
                          <span className="font-display text-lg text-green-700">
                            {sub.marks}/{a.max_marks}
                          </span>
                        )}
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => setOpenId(open ? null : a.id)}
                      className="mt-3 flex items-center gap-1 font-body text-sm text-purple-700 hover:text-purple-900"
                    >
                      {open ? (
                        <>
                          Hide details <ChevronUp size={14} />
                        </>
                      ) : (
                        <>
                          {a.status === 'pending' || a.status === 'overdue' ? 'View and submit' : 'View details'}
                          <ChevronDown size={14} />
                        </>
                      )}
                    </button>

                    {open && (
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        {a.description && (
                          <p className="font-body text-sm text-slate-700 whitespace-pre-line">{a.description}</p>
                        )}

                                                {taskFiles.filter((f) => f.assignment_id === a.id).map((f) => (
                          <button
                            key={f.id}
                            onClick={() => downloadStudentAssignmentFile(token, f.id, f.file_name).catch((e) => setError(e.message))}
                            className="mt-3 flex items-center gap-2 font-body text-sm text-purple-700 hover:text-purple-900"
                          >
                            <Paperclip size={14} /> Faculty file: {f.file_name} <Download size={14} />
                          </button>
                        ))}

                        {sub && (
                          <div className="mt-4 rounded-lg border border-slate-200 p-3">
                            <p className="font-body text-xs text-slate-400">
                              Your submission · {fmtDateTime(sub.submitted_at)}
                            </p>
                            {sub.file_name && (
                              <button
                                onClick={() => handleDownload(a)}
                                className="mt-2 flex items-center gap-2 font-body text-sm text-purple-700 hover:text-purple-900"
                              >
                                <Paperclip size={14} /> {sub.file_name} <Download size={14} />
                              </button>
                            )}
                            {sub.note && (
                              <p className="font-body text-sm text-slate-700 mt-2 whitespace-pre-line">{sub.note}</p>
                            )}
                          </div>
                        )}

                        {a.status === 'graded' && sub && (
                          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
                            <p className="font-body text-xs text-green-700">Faculty feedback</p>
                            <p className="font-display text-xl text-slate-900 mt-1">
                              {sub.marks} / {a.max_marks}
                            </p>
                            <p className="font-body text-sm text-slate-700 mt-1">
                              {sub.feedback || 'No written feedback was added.'}
                            </p>
                          </div>
                        )}

                        {a.status === 'submitted' && (
                          <p className="font-body text-xs text-slate-500 mt-3">
                            Waiting for your faculty to check this. You can still resubmit until it is graded.
                          </p>
                        )}

                        {a.status !== 'graded' && (
                          <SubmitForm assignment={a} token={token} onDone={load} />
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}