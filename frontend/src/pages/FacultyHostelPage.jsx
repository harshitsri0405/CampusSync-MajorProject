import { useState } from 'react'
import WardenDashboardTab from '../components/WardenDashboardTab.jsx'
import WardenHostelsTab from '../components/WardenHostelsTab.jsx'
import WardenRoomsTab from '../components/WardenRoomsTab.jsx'

const TABS = [
  ['dashboard', 'Dashboard', WardenDashboardTab],
  ['hostels', 'Hostels', WardenHostelsTab],
  ['rooms', 'Rooms', WardenRoomsTab],
]

export default function FacultyHostelPage({ session }) {
  const [tab, setTab] = useState(() => {
    try { return sessionStorage.getItem('warden_tab') || 'dashboard' } catch { return 'dashboard' }
  })
  const pick = (k) => {
    setTab(k)
    try { sessionStorage.setItem('warden_tab', k) } catch { /* ignore */ }
  }
  const Active = (TABS.find((t) => t[0] === tab) || TABS[0])[2]

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="font-display text-2xl text-slate-900">Hostel Management</h2>
      <p className="font-body text-sm text-slate-500 mb-4">Warden console for hostels, rooms and residents.</p>
      <div className="flex flex-wrap gap-1 border-b border-slate-200 mb-5">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => pick(k)} className={`px-4 py-2 font-body text-sm border-b-2 -mb-px ${tab === k ? 'border-green-600 text-green-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{l}</button>
        ))}
      </div>
      <Active session={session} onTab={pick} />
    </div>
  )
}