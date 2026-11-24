import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Calendar, Clock, Download, ExternalLink, MapPin, Upload } from 'lucide-react'
import {
  getPlacement,
  applyToDrive,
  withdrawApplication,
  uploadResume,
  downloadResume,
  seedDemoPlacement,
} from '../api.js'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'drives', label: 'Drives' },
  { key: 'applications', label: 'My Applications' },
  { key: 'resume', label: 'Resume' },
  { key: 'prepare', label: 'Prepare' },
  { key: 'offers', label: 'Offers & Statistics' },
]

const APP_STATUS = {
  applied: { label: 'Applied', cls: 'bg-blue-100 text-blue-700' },
  shortlisted: { label: 'Shortlisted', cls: 'bg-purple-100 text-purple-700' },
  interview: { label: 'Interview stage', cls: 'bg-indigo-100 text-indigo-700' },
  selected: { label: 'Selected', cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Not selected', cls: 'bg-red-100 text-red-700' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-slate-100 text-slate-500' },
}
const STEPS = ['Applied', 'Shortlisted', 'Interview', 'Selected']
const STEP_INDEX = { applied: 0, shortlisted: 1, interview: 2, selected: 3 }

const RESULT = {
  pending: { label: 'Result awaited', cls: 'bg-amber-100 text-amber-700' },
  cleared: { label: 'Cleared', cls: 'bg-green-100 text-green-700' },
  not_cleared: { label: 'Not cleared', cls: 'bg-red-100 text-red-700' },
}
const OFFER_STATUS = {
  accepted: { label: 'Accepted', cls: 'bg-green-100 text-green-700' },
  pending: { label: 'Decision pending', cls: 'bg-amber-100 text-amber-700' },
  declined: { label: 'Declined', cls: 'bg-slate-100 text-slate-500' },
}
const CHECK_STYLE = {
  good: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-700',
  missing: 'bg-red-100 text-red-700',
}
const DRIVE_FILTERS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'eligible', label: 'I can apply' },
  { key: 'applied', label: 'Applied' },
  { key: 'past', label: 'Past drives' },
]
const RESUME_ACCEPT = '.pdf,.docx,.txt'
const RESUME_EXT = ['.pdf', '.docx', '.txt']
const MAX_RESUME_BYTES = 3 * 1024 * 1024

const INPUT =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500'

// ---------------------------------------------------------------- study material (static, links open other sites)
const APTITUDE = [
  {
    title: 'Quantitative aptitude',
    topics: 'Percentages, profit and loss, ratio, time and work, speed and distance, averages, number system',
    tip: 'Learn the shortcut formulas once, then practise 15 to 20 questions a day with a timer.',
    links: [
      { label: 'IndiaBix', url: 'https://www.indiabix.com/' },
      { label: 'PrepInsta', url: 'https://prepinsta.com/' },
    ],
  },
  {
    title: 'Logical reasoning',
    topics: 'Series, coding and decoding, blood relations, directions, seating arrangement, puzzles',
    tip: 'Do not guess. Draw the arrangement on paper, it is faster and avoids silly mistakes.',
    links: [
      { label: 'IndiaBix', url: 'https://www.indiabix.com/' },
      { label: 'GeeksforGeeks', url: 'https://www.geeksforgeeks.org/' },
    ],
  },
  {
    title: 'Verbal ability',
    topics: 'Reading comprehension, synonyms and antonyms, sentence correction, para jumbles, fill in the blanks',
    tip: 'Read one editorial or article every day and note down the new words.',
    links: [{ label: 'PrepInsta', url: 'https://prepinsta.com/' }],
  },
  {
    title: 'Data interpretation',
    topics: 'Tables, bar and line graphs, pie charts, caselets',
    tip: 'Practise quick calculations: percentages, fractions and approximations save a lot of time.',
    links: [{ label: 'IndiaBix', url: 'https://www.indiabix.com/' }],
  },
]

const CODING = [
  { name: 'LeetCode', url: 'https://leetcode.com/', note: 'Interview style problems, sorted by topic and company.' },
  { name: 'HackerRank', url: 'https://www.hackerrank.com/', note: 'Many companies run their online tests here. Good for SQL and basics.' },
  { name: 'CodeChef', url: 'https://www.codechef.com/', note: 'Practice problems and regular contests.' },
  { name: 'Codeforces', url: 'https://codeforces.com/', note: 'Harder competitive programming, good for logic building.' },
  { name: 'GeeksforGeeks', url: 'https://www.geeksforgeeks.org/', note: 'Explanations of every data structure and algorithm, plus practice.' },
  { name: 'InterviewBit', url: 'https://www.interviewbit.com/', note: 'A guided path of topics for interview preparation.' },
]
const CODING_PLAN = [
  'Week 1: arrays, strings and basic maths problems',
  'Week 2: linked lists, stacks, queues and recursion',
  'Week 3: trees, binary search and sorting',
  'Week 4: graphs, hashing and dynamic programming basics',
  'Every week: solve 2 or 3 problems in SQL and revise your project code',
]

const INTERVIEW_GROUPS = [
  {
    title: 'HR and behavioural',
    items: [
      { q: 'Tell me about yourself.', a: 'Keep it to about one minute: your name and degree, one or two strengths with a short example, a project or internship you are proud of, and why this role interests you. Do not read out your resume.' },
      { q: 'What are your strengths and weaknesses?', a: 'Choose strengths that match the job and back each with a real example. For a weakness, pick a genuine but fixable one and say what you are doing to improve it.' },
      { q: 'Why do you want to join this company?', a: 'Read about the company before the interview. Mention its products, values or work that interest you and connect them to your skills and goals.' },
      { q: 'Where do you see yourself in five years?', a: 'Show that you want to learn and grow in the role: build strong skills first, then take more responsibility. Avoid saying you will move to another company.' },
      { q: 'Tell me about a time you faced a difficulty in a team project.', a: 'Use the STAR method: Situation, Task, Action, Result. Be honest about the problem, focus on what you did, and end with what you learned.' },
    ],
  },
  {
    title: 'Technical fundamentals',
    items: [
      { q: 'What are the four pillars of object oriented programming?', a: 'Encapsulation, abstraction, inheritance and polymorphism. Explain each in one line and give a small real example for each.' },
      { q: 'What is the difference between an array and a linked list?', a: 'Arrays give fast access by index but are fixed in size and slow to insert in the middle. Linked lists grow easily and insert quickly, but access needs traversal. Mention memory use too.' },
      { q: 'What is normalisation in a database?', a: 'Organising tables to reduce repeated data and update problems. Explain 1NF, 2NF and 3NF with a small table example.' },
      { q: 'What is the difference between a process and a thread?', a: 'A process has its own memory space. Threads of one process share memory, so they are lighter but need synchronisation. Give an example like a browser tab.' },
      { q: 'Explain SQL joins.', a: 'INNER JOIN returns matching rows only. LEFT JOIN keeps all rows of the left table. Draw two small tables and show the output of each join.' },
    ],
  },
  {
    title: 'About your projects',
    items: [
      { q: 'Explain your best project.', a: 'Cover the problem it solves, your role, the technologies and why you chose them, one difficult bug or decision, and the result. Be ready to open the code.' },
      { q: 'What would you improve in this project?', a: 'Name two real improvements, for example testing, security, performance or a missing feature. It shows you can judge your own work.' },
      { q: 'How did you test it?', a: 'Describe what you checked and how: sample inputs, edge cases, error handling. If you did little testing, say what you would add.' },
    ],
  },
]
const INTERVIEW_CHECKLIST = [
  'Carry 2 printed copies of your resume, your college ID and a pen',
  'Reach 20 minutes early, or join the online link 10 minutes early and test camera and internet',
  'Dress neatly and sit straight. Keep your phone silent',
  'Revise your resume line by line, because every line can become a question',
  'Listen to the full question, take a moment, then answer clearly. It is fine to say "I do not know, but I would try this"',
  'Prepare two questions to ask the interviewer, about the team or the training',
]

// ---------------------------------------------------------------- helpers
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fmtDate(s) {
  return parseDate(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function lpa(n) {
  return `₹${Number(n).toFixed(1).replace(/\.0$/, '')} LPA`
}

function fileSize(n) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`
}

function untilText(iso) {
  const ms = new Date(iso) - new Date()
  if (ms <= 0) return 'Started'
  const mins = Math.floor(ms / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days >= 1) return `In ${plural(days, 'day')}`
  if (hours >= 1) return `In ${plural(hours, 'hour')}`
  return `In ${Math.max(mins, 1)} min`
}

function criteriaText(d) {
  const parts = []
  if (d.min_cgpa !== null) parts.push(`CGPA ${d.min_cgpa} or more`)
  if (d.max_backlogs !== null) parts.push(d.max_backlogs === 0 ? 'No backlogs' : `Up to ${d.max_backlogs} backlog(s)`)
  parts.push(d.courses.length ? d.courses.join(', ') : 'All courses')
  return parts.join(' · ')
}

function isApplied(d) {
  return !!d.application_status && d.application_status !== 'withdrawn'
}

function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-xl border border-slate-200 p-6 ${className}`}>{children}</div>
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

function Chip({ cls, children }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>{children}</span>
}

function ScoreRing({ score }) {
  const r = 50
  const c = 2 * Math.PI * r
  const color = score >= 85 ? '#16A34A' : score >= 70 ? '#7C3AED' : score >= 50 ? '#D97706' : '#DC2626'
  return (
    <svg width="130" height="130" viewBox="0 0 130 130" role="img" aria-label={`Resume score ${score} out of 100`}>
      <circle cx="65" cy="65" r={r} fill="none" stroke="#E2E8F0" strokeWidth="12" />
      <circle
        cx="65"
        cy="65"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${((score / 100) * c).toFixed(1)} ${c.toFixed(1)}`}
        transform="rotate(-90 65 65)"
      />
      <text x="65" y="63" textAnchor="middle" fontSize="30" fontWeight="700" fill="#0F172A">
        {score}
      </text>
      <text x="65" y="84" textAnchor="middle" fontSize="12" fill="#64748B">
        out of 100
      </text>
    </svg>
  )
}

function InterviewCard({ iv, showCompany = true }) {
  const done = iv.status !== 'scheduled'
  const res = RESULT[iv.result] || RESULT.pending
  const when = new Date(iv.scheduled_at)
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="shrink-0 w-14 rounded-lg border border-purple-200 bg-purple-50 text-center py-1.5">
          <p className="font-body text-[10px] uppercase text-purple-700">
            {when.toLocaleDateString('en-IN', { month: 'short' })}
          </p>
          <p className="font-display text-xl text-slate-900 leading-none">{when.getDate()}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-body text-sm text-slate-900 font-medium">
            {iv.round_name}
            {showCompany ? ` · ${iv.company}` : ''}
          </p>
          <p className="font-body text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-4 gap-y-1">
            <span className="flex items-center gap-1">
              <Clock size={12} /> {fmtDateTime(iv.scheduled_at)}
            </span>
            <span className="flex items-center gap-1">
              <MapPin size={12} /> {iv.mode}
              {iv.venue ? ` · ${iv.venue}` : ''}
            </span>
          </p>
          {iv.instructions && <p className="font-body text-xs text-slate-600 mt-1">{iv.instructions}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          {done ? (
            <Chip cls={res.cls}>{res.label}</Chip>
          ) : (
            <Chip cls="bg-blue-100 text-blue-700">{untilText(iv.scheduled_at)}</Chip>
          )}
        </div>
      </div>
    </div>
  )
}

function DriveCard({ d, busy, onApply }) {
  const [open, setOpen] = useState(false)
  const applied = isApplied(d)
  const st = applied ? APP_STATUS[d.application_status] : null
  const canApply = d.phase === 'open' && d.eligible && !applied

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-body text-xs text-purple-700 font-medium">
            {d.company}
            {d.industry ? ` · ${d.industry}` : ''}
          </p>
          <h2 className="font-display text-lg text-slate-900 leading-snug">{d.role_title}</h2>
          <p className="font-body text-xs text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-slate-800 font-medium">{lpa(d.package_lpa)}</span>
            <span>{d.job_type}</span>
            <span>{d.mode}</span>
            {d.location && (
              <span className="flex items-center gap-1">
                <MapPin size={11} /> {d.location}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {st && <Chip cls={st.cls}>{st.label}</Chip>}
          {!applied && d.phase !== 'over' && (
            <Chip cls={d.eligible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
              {d.eligible ? 'You are eligible' : 'Not eligible'}
            </Chip>
          )}
          {d.phase === 'over' && <Chip cls="bg-slate-100 text-slate-500">Drive over</Chip>}
        </div>
      </div>

      <p className="font-body text-xs text-slate-600 mt-3 flex flex-wrap gap-x-5 gap-y-1">
        <span className="flex items-center gap-1">
          <Calendar size={12} /> Drive on {fmtDate(d.drive_date)}
        </span>
        <span>
          Apply by {fmtDate(d.apply_by)}
          {d.phase === 'open' && (
            <span className={d.days_left <= 3 ? 'text-red-600' : 'text-slate-500'}>
              {' '}
              ({d.days_left === 0 ? 'last day' : `${plural(d.days_left, 'day')} left`})
            </span>
          )}
          {d.phase === 'closed' && <span className="text-red-600"> (closed)</span>}
        </span>
      </p>
      <p className="font-body text-xs text-slate-500 mt-1">Criteria: {criteriaText(d)}</p>

      {!applied && d.phase !== 'over' && !d.eligible && (
        <ul className="mt-3 list-disc pl-5 font-body text-xs text-red-700 space-y-0.5">
          {d.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {canApply && (
          <button
            onClick={() => onApply(d)}
            disabled={busy}
            className="rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-4 py-2 disabled:opacity-60"
          >
            {busy ? 'Applying…' : 'Apply now'}
          </button>
        )}
        {!applied && d.phase === 'closed' && (
          <span className="font-body text-sm text-slate-500">Applications are closed.</span>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="font-body text-sm text-purple-700 hover:text-purple-900"
        >
          {open ? 'Hide details' : 'View details'}
        </button>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
          {d.description && <p className="font-body text-sm text-slate-700">{d.description}</p>}
          {d.skills.length > 0 && (
            <div>
              <p className="font-body text-xs text-slate-400 mb-1">Skills they look for</p>
              <div className="flex flex-wrap gap-2">
                {d.skills.map((s) => (
                  <span key={s} className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-xs">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          {d.selection_process.length > 0 && (
            <div>
              <p className="font-body text-xs text-slate-400 mb-1">Selection process</p>
              <ol className="list-decimal pl-5 font-body text-sm text-slate-700 space-y-0.5">
                {d.selection_process.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function StudentPlacementPage({ session, onBack }) {
  const token = session.access_token
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // drives
  const [driveFilter, setDriveFilter] = useState('upcoming')
  const [search, setSearch] = useState('')
  const [busyDrive, setBusyDrive] = useState(null)

  // applications
  const [busyApp, setBusyApp] = useState(null)

  // resume
  const [resumeFile, setResumeFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [resumeError, setResumeError] = useState('')
  const fileRef = useRef(null)

  // prepare + statistics
  const [prepTab, setPrepTab] = useState('aptitude')
  const [openQuestion, setOpenQuestion] = useState('')
  const [year, setYear] = useState('')

  async function load() {
    setData(await getPlacement(token))
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
      await seedDemoPlacement(token)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSeeding(false)
    }
  }

  async function handleApply(d) {
    setError('')
    setNotice('')
    if (!data.resume.has_resume) {
      setTab('resume')
      setNotice('Upload your resume first. Then you can apply to drives.')
      return
    }
    if (!window.confirm(`Apply for ${d.role_title} at ${d.company}?`)) return
    setBusyDrive(d.id)
    try {
      await applyToDrive(token, d.id)
      await load()
      setNotice(`You applied to ${d.company}. Track it in My Applications.`)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyDrive(null)
    }
  }

  async function handleWithdraw(a) {
    if (!window.confirm(`Withdraw your application to ${a.company}?`)) return
    setError('')
    setNotice('')
    setBusyApp(a.id)
    try {
      await withdrawApplication(token, a.id)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyApp(null)
    }
  }

  function pickResume(e) {
    setResumeError('')
    const f = e.target.files && e.target.files[0] ? e.target.files[0] : null
    if (!f) {
      setResumeFile(null)
      return
    }
    const dot = f.name.lastIndexOf('.')
    const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : ''
    if (!RESUME_EXT.includes(ext)) {
      setResumeError('Choose a PDF, DOCX or TXT file.')
      setResumeFile(null)
      return
    }
    if (f.size > MAX_RESUME_BYTES) {
      setResumeError('The file is larger than 3 MB.')
      setResumeFile(null)
      return
    }
    setResumeFile(f)
  }

  async function handleUpload(e) {
    e.preventDefault()
    setResumeError('')
    if (!resumeFile) {
      setResumeError('Choose your resume file first.')
      return
    }
    setUploading(true)
    try {
      const resume = await uploadResume(token, resumeFile)
      setData((d) => ({ ...d, resume }))
      setResumeFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setResumeError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDownloadResume() {
    setResumeError('')
    try {
      await downloadResume(token, data.resume.file_name)
    } catch (err) {
      setResumeError(err.message)
    }
  }

  const drives = data ? data.drives : []
  const applications = data ? data.applications : []
  const interviews = data ? data.interviews : []
  const offers = data ? data.offers : []
  const stats = data ? data.statistics : []
  const student = data ? data.student : null
  const resume = data ? data.resume : null
  const hasData = drives.length > 0 || applications.length > 0

  const now = new Date()
  const activeApps = applications.filter((a) => a.status !== 'withdrawn')
  const upcomingInterviews = interviews.filter((i) => i.status === 'scheduled' && new Date(i.scheduled_at) >= now)
  const applicable = drives.filter((d) => d.phase === 'open' && d.eligible && !isApplied(d))
  const closingSoon = applicable.filter((d) => d.days_left <= 7)

  const q = search.trim().toLowerCase()
  const visibleDrives = drives
    .filter((d) => {
      if (driveFilter === 'upcoming') return d.phase !== 'over'
      if (driveFilter === 'eligible') return d.phase === 'open' && d.eligible && !isApplied(d)
      if (driveFilter === 'applied') return isApplied(d)
      return d.phase === 'over'
    })
    .filter((d) => !q || d.company.toLowerCase().includes(q) || d.role_title.toLowerCase().includes(q))
    .sort((a, b) =>
      driveFilter === 'past' ? b.drive_date.localeCompare(a.drive_date) : a.drive_date.localeCompare(b.drive_date)
    )

  const selectedStat = stats.find((s) => s.academic_year === year) || stats[0] || null
  const percent = (s) => (s.total_students ? Math.round((s.placed_students * 1000) / s.total_students) / 10 : 0)
  const maxOffers = selectedStat ? Math.max(...selectedStat.recruiters.map((r) => r.offers), 1) : 1

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="w-full bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-body text-sm"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="font-display text-lg text-slate-900 ml-2">Placement Dashboard</h1>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {loading && <p className="font-body text-slate-400">Loading placement details…</p>}
        {error && <p className="font-body text-sm text-red-600">{error}</p>}
        {notice && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <p className="font-body text-sm text-green-800">{notice}</p>
          </div>
        )}

        {!loading && data && !hasData && (
          <Card className="text-center p-8">
            <p className="font-display text-lg text-slate-900">No placement drives yet</p>
            <p className="font-body text-sm text-slate-500 mt-2 max-w-md mx-auto">
              Drives posted by the placement cell will appear here. Until the Admin module is live you can load sample
              drives to try this screen. For correct eligibility, first load the sample data in <strong>Results</strong>
              (for CGPA) and fill your <strong>Course</strong> in Student Profile.
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
                  {t.key === 'drives' && applicable.length > 0 && (
                    <span className="rounded-full bg-purple-600 text-white px-1.5 py-0.5 text-[10px] leading-none">
                      {applicable.length}
                    </span>
                  )}
                  {t.key === 'applications' && upcomingInterviews.length > 0 && (
                    <span className="rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[10px] leading-none">
                      {upcomingInterviews.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ---------------- Overview ---------------- */}
            {tab === 'overview' && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Stat label="Drives you can apply to" value={applicable.length} tone="text-purple-700" />
                  <Stat label="Applications" value={activeApps.length} />
                  <Stat label="Interviews coming up" value={upcomingInterviews.length} />
                  <Stat label="Offers" value={offers.length} tone={offers.length ? 'text-green-700' : 'text-slate-900'} />
                </div>

                <Card>
                  <h2 className="font-display text-lg text-slate-900 mb-3">Your placement profile</h2>
                  <div className="grid sm:grid-cols-4 gap-4 font-body text-sm">
                    <div>
                      <p className="text-xs text-slate-400">CGPA</p>
                      <p className="font-display text-2xl text-slate-900">{student.cgpa ?? '—'}</p>
                      {student.cgpa === null && (
                        <p className="text-xs text-amber-700 mt-0.5">Needs published results</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Backlogs</p>
                      <p className="font-display text-2xl text-slate-900">{student.backlogs}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Course</p>
                      <p className="text-slate-800 mt-1">{student.course || 'Not filled'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Resume</p>
                      {resume.has_resume ? (
                        <p className="text-slate-800 mt-1">
                          {resume.score !== null ? `Score ${resume.score}/100` : 'Uploaded'}
                        </p>
                      ) : (
                        <button
                          onClick={() => setTab('resume')}
                          className="text-purple-700 hover:text-purple-900 mt-1"
                        >
                          Upload now
                        </button>
                      )}
                    </div>
                  </div>
                </Card>

                {upcomingInterviews.length > 0 && (
                  <div>
                    <h2 className="font-display text-lg text-slate-900 mb-3">Your next interview</h2>
                    <InterviewCard iv={upcomingInterviews[0]} />
                  </div>
                )}

                {closingSoon.length > 0 && (
                  <Card>
                    <h2 className="font-display text-lg text-slate-900 mb-3">Applications closing soon</h2>
                    <ul className="space-y-2">
                      {closingSoon.map((d) => (
                        <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 font-body text-sm">
                          <span className="text-slate-800">
                            {d.company} · {d.role_title} · {lpa(d.package_lpa)}
                          </span>
                          <span className="text-red-600 text-xs">
                            {d.days_left === 0 ? 'Last day today' : `${plural(d.days_left, 'day')} left`}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => {
                        setDriveFilter('eligible')
                        setTab('drives')
                      }}
                      className="mt-4 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-4 py-2"
                    >
                      See drives I can apply to
                    </button>
                  </Card>
                )}

                {!resume.has_resume && (
                  <Card className="border-amber-200 bg-amber-50">
                    <p className="font-body text-sm text-amber-900">
                      You have not uploaded your resume. You need one to apply to any drive, and we will also check it
                      and give you tips.
                    </p>
                    <button
                      onClick={() => setTab('resume')}
                      className="mt-3 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-4 py-2"
                    >
                      Upload resume
                    </button>
                  </Card>
                )}
              </>
            )}

            {/* ---------------- Drives ---------------- */}
            {tab === 'drives' && (
              <>
                <div className="flex flex-wrap gap-2">
                  {DRIVE_FILTERS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setDriveFilter(f.key)}
                      className={`rounded-full px-4 py-1.5 font-body text-sm border ${
                        driveFilter === f.key
                          ? 'bg-purple-600 border-purple-600 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by company or role"
                  className={INPUT}
                />

                {visibleDrives.length === 0 && (
                  <Card className="text-center">
                    <p className="font-body text-sm text-slate-500">
                      {q
                        ? 'No drives match your search.'
                        : driveFilter === 'eligible'
                        ? 'There is no open drive you can apply to right now.'
                        : driveFilter === 'applied'
                        ? 'You have not applied to any drive yet.'
                        : driveFilter === 'past'
                        ? 'There are no past drives.'
                        : 'There are no upcoming drives.'}
                    </p>
                  </Card>
                )}

                <div className="space-y-4">
                  {visibleDrives.map((d) => (
                    <DriveCard key={d.id} d={d} busy={busyDrive === d.id} onApply={handleApply} />
                  ))}
                </div>
              </>
            )}

            {/* ---------------- Applications and interview schedule ---------------- */}
            {tab === 'applications' && (
              <>
                <div>
                  <h2 className="font-display text-lg text-slate-900 mb-3">Interview schedule</h2>
                  {upcomingInterviews.length === 0 ? (
                    <Card className="text-center">
                      <p className="font-body text-sm text-slate-500">You have no interview or test scheduled.</p>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {upcomingInterviews.map((iv) => (
                        <InterviewCard key={iv.id} iv={iv} />
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h2 className="font-display text-lg text-slate-900 mb-3">Application status</h2>
                  {applications.length === 0 ? (
                    <Card className="text-center">
                      <p className="font-body text-sm text-slate-500">You have not applied to any drive yet.</p>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {applications.map((a) => {
                        const st = APP_STATUS[a.status] || APP_STATUS.applied
                        const idx = STEP_INDEX[a.status]
                        return (
                          <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-body text-xs text-purple-700 font-medium">{a.company}</p>
                                <h3 className="font-display text-lg text-slate-900">{a.role_title}</h3>
                                <p className="font-body text-xs text-slate-500 mt-0.5">
                                  {lpa(a.package_lpa)} · Applied on {fmtDate(a.applied_at.slice(0, 10))}
                                </p>
                              </div>
                              <Chip cls={st.cls}>{st.label}</Chip>
                            </div>

                            {idx !== undefined && (
                              <div className="flex items-start mt-4">
                                {STEPS.map((label, i) => (
                                  <div key={label} className={`flex items-start ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
                                    <div className="flex flex-col items-center">
                                      <span
                                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium ${
                                          i <= idx
                                            ? a.status === 'selected'
                                              ? 'bg-green-500 text-white'
                                              : 'bg-purple-600 text-white'
                                            : 'bg-slate-200 text-slate-500'
                                        }`}
                                      >
                                        {i < idx || (i === idx && a.status === 'selected') ? '✓' : i + 1}
                                      </span>
                                      <span className="font-body text-[11px] mt-1 text-slate-500 whitespace-nowrap">
                                        {label}
                                      </span>
                                    </div>
                                    {i < STEPS.length - 1 && (
                                      <span className={`flex-1 h-0.5 mx-2 mt-3 ${i < idx ? 'bg-purple-500' : 'bg-slate-200'}`} />
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {a.interviews.length > 0 && (
                              <div className="mt-4">
                                <p className="font-body text-xs text-slate-400 mb-2">Rounds</p>
                                <div className="space-y-2">
                                  {a.interviews.map((iv) => {
                                    const res = RESULT[iv.result] || RESULT.pending
                                    return (
                                      <div
                                        key={iv.id}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                                      >
                                        <span className="font-body text-sm text-slate-800">
                                          {iv.round_name}
                                          <span className="text-slate-500 text-xs"> · {fmtDateTime(iv.scheduled_at)}</span>
                                        </span>
                                        {iv.status === 'scheduled' ? (
                                          <Chip cls="bg-blue-100 text-blue-700">{untilText(iv.scheduled_at)}</Chip>
                                        ) : (
                                          <Chip cls={res.cls}>{res.label}</Chip>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}

                            {a.can_withdraw && (
                              <button
                                onClick={() => handleWithdraw(a)}
                                disabled={busyApp === a.id}
                                className="mt-4 font-body text-sm text-red-600 hover:text-red-800 disabled:opacity-60"
                              >
                                {busyApp === a.id ? 'Withdrawing…' : 'Withdraw application'}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ---------------- Resume ---------------- */}
            {tab === 'resume' && (
              <>
                <Card>
                  <h2 className="font-display text-lg text-slate-900 mb-1">Your resume</h2>
                  <p className="font-body text-sm text-slate-500 mb-4">
                    Upload one resume (PDF, DOCX or TXT, up to 3 MB). It is used when you apply to drives. Uploading a
                    new file replaces the old one.
                  </p>

                  {resume.has_resume && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 mb-4">
                      <div className="min-w-0">
                        <p className="font-body text-sm text-slate-900 font-medium truncate">{resume.file_name}</p>
                        <p className="font-body text-xs text-slate-500">
                          {fileSize(resume.size_bytes)} · Uploaded {fmtDateTime(resume.uploaded_at)}
                        </p>
                      </div>
                      <button
                        onClick={handleDownloadResume}
                        className="flex items-center gap-1.5 font-body text-sm text-purple-700 hover:text-purple-900"
                      >
                        <Download size={14} /> Download
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-3">
                    <input
                      ref={fileRef}
                      type="file"
                      accept={RESUME_ACCEPT}
                      onChange={pickResume}
                      className="block flex-1 min-w-56 font-body text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-purple-100 file:px-3 file:py-1.5 file:text-purple-700 file:font-medium hover:file:bg-purple-200"
                    />
                    <button
                      type="submit"
                      disabled={uploading}
                      className="flex items-center gap-1.5 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-4 py-2 disabled:opacity-60"
                    >
                      <Upload size={14} /> {uploading ? 'Uploading…' : resume.has_resume ? 'Replace resume' : 'Upload resume'}
                    </button>
                  </form>
                  {resumeError && <p className="font-body text-sm text-red-600 mt-3">{resumeError}</p>}
                </Card>

                {resume.has_resume && resume.score !== null && (
                  <Card>
                    <div className="flex flex-wrap items-center gap-6">
                      <ScoreRing score={resume.score} />
                      <div className="min-w-0 flex-1">
                        <p className="font-body text-xs text-slate-400">Resume score</p>
                        <p className="font-display text-2xl text-slate-900">{resume.label}</p>
                        <p className="font-body text-sm text-slate-600 mt-1">
                          {resume.word_count} words read from your file.
                        </p>
                        <p className="font-body text-xs text-slate-400 mt-2">
                          This is an automatic check of common resume points. It is a guide, not a recruiter's opinion.
                        </p>
                      </div>
                    </div>

                    <ul className="mt-5 divide-y divide-slate-100">
                      {resume.checks.map((c) => (
                        <li key={c.name} className="py-3 flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-body text-sm text-slate-900 font-medium">{c.name}</p>
                            <p className="font-body text-xs text-slate-500 mt-0.5">{c.tip}</p>
                          </div>
                          <Chip cls={CHECK_STYLE[c.status]}>
                            {c.points}/{c.max_points}
                          </Chip>
                        </li>
                      ))}
                    </ul>

                    {resume.skills_found.length > 0 && (
                      <div className="mt-5">
                        <p className="font-body text-xs text-slate-400 mb-2">Skills we found in your resume</p>
                        <div className="flex flex-wrap gap-2">
                          {resume.skills_found.map((s) => (
                            <span key={s} className="rounded-full bg-purple-50 text-purple-700 px-2.5 py-0.5 text-xs">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                )}

                {resume.has_resume && resume.score === null && (
                  <Card className="border-amber-200 bg-amber-50">
                    <p className="font-body text-sm text-amber-900">
                      {resume.message || 'We could not check this resume.'}
                    </p>
                    <p className="font-body text-xs text-amber-800 mt-2">
                      Your resume is saved and you can still apply with it.
                    </p>
                  </Card>
                )}
              </>
            )}

            {/* ---------------- Prepare ---------------- */}
            {tab === 'prepare' && (
              <>
                <div className="flex flex-wrap gap-2">
                  {[
                    ['aptitude', 'Aptitude resources'],
                    ['coding', 'Coding practice'],
                    ['interview', 'Interview preparation'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setPrepTab(key)}
                      className={`rounded-full px-4 py-1.5 font-body text-sm border ${
                        prepTab === key
                          ? 'bg-purple-600 border-purple-600 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {prepTab === 'aptitude' && (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {APTITUDE.map((a) => (
                      <Card key={a.title}>
                        <h3 className="font-display text-base text-slate-900">{a.title}</h3>
                        <p className="font-body text-xs text-slate-500 mt-1">{a.topics}</p>
                        <p className="font-body text-sm text-slate-700 mt-3">{a.tip}</p>
                        <div className="mt-3 flex flex-wrap gap-3">
                          {a.links.map((l) => (
                            <a
                              key={l.label}
                              href={l.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 font-body text-sm text-purple-700 hover:text-purple-900"
                            >
                              {l.label} <ExternalLink size={12} />
                            </a>
                          ))}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {prepTab === 'coding' && (
                  <>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {CODING.map((c) => (
                        <Card key={c.name}>
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 font-display text-base text-purple-700 hover:text-purple-900"
                          >
                            {c.name} <ExternalLink size={13} />
                          </a>
                          <p className="font-body text-sm text-slate-600 mt-1">{c.note}</p>
                        </Card>
                      ))}
                    </div>
                    <Card>
                      <h3 className="font-display text-lg text-slate-900 mb-2">A simple 4 week plan</h3>
                      <ul className="list-disc pl-5 font-body text-sm text-slate-700 space-y-1">
                        {CODING_PLAN.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </Card>
                  </>
                )}

                {prepTab === 'interview' && (
                  <>
                    {INTERVIEW_GROUPS.map((g) => (
                      <Card key={g.title}>
                        <h3 className="font-display text-lg text-slate-900 mb-3">{g.title}</h3>
                        <ul className="space-y-2">
                          {g.items.map((it) => {
                            const id = `${g.title}-${it.q}`
                            const open = openQuestion === id
                            return (
                              <li key={id} className="rounded-lg border border-slate-200">
                                <button
                                  onClick={() => setOpenQuestion(open ? '' : id)}
                                  className="w-full text-left px-4 py-3 font-body text-sm text-slate-900 font-medium flex items-center justify-between gap-3"
                                >
                                  {it.q}
                                  <span className="text-slate-400 text-xs shrink-0">{open ? 'Hide' : 'How to answer'}</span>
                                </button>
                                {open && (
                                  <p className="px-4 pb-3 font-body text-sm text-slate-700 border-t border-slate-100 pt-3">
                                    {it.a}
                                  </p>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      </Card>
                    ))}
                    <Card>
                      <h3 className="font-display text-lg text-slate-900 mb-2">Interview day checklist</h3>
                      <ul className="list-disc pl-5 font-body text-sm text-slate-700 space-y-1">
                        {INTERVIEW_CHECKLIST.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </Card>
                  </>
                )}
              </>
            )}

            {/* ---------------- Offers and statistics ---------------- */}
            {tab === 'offers' && (
              <>
                <div>
                  <h2 className="font-display text-lg text-slate-900 mb-3">My offers</h2>
                  {offers.length === 0 ? (
                    <Card className="text-center">
                      <p className="font-body text-sm text-slate-500">You have not received any offer yet.</p>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {offers.map((o, i) => {
                        const st = OFFER_STATUS[o.status] || OFFER_STATUS.pending
                        return (
                          <div key={`${o.company_name}-${i}`} className="bg-white rounded-xl border border-slate-200 p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-display text-lg text-slate-900">{o.company_name}</p>
                                <p className="font-body text-sm text-slate-600">{o.role_title}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-display text-xl text-green-700">{lpa(o.package_lpa)}</p>
                                <Chip cls={st.cls}>{st.label}</Chip>
                              </div>
                            </div>
                            <p className="font-body text-xs text-slate-500 mt-3">
                              Offer date {fmtDate(o.offer_date)}
                              {o.joining_date ? ` · Joining ${fmtDate(o.joining_date)}` : ''}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <h2 className="font-display text-lg text-slate-900 mb-3">Placement statistics</h2>
                  {!selectedStat ? (
                    <Card className="text-center">
                      <p className="font-body text-sm text-slate-500">
                        Placement figures will appear here once the placement cell adds them.
                      </p>
                    </Card>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {stats.map((s) => (
                          <button
                            key={s.academic_year}
                            onClick={() => setYear(s.academic_year)}
                            className={`rounded-full px-4 py-1.5 font-body text-sm border ${
                              selectedStat.academic_year === s.academic_year
                                ? 'bg-purple-600 border-purple-600 text-white'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {s.academic_year}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <Stat
                          label="Students placed"
                          value={`${percent(selectedStat)}%`}
                          hint={`${selectedStat.placed_students} of ${selectedStat.total_students}`}
                          tone="text-purple-700"
                        />
                        <Stat label="Offers made" value={selectedStat.offers_made} />
                        <Stat label="Companies visited" value={selectedStat.companies_visited} />
                        <Stat label="Highest package" value={lpa(selectedStat.highest_package)} />
                        <Stat label="Average package" value={lpa(selectedStat.average_package)} />
                        <Stat label="Median package" value={lpa(selectedStat.median_package)} />
                      </div>

                      {selectedStat.recruiters.length > 0 && (
                        <Card className="mt-4">
                          <h3 className="font-display text-base text-slate-900 mb-4">Top recruiters</h3>
                          <div className="space-y-3">
                            {selectedStat.recruiters.map((r) => (
                              <div key={r.company_name}>
                                <div className="flex justify-between font-body text-sm">
                                  <span className="text-slate-700">{r.company_name}</span>
                                  <span className="text-slate-500">
                                    {plural(r.offers, 'offer')}
                                    {r.highest_package ? ` · up to ${lpa(r.highest_package)}` : ''}
                                  </span>
                                </div>
                                <div className="mt-1.5 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                  <div className="h-full bg-purple-500" style={{ width: `${(r.offers / maxOffers) * 100}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </Card>
                      )}

                      {stats.length > 1 && (
                        <Card className="mt-4">
                          <h3 className="font-display text-base text-slate-900 mb-4">Year by year</h3>
                          <div className="space-y-3">
                            {[...stats].reverse().map((s) => (
                              <div key={s.academic_year}>
                                <div className="flex justify-between font-body text-sm">
                                  <span className="text-slate-700">{s.academic_year}</span>
                                  <span className="text-slate-500">
                                    {percent(s)}% placed · average {lpa(s.average_package)}
                                  </span>
                                </div>
                                <div className="mt-1.5 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                  <div className="h-full bg-green-500" style={{ width: `${Math.min(percent(s), 100)}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </Card>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}