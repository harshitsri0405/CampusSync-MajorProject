import { useEffect, useState } from 'react'
import { Clock, MapPin } from 'lucide-react'
import { facultyTimetableWeek, facultyExamSchedule } from '../api.js'

const INPUT =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500'
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const toMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m }
const fmtDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

const BADGE = {
  now: { label: 'Chal rahi hai', cls: 'bg-green-600 text-white' },
  next: { label: 'Agli class', cls: 'bg-amber-100 text-amber-700' },
  done: { label: 'Ho chuki', cls: 'bg-slate-100 text-slate-500' },
}

function Slot({ s, status }) {
  const practical = s.kind === 'practical'
  return (
    <div className={`rounded-xl border p-3 ${practical ? 'border-amber-200 bg-amber-50/60' : 'border-green-200 bg-green-50/50'} ${status === 'done' ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-sm text-slate-900">{s.subject}</p>
        {status && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${BADGE[status].cls}`}>{BADGE[status].label}</span>}
      </div>
      <p className="font-body text-xs text-slate-600 mt-1 flex items-center gap-1"><Clock size={11} /> {s.start} - {s.end}{practical ? ' · Practical' : ''}</p>
      <p className="font-body text-xs text-slate-500 mt-0.5">{s.course} · Sem {s.semester}</p>
      {s.room && <p className="font-body text-xs text-slate-500 mt-0.5 flex items-center gap-1"><MapPin size={11} /> {s.room}</p>}
      {s.clash && <p className="font-body text-xs font-medium text-red-600 mt-1">Clash: isi time par dusra slot bhi hai</p>}
    </div>
  )
}

function TimetableTab({ token }) {
  const [data, setData] = useState(null)
  const [view, setView] = useState('today')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    facultyTimetableWeek(token).then((d) => { setData(d); setError('') }).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [token])

  if (loading) return <p className="font-body text-sm text-slate-500">Loading...</p>
  if (error) return <p className="font-body text-sm text-red-600">{error}</p>
  if (!data) return null

  const todayIdx = data.today.day
  const nowM = toMin(data.today.time)
  const todays = data.items.filter((s) => s.day === todayIdx)
  const firstNext = todays.find((s) => toMin(s.start) > nowM)
  const statusOf = (s) => {
    if (s.day !== todayIdx) return ''
    if (toMin(s.end) < nowM) return 'done'
    if (toMin(s.start) <= nowM) return 'now'
    return firstNext && firstNext.id === s.id ? 'next' : ''
  }
  const sm = data.summary

  return (
    <div>
      {data.items.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-xl mx-auto">
          <p className="font-display text-base text-slate-900 mb-1">Aapka timetable abhi nahi bana</p>
          <p className="font-body text-sm text-slate-500">Admin jab timetable me aapke naam se slot daalega tab yahan dikhega.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 mb-4 font-body text-sm">
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700">Lectures: {sm.lectures}</span>
            <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-amber-700">Practicals: {sm.practicals}</span>
            <span className="rounded-lg bg-green-50 px-3 py-1.5 text-green-700">Hafte me {sm.hours} ghante</span>
            {sm.clashes > 0 && <span className="rounded-lg bg-red-50 px-3 py-1.5 text-red-700">Clash wale slot: {sm.clashes}</span>}
          </div>

          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit mb-4">
            {[['today', 'Aaj'], ['week', 'Poora hafta']].map(([k, label]) => (
              <button key={k} onClick={() => setView(k)} className={`rounded-md px-4 py-1.5 font-body text-sm ${view === k ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600'}`}>{label}</button>
            ))}
          </div>

          {view === 'today' && (
            <div>
              <p className="font-display text-base text-slate-900 mb-3">{DAY_NAMES[todayIdx]}</p>
              {todays.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center font-body text-sm text-slate-500">Aaj aapki koi class nahi hai.</div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {todays.map((s) => <Slot key={s.id} s={s} status={statusOf(s)} />)}
                </div>
              )}
            </div>
          )}

          {view === 'week' && (
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              {[0, 1, 2, 3, 4, 5].map((d) => {
                const list = data.items.filter((s) => s.day === d)
                return (
                  <div key={d} className={`rounded-xl border p-3 ${d === todayIdx ? 'border-green-400 bg-green-50/30' : 'border-slate-200 bg-white'}`}>
                    <p className={`font-display text-sm mb-2 ${d === todayIdx ? 'text-green-700' : 'text-slate-900'}`}>{DAY_NAMES[d]}{d === todayIdx ? ' (aaj)' : ''}</p>
                    <div className="space-y-2">
                      {list.length === 0 && <p className="font-body text-xs text-slate-400">Koi class nahi</p>}
                      {list.map((s) => <Slot key={s.id} s={s} status="" />)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ExamsTab({ token }) {
  const [scope, setScope] = useState('mine')
  const [past, setPast] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    facultyExamSchedule(token, { scope, includePast: past })
      .then((d) => { setData(d); setError('') })
      .catch((e) => { setData(null); setError(e.message) })
      .finally(() => setLoading(false))
  }, [token, scope, past])

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <p className="font-body text-xs text-slate-500 mb-1">Kaun si exams</p>
          <select className={INPUT} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="mine">Sirf mere subjects</option>
            <option value="class">Meri classes ki saari exams</option>
          </select>
        </div>
        <label className="flex items-center gap-2 font-body text-sm text-slate-600 pb-2">
          <input type="checkbox" className="accent-green-600" checked={past} onChange={(e) => setPast(e.target.checked)} /> Purani exams bhi dikhao
        </label>
        {data && <span className="font-body text-sm text-slate-500 ml-auto pb-2">{data.total} exams</span>}
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {loading && <p className="font-body text-sm text-slate-500">Loading...</p>}

      {data && !loading && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full font-body text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Subject</th><th className="px-4 py-3 font-medium">Exam</th>
                <th className="px-4 py-3 font-medium">Class</th><th className="px-4 py-3 font-medium">Venue</th><th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  {data.classes === 0 ? 'Aapko abhi koi class assign nahi hai.' : 'Koi exam schedule nahi mila.'}
                </td></tr>
              )}
              {data.items.map((x) => (
                <tr key={x.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 text-slate-900 whitespace-nowrap">{fmtDate(x.date)}</td>
                  <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{x.start} - {x.end}</td>
                  <td className="px-4 py-2.5 text-slate-900">{x.subject}{x.mine && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">Mera subject</span>}</td>
                  <td className="px-4 py-2.5 text-slate-700">{x.exam_type}</td>
                  <td className="px-4 py-2.5 text-slate-600">{x.course} · Sem {x.semester}</td>
                  <td className="px-4 py-2.5 text-slate-600">{x.venue || '-'}</td>
                  <td className="px-4 py-2.5 text-right text-xs whitespace-nowrap">
                    {x.days_left === 0 ? <span className="font-medium text-red-600">Aaj</span>
                      : x.days_left > 0 ? <span className={x.days_left <= 3 ? 'font-medium text-amber-700' : 'text-slate-500'}>{x.days_left} din baad</span>
                        : <span className="text-slate-400">Ho chuki</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function FacultyTimetablePage({ session }) {
  const token = session.access_token
  const [tab, setTab] = useState('timetable')
  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit mb-4">
        {[['timetable', 'Timetable'], ['exams', 'Exam Schedule']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-4 py-1.5 font-body text-sm ${tab === k ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600'}`}>{label}</button>
        ))}
      </div>
      {tab === 'timetable' && <TimetableTab token={token} />}
      {tab === 'exams' && <ExamsTab token={token} />}
    </div>
  )
}