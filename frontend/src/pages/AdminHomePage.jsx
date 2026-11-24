import { useEffect, useState } from 'react'
import { Users, GraduationCap, Building2, BookOpen, BookMarked, Bell, CheckCircle2, Circle } from 'lucide-react'
import { getAdminOverview } from '../api.js'

const CARDS = [
  { key: 'students', label: 'Students', icon: Users },
  { key: 'faculty', label: 'Faculty', icon: GraduationCap },
  { key: 'departments', label: 'Departments', icon: Building2 },
  { key: 'courses', label: 'Courses', icon: BookOpen },
  { key: 'subjects', label: 'Subjects', icon: BookMarked },
  { key: 'notices', label: 'Notices', icon: Bell },
]

function fmtUtc(s) {
  if (!s) return '-'
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export default function AdminHomePage({ session, onNavigate }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getAdminOverview(session.access_token)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [session.access_token])

  if (loading) return <p className="font-body text-sm text-stone-500">Loading...</p>
  if (error) return <p className="font-body text-sm text-red-600">{error}</p>
  if (!data) return null

  const pending = (data.setup || []).filter((s) => !s.done)

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-5">
        <h2 className="font-display text-2xl text-stone-900">{data.college_name}</h2>
        <p className="font-body text-sm text-stone-500">Admin dashboard - college ka overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        {CARDS.map((c) => {
          const Icon = c.icon
          const v = data.counts ? data.counts[c.key] : null
          return (
            <div key={c.key} className="bg-white rounded-xl border border-canvas-200 shadow-sm p-4">
              <span className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 bg-brand-100 text-brand-700">
                <Icon size={18} />
              </span>
              <p className="font-display text-2xl text-stone-900">{v === null || v === undefined ? '-' : v}</p>
              <p className="font-body text-xs text-stone-500">{c.label}</p>
            </div>
          )
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-canvas-200 shadow-sm p-5 lg:col-span-2">
          <h3 className="font-display text-base text-stone-900 mb-3">Recent Activities</h3>
          {data.recent_activities.length === 0 ? (
            <p className="font-body text-sm text-stone-500">Abhi koi activity nahi hai.</p>
          ) : (
            <ul className="divide-y divide-canvas-100">
              {data.recent_activities.map((a) => (
                <li key={a.id} className="py-2.5 flex items-start justify-between gap-3">
                  <p className="font-body text-sm text-stone-700">{a.detail || a.action}</p>
                  <span className="font-body text-xs text-stone-400 whitespace-nowrap">{fmtUtc(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-canvas-200 shadow-sm p-5">
          <h3 className="font-display text-base text-stone-900 mb-3">Setup checklist</h3>
          <ul className="space-y-2">
            {(data.setup || []).map((s) => (
              <li key={s.key} className="flex items-center gap-2 font-body text-sm text-stone-700">
                {s.done ? <CheckCircle2 size={16} className="text-green-600" /> : <Circle size={16} className="text-stone-400" />}
                {s.label}
              </li>
            ))}
          </ul>
          {pending.length > 0 && (
            <button
              onClick={() => onNavigate('college')}
              className="mt-4 rounded-md bg-brand-700 px-4 py-2 font-body text-sm text-white hover:bg-brand-800"
            >
              College information bharo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}