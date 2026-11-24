import { useState } from 'react'

function inr(n) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}

// "Pay now" box of one fee head. The student chooses the amount.
export default function FeeItemPay({ item, onPay }) {
  const min = Math.min(100, item.due)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(item.due))
  const [error, setError] = useState('')

  if (item.due <= 0) return null

  function submit(e) {
    e.preventDefault()
    const n = Number(amount)
    if (!Number.isInteger(n) || n <= 0) {
      setError('Enter the amount in whole rupees.')
      return
    }
    if (n < min) {
      setError(`The minimum payment is ${inr(min)}.`)
      return
    }
    if (n > item.due) {
      setError(`You cannot pay more than the due amount (${inr(item.due)}).`)
      return
    }
    setError('')
    onPay({ purpose: 'fee', fee_item_id: item.id, amount: n, title: item.name })
  }

  const half = Math.floor(item.due / 2)

  return (
    <div className="mt-4">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-4 py-2"
        >
          Pay now
        </button>
      ) : (
        <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
          <p className="font-body text-sm text-slate-700">
            How much do you want to pay? You can pay any amount from <strong>{inr(min)}</strong> to{' '}
            <strong>{inr(item.due)}</strong>.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-body text-sm text-slate-500">₹</span>
            <input
              type="number"
              min={min}
              max={item.due}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-36 rounded-md border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              type="button"
              onClick={() => setAmount(String(item.due))}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 font-body text-xs text-slate-600 hover:bg-slate-100"
            >
              Full {inr(item.due)}
            </button>
            {half >= min && half < item.due && (
              <button
                type="button"
                onClick={() => setAmount(String(half))}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 font-body text-xs text-slate-600 hover:bg-slate-100"
              >
                Half {inr(half)}
              </button>
            )}
          </div>
          {error && <p className="font-body text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-4 py-2"
            >
              Proceed to pay
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setError('')
              }}
              className="font-body text-sm text-slate-500 hover:text-slate-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}