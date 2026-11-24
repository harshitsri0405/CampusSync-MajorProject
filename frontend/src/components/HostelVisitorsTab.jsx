import { useState } from 'react'
import { cancelHostelVisitor, markHostelSeen, registerHostelVisitor } from '../api.js'
import {
  BTN,
  Card,
  Empty,
  Field,
  INPUT,
  Message,
  NewDot,
  StatusPill,
  dayInput,
  fmtClock,
  fmtDay,
  fmtLocal,
} from './HostelShared.jsx'

export default function HostelVisitorsTab({ data, reload }) {
  const rules = data.rules
  const today = new Date()
  const last = new Date()
  last.setDate(last.getDate() + rules.visitor_max_ahead_days)

  const [name, setName] = useState('')
  const [relation, setRelation] = useState('')
  const [phone, setPhone] = useState('')
  const [visitDate, setVisitDate] = useState(dayInput(today))
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (name.trim().length < 2) {
      setError('Visitor ka naam likho.')
      return
    }
    if (!phone.trim()) {
      setError('Visitor ka contact number likho.')
      return
    }
    setBusy(true)
    try {
      await registerHostelVisitor({
        visitor_name: name.trim(),
        relation: relation.trim(),
        phone: phone.trim(),
        visit_date: visitDate,
        expected_time: time,
        notes: notes.trim(),
      })
      setName('')
      setRelation('')
      setPhone('')
      setTime('')
      setNotes('')
      setInfo('Visitor request warden ko bhej di gayi.')
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function cancel(id) {
    if (!window.confirm('Ye visitor request cancel karni hai?')) return
    setError('')
    setInfo('')
    try {
      await cancelHostelVisitor(id)
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  async function seen(v) {
    if (!v.has_unseen_update) return
    try {
      await markHostelSeen('visitor', v.id)
      await reload()
    } catch (e) {
      /* the dot is only a convenience */
    }
  }

  return (
    <>
      <Card title="Visitor registration">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Visitor ka naam">
              <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} className={INPUT} />
            </Field>
            <Field label="Relation">
              <input
                value={relation}
                maxLength={50}
                onChange={(e) => setRelation(e.target.value)}
                placeholder="Jaise: father, friend"
                className={INPUT}
              />
            </Field>
            <Field label="Contact number">
              <input value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} className={INPUT} />
            </Field>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Visit date">
              <input
                type="date"
                required
                min={dayInput(today)}
                max={dayInput(last)}
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="Expected time (optional)">
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={INPUT} />
            </Field>
            <Field label="Quick notes (optional)">
              <input
                value={notes}
                maxLength={300}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Visit ki wajah"
                className={INPUT}
              />
            </Field>
          </div>

          <p className="font-body text-xs text-slate-500">
            Visit date aaj se {rules.visitor_max_ahead_days} din ke andar hi ho sakti hai. Ek saath maximum{' '}
            {rules.max_active_visitors} active requests. Entry aur exit ka time gate par warden darj karta hai.
          </p>

          <Message error={error} info={info} />
          <button disabled={busy} className={BTN}>
            {busy ? 'Sending...' : 'Register visitor'}
          </button>
        </form>
      </Card>

      <Card title="Visitor history">
        {data.visitors.length === 0 ? (
          <Empty>Abhi koi visitor request nahi hai.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.visitors.map((v) => (
              <li key={v.id} className="py-3" onClick={() => seen(v)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-base text-slate-900">{v.visitor_name}</span>
                      {v.relation && <span className="font-body text-xs text-slate-500">({v.relation})</span>}
                      <StatusPill status={v.status} />
                      {v.has_unseen_update && <NewDot />}
                    </div>
                    <p className="font-body text-sm text-slate-600 mt-1">
                      {fmtDay(v.visit_date)}
                      {v.expected_time ? ` | ${fmtClock(v.expected_time)}` : ''}
                      {v.phone ? ` | ${v.phone}` : ''}
                    </p>
                    {v.notes && <p className="font-body text-xs text-slate-500 mt-0.5">{v.notes}</p>}
                    <p className="font-body text-xs text-slate-500 mt-1">
                      Entry: {v.entry_time ? fmtLocal(v.entry_time) : '-'} | Exit: {v.exit_time ? fmtLocal(v.exit_time) : '-'}
                      {v.approved_by ? ` | Warden: ${v.approved_by}` : ''}
                    </p>
                    {v.remarks && <p className="font-body text-xs text-slate-600 mt-0.5">Remarks: {v.remarks}</p>}
                  </div>
                  {v.can_cancel && (
                    <button
                      type="button"
                      onClick={() => cancel(v.id)}
                      className="font-body text-sm text-red-600 hover:text-red-800 whitespace-nowrap"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
