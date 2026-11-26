import { useEffect, useState } from 'react'
import { Building2, DoorOpen, BedDouble, KeyRound, MessageSquareWarning, Wallet } from 'lucide-react'
import { facultyHostelDashboard } from '../api.js'

export default function WardenDashboardTab({ session, onTab }) {
  const token = session.access_token
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { facultyHostelDashboard(token).then(setData).catch((e) => setError(e.message)) }, [token])

  if (error) return <p className="font-body text-sm text-red-600">{error}</p>
  if (!data) return <p className="font-body text-sm text-slate-500">Loading...</p>

  const c = data.counts
  const cards = [
    { label: 'Total hostels', value: c.hostels, icon: Building2, to: 'hostels' },
    { label: 'Total rooms', value: c.rooms, icon: DoorOpen, to: 'rooms' },
    { label: 'Occupied rooms', value: c.occupied_rooms, icon: BedDouble, to: 'rooms' },
    { label: 'Available rooms', value: c.available_rooms, icon: KeyRound, to: 'rooms' },
    { label: 'Pending complaints', value: data.pending_complaints ?? '-', icon: MessageSquareWarning, note: data.pending_complaints === null ? 'Available once complaint management is enabled' : '' },
    { label: 'Hostel fee summary', value: data.fee_summary ?? '-', icon: Wallet, note: data.fee_summary === null ? 'Available once fee management is enabled' : '' },
  ]

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        {cards.map((k) => {
          const Icon = k.icon
          return (
            <button key={k.label} disabled={!k.to} onClick={() => k.to && onTab(k.to)} className="text-left bg-white rounded-xl border border-slate-200 shadow-sm p-4 enabled:hover:shadow-md transition">
              <span className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 bg-green-50 text-green-600"><Icon size={18} /></span>
              <p className="font-display text-2xl text-slate-900">{k.value}</p>
              <p className="font-body text-xs text-slate-500">{k.label}</p>
              {k.note && <p className="font-body text-xs text-slate-400 mt-1">{k.note}</p>}
            </button>
          )
        })}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5">
        <h3 className="font-display text-base text-slate-900 mb-3">Bed occupancy</h3>
        <p className="font-body text-sm text-slate-700 mb-2">{c.occupied_beds} of {c.total_beds} beds occupied · {c.available_beds} available · {c.full_rooms} full rooms · {c.maintenance_rooms} under maintenance</p>
        <div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-green-500" style={{ width: `${c.total_beds ? Math.min(100, (c.occupied_beds / c.total_beds) * 100) : 0}%` }} /></div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-display text-base text-slate-900 mb-3">Hostels</h3>
        {data.hostels.length === 0 ? <p className="font-body text-sm text-slate-500">No hostels added yet.</p> : (
          <table className="w-full font-body text-sm">
            <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200"><th className="py-2 pr-3">Hostel</th><th className="pr-3">Type</th><th className="pr-3">Rooms</th><th className="pr-3">Beds</th><th>Occupied</th></tr></thead>
            <tbody>
              {data.hostels.map((h) => (
                <tr key={h.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3 text-slate-800">{h.name}</td><td className="pr-3 text-slate-600">{h.hostel_type}</td>
                  <td className="pr-3">{h.rooms}</td><td className="pr-3">{h.beds}</td>
                  <td>{h.occupied_beds}{h.beds ? ` (${Math.round((h.occupied_beds / h.beds) * 100)}%)` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}