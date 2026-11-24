import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { getHostelOverview, seedHostelDemo } from '../api.js'
import { Card, Message, NeedStay } from '../components/HostelShared.jsx'
import HostelDashboardTab from '../components/HostelDashboardTab.jsx'
import HostelLeaveTab from '../components/HostelLeaveTab.jsx'
import HostelComplaintsTab from '../components/HostelComplaintsTab.jsx'
import HostelVisitorsTab from '../components/HostelVisitorsTab.jsx'
import HostelNoticesTab from '../components/HostelNoticesTab.jsx'
import HostelMessTab from '../components/HostelMessTab.jsx'

// tabs that only make sense for a student who has a hostel room
const TABS = [
  { key: 'dashboard', label: 'Dashboard', needsStay: false },
  { key: 'leave', label: 'Leave & Outpass', needsStay: true },
  { key: 'complaints', label: 'Complaints', needsStay: true },
  { key: 'visitors', label: 'Visitors', needsStay: true },
  { key: 'notices', label: 'Notice Board', needsStay: false },
  { key: 'mess', label: 'Mess', needsStay: true },
]

export default function StudentHostelPage({ session, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('dashboard')
  const [seeding, setSeeding] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      setData(await getHostelOverview())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleSeed() {
    setSeeding(true)
    setError('')
    try {
      await seedHostelDemo()
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSeeding(false)
    }
  }

  // red dot counts per tab (updates from the warden that the student has not opened yet)
  const unseen = data
    ? {
        leave: data.requests.filter((r) => r.has_unseen_update).length,
        complaints: data.complaints.filter((c) => c.has_unseen_update).length,
        visitors: data.visitors.filter((v) => v.has_unseen_update).length,
      }
    : {}

  const current = TABS.find((t) => t.key === tab)
  const locked = data && current.needsStay && !data.stay.allocated

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="w-full bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-body text-sm"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="font-display text-lg text-slate-900 ml-2">Hostel</h1>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {loading && <p className="font-body text-slate-400">Loading hostel...</p>}
        <Message error={error} />

        {data && (
          <>
            {data.stay.is_sample && (
              <p className="font-body text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 mb-4">
                Ye SAMPLE data hai (development ke liye). Real hostel module bante hi asli data yahan dikhega.
              </p>
            )}

            {!data.stay.allocated && (
              <div className="bg-white rounded-xl border border-dashed border-slate-300 p-6 text-center mb-6">
                <p className="font-display text-lg text-slate-900">Hostel allocation baaki hai</p>
                <p className="font-body text-sm text-slate-500 mt-2 max-w-md mx-auto">
                  Warden / admin module bante hi room allocate hoga. Tab tak sample data load karke dekh sakte ho ki
                  ye section kaise kaam karta hai.
                </p>
                <button
                  disabled={seeding}
                  onClick={handleSeed}
                  className="mt-4 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-5 py-2.5 disabled:opacity-60"
                >
                  {seeding ? 'Loading...' : 'Load sample data'}
                </button>
              </div>
            )}

            <div className="flex gap-6 border-b border-slate-200 mb-5 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`pb-2 font-body text-sm font-medium border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
                    tab === t.key
                      ? 'border-purple-600 text-purple-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t.label}
                  {unseen[t.key] > 0 && (
                    <span className="min-w-[18px] h-[18px] rounded-full bg-purple-600 text-white text-[10px] flex items-center justify-center px-1">
                      {unseen[t.key]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {locked ? (
              <NeedStay />
            ) : (
              <>
                {tab === 'dashboard' && <HostelDashboardTab data={data} />}
                {tab === 'leave' && <HostelLeaveTab data={data} reload={load} />}
                {tab === 'complaints' && <HostelComplaintsTab data={data} reload={load} />}
                {tab === 'visitors' && <HostelVisitorsTab data={data} reload={load} />}
                {tab === 'notices' && <HostelNoticesTab data={data} />}
                {tab === 'mess' && <HostelMessTab data={data} reload={load} />}
              </>
            )}
          </>
        )}

        {!loading && !data && !error && (
          <Card>
            <p className="font-body text-sm text-slate-500">Hostel data load nahi ho paya.</p>
          </Card>
        )}
      </div>
    </div>
  )
}