import { useCallback, useEffect, useState } from 'react'
import { UserCheck, Users, UserX, GraduationCap, Search, X, Database, Pencil, UserPlus, UserMinus, ListChecks } from 'lucide-react'
import {
  listCourses, mentorSummary, listMentors, listMentees, assignMentees, assignMentorClass, unassignMentees, saveMentorDetails, seedDemoAdminMentor,
} from '../api.js'

const ACCENT = '#2563EB'
const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const PRIMARY = 'rounded-lg px-4 py-2 font-body text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const DANGER = 'rounded-lg border border-red-200 bg-white px-3 py-1.5 font-body text-sm text-red-600 hover:bg-red-50 disabled:opacity-60'
const PAGE_SIZE = 10

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
      <span className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${color}1A`, color }}><Icon size={20} /></span>
      <div>
        <p className="font-display text-2xl text-slate-900 leading-tight">{value}</p>
        <p className="font-body text-xs text-slate-500">{label}</p>
      </div>
    </div>
  )
}

const Label = ({ children }) => <label className="font-body text-sm text-slate-600 mb-1 block">{children}</label>
const initials = (n) => (n || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')

export default function AdminMentorPage({ session }) {
  const token = session.access_token
  const [tab, setTab] = useState('mentors')
  const [summary, setSummary] = useState(null)
  const [mentors, setMentors] = useState([])
  const [courses, setCourses] = useState([])
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  // students tab
  const [data, setData] = useState({ items: [], total: 0 })
  const [mentorId, setMentorId] = useState('')
  const [status, setStatus] = useState('')
  const [courseId, setCourseId] = useState('')
  const [semester, setSemester] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState([])
  const [target, setTarget] = useState('')

  // details modal
  const [details, setDetails] = useState(null)
  const [detailsError, setDetailsError] = useState('')

  const loadTop = useCallback(() => {
    mentorSummary(token).then(setSummary).catch((e) => setError(e.message))
    listMentors(token).then((d) => setMentors(d.items)).catch((e) => setError(e.message))
  }, [token])

  useEffect(() => { loadTop() }, [loadTop])
  useEffect(() => { listCourses(token, { page: 1, pageSize: 100, status: 'active' }).then((d) => setCourses(d.items)).catch(() => setCourses([])) }, [token])
  useEffect(() => { setPage(1); setSelected([]) }, [mentorId, status, courseId, semester, q])

  const loadStudents = useCallback(() => {
    setLoading(true)
    return listMentees(token, { mentorId, status, courseId, semester, q, page, pageSize: PAGE_SIZE })
      .then((d) => { setData(d); setError('') })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, mentorId, status, courseId, semester, q, page])

  useEffect(() => { if (tab === 'students') loadStudents() }, [tab, loadStudents])

  async function run(fn, ok) {
    setBusy(true); setError(''); setInfo('')
    try {
      const r = await fn()
      setInfo(typeof ok === 'function' ? ok(r) : ok)
      setSelected([])
      loadTop()
      if (tab === 'students') await loadStudents()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const needMentor = () => { if (!target) { setError('Pehle upar se mentor chuno.'); return false } return true }
  const course = courses.find((c) => c.id === courseId)
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const allOnPage = data.items.length > 0 && data.items.every((s) => selected.includes(s.student_id))
  const activeMentors = mentors.filter((m) => m.is_active)

  async function saveDetails(e) {
    e.preventDefault(); setDetailsError('')
    try {
      const r = await saveMentorDetails(token, details.id, { cabin: details.cabin || null, availability: details.availability || null })
      setInfo(`${r.updated} students ke liye mentor details update ho gayi.`)
      setDetails(null); loadTop()
    } catch (err) { setDetailsError(err.message) }
  }

  return (
    <div className="max-w-6xl mx-auto">
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Stat icon={GraduationCap} label="Active students" value={summary.students} color="#2563EB" />
          <Stat icon={UserCheck} label="Mentor assigned" value={summary.assigned} color="#16A34A" />
          <Stat icon={UserX} label="Bina mentor" value={summary.unassigned} color="#DC2626" />
          <Stat icon={Users} label={`Mentors · avg ${summary.avg_load} students`} value={summary.mentors} color="#7C3AED" />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
          {[['mentors', 'Mentors', Users], ['students', 'Students', ListChecks]].map(([k, label, Icon]) => (
            <button key={k} onClick={() => { setTab(k); setError(''); setInfo('') }}
              className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 font-body text-sm ${tab === k ? 'text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              style={tab === k ? { background: ACCENT } : undefined}><Icon size={15} /> {label}</button>
          ))}
        </div>
        <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy} onClick={() => run(() => seedDemoAdminMentor(token), (r) => r.message)}><Database size={15} /> Sample data</button>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {info && <p className="font-body text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{info}</p>}

      {tab === 'mentors' && (
        mentors.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center font-body text-sm text-slate-500">Abhi koi faculty nahi hai. Pehle Faculty section me faculty banao.</div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {mentors.map((m) => {
              const pct = Math.min(100, Math.round((m.mentees * 100) / m.capacity))
              return (
                <div key={m.id} className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4 ${m.is_active ? '' : 'opacity-60'}`}>
                  <div className="flex items-center gap-3">
                    <span className="w-11 h-11 rounded-full flex items-center justify-center font-display text-sm text-white" style={{ background: ACCENT }}>{initials(m.name)}</span>
                    <div className="min-w-0">
                      <p className="font-display text-base text-slate-900 truncate">{m.name}{!m.is_active && <span className="ml-2 font-body text-xs text-slate-500">(blocked)</span>}</p>
                      <p className="font-body text-xs text-slate-500 truncate">{m.faculty_id}{m.designation ? ` · ${m.designation}` : ''}{m.department ? ` · ${m.department}` : ''}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between font-body text-xs text-slate-600 mb-1"><span>Mentees</span><span>{m.mentees} / {m.capacity}</span></div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? '#DC2626' : pct >= 80 ? '#D97706' : '#16A34A' }} /></div>
                  </div>
                  {(m.cabin || m.availability) && <p className="font-body text-xs text-slate-500 mt-2">{m.cabin ? `Cabin: ${m.cabin}` : ''}{m.cabin && m.availability ? ' · ' : ''}{m.availability || ''}</p>}
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button className={`${OUTLINE} flex items-center gap-1`} onClick={() => { setMentorId(m.id); setStatus(''); setTab('students') }}><ListChecks size={13} /> Mentees</button>
                    <button className={`${OUTLINE} flex items-center gap-1`} onClick={() => { setTarget(m.id); setStatus('unassigned'); setMentorId(''); setTab('students') }} disabled={!m.is_active}><UserPlus size={13} /> Students jodo</button>
                    {m.mentees > 0 && <button className={`${OUTLINE} flex items-center gap-1`} onClick={() => { setDetailsError(''); setInfo(''); setDetails({ id: m.id, name: m.name, cabin: m.cabin || '', availability: m.availability || '' }) }}><Pencil size={13} /> Details</button>}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {tab === 'students' && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-3 flex flex-wrap gap-2">
            <div className="relative"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input className={`${INPUT} pl-9 w-56`} placeholder="Naam ya college ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <select className={`${INPUT} w-48`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All students</option><option value="unassigned">Bina mentor</option><option value="assigned">Mentor assigned</option></select>
            <select className={`${INPUT} w-52`} value={mentorId} onChange={(e) => setMentorId(e.target.value)}><option value="">Kisi bhi mentor ke</option>{mentors.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.mentees})</option>)}</select>
            <select className={`${INPUT} w-52`} value={courseId} onChange={(e) => { setCourseId(e.target.value); setSemester('') }}><option value="">All courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select className={`${INPUT} w-36`} value={semester} onChange={(e) => setSemester(e.target.value === '' ? '' : Number(e.target.value))}><option value="">All sem</option>{Array.from({ length: course ? course.semesters : 8 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Semester {n}</option>)}</select>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex flex-wrap items-center gap-2">
            <span className="font-body text-sm text-blue-900">Mentor:</span>
            <select className={`${INPUT} w-60`} value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Mentor chuno</option>{activeMentors.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.mentees}/{m.capacity})</option>)}</select>
            <button className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: ACCENT }} disabled={busy || selected.length === 0}
              onClick={() => needMentor() && run(() => assignMentees(token, target, selected), (r) => `${r.added} naye students assign hue${r.moved ? `, ${r.moved} dusre mentor se badle` : ''}.`)}><UserPlus size={15} /> Selected assign ({selected.length})</button>
            <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy || !courseId || semester === ''}
              onClick={() => needMentor() && window.confirm('Is class ke saare bina-mentor students is mentor ko assign karne hain?') && run(() => assignMentorClass(token, target, courseId, semester, true), (r) => `${r.added} students assign hue.`)}><Users size={15} /> Poori class assign</button>
            <button className={`${DANGER} flex items-center gap-1.5`} disabled={busy || selected.length === 0}
              onClick={() => window.confirm(`${selected.length} students ka mentor hatana hai?`) && run(() => unassignMentees(token, selected), (r) => `${r.removed} students se mentor hata diya.`)}><UserMinus size={15} /> Mentor hatao</button>
            {(!courseId || semester === '') && <span className="font-body text-xs text-blue-800">"Poori class" ke liye course aur semester filter chuno.</span>}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full font-body text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 w-10"><input type="checkbox" checked={allOnPage} onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...data.items.map((s) => s.student_id)])] : selected.filter((id) => !data.items.some((s) => s.student_id === id)))} aria-label="Select page" /></th>
                <th className="px-4 py-3 font-medium">Student</th><th className="px-4 py-3 font-medium">Class</th><th className="px-4 py-3 font-medium">Mentor</th>
              </tr></thead>
              <tbody>
                {loading && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>}
                {!loading && data.items.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">No students found.</td></tr>}
                {!loading && data.items.map((s) => (
                  <tr key={s.student_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3"><input type="checkbox" checked={selected.includes(s.student_id)} onChange={(e) => setSelected(e.target.checked ? [...selected, s.student_id] : selected.filter((id) => id !== s.student_id))} /></td>
                    <td className="px-4 py-3"><p className="text-slate-900 font-medium">{s.name}</p><p className="text-xs text-slate-500">{s.college_id}</p></td>
                    <td className="px-4 py-3 text-slate-700">{s.course || '-'} · Sem {s.semester || '-'}</td>
                    <td className="px-4 py-3">{s.mentor ? <span className="text-slate-800">{s.mentor}<span className="text-xs text-slate-500"> ({s.mentor_faculty_id})</span></span> : <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">Bina mentor</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3 font-body text-sm text-slate-500">
            <span>Total: {data.total}</span>
            <div className="flex items-center gap-2">
              <button className={OUTLINE} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page} / {pages}</span>
              <button className={OUTLINE} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        </>
      )}

      {details && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-lg text-slate-900">Mentor details · {details.name}</h3>
              <button onClick={() => setDetails(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={20} /></button>
            </div>
            <form onSubmit={saveDetails} className="p-6 space-y-4">
              {detailsError && <p className="font-body text-sm text-red-600">{detailsError}</p>}
              <div><Label>Cabin</Label><input className={INPUT} maxLength={40} value={details.cabin} onChange={(e) => setDetails({ ...details, cabin: e.target.value })} placeholder="e.g. Block A, Room 204" /></div>
              <div><Label>Availability</Label><input className={INPUT} maxLength={100} value={details.availability} onChange={(e) => setDetails({ ...details, availability: e.target.value })} placeholder="e.g. Mon-Fri, 2-4 PM" /></div>
              <p className="font-body text-xs text-slate-500">Save karne par naam, designation, department, email aur phone bhi Faculty section se dobara le liye jate hain.</p>
              <div className="flex gap-3"><button type="submit" className={PRIMARY} style={{ background: ACCENT }}>Save</button><button type="button" className={OUTLINE} onClick={() => setDetails(null)}>Cancel</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}