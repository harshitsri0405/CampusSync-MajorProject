import { useEffect, useState } from 'react'
import { ArrowLeft, Printer } from 'lucide-react'
import { getResultsOverview, seedDemoResults, getStudentProfile } from '../api.js'
import StudentExamCopies from './StudentExamCopies.jsx'
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'internal', label: 'Internal Marks' },
  { key: 'results', label: 'Semester Results' },
  { key: 'gradecard', label: 'Grade Card' },
]

function gradeStyle(grade) {
  if (!grade) return 'bg-slate-100 text-slate-400'
  if (grade === 'F') return 'bg-red-100 text-red-700'
  if (grade === 'O' || grade === 'A+') return 'bg-green-100 text-green-700'
  if (grade === 'A' || grade === 'B+') return 'bg-purple-100 text-purple-700'
  return 'bg-amber-100 text-amber-700'
}

const STATUS = {
  pass: { label: 'Pass', cls: 'bg-green-100 text-green-700' },
  fail: { label: 'Fail', cls: 'bg-red-100 text-red-700' },
  in_progress: { label: 'Result pending', cls: 'bg-amber-100 text-amber-700' },
}

function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-xl border border-slate-200 p-6 ${className}`}>{children}</div>
}

function Stat({ label, value, hint }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="font-body text-xs text-slate-400">{label}</p>
      <p className="font-display text-3xl mt-1 text-slate-900">{value}</p>
      {hint && <p className="font-body text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

function SemesterPicker({ semesters, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {semesters.map((s) => (
        <button
          key={s.semester}
          onClick={() => onChange(s.semester)}
          className={`rounded-full px-4 py-1.5 font-body text-sm border ${
            value === s.semester
              ? 'bg-purple-600 border-purple-600 text-white'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Semester {s.semester}
        </button>
      ))}
    </div>
  )
}

export default function StudentResultsPage({ session, onBack }) {
  const token = session.access_token
  const [data, setData] = useState(null)
  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState('overview')
  const [semester, setSemester] = useState(null)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const d = await getResultsOverview(token)
    setData(d)
    if (d.semesters.length) {
      setSemester((cur) =>
        d.semesters.some((s) => s.semester === cur) ? cur : d.semesters[d.semesters.length - 1].semester
      )
    }
  }

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
    getStudentProfile(token).then(setProfile).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function handleSeed() {
    setSeeding(true)
    setError('')
    try {
      await seedDemoResults(token)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSeeding(false)
    }
  }

  const hasData = data && data.semesters.length > 0
  const current = hasData ? data.semesters.find((s) => s.semester === semester) : null
  const completed = hasData ? data.semesters.filter((s) => s.status !== 'in_progress') : []

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="w-full bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-body text-sm"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="font-display text-lg text-slate-900 ml-2">Results</h1>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {loading && <p className="font-body text-slate-400">Loading results…</p>}
        {error && <p className="font-body text-sm text-red-600">{error}</p>}

        {!loading && data && !hasData && (
          <Card className="text-center p-8">
            <p className="font-display text-lg text-slate-900">No results published yet</p>
            <p className="font-body text-sm text-slate-500 mt-2 max-w-md mx-auto">
              Marks appear here once your faculty enters them and the results are published. Until the
              Faculty and Admin modules are live you can load sample data to try this screen.
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

            {/* ---------------- Overview ---------------- */}
            {tab === 'overview' && (
              <>
                <div className="grid sm:grid-cols-4 gap-4">
                  <Stat label="CGPA" value={data.cgpa ?? '—'} hint="out of 10" />
                  <Stat
                    label="Latest SGPA"
                    value={completed.length ? completed[completed.length - 1].sgpa : '—'}
                    hint={completed.length ? `Semester ${completed[completed.length - 1].semester}` : ''}
                  />
                  <Stat label="Credits earned" value={data.earned_credits} hint={`of ${data.total_credits} completed`} />
                  <Stat label="Semesters completed" value={completed.length} hint={`of ${data.semesters.length} listed`} />
                </div>

                <Card>
                  <h2 className="font-display text-lg text-slate-900 mb-5">SGPA by semester</h2>
                  <div className="flex items-end gap-6 h-48 border-b border-slate-200 px-2">
                    {data.semesters.map((s) => (
                      <div key={s.semester} className="flex-1 max-w-24 flex flex-col items-center justify-end h-full">
                        {s.sgpa !== null ? (
                          <>
                            <span className="font-body text-sm text-slate-700 mb-1">{s.sgpa}</span>
                            <div
                              className={`w-full rounded-t-md ${s.status === 'fail' ? 'bg-red-400' : 'bg-purple-500'}`}
                              style={{ height: `${(s.sgpa / 10) * 100}%` }}
                              title={`Semester ${s.semester}: SGPA ${s.sgpa}`}
                            />
                          </>
                        ) : (
                          <div className="w-full h-16 rounded-t-md border border-dashed border-slate-300 flex items-center justify-center">
                            <span className="font-body text-xs text-slate-400">Pending</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-6 px-2 mt-2">
                    {data.semesters.map((s) => (
                      <div key={s.semester} className="flex-1 max-w-24 text-center font-body text-xs text-slate-500">
                        Sem {s.semester}
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <h2 className="font-display text-lg text-slate-900 mb-4">Grading scale</h2>
                  <div className="flex flex-wrap gap-3">
                    {data.grade_scale.map((g, i) => {
                      const upper = i === 0 ? 100 : data.grade_scale[i - 1].min_marks - 1
                      return (
                        <div key={g.grade} className="rounded-lg border border-slate-200 px-3 py-2 text-center min-w-20">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${gradeStyle(g.grade)}`}>
                            {g.grade}
                          </span>
                          <p className="font-body text-xs text-slate-500 mt-1.5">
                            {g.min_marks}–{upper}
                          </p>
                          <p className="font-body text-xs text-slate-400">{g.points} points</p>
                        </div>
                      )
                    })}
                  </div>
                  <p className="font-body text-xs text-slate-400 mt-3">
                    Pass mark is {data.pass_marks} out of 100 (internal {data.internal_max} + external {data.external_max}).
                    SGPA = sum of (grade points × credits) ÷ total credits.
                  </p>
                </Card>
              </>
            )}

            {/* ---------------- Internal marks ---------------- */}
            {tab === 'internal' && (
              <Card>
                <SemesterPicker semesters={data.semesters} value={semester} onChange={setSemester} />
                {current && (
                  <>
                    <div className="space-y-4">
                      {current.subjects.map((s) => {
                        const pct = s.internal_marks === null ? 0 : (s.internal_marks / data.internal_max) * 100
                        return (
                          <div key={s.subject}>
                            <div className="flex justify-between font-body text-sm">
                              <span className="text-slate-700">{s.subject}</span>
                              <span className="text-slate-600">
                                {s.internal_marks === null ? 'Not entered' : `${s.internal_marks} / ${data.internal_max}`}
                              </span>
                            </div>
                            <div className="mt-1.5 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full ${pct >= 60 ? 'bg-purple-500' : 'bg-amber-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <p className="font-body text-xs text-slate-400 mt-5">
                      Internal marks are out of {data.internal_max} and count towards your final total.
                    </p>
                                        <StudentExamCopies token={token} semester={semester} />
                  </>
                )}
              </Card>
            )}

            {/* ---------------- Semester results ---------------- */}
            {tab === 'results' && (
              <Card>
                <SemesterPicker semesters={data.semesters} value={semester} onChange={setSemester} />
                {current && (
                  <>
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS[current.status].cls}`}>
                        {STATUS[current.status].label}
                      </span>
                      {current.sgpa !== null && (
                        <span className="font-body text-sm text-slate-700">
                          SGPA <strong className="font-display text-lg text-slate-900">{current.sgpa}</strong>
                        </span>
                      )}
                      <span className="font-body text-sm text-slate-500">
                        Credits {current.status === 'in_progress' ? current.credits : `${current.earned_credits}/${current.credits}`}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full font-body text-sm">
                        <thead>
                          <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                            <th className="py-2 font-normal">Subject</th>
                            <th className="py-2 font-normal text-right">Credits</th>
                            <th className="py-2 font-normal text-right">Internal /{data.internal_max}</th>
                            <th className="py-2 font-normal text-right">External /{data.external_max}</th>
                            <th className="py-2 font-normal text-right">Total /100</th>
                            <th className="py-2 font-normal text-center">Grade</th>
                            <th className="py-2 font-normal text-right">Points</th>
                          </tr>
                        </thead>
                        <tbody>
                          {current.subjects.map((s) => (
                            <tr key={s.subject} className="border-b border-slate-50 last:border-0">
                              <td className="py-2.5 text-slate-700">{s.subject}</td>
                              <td className="py-2.5 text-right text-slate-600">{s.credits}</td>
                              <td className="py-2.5 text-right text-slate-600">{s.internal_marks ?? '—'}</td>
                              <td className="py-2.5 text-right text-slate-600">{s.external_marks ?? '—'}</td>
                              <td className="py-2.5 text-right text-slate-800 font-medium">{s.total ?? '—'}</td>
                              <td className="py-2.5 text-center">
                                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${gradeStyle(s.grade)}`}>
                                  {s.grade ?? '—'}
                                </span>
                              </td>
                              <td className="py-2.5 text-right text-slate-600">{s.grade_points ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {current.status === 'in_progress' && (
                      <p className="font-body text-xs text-slate-400 mt-4">
                        External marks and grades appear after the exam results are declared.
                      </p>
                    )}
                  </>
                )}
              </Card>
            )}

            {/* ---------------- Grade card ---------------- */}
            {tab === 'gradecard' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <SemesterPicker semesters={data.semesters} value={semester} onChange={setSemester} />
                  {current && current.status !== 'in_progress' && (
                    <button
                      onClick={() => window.print()}
                      className="mb-5 flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 font-body text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Printer size={14} /> Print / Save as PDF
                    </button>
                  )}
                </div>

                {current && current.status === 'in_progress' && (
                  <Card className="text-center">
                    <p className="font-body text-sm text-slate-500">
                      The grade card for Semester {current.semester} will be available once all results are declared.
                    </p>
                  </Card>
                )}

                {current && current.status !== 'in_progress' && (
                  <div className="print-area bg-white rounded-xl border border-slate-300 p-8">
                    <div className="text-center border-b border-slate-200 pb-4">
                      <p className="font-display text-2xl text-slate-900">
                        Campus<span className="text-purple-600">Sync</span>
                      </p>
                      <p className="font-body text-sm text-slate-500 mt-1">Grade Card · Semester {current.semester}</p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 py-4 font-body text-sm">
                      <p><span className="text-slate-400">Name: </span><span className="text-slate-800">{profile?.name || session.display_name}</span></p>
                      <p><span className="text-slate-400">College ID: </span><span className="text-slate-800">{profile?.college_id || '—'}</span></p>
                      <p><span className="text-slate-400">Course: </span><span className="text-slate-800">{profile?.course || '—'}</span></p>
                      <p><span className="text-slate-400">Department: </span><span className="text-slate-800">{profile?.department || '—'}</span></p>
                    </div>

                    <table className="w-full font-body text-sm border-t border-slate-200">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                          <th className="py-2 font-medium">Subject</th>
                          <th className="py-2 font-medium text-right">Credits</th>
                          <th className="py-2 font-medium text-right">Total /100</th>
                          <th className="py-2 font-medium text-center">Grade</th>
                          <th className="py-2 font-medium text-right">Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {current.subjects.map((s) => (
                          <tr key={s.subject} className="border-b border-slate-100">
                            <td className="py-2 text-slate-800">{s.subject}</td>
                            <td className="py-2 text-right text-slate-700">{s.credits}</td>
                            <td className="py-2 text-right text-slate-700">{s.total}</td>
                            <td className="py-2 text-center text-slate-800 font-medium">{s.grade}</td>
                            <td className="py-2 text-right text-slate-700">{s.grade_points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="flex flex-wrap justify-between gap-4 mt-5 font-body text-sm">
                      <p><span className="text-slate-400">SGPA: </span><strong className="text-slate-900">{current.sgpa}</strong></p>
                      <p><span className="text-slate-400">CGPA: </span><strong className="text-slate-900">{data.cgpa}</strong></p>
                      <p><span className="text-slate-400">Credits earned: </span><strong className="text-slate-900">{current.earned_credits}/{current.credits}</strong></p>
                      <p><span className="text-slate-400">Result: </span><strong className="text-slate-900">{STATUS[current.status].label}</strong></p>
                    </div>

                    <p className="font-body text-xs text-slate-400 mt-6 pt-3 border-t border-slate-100">
                      This is a computer-generated grade card from CampusSync and is not an official transcript.
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
