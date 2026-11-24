import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, QrCode } from 'lucide-react'
import QrAttendanceScanner from '../components/QrAttendanceScanner'
import {
  getAttendanceSummary,
  getAttendanceMonth,
  getAttendanceRange,
  seedDemoAttendance,
} from '../api.js'
import AttendanceRadar from '../components/AttendanceRadar.jsx'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function pctColor(p) {
  if (p >= 75) return { text: 'text-green-700', bar: 'bg-green-500' }
  if (p >= 65) return { text: 'text-amber-700', bar: 'bg-amber-500' }
  return { text: 'text-red-700', bar: 'bg-red-500' }
}

const DAY_STYLE = {
  present: 'bg-green-100 text-green-800 border-green-200',
  absent: 'bg-red-100 text-red-800 border-red-200',
  mixed: 'bg-amber-100 text-amber-800 border-amber-200',
  none: 'bg-white text-slate-400 border-slate-100',
}

// Date as YYYY-MM-DD in the user's own timezone (what <input type="date"> expects)
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
  return parseDate(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function weekdayOf(s) {
  return parseDate(s).toLocaleDateString('en-IN', { weekday: 'long' })
}

const INPUT =
  'rounded-md border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500'

// Present / Absent / Total / Percentage cards used by both date-range sections
function RangeStats({ data }) {
  const color = pctColor(data.percentage)
  return (
    <div className="grid sm:grid-cols-4 gap-4 mt-3">
      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
        <p className="font-body text-xs text-green-700">Present</p>
        <p className="font-display text-3xl mt-1 text-green-800">{data.present}</p>
      </div>
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="font-body text-xs text-red-700">Absent</p>
        <p className="font-display text-3xl mt-1 text-red-800">{data.absent}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="font-body text-xs text-slate-500">Total classes</p>
        <p className="font-display text-3xl mt-1 text-slate-900">{data.total_classes}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="font-body text-xs text-slate-500">Percentage</p>
        <p className={`font-display text-3xl mt-1 ${color.text}`}>{data.percentage}%</p>
        <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full ${color.bar}`} style={{ width: `${Math.min(data.percentage, 100)}%` }} />
        </div>
      </div>
    </div>
  )
}

export default function StudentAttendancePage({ session, onBack }) {
  const token = session.access_token
  const today = new Date()
  const monthStart = toInputDate(new Date(today.getFullYear(), today.getMonth(), 1))
  const todayStr = toInputDate(today)

  const [summary, setSummary] = useState(null)
  const [monthView, setMonthView] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 })
  const [monthData, setMonthData] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState('')

  // QR attendance section open/close
  const [showQr, setShowQr] = useState(false)

  // overall attendance between two dates
  const [rangeStart, setRangeStart] = useState(monthStart)
  const [rangeEnd, setRangeEnd] = useState(todayStr)
  const [rangeData, setRangeData] = useState(null)
  const [rangeLoading, setRangeLoading] = useState(false)
  const [rangeError, setRangeError] = useState('')

  // one subject between two dates
  const [subjectName, setSubjectName] = useState('')
  const [subStart, setSubStart] = useState(monthStart)
  const [subEnd, setSubEnd] = useState(todayStr)
  const [subData, setSubData] = useState(null)
  const [subLoading, setSubLoading] = useState(false)
  const [subError, setSubError] = useState('')

  const loadSummary = useCallback(async () => {
    setSummary(await getAttendanceSummary(token))
  }, [token])

  const loadMonth = useCallback(async () => {
    const m = await getAttendanceMonth(token, monthView.year, monthView.month)
    setMonthData(m)
  }, [token, monthView.year, monthView.month])

  useEffect(() => {
    loadSummary()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [loadSummary])

  useEffect(() => {
    loadMonth().catch((e) => setError(e.message))
  }, [loadMonth])

  async function handleSeed() {
    setSeeding(true)
    setError('')
    try {
      await seedDemoAttendance(token)
      await Promise.all([loadSummary(), loadMonth()])
    } catch (e) {
      setError(e.message)
    } finally {
      setSeeding(false)
    }
  }

  // called by the QR scanner after attendance is recorded: refresh numbers + calendar
  async function handleQrMarked() {
    try {
      await Promise.all([loadSummary(), loadMonth()])
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleRange(e) {
    e.preventDefault()
    setRangeError('')
    setRangeData(null)
    if (!rangeStart || !rangeEnd) {
      setRangeError('Please choose both dates.')
      return
    }
    if (rangeEnd < rangeStart) {
      setRangeError('The "To" date must be on or after the "From" date.')
      return
    }
    setRangeLoading(true)
    try {
      setRangeData(await getAttendanceRange(token, rangeStart, rangeEnd))
    } catch (err) {
      setRangeError(err.message)
    } finally {
      setRangeLoading(false)
    }
  }

  async function handleSubjectRange(e) {
    e.preventDefault()
    setSubError('')
    setSubData(null)
    if (!subjectName.trim()) {
      setSubError('Please type or choose a subject.')
      return
    }
    if (!subStart || !subEnd) {
      setSubError('Please choose both dates.')
      return
    }
    if (subEnd < subStart) {
      setSubError('The "To" date must be on or after the "From" date.')
      return
    }
    setSubLoading(true)
    try {
      setSubData(await getAttendanceRange(token, subStart, subEnd, subjectName.trim()))
    } catch (err) {
      setSubError(err.message)
    } finally {
      setSubLoading(false)
    }
  }

  function shiftMonth(delta) {
    setSelectedDay(null)
    setMonthView(({ year, month }) => {
      const d = new Date(year, month - 1 + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() + 1 }
    })
  }

  // Build the calendar grid for the visible month
  const firstWeekday = new Date(monthView.year, monthView.month - 1, 1).getDay()
  const daysInMonth = new Date(monthView.year, monthView.month, 0).getDate()
  const dayStatus = {}
  ;(monthData?.days || []).forEach((d) => {
    dayStatus[Number(d.date.slice(8, 10))] = d
  })
  const cells = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const selectedInfo = selectedDay ? dayStatus[selectedDay] : null
  const selectedLabel = selectedDay
    ? new Date(monthView.year, monthView.month - 1, selectedDay).toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : ''

  const overall = summary ? pctColor(summary.percentage) : pctColor(100)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="w-full bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-body text-sm"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="font-display text-lg text-slate-900 ml-2">Attendance</h1>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* QR attendance (always visible, even before any attendance data exists) */}
        <div>
          <button
            type="button"
            onClick={() => setShowQr((v) => !v)}
            className="flex items-center gap-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-5 py-2.5"
          >
            <QrCode size={16} />
            {showQr ? 'Close QR scanner' : 'Mark attendance via QR'}
          </button>
          {showQr && (
            <div className="mt-4">
              <QrAttendanceScanner onMarked={handleQrMarked} />
            </div>
          )}
        </div>

        {loading && <p className="font-body text-slate-400">Loading attendance…</p>}
        {error && <p className="font-body text-sm text-red-600">{error}</p>}

        {!loading && summary && summary.total_classes === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="font-display text-lg text-slate-900">No attendance recorded yet</p>
            <p className="font-body text-sm text-slate-500 mt-2 max-w-md mx-auto">
              Your faculty will mark attendance once the Faculty module is live. Until then you can
              load sample data to see how this screen works.
            </p>
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="mt-5 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-5 py-2.5 disabled:opacity-60"
            >
              {seeding ? 'Loading…' : 'Load sample data'}
            </button>
          </div>
        )}

        {!loading && summary && summary.total_classes > 0 && (
          <>
            {/* Summary cards */}
            <div className="grid sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5 sm:col-span-1">
                <p className="font-body text-xs text-slate-400">Overall attendance</p>
                <p className={`font-display text-3xl mt-1 ${overall.text}`}>{summary.percentage}%</p>
                <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full ${overall.bar}`} style={{ width: `${Math.min(summary.percentage, 100)}%` }} />
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="font-body text-xs text-slate-400">Classes attended</p>
                <p className="font-display text-3xl mt-1 text-slate-900">{summary.present}</p>
                <p className="font-body text-xs text-slate-400 mt-1">of {summary.total_classes} held</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="font-body text-xs text-slate-400">Classes missed</p>
                <p className="font-display text-3xl mt-1 text-slate-900">{summary.absent}</p>
              </div>
              <div
                className={`rounded-xl border p-5 flex items-start gap-2 ${
                  summary.at_risk ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                }`}
              >
                {summary.at_risk ? (
                  <AlertTriangle size={18} className="text-red-600 mt-0.5 shrink-0" />
                ) : (
                  <CheckCircle2 size={18} className="text-green-600 mt-0.5 shrink-0" />
                )}
                <p className={`font-body text-sm ${summary.at_risk ? 'text-red-700' : 'text-green-700'}`}>
                  {summary.at_risk
                    ? `Below the required ${summary.required_percentage}%. Attend regularly to avoid shortage.`
                    : `You meet the required ${summary.required_percentage}% attendance.`}
                </p>
              </div>
            </div>

            {/* Subject-wise */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="font-display text-lg text-slate-900 mb-4">Subject-wise attendance</h2>
              {summary.subjects.length >= 3 ? (
                <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] gap-6 items-center">
                  <AttendanceRadar subjects={summary.subjects} required={summary.required_percentage} />
                  <ul className="space-y-3">
                    {summary.subjects.map((s) => {
                      const c = pctColor(s.percentage)
                      return (
                        <li key={s.subject} className="flex items-center justify-between gap-3 font-body text-sm">
                          <span className="text-slate-700">{s.subject}</span>
                          <span className={`${c.text} whitespace-nowrap`}>
                            {s.present}/{s.total} · {s.percentage}%
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : (
                <div className="space-y-4">
                  {summary.subjects.map((s) => {
                    const c = pctColor(s.percentage)
                    return (
                      <div key={s.subject}>
                        <div className="flex justify-between font-body text-sm">
                          <span className="text-slate-700">{s.subject}</span>
                          <span className={c.text}>
                            {s.present}/{s.total} · {s.percentage}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div className={`h-full ${c.bar}`} style={{ width: `${Math.min(s.percentage, 100)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Monthly calendar with day details */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg text-slate-900">Monthly attendance</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => shiftMonth(-1)}
                    className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                    aria-label="Previous month"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="font-body text-sm text-slate-800 w-36 text-center">
                    {MONTHS[monthView.month - 1]} {monthView.year}
                  </span>
                  <button
                    onClick={() => shiftMonth(1)}
                    className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                    aria-label="Next month"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              <p className="font-body text-sm text-slate-500 mb-4">
                {monthData && monthData.total_classes > 0
                  ? `${monthData.present} of ${monthData.total_classes} classes attended (${monthData.percentage}%)`
                  : 'No classes recorded this month.'}
              </p>

              <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] gap-6">
                {/* calendar */}
                <div>
                  <div className="grid grid-cols-7 gap-1.5 text-center">
                    {WEEKDAYS.map((w) => (
                      <div key={w} className="font-body text-xs text-slate-400 pb-1">{w}</div>
                    ))}
                    {cells.map((day, i) => {
                      if (day === null) return <div key={`e${i}`} />
                      const info = dayStatus[day]
                      const style = DAY_STYLE[info ? info.status : 'none']
                      const isSelected = selectedDay === day
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setSelectedDay(day)}
                          className={`rounded-md border py-2 font-body text-sm transition-shadow hover:ring-2 hover:ring-purple-300 ${style} ${
                            isSelected ? 'ring-2 ring-purple-600' : ''
                          }`}
                        >
                          {day}
                        </button>
                      )
                    })}
                  </div>

                  <div className="flex flex-wrap gap-4 mt-4 font-body text-xs text-slate-500">
                    <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded bg-green-200 inline-block" /> All present</span>
                    <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded bg-amber-200 inline-block" /> Some missed</span>
                    <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded bg-red-200 inline-block" /> All absent</span>
                    <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded bg-slate-100 inline-block" /> No class</span>
                  </div>
                </div>

                {/* day details */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 self-start">
                  {!selectedDay && (
                    <p className="font-body text-sm text-slate-500">
                      Click a date on the calendar to see which classes you attended or missed that day.
                    </p>
                  )}

                  {selectedDay && (
                    <>
                      <p className="font-display text-base text-slate-900">{selectedLabel}</p>

                      {!selectedInfo && (
                        <p className="font-body text-sm text-slate-500 mt-2">No classes were held on this day.</p>
                      )}

                      {selectedInfo && (
                        <>
                          <p className="font-body text-xs text-slate-500 mt-1">
                            {selectedInfo.present} present · {selectedInfo.absent} absent
                          </p>
                          <ul className="mt-3 space-y-2">
                            {selectedInfo.classes.map((c, i) => (
                              <li
                                key={`${c.subject}-${i}`}
                                className="flex items-center justify-between gap-3 rounded-md bg-white border border-slate-200 px-3 py-2"
                              >
                                <span className="font-body text-sm text-slate-700">{c.subject}</span>
                                <span
                                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                    c.status === 'present' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                  }`}
                                >
                                  {c.status === 'present' ? 'Present' : 'Absent'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Overall attendance between two dates */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="font-display text-lg text-slate-900 mb-4">Overall attendance by date range</h2>

              <form onSubmit={handleRange} className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="font-body text-sm text-slate-600 mb-1 block">From</label>
                  <input
                    type="date"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="font-body text-sm text-slate-600 mb-1 block">To</label>
                  <input
                    type="date"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className={INPUT}
                  />
                </div>
                <button
                  type="submit"
                  disabled={rangeLoading}
                  className="rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-5 py-2.5 disabled:opacity-60"
                >
                  {rangeLoading ? 'Checking…' : 'Show attendance'}
                </button>
              </form>

              {rangeError && <p className="font-body text-sm text-red-600 mt-3">{rangeError}</p>}

              {rangeData && (
                <div className="mt-6">
                  <p className="font-body text-sm text-slate-500">
                    {fmtDate(rangeData.start)} to {fmtDate(rangeData.end)}
                  </p>

                  {rangeData.total_classes === 0 ? (
                    <p className="font-body text-sm text-slate-500 mt-3">
                      No classes were recorded between these dates.
                    </p>
                  ) : (
                    <>
                      <RangeStats data={rangeData} />

                      <h3 className="font-display text-base text-slate-900 mt-6 mb-3">Subject-wise in this period</h3>
                      <ul className="space-y-2">
                        {rangeData.subjects.map((s) => {
                          const c = pctColor(s.percentage)
                          return (
                            <li
                              key={s.subject}
                              className="flex items-center justify-between gap-3 font-body text-sm border-b border-slate-100 pb-2 last:border-0"
                            >
                              <span className="text-slate-700">{s.subject}</span>
                              <span className={`${c.text} whitespace-nowrap`}>
                                {s.present} present · {s.total - s.present} absent · {s.percentage}%
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* One subject between two dates */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="font-display text-lg text-slate-900 mb-4">Subject attendance by date range</h2>

              <form onSubmit={handleSubjectRange} className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="font-body text-sm text-slate-600 mb-1 block">Subject</label>
                  <input
                    type="text"
                    list="attendance-subjects"
                    value={subjectName}
                    onChange={(e) => setSubjectName(e.target.value)}
                    placeholder="Type or choose a subject"
                    className={`${INPUT} w-60`}
                  />
                  <datalist id="attendance-subjects">
                    {summary.subjects.map((s) => (
                      <option key={s.subject} value={s.subject} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="font-body text-sm text-slate-600 mb-1 block">From</label>
                  <input
                    type="date"
                    value={subStart}
                    onChange={(e) => setSubStart(e.target.value)}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="font-body text-sm text-slate-600 mb-1 block">To</label>
                  <input
                    type="date"
                    value={subEnd}
                    onChange={(e) => setSubEnd(e.target.value)}
                    className={INPUT}
                  />
                </div>
                <button
                  type="submit"
                  disabled={subLoading}
                  className="rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-5 py-2.5 disabled:opacity-60"
                >
                  {subLoading ? 'Checking…' : 'Show subject attendance'}
                </button>
              </form>

              {subError && <p className="font-body text-sm text-red-600 mt-3">{subError}</p>}

              {subData && (
                <div className="mt-6">
                  <p className="font-body text-sm text-slate-500">
                    <span className="text-slate-800 font-medium">{subData.subject}</span> ·{' '}
                    {fmtDate(subData.start)} to {fmtDate(subData.end)}
                  </p>

                  {subData.total_classes === 0 ? (
                    <p className="font-body text-sm text-slate-500 mt-3">
                      No classes of "{subData.subject}" were recorded between these dates. Check the subject name
                      or choose one from the suggestions.
                    </p>
                  ) : (
                    <>
                      <RangeStats data={subData} />

                      <h3 className="font-display text-base text-slate-900 mt-6 mb-3">Date-wise</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full font-body text-sm">
                          <thead>
                            <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                              <th className="py-2 font-normal">Date</th>
                              <th className="py-2 font-normal">Day</th>
                              <th className="py-2 font-normal">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {subData.records.map((r, i) => (
                              <tr key={`${r.date}-${i}`} className="border-b border-slate-50 last:border-0">
                                <td className="py-2.5 text-slate-800">{fmtDate(r.date)}</td>
                                <td className="py-2.5 text-slate-500">{weekdayOf(r.date)}</td>
                                <td className="py-2.5">
                                  <span
                                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                      r.status === 'present' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                    }`}
                                  >
                                    {r.status === 'present' ? 'Present' : 'Absent'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}