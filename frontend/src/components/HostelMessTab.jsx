import { useState } from 'react'
import { Star } from 'lucide-react'
import { sendMessFeedback } from '../api.js'
import {
  BTN,
  Card,
  Empty,
  Field,
  INPUT,
  Message,
  dayInput,
  fmtClock,
  fmtDay,
} from './HostelShared.jsx'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function minutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function Stars({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} star`}
          className="p-0.5"
        >
          <Star
            size={22}
            className={n <= value ? 'text-amber-500' : 'text-slate-300'}
            fill={n <= value ? 'currentColor' : 'none'}
          />
        </button>
      ))}
    </div>
  )
}

export default function HostelMessTab({ data, reload }) {
  const mess = data.mess
  const rules = data.rules
  const now = new Date()
  const todayIndex = (now.getDay() + 6) % 7 // Monday = 0
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const mealLabel = Object.fromEntries(data.meals.map((m) => [m.key, m.label]))

  const [feedDate, setFeedDate] = useState(dayInput(now))
  const [feedMeal, setFeedMeal] = useState(data.meals[0]?.key || 'breakfast')
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const menuAt = (day, meal) => {
    const row = mess.menu.find((m) => m.day === day && m.meal === meal)
    return row ? row.items : '-'
  }

  const dateOptions = []
  for (let i = 0; i <= rules.feedback_window_days; i += 1) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dateOptions.push({ value: dayInput(d), label: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : fmtDay(dayInput(d)) })
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (rating < 1) {
      setError('Pehle star rating chuno.')
      return
    }
    setBusy(true)
    try {
      await sendMessFeedback({ meal_date: feedDate, meal: feedMeal, rating, comment: comment.trim() })
      setRating(0)
      setComment('')
      setInfo('Feedback mil gaya. Dhanyavaad!')
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!mess.has_hostel || mess.menu.length === 0) {
    return (
      <Card>
        <Empty>Abhi tumhare hostel ka mess menu publish nahi hua hai.</Empty>
      </Card>
    )
  }

  return (
    <>
      <Card title="Today's meals">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {mess.timings.map((t) => {
            const ongoing = nowMin >= minutes(t.start_time) && nowMin < minutes(t.end_time)
            return (
              <div
                key={t.meal}
                className={`rounded-lg border p-3 ${
                  ongoing ? 'border-purple-300 bg-purple-50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-body text-sm font-medium text-slate-900">{mealLabel[t.meal] || t.meal}</p>
                  {ongoing && (
                    <span className="rounded-full bg-purple-600 text-white px-2 py-0.5 text-xs">Now</span>
                  )}
                </div>
                <p className="font-body text-xs text-slate-500 mt-0.5">
                  {fmtClock(t.start_time)} - {fmtClock(t.end_time)}
                </p>
                <p className="font-body text-sm text-slate-700 mt-2">{menuAt(todayIndex, t.meal)}</p>
              </div>
            )
          })}
        </div>
      </Card>

      {mess.specials.length > 0 && (
        <Card title="Special meals">
          <ul className="space-y-2">
            {mess.specials.map((s) => (
              <li key={s.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="font-body text-xs text-amber-700 font-medium">
                  {fmtDay(s.meal_date)} | {mealLabel[s.meal] || s.meal}
                </p>
                <p className="font-body text-sm text-slate-900">{s.items}</p>
                {s.note && <p className="font-body text-xs text-slate-600 mt-0.5">{s.note}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Weekly menu">
        <div className="overflow-x-auto">
          <table className="w-full font-body text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="py-2 font-normal">Day</th>
                {data.meals.map((m) => (
                  <th key={m.key} className="py-2 font-normal">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((d, i) => (
                <tr
                  key={d}
                  className={`border-b border-slate-50 last:border-0 ${i === todayIndex ? 'bg-purple-50' : ''}`}
                >
                  <td className="py-2.5 pr-3 text-slate-900 font-medium whitespace-nowrap">
                    {d}
                    {i === todayIndex && <span className="ml-2 text-xs text-purple-700">Today</span>}
                  </td>
                  {data.meals.map((m) => (
                    <td key={m.key} className="py-2.5 pr-3 text-slate-600">
                      {menuAt(i, m.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Food feedback">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Date">
              <select value={feedDate} onChange={(e) => setFeedDate(e.target.value)} className={INPUT}>
                {dateOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Meal">
              <select value={feedMeal} onChange={(e) => setFeedMeal(e.target.value)} className={INPUT}>
                {data.meals.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Rating">
            <Stars value={rating} onChange={setRating} />
          </Field>
          <Field label="Comment (optional)">
            <textarea
              rows={2}
              maxLength={300}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Khana kaisa laga?"
              className={INPUT}
            />
          </Field>
          <p className="font-body text-xs text-slate-500">
            Ek meal ka ek hi feedback hota hai, dobara bhejne par purana update ho jayega.
          </p>
          <Message error={error} info={info} />
          <button disabled={busy} className={BTN}>
            {busy ? 'Sending...' : 'Send feedback'}
          </button>
        </form>

        {mess.averages.length > 0 && (
          <div className="mt-6">
            <p className="font-body text-xs text-slate-400 mb-2">Hostel ka average rating (pichhle 30 din)</p>
            <ul className="space-y-2">
              {mess.averages.map((a) => (
                <li key={a.meal}>
                  <div className="flex justify-between font-body text-sm">
                    <span className="text-slate-700">{mealLabel[a.meal] || a.meal}</span>
                    <span className="text-slate-600">
                      {a.average}/5 ({a.count})
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: `${(a.average / 5) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {mess.feedback.length > 0 && (
          <div className="mt-6">
            <p className="font-body text-xs text-slate-400 mb-2">Tumhara recent feedback</p>
            <ul className="divide-y divide-slate-100">
              {mess.feedback.map((f) => (
                <li key={f.id} className="py-2 flex items-start justify-between gap-3 font-body text-sm">
                  <div>
                    <p className="text-slate-800">
                      {mealLabel[f.meal] || f.meal} | {fmtDay(f.meal_date)}
                    </p>
                    {f.comment && <p className="text-xs text-slate-500">{f.comment}</p>}
                  </div>
                  <span className="text-amber-600 whitespace-nowrap">{f.rating}/5</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </>
  )
}
