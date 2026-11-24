import { useEffect, useState } from 'react'
import { CalendarCheck, Library, UserCheck, GraduationCap, Settings, RotateCcw, Save } from 'lucide-react'
import { getAdminSettings, saveAdminSettings, resetAdminSettings } from '../api.js'

const ACCENT = '#2563EB'
const INPUT =
  'w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const ICONS = { Attendance: CalendarCheck, Library, Mentor: UserCheck, Exams: GraduationCap }

export default function AdminSettingsPage({ session }) {
  const token = session.access_token
  const [items, setItems] = useState([])
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  function apply(d) {
    setItems(d.items)
    setForm(Object.fromEntries(d.items.map((i) => [i.key, String(i.value)])))
  }

  useEffect(() => {
    getAdminSettings(token).then(apply).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [token])

  const groups = [...new Set(items.map((i) => i.group))]
  const dirty = items.filter((i) => String(i.value) !== String(form[i.key]).trim())

  async function save() {
    setError(''); setOk('')
    const values = {}
    for (const i of dirty) {
      const raw = String(form[i.key]).trim()
      if (!/^\d+$/.test(raw)) return setError(`${i.label}: sirf poora number daalo.`)
      values[i.key] = Number(raw)
    }
    setBusy(true)
    try { apply(await saveAdminSettings(token, values)); setOk('Settings save ho gayi.') } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function reset(group) {
    if (!window.confirm(`${group ? group + ' ki' : 'Saari'} settings default par wapas karni hain?`)) return
    setBusy(true); setError(''); setOk('')
    try { apply(await resetAdminSettings(token, group)); setOk('Default values wapas laga di gayi.') } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (loading) return <p className="font-body text-sm text-slate-500">Loading...</p>

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#2563EB1A', color: ACCENT }}><Settings size={19} /></span>
          <div>
            <p className="font-display text-lg text-slate-900">System Settings</p>
            <p className="font-body text-xs text-slate-500">College ke rules. Badlaav turant lagu hote hain.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy} onClick={() => reset(null)}><RotateCcw size={14} /> Sab reset</button>
          <button className="rounded-lg px-4 py-1.5 font-body text-sm text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: ACCENT }} disabled={busy || dirty.length === 0} onClick={save}>
            <Save size={14} /> {busy ? 'Save ho raha hai...' : `Save${dirty.length ? ` (${dirty.length})` : ''}`}
          </button>
        </div>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700 mb-3">{ok}</p>}

      <div className="space-y-4">
        {groups.map((g) => {
          const Icon = ICONS[g] || Settings
          return (
            <div key={g} className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <p className="font-display text-base text-slate-900 flex items-center gap-2"><Icon size={17} style={{ color: ACCENT }} /> {g}</p>
                <button className="font-body text-xs text-slate-500 hover:text-slate-800 disabled:opacity-60" disabled={busy} onClick={() => reset(g)}>Default par wapas</button>
              </div>
              <div className="divide-y divide-slate-100">
                {items.filter((i) => i.group === g).map((i) => {
                  const changed = String(i.value) !== String(form[i.key]).trim()
                  return (
                    <div key={i.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-body text-sm text-slate-900">{i.label}{changed && <span className="ml-2 text-xs text-amber-600">badla hua</span>}</p>
                        <p className="font-body text-xs text-slate-500">{i.help} <span className="text-slate-400">(Default {i.default}, range {i.min}-{i.max})</span></p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input className={INPUT} inputMode="numeric" value={form[i.key] ?? ''} onChange={(e) => setForm({ ...form, [i.key]: e.target.value })} />
                        <span className="font-body text-xs text-slate-500 w-14">{i.unit}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}