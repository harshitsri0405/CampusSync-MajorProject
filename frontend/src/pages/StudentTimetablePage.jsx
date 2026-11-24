import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, MapPin, User } from 'lucide-react'
import { getTimetableOverview, seedDemoTimetable } from '../api.js'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const TABS = [
  { key: 'weekly', label: 'Weekly Timetable' },
  { key: 'daily', label: 'Daily Timetable' },
  { key: 'exams', label: 'Exam Schedule' },
  { key: 'practical', label: 'Practical Schedule' },
]

const DATE_INPUT =
  'rounded-md border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500'

function fmtTime(t) {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function startOfToday() {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}
function termDate(s) {
  return parseDate(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
// YYYY-MM-DD in the user's own timezone (what <input type="date"> uses)
function toInputDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

// Monday = 0 ... Sunday = 6 (same numbering the backend uses for day_of_week)
function weekdayIndex(s) {
  return (parseDate(s).getDay() + 6) % 7
}

function longDate(s) {
  return parseDate(s).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-xl border border-slate-200 p-6 ${className}`}>{children}</div>
}

function ClassCard({ e }) {
  return (
    <div
      className={`rounded-lg border px-2.5 py-2 ${
        e.kind === 'practical' ? 'bg-orange-50 border-orange-200' : 'bg-purple-50 border-purple-100'
      }`}
    >
      <p className="font-body text-[11px] text-slate-500">
        {fmtTime(e.start_time)} – {fmtTime(e.end_time)}
      </p>
      <p className="font-body text-sm text-slate-900 font-medium leading-snug">{e.subject}</p>
      {e.faculty_name && (
        <p className="font-body text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
          <User size={10} /> {e.faculty_name}
        </p>
      )}
      {e.room && (
        <p className="font-body text-[11px] text-slate-500 flex items-center gap-1">
          <MapPin size={10} /> {e.room}
        </p>
      )}
    </div>
  )
}

function DateFilter({ value, onChange }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="font-body text-sm text-slate-600 mb-1 block">Search by date</label>
        <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={DATE_INPUT} />
      </div>
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 font-body text-sm text-slate-600 hover:bg-slate-50"
        >
          Show all
        </button>
      )}
    </div>
  )
}

export default function StudentTimetablePage({ session, onBack }) {
  const token = session.access_token
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('weekly')
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState('')

  // date search state (one per section)
  const [dailyDate, setDailyDate] = useState(toInputDate(new Date()))
  const [examDate, setExamDate] = useState('')
  const [pracDate, setPracDate] = useState('')

  async function load() {
    setData(await getTimetableOverview(token))
  }

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function handleSeed() {
    setSeeding(true)
    setError('')
    try {
      await seedDemoTimetable(token)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSeeding(false)
    }
  }

  function shiftDaily(delta) {
    const d = dailyDate ? parseDate(dailyDate) : startOfToday()
    d.setDate(d.getDate() + delta)
    setDailyDate(toInputDate(d))
  }

  const entries = data ? data.entries : []
  const exams = data ? data.exams : []
  const hasData = data && data.class_known && (entries.length > 0 || exams.length > 0)
  const term = data ? data.term : null
  const termEnded = !!term && term.status === 'ended'

  const today = startOfToday()
  const todayIndex = (new Date().getDay() + 6) % 7 // Monday = 0

  const byDay = DAYS.map((_, d) => entries.filter((e) => e.day === d))
  const visibleDays = [0, 1, 2, 3, 4].concat([5, 6].filter((d) => byDay[d].length > 0))

  const upcoming = exams.filter((x) => parseDate(x.exam_date) >= today)
  const past = exams.filter((x) => parseDate(x.exam_date) < today)
  const nextExam = upcoming[0]
  const daysLeft = nextExam ? Math.round((parseDate(nextExam.exam_date) - today) / 86400000) : null

  const practicals = entries.filter((e) => e.kind === 'practical')

  // daily timetable
  const dayEntries = dailyDate ? entries.filter((e) => e.day === weekdayIndex(dailyDate)) : []
  const dayExams = dailyDate ? exams.filter((x) => x.exam_date === dailyDate) : []

  // exam / practical search results
  const examMatches = examDate ? exams.filter((x) => x.exam_date === examDate) : []
  const pracMatches = pracDate ? practicals.filter((e) => e.day === weekdayIndex(pracDate)) : []

  function examRow(x, i, isPast) {
    const d = parseDate(x.exam_date)
    return (
      <tr
        key={`${x.subject}-${x.exam_date}-${i}`}
        className={`border-b border-slate-50 last:border-0 ${isPast ? 'opacity-50' : ''}`}
      >
        <td className="py-2.5 text-slate-800">
          {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </td>
        <td className="py-2.5 text-slate-500">{d.toLocaleDateString('en-IN', { weekday: 'long' })}</td>
        <td className="py-2.5 text-slate-800 font-medium">{x.subject}</td>
        <td className="py-2.5 text-slate-600">{x.exam_type}</td>
        <td className="py-2.5 text-slate-600 whitespace-nowrap">
          {fmtTime(x.start_time)} – {fmtTime(x.end_time)}
        </td>
        <td className="py-2.5 text-slate-600">{x.venue || '—'}</td>
      </tr>
    )
  }

  function examTable(rows) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
              <th className="py-2 font-normal">Date</th>
              <th className="py-2 font-normal">Day</th>
              <th className="py-2 font-normal">Subject</th>
              <th className="py-2 font-normal">Exam</th>
              <th className="py-2 font-normal">Time</th>
              <th className="py-2 font-normal">Venue</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    )
  }

  function practicalTable(list) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
              <th className="py-2 font-normal">Day</th>
              <th className="py-2 font-normal">Time</th>
              <th className="py-2 font-normal">Lab / Subject</th>
              <th className="py-2 font-normal">Venue</th>
              <th className="py-2 font-normal">Faculty</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e, i) => (
              <tr key={`${e.subject}-${e.day}-${i}`} className="border-b border-slate-50 last:border-0">
                <td className="py-2.5 text-slate-800">
                  {DAYS[e.day]}
                  {e.day === todayIndex && (
                    <span className="ml-2 rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-[10px] font-medium">
                      Today
                    </span>
                  )}
                </td>
                <td className="py-2.5 text-slate-600 whitespace-nowrap">
                  {fmtTime(e.start_time)} – {fmtTime(e.end_time)}
                </td>
                <td className="py-2.5 text-slate-800 font-medium">{e.subject}</td>
                <td className="py-2.5 text-slate-600">{e.room || '—'}</td>
                <td className="py-2.5 text-slate-600">{e.faculty_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
        <h1 className="font-display text-lg text-slate-900 ml-2">Timetable</h1>
        {data && data.class_known && (
          <span className="font-body text-sm text-slate-500 ml-auto">
            {data.course} · Semester {data.semester}
          </span>
        )}
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {loading && <p className="font-body text-slate-400">Loading timetable…</p>}
        {error && <p className="font-body text-sm text-red-600">{error}</p>}

        {!loading && data && !data.class_known && (
          <Card className="text-center p-8">
            <p className="font-display text-lg text-slate-900">Your class is not set yet</p>
            <p className="font-body text-sm text-slate-500 mt-2 max-w-md mx-auto">
              The timetable is made for a class. Open <strong>Student Profile</strong>, fill in your
              <strong> Course</strong> and <strong>Semester</strong> under Academic Information, then come back here.
            </p>
          </Card>
        )}

                {!loading && data && data.class_known && termEnded && (
          <Card className="text-center p-8">
            <p className="font-display text-lg text-slate-900">Semester {data.semester} has ended</p>
            <p className="font-body text-sm text-slate-500 mt-2 max-w-md mx-auto">
              The semester ended on {termDate(term.end_date)}, so its timetable is no longer shown. The timetable of
              your next semester will appear here once the admin publishes it. Update your Semester in Student
              Profile when you move to the next one.
            </p>
          </Card>
        )}

      

        {!loading && data && data.class_known && !hasData && (
          <Card className="text-center p-8">
            <p className="font-display text-lg text-slate-900">No timetable published yet</p>
            <p className="font-body text-sm text-slate-500 mt-2 max-w-md mx-auto">
              The timetable for {data.course}, Semester {data.semester} will appear here once the admin
              publishes it. Until then you can load a sample timetable to try this screen.
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
          {term && (
              <div
                className={`rounded-lg border px-4 py-2 font-body text-sm ${
                  term.status === 'running'
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                {term.status === 'running'
                  ? `Semester ${data.semester} is running: ${termDate(term.start_date)} to ${termDate(term.end_date)} (${
                      term.days_left === 0 ? 'last day' : `${term.days_left} days left`
                    })`
                  : `Semester ${data.semester} starts on ${termDate(term.start_date)}.`}
              </div>
            )}

          <>
            <div className="flex flex-wrap gap-1 border-b border-slate-200">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-2.5 font-body text-sm -mb-px border-b-2 ${
                    tab === t.key
                      ? 'border-purple-600 text-purple-700 font-medium'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ---------------- Weekly timetable ---------------- */}
            {tab === 'weekly' && (
              <>
                <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {visibleDays.map((d) => {
                    const isToday = d === todayIndex
                    return (
                      <div
                        key={d}
                        className={`rounded-xl border p-3 bg-white ${
                          isToday ? 'border-purple-400 ring-1 ring-purple-300' : 'border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-display text-base text-slate-900">{DAYS[d]}</p>
                          {isToday && (
                            <span className="rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-[10px] font-medium">
                              Today
                            </span>
                          )}
                        </div>

                        {byDay[d].length === 0 && <p className="font-body text-xs text-slate-400">No classes</p>}

                        <div className="space-y-2">
                          {byDay[d].map((e, i) => (
                            <ClassCard key={`${e.subject}-${e.start_time}-${i}`} e={e} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="flex gap-4 font-body text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <i className="w-3 h-3 rounded bg-purple-100 border border-purple-200 inline-block" /> Lecture
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="w-3 h-3 rounded bg-orange-100 border border-orange-200 inline-block" /> Practical / Lab
                  </span>
                </div>
              </>
            )}

            {/* ---------------- Daily timetable (search by date) ---------------- */}
            {tab === 'daily' && (
              <>
                <Card>
                  <div className="flex flex-wrap items-end gap-3">
                    <button
                      type="button"
                      onClick={() => shiftDaily(-1)}
                      className="p-2 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                      aria-label="Previous day"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <div>
                      <label className="font-body text-sm text-slate-600 mb-1 block">Choose a date</label>
                      <input
                        type="date"
                        value={dailyDate}
                        onChange={(e) => setDailyDate(e.target.value)}
                        className={DATE_INPUT}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => shiftDaily(1)}
                      className="p-2 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                      aria-label="Next day"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDailyDate(toInputDate(new Date()))}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 font-body text-sm text-slate-600 hover:bg-slate-50"
                    >
                      Today
                    </button>
                  </div>
                </Card>

                {!dailyDate && (
                  <Card className="text-center">
                    <p className="font-body text-sm text-slate-500">Choose a date to see that day's timetable.</p>
                  </Card>
                )}

                {dailyDate && (
                  <Card>
                    <p className="font-display text-lg text-slate-900">{longDate(dailyDate)}</p>
                    <p className="font-body text-xs text-slate-500 mt-1">
                      {dayEntries.length} {dayEntries.length === 1 ? 'class' : 'classes'}
                    </p>

                    {dayExams.length > 0 && (
                      <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-3">
                        <p className="font-body text-xs text-purple-700">Exam on this day</p>
                        {dayExams.map((x, i) => (
                          <p key={`${x.subject}-${i}`} className="font-body text-sm text-slate-800 mt-1">
                            {x.subject} · {x.exam_type} · {fmtTime(x.start_time)} – {fmtTime(x.end_time)}
                            {x.venue ? ` · ${x.venue}` : ''}
                          </p>
                        ))}
                      </div>
                    )}

                    {dayEntries.length === 0 ? (
                      <p className="font-body text-sm text-slate-500 mt-4">
                        No classes are scheduled on this day ({DAYS[weekdayIndex(dailyDate)]}).
                      </p>
                    ) : (
                      <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {dayEntries.map((e, i) => (
                          <ClassCard key={`${e.subject}-${e.start_time}-${i}`} e={e} />
                        ))}
                      </div>
                    )}
                  </Card>
                )}
              </>
            )}

            {/* ---------------- Exam schedule (search by date) ---------------- */}
            {tab === 'exams' && (
              <>
                <Card>
                  <DateFilter value={examDate} onChange={setExamDate} />
                </Card>

                {examDate && examMatches.length === 0 && (
                  <Card className="text-center">
                    <p className="font-body text-sm text-slate-500">No exam on {longDate(examDate)}.</p>
                  </Card>
                )}

                {examDate && examMatches.length > 0 && (
                  <Card>
                    <p className="font-body text-sm text-slate-500 mb-3">Exams on {longDate(examDate)}</p>
                    {examTable(examMatches.map((x, i) => examRow(x, i, false)))}
                  </Card>
                )}

                {!examDate && (
                  <>
                    {exams.length === 0 && (
                      <Card className="text-center">
                        <p className="font-body text-sm text-slate-500">No exams are scheduled for your class yet.</p>
                      </Card>
                    )}

                    {nextExam && (
                      <div className="rounded-xl border border-purple-200 bg-purple-50 p-5">
                        <p className="font-body text-xs text-purple-700">Next exam</p>
                        <p className="font-display text-xl text-slate-900 mt-1">
                          {nextExam.subject} · {nextExam.exam_type}
                        </p>
                        <p className="font-body text-sm text-slate-600 mt-1">
                          {daysLeft === 0 ? 'Today' : daysLeft === 1 ? 'Tomorrow' : `In ${daysLeft} days`} ·{' '}
                          {fmtTime(nextExam.start_time)} · {nextExam.venue || 'Venue to be announced'}
                        </p>
                      </div>
                    )}

                    {exams.length > 0 && (
                      <Card>
                        {examTable([
                          ...upcoming.map((x, i) => examRow(x, i, false)),
                          ...past.map((x, i) => examRow(x, i + upcoming.length, true)),
                        ])}
                        {past.length > 0 && (
                          <p className="font-body text-xs text-slate-400 mt-3">
                            Faded rows are exams that are already over.
                          </p>
                        )}
                      </Card>
                    )}
                  </>
                )}
              </>
            )}

            {/* ---------------- Practical schedule (search by date) ---------------- */}
            {tab === 'practical' && (
              <>
                <Card>
                  <DateFilter value={pracDate} onChange={setPracDate} />
                </Card>

                {pracDate && pracMatches.length === 0 && (
                  <Card className="text-center">
                    <p className="font-body text-sm text-slate-500">
                      No practical session on {longDate(pracDate)}.
                    </p>
                  </Card>
                )}

                {pracDate && pracMatches.length > 0 && (
                  <Card>
                    <p className="font-body text-sm text-slate-500 mb-3">
                      Practical sessions on {longDate(pracDate)}
                    </p>
                    {practicalTable(pracMatches)}
                  </Card>
                )}

                {!pracDate && (
                  <Card>
                    {practicals.length === 0 ? (
                      <p className="font-body text-sm text-slate-500 text-center">
                        No practical sessions are scheduled for your class.
                      </p>
                    ) : (
                      practicalTable(practicals)
                    )}
                  </Card>
                )}
              </>
            )}
          </>
        )
      </div>
    </div>
  )
}