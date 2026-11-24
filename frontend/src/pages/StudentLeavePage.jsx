import { useEffect, useState } from 'react'
import { ArrowLeft, AlertTriangle, CheckCircle2, Paperclip, Printer } from 'lucide-react'
import {
  getLeaveOverview,
  getLeaveImpact,
  applyLeave,
  cancelLeave,
  markLeaveSeen,
  seedLeaveDemo,
  openLeaveAttachment,
} from '../api.js'

const STATUS_STYLE = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
}

const INPUT =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500'

function toInputDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fmtDate(s) {
  if (!s) return '-'
  return parseDate(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(v) {
  if (!v) return '-'
  const iso = String(v).endsWith('Z') ? v : `${v}Z`
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Card({ title, children, right }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
      {(title || right) && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-base text-slate-900">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

export default function StudentLeavePage({ session, onBack }) {
  const todayStr = toInputDate(new Date())

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('apply')

  // apply form
  const [leaveType, setLeaveType] = useState('personal')
  const [fromDate, setFromDate] = useState(todayStr)
  const [toDate, setToDate] = useState(todayStr)
  const [halfDay, setHalfDay] = useState(false)
  const [reason, setReason] = useState('')
  const [file, setFile] = useState(null)
  const [fileKey, setFileKey] = useState(0)
  const [impact, setImpact] = useState(null)

  // history
  const [filter, setFilter] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [slip, setSlip] = useState(null)

  async function load() {
    setError('')
    try {
      setData(await getLeaveOverview())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // attendance impact preview (re-calculated when the form changes)
  useEffect(() => {
    if (!fromDate || !toDate || toDate < fromDate) {
      setImpact(null)
      return undefined
    }
    let cancelled = false
    const t = setTimeout(() => {
      getLeaveImpact({
        leaveType,
        fromDate,
        toDate,
        halfDay: halfDay && fromDate === toDate,
      })
        .then((r) => !cancelled && setImpact(r))
        .catch(() => !cancelled && setImpact(null))
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [leaveType, fromDate, toDate, halfDay])

  const typeMeta = data ? data.types.find((t) => t.key === leaveType) : null
  const rules = data?.rules

  async function handleApply(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (toDate < fromDate) {
      setError('"To" date, "From" date se pehle nahi ho sakti.')
      return
    }
    if (reason.trim().length < (rules?.min_reason_len || 10)) {
      setError(`Reason kam se kam ${rules?.min_reason_len || 10} characters ka likho.`)
      return
    }
    setBusy(true)
    try {
      await applyLeave({
        leaveType,
        fromDate,
        toDate,
        halfDay: halfDay && fromDate === toDate,
        reason: reason.trim(),
        file,
      })
      setReason('')
      setFile(null)
      setFileKey((k) => k + 1)
      setInfo('Leave request submit ho gayi.')
      await load()
      setTab('history')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel(id) {
    if (!window.confirm('Ye leave request cancel karni hai?')) return
    setBusy(true)
    setError('')
    try {
      await cancelLeave(id)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleSeed() {
    setBusy(true)
    setError('')
    try {
      await seedLeaveDemo()
      await load()
      setTab('history')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleOpen(r) {
    const next = openId === r.id ? null : r.id
    setOpenId(next)
    if (next && r.has_unseen_update) {
      try {
        await markLeaveSeen(r.id)
        await load()
      } catch (e) {
        /* ignore */
      }
    }
  }

  function printSlip(r) {
    setSlip(r)
    setTimeout(() => window.print(), 150)
  }

  const requests = data?.requests || []
  const shown = requests.filter((r) => filter === 'all' || r.status === filter)
  const s = data?.summary
  const att = data?.attendance

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="w-full bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-body text-sm"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="font-display text-lg text-slate-900 ml-2">Leave</h1>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {loading && <p className="font-body text-slate-400">Loading leave…</p>}
        {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
        {info && <p className="font-body text-sm text-green-600 mb-3">{info}</p>}

        {data && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="font-body text-xs text-slate-400">Pending</p>
                <p className="font-display text-3xl mt-1 text-amber-600">{s.pending}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="font-body text-xs text-slate-400">Approved</p>
                <p className="font-display text-3xl mt-1 text-green-700">{s.approved}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="font-body text-xs text-slate-400">Rejected</p>
                <p className="font-display text-3xl mt-1 text-red-700">{s.rejected}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="font-body text-xs text-slate-400">Approved days (this year)</p>
                <p className="font-display text-3xl mt-1 text-slate-900">{s.approved_days_this_year}</p>
                <p className="font-body text-xs text-slate-400 mt-1">
                  {s.excused_days_this_year} excused (medical / OD)
                </p>
              </div>
            </div>

            {requests.length === 0 && (
              <div className="bg-white rounded-xl border border-dashed border-slate-300 p-6 text-center mb-6">
                <p className="font-body text-sm text-slate-600 mb-3">Abhi koi leave request nahi hai.</p>
                <button
                  disabled={busy}
                  onClick={handleSeed}
                  className="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm disabled:opacity-60"
                >
                  Load sample data
                </button>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-6 border-b border-slate-200 mb-4">
              {[
                ['apply', 'Apply Leave'],
                ['history', `My Leaves${s.unseen ? ` (${s.unseen} new)` : ''}`],
              ].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`pb-2 font-body text-sm font-medium border-b-2 ${
                    tab === k
                      ? 'border-purple-600 text-purple-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* APPLY */}
            {tab === 'apply' && (
              <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] gap-4">
                <Card title="Naya leave request">
                  <form onSubmit={handleApply} className="space-y-4">
                    <div>
                      <label className="font-body text-sm text-slate-600 mb-1 block">Leave type</label>
                      <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className={INPUT}>
                        {data.types.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      {typeMeta?.excused && (
                        <p className="font-body text-xs text-green-700 mt-1">
                          Approve hone par ye leave attendance me excused (present jaisi) maani jayegi.
                        </p>
                      )}
                      {typeMeta?.attach_after_days != null && (
                        <p className="font-body text-xs text-slate-500 mt-1">
                          {typeMeta.attach_after_days} din se zyada ho to certificate attach karna zaroori hai.
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="font-body text-sm text-slate-600 mb-1 block">From</label>
                        <input
                          type="date"
                          required
                          value={fromDate}
                          onChange={(e) => {
                            setFromDate(e.target.value)
                            if (toDate < e.target.value) setToDate(e.target.value)
                          }}
                          className={INPUT}
                        />
                      </div>
                      <div>
                        <label className="font-body text-sm text-slate-600 mb-1 block">To</label>
                        <input
                          type="date"
                          required
                          min={fromDate}
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                          className={INPUT}
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 font-body text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={halfDay && fromDate === toDate}
                        disabled={fromDate !== toDate}
                        onChange={(e) => setHalfDay(e.target.checked)}
                      />
                      Half day (sirf ek din ki leave me)
                    </label>

                    <div>
                      <label className="font-body text-sm text-slate-600 mb-1 block">Reason</label>
                      <textarea
                        rows={3}
                        maxLength={rules.max_reason_len}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Leave ki wajah likho"
                        className={INPUT}
                      />
                      <p className="font-body text-xs text-slate-400 mt-1 text-right">
                        {reason.length}/{rules.max_reason_len}
                      </p>
                    </div>

                    <div>
                      <label className="font-body text-sm text-slate-600 mb-1 block">
                        Attachment (optional)
                      </label>
                      <input
                        key={fileKey}
                        type="file"
                        accept={rules.allowed_ext.join(',')}
                        onChange={(e) => setFile(e.target.files[0] || null)}
                        className="font-body text-sm"
                      />
                      <p className="font-body text-xs text-slate-400 mt-1">
                        {rules.allowed_ext.join(', ')} | max {rules.max_file_mb} MB
                      </p>
                    </div>

                    <button
                      disabled={busy}
                      className="rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-5 py-2.5 disabled:opacity-60"
                    >
                      {busy ? 'Submitting…' : 'Submit request'}
                    </button>
                  </form>
                </Card>

                <div>
                  <Card title="Attendance impact">
                    {!impact && (
                      <p className="font-body text-sm text-slate-500">
                        Dates chuno, yahan dikhega ki attendance par kya asar padega.
                      </p>
                    )}
                    {impact && !impact.has_data && (
                      <p className="font-body text-sm text-slate-500">{impact.message}</p>
                    )}
                    {impact && impact.has_data && (
                      <div className="space-y-3 font-body text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Abhi</span>
                          <span className="text-slate-900">{impact.current_pct}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Working days</span>
                          <span className="text-slate-900">{impact.working_days}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Estimated classes miss</span>
                          <span className="text-slate-900">{impact.classes_estimated}</span>
                        </div>
                        <hr className="border-slate-100" />
                        <div className="flex justify-between">
                          <span className="text-slate-500">Agar absent maani gayi</span>
                          <span className="text-slate-900">{impact.projected_if_absent}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Agar excused hui</span>
                          <span className="text-slate-900">{impact.projected_if_excused}%</span>
                        </div>
                        <div
                          className={`flex items-start gap-2 rounded-lg border p-3 ${
                            impact.below_required
                              ? 'bg-red-50 border-red-200 text-red-700'
                              : 'bg-green-50 border-green-200 text-green-700'
                          }`}
                        >
                          {impact.below_required ? (
                            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                          ) : (
                            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                          )}
                          <span>
                            {impact.below_required
                              ? `Attendance ${impact.required}% se neeche ja sakti hai.`
                              : `Attendance ${impact.required}% se upar rahegi.`}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          Ye andaza hai (tumhari average classes per day ke hisaab se). Excused tabhi maana jayega jab
                          leave approve ho.
                        </p>
                      </div>
                    )}
                  </Card>
                  {att?.has_data && (
                    <p className="font-body text-xs text-slate-500">
                      Current attendance: {att.percentage}% ({att.present}/{att.total_classes})
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* HISTORY */}
            {tab === 'history' && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-body text-sm text-slate-500">{shown.length} request(s)</p>
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-body text-sm"
                  >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {shown.length === 0 ? (
                  <Card>
                    <p className="font-body text-sm text-slate-500">Koi request nahi mili.</p>
                  </Card>
                ) : (
                  shown.map((r) => (
                    <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-5 mb-3">
                      <button type="button" onClick={() => toggleOpen(r)} className="w-full text-left">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-display text-base text-slate-900">{r.type_label}</span>
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLE[r.status]}`}
                              >
                                {r.status}
                              </span>
                              {r.has_unseen_update && (
                                <span className="w-2 h-2 rounded-full bg-purple-600 inline-block" title="Naya update" />
                              )}
                              {r.excused && r.status === 'approved' && (
                                <span className="text-xs text-green-700">excused</span>
                              )}
                            </div>
                            <p className="font-body text-sm text-slate-600 mt-1">
                              {fmtDate(r.from_date)}
                              {r.from_date !== r.to_date ? ` to ${fmtDate(r.to_date)}` : ''} | {r.days} day
                              {r.days === 1 ? '' : 's'}
                              {r.is_half_day ? ' (half day)' : ''}
                            </p>
                          </div>
                          <span className="font-body text-xs text-slate-400 whitespace-nowrap">
                            {fmtDateTime(r.created_at)}
                          </span>
                        </div>
                      </button>

                      {openId === r.id && (
                        <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
                          <p className="font-body text-sm text-slate-700">
                            <span className="text-slate-400">Reason: </span>
                            {r.reason}
                          </p>
                          {r.reviewer_remarks && (
                            <p className="font-body text-sm text-slate-700">
                              <span className="text-slate-400">Remarks: </span>
                              {r.reviewer_remarks}
                              {r.reviewed_by ? ` (${r.reviewed_by})` : ''}
                            </p>
                          )}

                          <ol className="space-y-1">
                            {r.events.map((ev) => (
                              <li key={ev.id} className="font-body text-xs text-slate-500">
                                <span className="text-slate-700 font-medium">{ev.event}</span> |{' '}
                                {fmtDateTime(ev.created_at)}
                                {ev.note ? ` | ${ev.note}` : ''}
                              </li>
                            ))}
                          </ol>

                          <div className="flex items-center gap-4 flex-wrap">
                            {r.has_attachment && (
                              <button
                                onClick={() => openLeaveAttachment(r.id).catch((e) => setError(e.message))}
                                className="flex items-center gap-1 font-body text-sm text-purple-600 hover:text-purple-800"
                              >
                                <Paperclip size={14} /> {r.attachment_name || 'Attachment'}
                              </button>
                            )}
                            {r.status === 'approved' && (
                              <button
                                onClick={() => printSlip(r)}
                                className="flex items-center gap-1 font-body text-sm text-purple-600 hover:text-purple-800"
                              >
                                <Printer size={14} /> Print slip
                              </button>
                            )}
                            {r.can_cancel && (
                              <button
                                disabled={busy}
                                onClick={() => handleCancel(r.id)}
                                className="font-body text-sm text-red-600 hover:text-red-800 disabled:opacity-60"
                              >
                                Cancel request
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </>
            )}

            {/* Printable slip (only rendered after Print slip is pressed) */}
            {slip && (
              <div className="print-area bg-white rounded-xl border border-slate-200 p-8 mt-6">
                <h2 className="text-center font-display text-xl mb-6 underline">LEAVE APPROVAL SLIP</h2>
                <table className="w-full font-body text-sm text-slate-800">
                  <tbody>
                    <tr><td className="py-1.5 text-slate-500 w-40">Student</td><td>{data.student.name || '-'}</td></tr>
                    <tr><td className="py-1.5 text-slate-500">College ID</td><td>{data.student.college_id || '-'}</td></tr>
                    <tr><td className="py-1.5 text-slate-500">Course / Semester</td><td>{data.student.course || '-'} / {data.student.semester || '-'}</td></tr>
                    <tr><td className="py-1.5 text-slate-500">Leave type</td><td>{slip.type_label}</td></tr>
                    <tr>
                      <td className="py-1.5 text-slate-500">Period</td>
                      <td>
                        {fmtDate(slip.from_date)}
                        {slip.from_date !== slip.to_date ? ` to ${fmtDate(slip.to_date)}` : ''} ({slip.days} day
                        {slip.days === 1 ? '' : 's'}
                        {slip.is_half_day ? ', half day' : ''})
                      </td>
                    </tr>
                    <tr><td className="py-1.5 text-slate-500">Reason</td><td>{slip.reason}</td></tr>
                    <tr><td className="py-1.5 text-slate-500">Status</td><td>Approved{slip.excused ? ' (excused)' : ''}</td></tr>
                    <tr><td className="py-1.5 text-slate-500">Approved by</td><td>{slip.reviewed_by || '-'}</td></tr>
                    <tr><td className="py-1.5 text-slate-500">Approved on</td><td>{fmtDateTime(slip.reviewed_at)}</td></tr>
                  </tbody>
                </table>
                <p className="font-body text-xs text-slate-400 mt-8">System generated slip.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}