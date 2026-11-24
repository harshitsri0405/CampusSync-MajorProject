import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cancelHostelRequest, createHostelRequest, markHostelSeen } from '../api.js'
import {
  BTN,
  Card,
  Empty,
  Field,
  INPUT,
  Message,
  NewDot,
  StatusPill,
  dateTimeInput,
  fmtLocal,
  fmtUtc,
} from './HostelShared.jsx'

// next full hour, so the default "from" is never in the past
function nextHour() {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d
}

function defaultReturn(from, kind) {
  const d = new Date(from)
  if (kind === 'outpass') d.setHours(d.getHours() + 4)
  else d.setDate(d.getDate() + 1)
  return d
}

export default function HostelLeaveTab({ data, reload }) {
  const rules = data.rules
  const [kind, setKind] = useState('outpass')
  const [emergency, setEmergency] = useState(false)
  const [fromAt, setFromAt] = useState(() => dateTimeInput(nextHour()))
  const [returnAt, setReturnAt] = useState(() => dateTimeInput(defaultReturn(nextHour(), 'outpass')))
  const [destination, setDestination] = useState('')
  const [reason, setReason] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [openId, setOpenId] = useState(null)
  const [filter, setFilter] = useState('all')

  function changeKind(next) {
    setKind(next)
    setReturnAt(dateTimeInput(defaultReturn(new Date(fromAt), next)))
  }

  function changeFrom(value) {
    setFromAt(value)
    if (value && returnAt && returnAt <= value) {
      setReturnAt(dateTimeInput(defaultReturn(new Date(value), kind)))
    }
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!fromAt || !returnAt) {
      setError('Jaane aur wapas aane ka time dono chuno.')
      return
    }
    if (returnAt <= fromAt) {
      setError('Wapas aane ka time jaane ke time ke baad hona chahiye.')
      return
    }
    if (reason.trim().length < rules.min_reason_len) {
      setError(`Reason kam se kam ${rules.min_reason_len} characters ka likho.`)
      return
    }
    if (emergency && !phone.trim()) {
      setError('Emergency request me contact number zaroori hai.')
      return
    }
    setBusy(true)
    try {
      await createHostelRequest({
        kind,
        is_emergency: emergency,
        destination: destination.trim(),
        reason: reason.trim(),
        contact_phone: phone.trim(),
        from_at: fromAt,
        return_at: returnAt,
      })
      setReason('')
      setDestination('')
      setEmergency(false)
      setInfo('Request warden ko bhej di gayi.')
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function cancel(id) {
    if (!window.confirm('Ye request cancel karni hai?')) return
    setError('')
    setInfo('')
    try {
      await cancelHostelRequest(id)
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggle(r) {
    const next = openId === r.id ? null : r.id
    setOpenId(next)
    if (next && r.has_unseen_update) {
      try {
        await markHostelSeen('request', r.id)
        await reload()
      } catch (e) {
        /* the dot is only a convenience */
      }
    }
  }

  const list = data.requests.filter((r) => filter === 'all' || r.status === filter)
  const minNow = dateTimeInput(new Date())

  return (
    <>
      <Card title="Leave / outpass request">
        <form onSubmit={submit} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              ['outpass', 'Outpass (kuch ghante)'],
              ['leave', 'Hostel leave (kuch din)'],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => changeKind(k)}
                className={`rounded-full border px-4 py-1.5 font-body text-sm ${
                  kind === k
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label
            className={`flex items-start gap-2 rounded-lg border p-3 font-body text-sm ${
              emergency ? 'bg-red-50 border-red-200 text-red-700' : 'border-slate-200 text-slate-700'
            }`}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={emergency}
              onChange={(e) => setEmergency(e.target.checked)}
            />
            <span>
              <span className="font-medium flex items-center gap-1">
                <AlertTriangle size={14} /> Emergency request
              </span>
              <span className="block text-xs mt-0.5">
                Warden ko turant dikhegi. Jaane ka time {`aaj ke pichhle kuch ghante`} ka bhi ho sakta hai. Contact number
                zaroori hai.
              </span>
            </span>
          </label>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Jaane ka date aur time">
              <input
                type="datetime-local"
                required
                min={emergency ? undefined : minNow}
                value={fromAt}
                onChange={(e) => changeFrom(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="Wapas aane ka date aur time">
              <input
                type="datetime-local"
                required
                min={fromAt}
                value={returnAt}
                onChange={(e) => setReturnAt(e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={kind === 'outpass' ? 'Kahan ja rahe ho' : 'Destination (optional)'}>
              <input
                value={destination}
                maxLength={200}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Jaise: market, ghar, hospital"
                className={INPUT}
              />
            </Field>
            <Field label={emergency ? 'Contact number (zaroori)' : 'Contact number (optional)'}>
              <input
                value={phone}
                maxLength={20}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Jis par warden sampark kar sake"
                className={INPUT}
              />
            </Field>
          </div>

          <Field label="Reason">
            <textarea
              rows={3}
              maxLength={rules.max_reason_len}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Request ki wajah likho"
              className={INPUT}
            />
            <p className="font-body text-xs text-slate-400 mt-1 text-right">
              {reason.length}/{rules.max_reason_len}
            </p>
          </Field>

          <p className="font-body text-xs text-slate-500">
            Rules: outpass maximum {rules.outpass_max_hours} ghante, leave maximum {rules.leave_max_days} din. Ek saath
            maximum 3 pending requests.
          </p>

          <Message error={error} info={info} />
          <button disabled={busy} className={BTN}>
            {busy ? 'Sending...' : 'Submit request'}
          </button>
        </form>
      </Card>

      <Card
        title="Request history"
        right={
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-body text-sm"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        }
      >
        {list.length === 0 ? (
          <Empty>Koi request nahi mili.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((r) => (
              <li key={r.id} className="py-3">
                <button type="button" onClick={() => toggle(r)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-base text-slate-900 capitalize">{r.kind}</span>
                        <StatusPill status={r.status} />
                        {r.is_emergency && (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">
                            Emergency
                          </span>
                        )}
                        {r.has_unseen_update && <NewDot />}
                      </div>
                      <p className="font-body text-sm text-slate-600 mt-1">
                        {fmtLocal(r.from_at)} to {fmtLocal(r.return_at)}
                        {r.destination ? ` | ${r.destination}` : ''}
                      </p>
                    </div>
                    <span className="font-body text-xs text-slate-400 whitespace-nowrap">{fmtUtc(r.created_at)}</span>
                  </div>
                </button>

                {openId === r.id && (
                  <div className="mt-3 space-y-2 font-body text-sm text-slate-700">
                    <p>
                      <span className="text-slate-400">Reason: </span>
                      {r.reason}
                    </p>
                    {r.contact_phone && (
                      <p>
                        <span className="text-slate-400">Contact: </span>
                        {r.contact_phone}
                      </p>
                    )}
                    {r.remarks && (
                      <p>
                        <span className="text-slate-400">Warden remarks: </span>
                        {r.remarks}
                        {r.reviewed_by ? ` (${r.reviewed_by})` : ''}
                      </p>
                    )}
                    {r.returned_at && (
                      <p>
                        <span className="text-slate-400">Returned at: </span>
                        {fmtLocal(r.returned_at)}
                      </p>
                    )}
                    {r.can_cancel && (
                      <button
                        type="button"
                        onClick={() => cancel(r.id)}
                        className="font-body text-sm text-red-600 hover:text-red-800"
                      >
                        Cancel request
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
