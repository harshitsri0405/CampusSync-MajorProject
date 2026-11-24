import { useEffect, useState } from 'react'
import { ArrowLeft, Printer } from 'lucide-react'
import { getFeesOverview, getFeeReceipt, seedDemoFees } from '../api.js'
import FeeItemPay from '../components/FeeItemPay.jsx'
import PaymentModal from '../components/PaymentModal.jsx'
const TABS = [
  { key: 'status', label: 'Fee Status' },
  { key: 'history', label: 'Payment History' },
  { key: 'receipts', label: 'Receipts' },
]

const STATUS = {
  paid: { label: 'Paid', cls: 'bg-green-100 text-green-700', bar: 'bg-green-500' },
  partial: { label: 'Partly paid', cls: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500' },
  pending: { label: 'Pending', cls: 'bg-slate-100 text-slate-600', bar: 'bg-slate-400' },
  overdue: { label: 'Overdue', cls: 'bg-red-100 text-red-700', bar: 'bg-red-500' },
}

function inr(n) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}

function fmtDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-xl border border-slate-200 p-6 ${className}`}>{children}</div>
}

function Stat({ label, value, tone = 'text-slate-900', hint }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="font-body text-xs text-slate-400">{label}</p>
      <p className={`font-display text-2xl mt-1 ${tone}`}>{value}</p>
      {hint && <p className="font-body text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

export default function StudentFeesPage({ session, onBack }) {
  const token = session.access_token
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('status')
  const [receipt, setReceipt] = useState(null)
  const [receiptBusy, setReceiptBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState('')
  const [payRequest, setPayRequest] = useState(null)

  async function handlePaymentClosed(paid) {
    setPayRequest(null)
    if (paid) {
      try {
        await load()
      } catch (e) {
        setError(e.message)
      }
    }
  }
  async function load() {
    setData(await getFeesOverview(token))
  }

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function handleSeed() {
    setSeeding(true)
    setError('')
    try {
      await seedDemoFees(token)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSeeding(false)
    }
  }

  async function openReceipt(receiptNo) {
    setError('')
    setTab('receipts')
    setReceiptBusy(true)
    try {
      setReceipt(await getFeeReceipt(token, receiptNo))
    } catch (e) {
      setError(e.message)
    } finally {
      setReceiptBusy(false)
    }
  }

  const items = data ? data.items : []
  const payments = data ? data.payments : []
  const s = data ? data.summary : null
  const hasData = data && data.class_known && (items.length > 0 || payments.length > 0)
  const paidPct = s && s.total_fee > 0 ? Math.round((s.total_paid * 100) / s.total_fee) : 0

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="w-full bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-body text-sm"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="font-display text-lg text-slate-900 ml-2">Fee Management</h1>
        {data && data.class_known && (
          <span className="font-body text-sm text-slate-500 ml-auto">
            {data.course} · Semester {data.semester}
          </span>
        )}
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {loading && <p className="font-body text-slate-400">Loading fee details…</p>}
        {error && <p className="font-body text-sm text-red-600">{error}</p>}

        {!loading && data && !data.class_known && (
          <Card className="text-center p-8">
            <p className="font-display text-lg text-slate-900">Your class is not set yet</p>
            <p className="font-body text-sm text-slate-500 mt-2 max-w-md mx-auto">
              Fees are set for a class. Open <strong>Student Profile</strong>, fill in your
              <strong> Course</strong> and <strong>Semester</strong> under Academic Information, then come back here.
            </p>
          </Card>
        )}

        {!loading && data && data.class_known && !hasData && (
          <Card className="text-center p-8">
            <p className="font-display text-lg text-slate-900">No fee details yet</p>
            <p className="font-body text-sm text-slate-500 mt-2 max-w-md mx-auto">
              The fee structure for {data.course}, Semester {data.semester} will appear here once the college sets it.
              Until then you can load sample data to try this screen.
            </p>
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="mt-5 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-5 py-2.5 disabled:opacity-60"
            >
              {seeding ? 'Loading…' : 'Load sample data'}
            </button>
          </Card>
        )}

        {hasData && (
          <>
            <div className="flex flex-wrap gap-1 border-b border-slate-200">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-2.5 font-body text-sm -mb-px border-b-2 ${
                    tab === t.key
                      ? 'border-purple-600 text-purple-700 font-medium'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ---------------- Fee status ---------------- */}
            {tab === 'status' && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Stat label="Total fee" value={inr(s.total_fee)} />
                  <Stat label="Paid" value={inr(s.total_paid)} tone="text-green-700" />
                  <Stat label="Due" value={inr(s.total_due)} tone={s.total_due > 0 ? 'text-slate-900' : 'text-green-700'} />
                  <Stat
                    label="Overdue"
                    value={inr(s.overdue_amount)}
                    tone={s.overdue_amount > 0 ? 'text-red-700' : 'text-slate-900'}
                    hint={s.overdue_amount > 0 ? 'Please pay as soon as possible' : 'Nothing overdue'}
                  />
                </div>

                <Card>
                  <div className="flex items-center justify-between font-body text-sm">
                    <span className="text-slate-600">Fees paid so far</span>
                    <span className="text-slate-900 font-medium">{paidPct}%</span>
                  </div>
                  <div className="mt-2 h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: `${Math.min(paidPct, 100)}%` }} />
                  </div>
                  {s.next_due_date && (
                    <p className="font-body text-sm text-slate-600 mt-4">
                      Next payment due: <strong className="text-slate-900">{s.next_due_name}</strong>,{' '}
                      <strong className="text-slate-900">{inr(s.next_due_amount)}</strong> by{' '}
                      {fmtDate(s.next_due_date)}
                    </p>
                  )}
                </Card>

               <div className="space-y-3">
                  {items.map((i) => {
                    const st = STATUS[i.status]
                    const pct = i.amount > 0 ? Math.round((i.paid * 100) / i.amount) : 0
                    return (
                      <div key={i.id} className="bg-white rounded-xl border border-slate-200 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-display text-base text-slate-900">{i.name}</p>
                            <p className="font-body text-xs text-slate-500 mt-0.5">Due date: {fmtDate(i.due_date)}</p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-body text-sm">
                          <span className="text-slate-500">
                            Fee <strong className="text-slate-900">{inr(i.amount)}</strong>
                          </span>
                          <span className="text-slate-500">
                            Paid <strong className="text-green-700">{inr(i.paid)}</strong>
                          </span>
                          <span className="text-slate-500">
                            Due{' '}
                            <strong className={i.due > 0 ? 'text-slate-900' : 'text-green-700'}>{inr(i.due)}</strong>
                          </span>
                        </div>
                        <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div className={`h-full ${st.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <FeeItemPay item={i} onPay={setPayRequest} />
                      </div>
                    )
                  })}
                </div>

                <p className="font-body text-xs text-slate-400">
                  You can pay online here (any amount you choose, up to the due amount) or at the college accounts
                  office. Every payment appears in Payment History with a receipt.
                </p>
              </>
            )}

            {/* ---------------- Payment history ---------------- */}
            {tab === 'history' && (
              <Card>
                {payments.length === 0 ? (
                  <p className="font-body text-sm text-slate-500 text-center">No payments have been recorded yet.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full font-body text-sm">
                        <thead>
                          <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                            <th className="py-2 font-normal">Date</th>
                            <th className="py-2 font-normal">Fee</th>
                            <th className="py-2 font-normal">Mode</th>
                            <th className="py-2 font-normal">Reference</th>
                            <th className="py-2 font-normal text-right">Amount</th>
                            <th className="py-2 font-normal text-right">Receipt</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((p) => (
                            <tr key={p.receipt_no} className="border-b border-slate-50 last:border-0">
                              <td className="py-2.5 text-slate-800 whitespace-nowrap">{fmtDate(p.paid_on)}</td>
                              <td className="py-2.5 text-slate-700">{p.fee_name}</td>
                              <td className="py-2.5 text-slate-600">{p.mode}</td>
                              <td className="py-2.5 text-slate-500 font-mono text-xs">{p.reference || '—'}</td>
                              <td className="py-2.5 text-right text-slate-900 font-medium">{inr(p.amount)}</td>
                              <td className="py-2.5 text-right">
                                <button
                                  onClick={() => openReceipt(p.receipt_no)}
                                  className="font-body text-sm text-purple-700 hover:text-purple-900"
                                >
                                  View
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="font-body text-sm text-slate-600 mt-4 text-right">
                      Total paid: <strong className="text-slate-900">{inr(payments.reduce((t, p) => t + p.amount, 0))}</strong>
                    </p>
                  </>
                )}
              </Card>
            )}

            {/* ---------------- Receipts ---------------- */}
            {tab === 'receipts' && (
              <>
                {receiptBusy && <p className="font-body text-slate-400">Loading receipt…</p>}

                {receipt && !receiptBusy && (
                  <>
                    <div className="flex gap-2">
                      <button
                        onClick={() => window.print()}
                        className="flex items-center gap-1.5 rounded-md bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 font-body text-sm"
                      >
                        <Printer size={14} /> Print / Save as PDF
                      </button>
                      <button
                        onClick={() => setReceipt(null)}
                        className="rounded-md border border-slate-200 bg-white px-3 py-2 font-body text-sm text-slate-600 hover:bg-slate-50"
                      >
                        Close receipt
                      </button>
                    </div>

                    <div className="print-area bg-white rounded-xl border border-slate-300 p-8">
                      <div className="text-center border-b border-slate-200 pb-4">
                        <p className="font-display text-2xl text-slate-900">
                          Campus<span className="text-purple-600">Sync</span>
                        </p>
                        <p className="font-body text-sm text-slate-500 mt-1">Fee Receipt</p>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 py-4 font-body text-sm">
                        <p><span className="text-slate-400">Receipt no: </span><span className="text-slate-800 font-medium">{receipt.receipt_no}</span></p>
                        <p><span className="text-slate-400">Date: </span><span className="text-slate-800">{fmtDate(receipt.paid_on)}</span></p>
                        <p><span className="text-slate-400">Student: </span><span className="text-slate-800">{receipt.student_name}</span></p>
                        <p><span className="text-slate-400">College ID: </span><span className="text-slate-800">{receipt.college_id}</span></p>
                        <p><span className="text-slate-400">Course: </span><span className="text-slate-800">{receipt.course || '—'}</span></p>
                        <p><span className="text-slate-400">Semester: </span><span className="text-slate-800">{receipt.semester || '—'}</span></p>
                      </div>

                      <table className="w-full font-body text-sm border-t border-slate-200">
                        <thead>
                          <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                            <th className="py-2 font-medium">Particulars</th>
                            <th className="py-2 font-medium text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-slate-100">
                            <td className="py-2 text-slate-800">{receipt.fee_name}</td>
                            <td className="py-2 text-right text-slate-900 font-medium">{inr(receipt.amount)}</td>
                          </tr>
                        </tbody>
                      </table>

                      <p className="font-body text-sm text-slate-700 mt-3">
                        <span className="text-slate-400">Amount in words: </span>
                        {receipt.amount_in_words}
                      </p>

                      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 mt-4 font-body text-sm">
                        <p><span className="text-slate-400">Payment mode: </span><span className="text-slate-800">{receipt.mode}</span></p>
                        <p><span className="text-slate-400">Reference: </span><span className="text-slate-800">{receipt.reference || '—'}</span></p>
                        <p><span className="text-slate-400">Total fee for this head: </span><span className="text-slate-800">{inr(receipt.fee_total)}</span></p>
                        <p><span className="text-slate-400">Paid till this receipt: </span><span className="text-slate-800">{inr(receipt.paid_till_date)}</span></p>
                        <p><span className="text-slate-400">Balance: </span><strong className="text-slate-900">{inr(receipt.balance)}</strong></p>
                        <p><span className="text-slate-400">Received by: </span><span className="text-slate-800">{receipt.received_by || '—'}</span></p>
                      </div>

                      <p className="font-body text-xs text-slate-400 mt-6 pt-3 border-t border-slate-100">
                        This is a computer-generated receipt from CampusSync and does not need a signature.
                      </p>
                    </div>
                  </>
                )}

                <Card>
                  <h2 className="font-display text-lg text-slate-900 mb-4">Your receipts</h2>
                  {payments.length === 0 ? (
                    <p className="font-body text-sm text-slate-500">No receipts yet. They appear after a payment is recorded.</p>
                  ) : (
                    <ul className="space-y-2">
                      {payments.map((p) => (
                        <li
                          key={p.receipt_no}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3"
                        >
                                {payRequest && (
        <PaymentModal
          token={token}
          request={payRequest}
          studentName={session.display_name}
          onClose={handlePaymentClosed}
          onViewReceipt={async (no) => {
            setPayRequest(null)
            await load()
            openReceipt(no)
          }}
        />
      )}
                          <div className="min-w-0">
                            <p className="font-body text-sm text-slate-900 font-medium">{p.fee_name}</p>
                            <p className="font-body text-xs text-slate-500">
                              {p.receipt_no} · {fmtDate(p.paid_on)} · {p.mode}
                            </p>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="font-display text-base text-slate-900">{inr(p.amount)}</span>
                            <button
                              onClick={() => openReceipt(p.receipt_no)}
                              className="rounded-md border border-slate-200 px-3 py-1.5 font-body text-sm text-purple-700 hover:bg-slate-50"
                            >
                              View receipt
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}