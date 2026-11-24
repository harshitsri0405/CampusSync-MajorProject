import { BedDouble, Building2, Phone } from 'lucide-react'
import { Card, Empty, StatusPill, fmtDay, inr } from './HostelShared.jsx'

function Stat({ label, value, hint, tone = 'text-slate-900' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="font-body text-xs text-slate-400">{label}</p>
      <p className={`font-display text-3xl mt-1 ${tone}`}>{value}</p>
      {hint && <p className="font-body text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

export default function HostelDashboardTab({ data }) {
  const { stay, stats, fees } = data
  const paidPct = fees.total > 0 ? Math.round((fees.paid / fees.total) * 100) : 0

  return (
    <>
      {stay.allocated ? (
        <Card>
          <div className="flex flex-wrap items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
              <Building2 size={22} className="text-purple-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-body text-xs text-slate-400">Your hostel</p>
              <p className="font-display text-xl text-slate-900">{stay.hostel_name}</p>
              <p className="font-body text-sm text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                <span className="flex items-center gap-1">
                  <BedDouble size={14} /> Room {stay.room_no} | Floor {stay.floor} | {stay.room_type}
                </span>
                {stay.allocated_on && <span>Since {fmtDay(stay.allocated_on)}</span>}
              </p>
            </div>
            {stay.warden_name && (
              <div className="font-body text-sm text-slate-600 sm:text-right">
                <p className="text-xs text-slate-400">Warden</p>
                <p className="text-slate-900">{stay.warden_name}</p>
                {stay.warden_phone && (
                  <p className="flex items-center gap-1 sm:justify-end">
                    <Phone size={12} /> {stay.warden_phone}
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card>
          <p className="font-body text-sm text-slate-600">
            Tumhe abhi koi hostel room allocate nahi hua hai. Allocation hone par yahan room aur warden ki details
            dikhengi.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <Stat label="Total hostels" value={stats.total_hostels} />
        <Stat label="Total rooms" value={stats.total_rooms} />
        <Stat label="Occupied rooms" value={stats.occupied_rooms} hint="Rooms with at least one student" />
        <Stat label="Available rooms" value={stats.available_rooms} hint={`${stats.free_beds} free bed(s)`} />
        <Stat
          label="Your pending complaints"
          value={stats.pending_complaints}
          tone={stats.pending_complaints > 0 ? 'text-amber-700' : 'text-slate-900'}
        />
        <Stat
          label="Hostel fee due"
          value={inr(fees.due)}
          hint={fees.overdue > 0 ? `${inr(fees.overdue)} overdue` : 'Nothing overdue'}
          tone={fees.overdue > 0 ? 'text-red-700' : 'text-slate-900'}
        />
      </div>

      <Card title="Hostel fee summary">
        {fees.items.length === 0 ? (
          <Empty>Abhi koi hostel fee record nahi hai.</Empty>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="font-body text-xs text-slate-400">Total</p>
                <p className="font-display text-xl text-slate-900">{inr(fees.total)}</p>
              </div>
              <div>
                <p className="font-body text-xs text-slate-400">Paid</p>
                <p className="font-display text-xl text-green-700">{inr(fees.paid)}</p>
              </div>
              <div>
                <p className="font-body text-xs text-slate-400">Due</p>
                <p className="font-display text-xl text-slate-900">{inr(fees.due)}</p>
              </div>
              <div>
                <p className="font-body text-xs text-slate-400">Overdue</p>
                <p className={`font-display text-xl ${fees.overdue > 0 ? 'text-red-700' : 'text-slate-900'}`}>
                  {inr(fees.overdue)}
                </p>
              </div>
            </div>
            <div className="mt-4 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-green-500" style={{ width: `${paidPct}%` }} />
            </div>
            <p className="font-body text-xs text-slate-500 mt-1">{paidPct}% paid</p>

            <div className="overflow-x-auto mt-4">
              <table className="w-full font-body text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="py-2 font-normal">Fee</th>
                    <th className="py-2 font-normal">Amount</th>
                    <th className="py-2 font-normal">Paid</th>
                    <th className="py-2 font-normal">Due date</th>
                    <th className="py-2 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fees.items.map((f) => (
                    <tr key={f.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 text-slate-800">
                        {f.title}
                        {f.receipt_no && <span className="block text-xs text-slate-400">Receipt {f.receipt_no}</span>}
                      </td>
                      <td className="py-2.5 text-slate-700">{inr(f.amount)}</td>
                      <td className="py-2.5 text-slate-700">{inr(f.paid_amount)}</td>
                      <td className="py-2.5 text-slate-500">{fmtDay(f.due_date)}</td>
                      <td className="py-2.5">
                        <StatusPill status={f.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </>
  )
}
