import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, X, XCircle } from 'lucide-react'
import { startPayment, confirmPayment, cancelPayment } from '../api.js'

const METHODS = ['UPI', 'Card', 'Net Banking']

function inr(n) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = resolve
    s.onerror = () => reject(new Error('Could not load the payment window. Check your internet connection.'))
    document.body.appendChild(s)
  })
}

// request = { purpose: 'fee' | 'library_fine', fee_item_id?, amount, title }
export default function PaymentModal({ token, request, studentName, onClose, onViewReceipt }) {
  const [stage, setStage] = useState('loading') // loading | pay | working | done | error
  const [order, setOrder] = useState(null)
  const [method, setMethod] = useState('UPI')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    startPayment(token, {
      purpose: request.purpose,
      fee_item_id: request.fee_item_id || null,
      amount: request.amount,
    })
      .then((o) => {
        setOrder(o)
        setStage('pay')
      })
      .catch((e) => {
        setError(e.message)
        setStage('error')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const paid = stage === 'done' && !!result && result.status === 'paid'

  async function close() {
    if (stage === 'pay' && order) {
      try {
        await cancelPayment(token, order.order_id)
      } catch {
        /* nothing to do */
      }
    }
    onClose(paid)
  }

  async function payTest(outcome) {
    setStage('working')
    setError('')
    try {
      const r = await confirmPayment(token, order.order_id, { outcome, method })
      setResult(r)
      setStage('done')
    } catch (e) {
      setError(e.message)
      setStage('pay')
    }
  }

  async function payRazorpay() {
    setError('')
    try {
      await loadRazorpay()
    } catch (e) {
      setError(e.message)
      return
    }
    const rz = new window.Razorpay({
      key: order.key_id,
      amount: order.amount * 100,
      currency: 'INR',
      name: 'CampusSync',
      description: order.title,
      order_id: order.gateway_order_id,
      prefill: { name: studentName || '' },
      theme: { color: '#7C3AED' },
      handler: async (resp) => {
        setStage('working')
        try {
          const r = await confirmPayment(token, order.order_id, {
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_signature: resp.razorpay_signature,
          })
          setResult(r)
          setStage('done')
        } catch (e) {
          setError(e.message)
          setStage('error')
        }
      },
    })
    rz.on('payment.failed', (resp) => setError((resp.error && resp.error.description) || 'The payment failed.'))
    rz.open()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 relative">
        {stage !== 'working' && (
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        )}

        {stage === 'loading' && <p className="font-body text-sm text-slate-500 py-8 text-center">Preparing your payment…</p>}

        {stage === 'working' && <p className="font-body text-sm text-slate-500 py-8 text-center">Processing the payment…</p>}

        {stage === 'error' && (
          <div className="py-4">
            <p className="font-display text-lg text-slate-900">Payment could not start</p>
            <p className="font-body text-sm text-red-600 mt-2">{error}</p>
            <button
              type="button"
              onClick={close}
              className="mt-5 rounded-md border border-slate-200 px-4 py-2 font-body text-sm text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        )}

        {stage === 'pay' && order && (
          <div>
            <p className="font-body text-xs text-slate-400">You are paying</p>
            <p className="font-display text-lg text-slate-900">{order.title}</p>
            <p className="font-display text-4xl text-purple-700 mt-2">{inr(order.amount)}</p>

            {order.mode === 'test' ? (
              <>
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="font-body text-xs text-amber-900">
                    <strong>Test mode.</strong> This is a practice payment window. No real money is taken.
                  </p>
                </div>

                <p className="font-body text-sm text-slate-600 mt-4 mb-2">Choose how you want to pay</p>
                <div className="space-y-2">
                  {METHODS.map((m) => (
                    <label
                      key={m}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer ${
                        method === m ? 'border-purple-400 bg-purple-50' : 'border-slate-200'
                      }`}
                    >
                      <input type="radio" name="pay-method" checked={method === m} onChange={() => setMethod(m)} />
                      <span className="font-body text-sm text-slate-800">{m}</span>
                    </label>
                  ))}
                </div>

                {error && <p className="font-body text-sm text-red-600 mt-3">{error}</p>}

                <button
                  type="button"
                  onClick={() => payTest('success')}
                  className="mt-5 w-full rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium py-2.5"
                >
                  Pay {inr(order.amount)}
                </button>
                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => payTest('failed')}
                    className="font-body text-xs text-slate-500 hover:text-red-600"
                  >
                    Try a failed payment (test)
                  </button>
                  <button type="button" onClick={close} className="font-body text-xs text-slate-500 hover:text-slate-800">
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="font-body text-sm text-slate-600 mt-4">
                  You will pay securely through Razorpay (UPI, cards, net banking and wallets).
                </p>
                {error && <p className="font-body text-sm text-red-600 mt-3">{error}</p>}
                <button
                  type="button"
                  onClick={payRazorpay}
                  className="mt-5 w-full rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium py-2.5"
                >
                  Pay {inr(order.amount)} securely
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="mt-3 w-full font-body text-xs text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )}

        {stage === 'done' && result && (
          <div className="py-2 text-center">
            {result.status === 'paid' ? (
              <CheckCircle2 size={44} className="text-green-500 mx-auto" />
            ) : (
              <XCircle size={44} className="text-red-500 mx-auto" />
            )}
            <p className="font-display text-xl text-slate-900 mt-3">
              {result.status === 'paid' ? 'Payment successful' : 'Payment not completed'}
            </p>
            <p className="font-body text-sm text-slate-600 mt-1">{result.message}</p>

            {result.status === 'paid' && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left font-body text-sm space-y-1">
                <p>
                  <span className="text-slate-400">Paid: </span>
                  <strong className="text-slate-900">{inr(result.amount)}</strong> for {result.title}
                </p>
                {result.receipt_no && (
                  <p>
                    <span className="text-slate-400">Receipt no: </span>
                    <span className="text-slate-900">{result.receipt_no}</span>
                  </p>
                )}
                {result.reference && (
                  <p>
                    <span className="text-slate-400">Reference: </span>
                    <span className="text-slate-900 font-mono text-xs">{result.reference}</span>
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {result.status === 'paid' && result.purpose === 'fee' && result.receipt_no && onViewReceipt && (
                <button
                  type="button"
                  onClick={() => onViewReceipt(result.receipt_no)}
                  className="rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-4 py-2"
                >
                  View receipt
                </button>
              )}
              <button
                type="button"
                onClick={() => onClose(paid)}
                className="rounded-md border border-slate-200 px-4 py-2 font-body text-sm text-slate-700 hover:bg-slate-50"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}