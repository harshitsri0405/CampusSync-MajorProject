// Small helpers and building blocks shared by every Hostel tab.

export const INPUT =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500'

export const BTN =
  'rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-5 py-2.5 disabled:opacity-60'

export const BTN_OUTLINE =
  'rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-body text-sm px-4 py-2 disabled:opacity-60'

const pad = (n) => String(n).padStart(2, '0')

// "YYYY-MM-DD" (or a longer ISO string) -> local Date at midnight
export function parseDay(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function dayInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// value for <input type="datetime-local">
export function dateTimeInput(d) {
  return `${dayInput(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtDay(s) {
  if (!s) return '-'
  return parseDay(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const DT_OPTS = { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }

// date-times that the student typed (hostel local time, no timezone)
export function fmtLocal(s) {
  if (!s) return '-'
  return new Date(s).toLocaleString('en-IN', DT_OPTS)
}

// date-times stamped by the server in UTC without a timezone suffix
export function fmtUtc(s) {
  if (!s) return '-'
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`
  return new Date(iso).toLocaleString('en-IN', DT_OPTS)
}

export function fmtClock(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`
}

export function inr(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`
}

export const STATUS = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Approved', cls: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-700 border-red-200' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  open: { label: 'Open', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  in_progress: { label: 'In progress', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  resolved: { label: 'Resolved', cls: 'bg-green-50 text-green-700 border-green-200' },
  checked_in: { label: 'Inside hostel', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  checked_out: { label: 'Visit completed', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  paid: { label: 'Paid', cls: 'bg-green-50 text-green-700 border-green-200' },
  partial: { label: 'Part paid', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  due: { label: 'Due', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  overdue: { label: 'Overdue', cls: 'bg-red-50 text-red-700 border-red-200' },
}

export function StatusPill({ status }) {
  const s = STATUS[status] || STATUS.cancelled
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  )
}

export function NewDot() {
  return <span className="inline-block w-2 h-2 rounded-full bg-purple-600" title="New update" />
}

export function Card({ title, right, children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-5 mb-4 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-display text-base text-slate-900">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

export function Empty({ children }) {
  return <p className="font-body text-sm text-slate-500">{children}</p>
}

export function Field({ label, children, hint }) {
  return (
    <div>
      <label className="font-body text-sm text-slate-600 mb-1 block">{label}</label>
      {children}
      {hint && <p className="font-body text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

export function Message({ error, info }) {
  if (!error && !info) return null
  return (
    <p className={`font-body text-sm mb-3 ${error ? 'text-red-600' : 'text-green-600'}`}>{error || info}</p>
  )
}

// shown by tabs that need a hostel allocation
export function NeedStay() {
  return (
    <Card>
      <p className="font-body text-sm text-slate-600">
        Ye feature use karne ke liye hostel allocation zaroori hai. Allocation hostel warden / admin karenge. Abhi ke
        liye Dashboard tab se sample data load kar sakte ho.
      </p>
    </Card>
  )
}