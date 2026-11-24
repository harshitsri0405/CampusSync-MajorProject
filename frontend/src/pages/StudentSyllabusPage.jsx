import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, Search } from 'lucide-react'
import {
  getSyllabus,
  seedDemoSyllabus,
  downloadSyllabusPdf,
} from '../api.js'

const TABS = [
  { key: 'semester', label: 'Semester-wise Syllabus' },
  { key: 'subject', label: 'Subject-wise Syllabus' },
]

const TYPE = {
  theory: { label: 'Theory', cls: 'bg-purple-100 text-purple-700' },
  practical: { label: 'Practical', cls: 'bg-orange-100 text-orange-700' },
}

const typeOf = (type) => TYPE[type] || TYPE.theory

const marksOrDash = (value) => value == null ? '—' : value

const totalMarks = (subject) =>
  subject.internal_marks == null && subject.external_marks == null
    ? '—'
    : Number(subject.internal_marks || 0) +
      Number(subject.external_marks || 0)

const safeName = (value) =>
  String(value || 'Subject')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-6 ${className}`}>
      {children}
    </div>
  )
}

function SemesterPicker({ semesters, value, current, onChange }) {
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {semesters.map((item) => (
        <button
          key={item.semester}
          type="button"
          onClick={() => onChange(item.semester)}
          className={`rounded-full border px-4 py-1.5 text-sm ${
            value === item.semester
              ? 'border-purple-600 bg-purple-600 text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          Semester {item.semester}
          {current === item.semester ? ' (current)' : ''}
        </button>
      ))}
    </div>
  )
}

function DownloadButton({
  token,
  semester,
  subjectId = null,
  fileName,
  label,
  hint,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleDownload() {
    if (!token || semester == null) {
      setError('Required download details are missing.')
      return
    }

    setBusy(true)
    setError('')

    try {
      await downloadSyllabusPdf(
        token,
        { semester, subjectId },
        fileName
      )
    } catch (err) {
      setError(err?.message || 'Could not download the PDF.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-60"
        >
          <Download size={14} />
          {busy ? 'Preparing the PDF…' : label}
        </button>

        {hint && (
          <span className="text-xs text-slate-400">
            {hint}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

function normalizeSyllabus(raw) {
  if (!raw || typeof raw !== 'object') return null

  return {
    ...raw,
    semesters: (Array.isArray(raw.semesters) ? raw.semesters : []).map(
      (semester) => ({
        ...semester,
        subjects: (
          Array.isArray(semester.subjects) ? semester.subjects : []
        ).map((subject) => ({
          ...subject,
          units: (
            Array.isArray(subject.units) ? subject.units : []
          ).map((unit) => ({
            ...unit,
            topics: Array.isArray(unit.topics) ? unit.topics : [],
          })),
          books: Array.isArray(subject.books) ? subject.books : [],
        })),
      })
    ),
  }
}

export default function StudentSyllabusPage({ session, onBack }) {
  const token = session?.access_token

  const [data, setData] = useState(null)
  const [tab, setTab] = useState('semester')
  const [semester, setSemester] = useState(null)
  const [subjectId, setSubjectId] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!token) {
      throw new Error('Please log in again.')
    }

    const result = normalizeSyllabus(await getSyllabus(token))

    setData(result)

    const numbers = (result?.semesters || []).map(
      (s) => s.semester
    )

    const initial = numbers.includes(result?.current_semester)
      ? result.current_semester
      : numbers[0] ?? null

    setSemester((current) =>
      numbers.includes(current) ? current : initial
    )
  }, [token])

  useEffect(() => {
    let active = true

    setLoading(true)
    setError('')

    load()
      .catch((err) => {
        if (active) {
          setError(err?.message || 'Unable to load syllabus.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [load])

  async function handleSeed() {
    setSeeding(true)
    setError('')

    try {
      await seedDemoSyllabus(token)
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to load sample data.')
    } finally {
      setSeeding(false)
    }
  }

  const semesters = data?.semesters || []

  const hasData = Boolean(
    data?.course_known && semesters.length
  )

  const currentSem =
    semesters.find(
      (s) => String(s.semester) === String(semester)
    ) || null

  const allSubjects = useMemo(
    () =>
      semesters.flatMap((s) =>
        s.subjects.map((subject) => ({
          ...subject,
          semester: s.semester,
        }))
      ),
    [semesters]
  )

  const q = search.trim().toLowerCase()

  const listForSubjectTab = q
    ? allSubjects.filter(
        (s) =>
          String(s.name || '').toLowerCase().includes(q) ||
          String(s.code || '').toLowerCase().includes(q)
      )
    : (currentSem?.subjects || []).map((s) => ({
        ...s,
        semester: currentSem.semester,
      }))

  const selected =
    allSubjects.find(
      (s) => String(s.id) === String(subjectId)
    ) ||
    (currentSem?.subjects?.[0]
      ? {
          ...currentSem.subjects[0],
          semester: currentSem.semester,
        }
      : null)

  const totalHours = (selected?.units || []).reduce(
    (total, unit) => total + (Number(unit.hours) || 0),
    0
  )

  function openSubject(subject) {
    setTab('subject')
    setSemester(subject.semester)
    setSubjectId(subject.id)
    setSearch('')
  }

  function pickSemesterForSubjects(value) {
    setSemester(value)
    setSubjectId(null)
    setSearch('')
  }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <header className="flex w-full items-center gap-3 border-b border-slate-200 bg-white px-6 py-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 className="ml-2 text-lg font-semibold text-slate-900">
          Syllabus
        </h1>

        {data?.course_known && (
          <span className="ml-auto text-sm text-slate-500">
            {data.course}
          </span>
        )}
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">

        {loading && (
          <p className="text-slate-500">
            Loading syllabus…
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {/* Course Not Set */}
        {!loading && data && !data.course_known && (
          <Card className="p-8 text-center">
            <h2 className="text-lg font-semibold">
              Your course is not set yet
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              Open Student Profile and fill in your Course
              under Academic Information, then come back here.
            </p>
          </Card>
        )}

        {/* No Syllabus */}
        {!loading && data?.course_known && !hasData && (
          <Card className="p-8 text-center">
            <h2 className="text-lg font-semibold">
              No syllabus published yet
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              The syllabus for {data.course} will appear here
              once published. You can load sample data to preview
              this screen.
            </p>

            <button
              type="button"
              onClick={handleSeed}
              disabled={seeding}
              className="mt-5 rounded-md bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
            >
              {seeding ? 'Loading…' : 'Load sample data'}
            </button>
          </Card>
        )}

        {/* Syllabus Content */}
        {hasData && (
          <>
            {/* Tabs */}
            <div className="flex flex-wrap gap-1 border-b border-slate-200">
              {TABS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={`-mb-px border-b-2 px-4 py-2.5 text-sm ${
                    tab === item.key
                      ? 'border-purple-600 font-medium text-purple-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Semester-wise Syllabus */}
            {tab === 'semester' && (
              <>
                <SemesterPicker
                  semesters={semesters}
                  value={semester}
                  current={data.current_semester}
                  onChange={setSemester}
                />

                {currentSem && (
                  <Card>
                    {/* Semester PDF Download */}
                    <div className="mb-5">
                      <DownloadButton
                        token={token}
                        semester={currentSem.semester}
                        fileName={`Syllabus_${safeName(data.course)}_Semester_${currentSem.semester}.pdf`}
                        label="Download full semester syllabus (PDF)"
                        hint="Includes the semester scheme and subject syllabi."
                      />
                    </div>

                    {/* Subject Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                            <th className="py-2 font-medium">Code</th>
                            <th className="py-2 font-medium">Subject</th>
                            <th className="py-2 font-medium">Type</th>
                            <th className="py-2 text-right font-medium">Credits</th>
                            <th className="py-2 text-right font-medium">Internal</th>
                            <th className="py-2 text-right font-medium">External</th>
                            <th className="py-2 text-right font-medium">Total</th>
                            <th className="py-2 text-right font-medium print:hidden" />
                          </tr>
                        </thead>

                        <tbody>
                          {currentSem.subjects.map((subject) => (
                            <tr
                              key={subject.id}
                              className="border-b border-slate-100 last:border-0"
                            >
                              <td className="py-2.5 font-mono text-xs text-slate-500">
                                {subject.code}
                              </td>

                              <td className="py-2.5 font-medium text-slate-900">
                                {subject.name}
                              </td>

                              <td className="py-2.5">
                                <span
                                  className={`rounded-full px-2.5 py-0.5 text-xs ${typeOf(subject.subject_type).cls}`}
                                >
                                  {typeOf(subject.subject_type).label}
                                </span>
                              </td>

                              <td className="py-2.5 text-right">
                                {subject.credits}
                              </td>

                              <td className="py-2.5 text-right">
                                {marksOrDash(subject.internal_marks)}
                              </td>

                              <td className="py-2.5 text-right">
                                {marksOrDash(subject.external_marks)}
                              </td>

                              <td className="py-2.5 text-right font-medium">
                                {totalMarks(subject)}
                              </td>

                              <td className="py-2.5 text-right print:hidden">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openSubject({
                                      ...subject,
                                      semester: currentSem.semester,
                                    })
                                  }
                                  className="text-purple-700 hover:text-purple-900"
                                >
                                  View
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <p className="mt-4 text-right text-sm text-slate-700">
                      Total credits:{' '}
                      <strong>
                        {currentSem.total_credits ?? '—'}
                      </strong>
                    </p>

                    {String(data.current_semester) ===
                      String(currentSem.semester) && (
                      <p className="mt-1 text-right text-xs text-purple-700 print:hidden">
                        This is your current semester.
                      </p>
                    )}
                  </Card>
                )}
              </>
            )}

            {/* Subject-wise Syllabus */}
            {tab === 'subject' && (
              <>
                <SemesterPicker
                  semesters={semesters}
                  value={semester}
                  current={data.current_semester}
                  onChange={pickSemesterForSubjects}
                />

                <div className="grid items-start gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">

                  {/* Subject List */}
                  <aside className="space-y-3">
                    <div className="relative">
                      <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />

                      <input
                        type="text"
                        value={search}
                        onChange={(event) =>
                          setSearch(event.target.value)
                        }
                        placeholder="Search subject or code"
                        className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    {listForSubjectTab.length === 0 && (
                      <p className="text-sm text-slate-500">
                        No subjects match your search.
                      </p>
                    )}

                    <div className="space-y-2">
                      {listForSubjectTab.map((subject) => (
                        <button
                          key={`${subject.semester}-${subject.id}`}
                          type="button"
                          onClick={() => openSubject(subject)}
                          className={`w-full rounded-lg border px-3 py-2.5 text-left ${
                            selected?.id === subject.id
                              ? 'border-purple-400 bg-purple-50'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <p className="text-sm font-medium leading-snug text-slate-900">
                            {subject.name}
                          </p>

                          <p className="mt-0.5 text-xs text-slate-500">
                            {subject.code} · {subject.credits} credits
                            {q ? ` · Semester ${subject.semester}` : ''}
                          </p>
                        </button>
                      ))}
                    </div>
                  </aside>

                  {/* Selected Subject Details */}
                  <section>
                    {!selected && (
                      <Card className="text-center">
                        <p className="text-sm text-slate-500">
                          Choose a subject to see its syllabus.
                        </p>
                      </Card>
                    )}

                    {selected && (
                      <>
                        {/* Subject PDF Download */}
                        <div className="mb-4">
                          <DownloadButton
                            token={token}
                            semester={selected.semester}
                            subjectId={selected.id}
                            fileName={`Syllabus_${safeName(selected.code)}.pdf`}
                            label="Download this subject (PDF)"
                          />
                        </div>

                        {/* Subject Syllabus */}
                        <div className="print-area rounded-xl border border-slate-200 bg-white p-6">

                          <div className="mb-4 border-b border-slate-200 pb-4 text-center">
                            <p className="text-2xl font-semibold text-slate-900">
                              Campus
                              <span className="text-purple-600">
                                Sync
                              </span>
                            </p>

                            <p className="mt-1 text-sm text-slate-500">
                              Subject Syllabus · {data.course} ·
                              Semester {selected.semester}
                            </p>
                          </div>

                          <p className="text-xs text-slate-500">
                            {selected.code}
                          </p>

                          <div className="flex flex-wrap items-center gap-3">
                            <h2 className="text-2xl font-semibold text-slate-900">
                              {selected.name}
                            </h2>

                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs ${typeOf(selected.subject_type).cls}`}
                            >
                              {typeOf(selected.subject_type).label}
                            </span>
                          </div>

                          {/* Subject Information */}
                          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {[
                              ['Credits', selected.credits],
                              ['Internal marks', marksOrDash(selected.internal_marks)],
                              ['External marks', marksOrDash(selected.external_marks)],
                              ['Total marks', totalMarks(selected)],
                            ].map(([label, value]) => (
                              <div
                                key={label}
                                className="rounded-lg border border-slate-200 p-3"
                              >
                                <p className="text-xs text-slate-400">
                                  {label}
                                </p>

                                <p className="mt-0.5 text-xl font-semibold text-slate-900">
                                  {value}
                                </p>
                              </div>
                            ))}
                          </div>

                          {/* Overview */}
                          {selected.overview && (
                            <div className="mt-5">
                              <h3 className="font-semibold text-slate-900">
                                About this subject
                              </h3>

                              <p className="mt-1 text-sm text-slate-700">
                                {selected.overview}
                              </p>
                            </div>
                          )}

                          {/* Units */}
                          <div className="mt-5">
                            <h3 className="font-semibold text-slate-900">
                              {selected.subject_type === 'practical'
                                ? 'Practical work'
                                : 'Syllabus'}

                              {totalHours > 0 && (
                                <span className="ml-1 text-xs font-normal text-slate-400">
                                  · {totalHours} hours in total
                                </span>
                              )}
                            </h3>

                            {selected.units.map((unit, index) => (
                              <div
                                key={`${unit.unit_no ?? index}-${index}`}
                                className="mt-3"
                              >
                                <p className="text-sm font-medium text-slate-900">
                                  {selected.subject_type === 'practical'
                                    ? unit.title
                                    : `Unit ${unit.unit_no}: ${unit.title}`}

                                  {unit.hours ? (
                                    <span className="font-normal text-slate-400">
                                      {' '}· {unit.hours} hours
                                    </span>
                                  ) : null}
                                </p>

                                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                                  {unit.topics.map((topic, index) => (
                                    <li key={index}>{topic}</li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>

                          {/* Reference Books */}
                          {selected.books.length > 0 && (
                            <div className="mt-5">
                              <h3 className="font-semibold text-slate-900">
                                Reference books
                              </h3>

                              <ul className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-slate-700">
                                {selected.books.map((book, index) => (
                                  <li key={index}>{book}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <p className="mt-6 border-t border-slate-100 pt-3 text-xs text-slate-400">
                            This is a computer-generated copy of the
                            syllabus from CampusSync. Please check with
                            your department for any later change.
                          </p>

                        </div>
                      </>
                    )}
                  </section>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}