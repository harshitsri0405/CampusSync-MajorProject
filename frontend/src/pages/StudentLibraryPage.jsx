import { useEffect, useState } from 'react'
import { ArrowLeft, Download, Search } from 'lucide-react'
import {
  getLibraryOverview,
  seedDemoLibrary,
  renewBook,
  getEbooks,
  downloadEbook,
  readEbook,
  seedDemoEbooks,
} from '../api.js'
import PaymentModal from '../components/PaymentModal.jsx'

const TABS = [
  { key: 'issued', label: 'Issued Books' },
  { key: 'history', label: 'Return History' },
  { key: 'fines', label: 'Fine Details' },
  { key: 'ebooks', label: 'E-Books' },
]

const FINE_STATUS = {
  accruing: { label: 'Growing daily', cls: 'bg-red-100 text-red-700' },
  pending: { label: 'Unpaid', cls: 'bg-amber-100 text-amber-700' },
  paid: { label: 'Paid', cls: 'bg-green-100 text-green-700' },
}

const INPUT =
  'rounded-md border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500'

function inr(n) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}

function fmtDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function fileSize(n) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`
}

function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-xl border border-slate-200 p-6 ${className}`}>{children}</div>
}

function Stat({ label, value, tone = 'text-slate-900', hint }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="font-body text-xs text-slate-400">{label}</p>
      <p className={`font-display text-3xl mt-1 ${tone}`}>{value}</p>
      {hint && <p className="font-body text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

function dueChip(book) {
  if (book.is_overdue) {
    return { text: `Overdue by ${plural(-book.days_left, 'day')}`, cls: 'bg-red-100 text-red-700' }
  }
  if (book.days_left === 0) return { text: 'Due today', cls: 'bg-amber-100 text-amber-700' }
  if (book.days_left <= 3) {
    return { text: `Due in ${plural(book.days_left, 'day')}`, cls: 'bg-amber-100 text-amber-700' }
  }
  return { text: `Due in ${plural(book.days_left, 'day')}`, cls: 'bg-green-100 text-green-700' }
}

// pay the fine: the student chooses how much to pay
function FinePay({ pending, onPay }) {
  const [amount, setAmount] = useState(String(pending))
  const [error, setError] = useState('')

  useEffect(() => {
    setAmount(String(pending))
  }, [pending])

  function submit(e) {
    e.preventDefault()
    const n = Number(amount)
    if (!Number.isInteger(n) || n <= 0) {
      setError('Enter the amount in whole rupees.')
      return
    }
    if (n > pending) {
      setError(`You cannot pay more than the fine (${inr(pending)}).`)
      return
    }
    setError('')
    onPay({ purpose: 'library_fine', amount: n, title: 'Library fine' })
  }

  return (
    <Card>
      <h2 className="font-display text-lg text-slate-900">Pay your fine</h2>
      <p className="font-body text-sm text-slate-500 mt-1">
        Fine pending: <strong className="text-slate-900">{inr(pending)}</strong>. You can pay all of it or a part.
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-body text-sm text-slate-500">₹</span>
        <input
          type="number"
          min="1"
          max={pending}
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={`${INPUT} w-32`}
        />
        <button
          type="button"
          onClick={() => setAmount(String(pending))}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 font-body text-xs text-slate-600 hover:bg-slate-50"
        >
          Full {inr(pending)}
        </button>
        <button
          type="submit"
          className="rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-4 py-2"
        >
          Pay fine
        </button>
      </form>
      {error && <p className="font-body text-sm text-red-600 mt-2">{error}</p>}
    </Card>
  )
}

export default function StudentLibraryPage({ session, onBack }) {
  const token = session.access_token
  const [data, setData] = useState(null)
  const [ebooks, setEbooks] = useState([])
  const [tab, setTab] = useState('issued')
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [renewing, setRenewing] = useState(null)
  const [payRequest, setPayRequest] = useState(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    const [overview, books] = await Promise.all([getLibraryOverview(token), getEbooks(token)])
    setData(overview)
    setEbooks(books)
  }

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function handleSeed(fn) {
    setSeeding(true)
    setError('')
    try {
      await fn(token)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSeeding(false)
    }
  }

  async function handleRenew(b) {
    setError('')
    setNotice('')
    setRenewing(b.id)
    try {
      const r = await renewBook(token, b.id)
      await load()
      setNotice(`"${b.title}" renewed. New due date: ${fmtDate(r.due_on)}.`)
    } catch (e) {
      setError(e.message)
    } finally {
      setRenewing(null)
    }
  }

  async function handleEbook(fn, book) {
    setError('')
    try {
      await fn(token, book)
    } catch (e) {
      setError(e.message)
    }
  }

  async function handlePaymentClosed(paid) {
    setPayRequest(null)
    if (paid) {
      try {
        await load()
        setNotice('Your fine payment was recorded.')
      } catch (e) {
        setError(e.message)
      }
    }
  }

  const s = data ? data.summary : null
  const hasRecords = data && (data.issued.length > 0 || data.returned.length > 0)

  const categories = ['All', ...Array.from(new Set(ebooks.map((e) => e.category).filter(Boolean))).sort()]
  const q = search.trim().toLowerCase()
  const visibleEbooks = ebooks.filter(
    (e) =>
      (category === 'All' || e.category === category) &&
      (!q || e.title.toLowerCase().includes(q) || (e.author || '').toLowerCase().includes(q))
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="w-full bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-body text-sm"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="font-display text-lg text-slate-900 ml-2">Library</h1>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {loading && <p className="font-body text-slate-400">Loading library records…</p>}
        {error && <p className="font-body text-sm text-red-600">{error}</p>}
        {notice && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <p className="font-body text-sm text-green-800">{notice}</p>
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Books issued now" value={s.currently_issued} />
              <Stat
                label="Overdue books"
                value={s.overdue}
                tone={s.overdue > 0 ? 'text-red-700' : 'text-slate-900'}
                hint={s.overdue > 0 ? 'Please return them soon' : 'None overdue'}
              />
              <Stat
                label="Fine pending"
                value={inr(s.fine_pending)}
                tone={s.fine_pending > 0 ? 'text-red-700' : 'text-green-700'}
              />
            </div>

            <div className="flex flex-wrap gap-1 border-b border-slate-200">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setTab(t.key)
                    setNotice('')
                  }}
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

            {/* ---------------- Issued books ---------------- */}
            {tab === 'issued' && (
              <>
                {data.issued.length === 0 && (
                  <Card className="text-center">
                    <p className="font-body text-sm text-slate-500">You have no books issued right now.</p>
                    {!hasRecords && (
                      <button
                        onClick={() => handleSeed(seedDemoLibrary)}
                        disabled={seeding}
                        className="mt-4 rounded-md border border-slate-200 bg-white px-4 py-2 font-body text-sm text-purple-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {seeding ? 'Loading…' : 'Load sample data'}
                      </button>
                    )}
                  </Card>
                )}

                <div className="space-y-3">
                  {data.issued.map((b) => {
                    const chip = dueChip(b)
                    return (
                      <div
                        key={b.id}
                        className={`bg-white rounded-xl border p-5 ${b.is_overdue ? 'border-red-200' : 'border-slate-200'}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-display text-base text-slate-900">{b.title}</p>
                            <p className="font-body text-xs text-slate-500 mt-0.5">
                              {b.author || 'Unknown author'}
                              {b.category ? ` · ${b.category}` : ''}
                            </p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-medium ${chip.cls}`}>{chip.text}</span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-body text-sm text-slate-500">
                          <span>
                            Issued on <strong className="text-slate-800">{fmtDate(b.issued_on)}</strong>
                          </span>
                          <span>
                            Due date <strong className="text-slate-800">{fmtDate(b.due_on)}</strong>
                          </span>
                          {b.renewals > 0 && <span>Renewed {plural(b.renewals, 'time')}</span>}
                          {b.is_overdue && (
                            <span>
                              Fine so far <strong className="text-red-700">{inr(b.fine_so_far)}</strong>
                            </span>
                          )}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          {b.can_renew ? (
                            <button
                              onClick={() => handleRenew(b)}
                              disabled={renewing === b.id}
                              className="rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-4 py-2 disabled:opacity-60"
                            >
                              {renewing === b.id ? 'Renewing…' : `Renew for ${s.renew_days} more days`}
                            </button>
                          ) : (
                            b.renew_note && <span className="font-body text-xs text-slate-500">{b.renew_note}</span>
                          )}
                          {b.can_renew && (
                            <span className="font-body text-xs text-slate-400">
                              {s.max_renewals - b.renewals} of {s.max_renewals} renewals left
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* ---------------- Return history ---------------- */}
            {tab === 'history' && (
              <Card>
                {data.returned.length === 0 ? (
                  <p className="font-body text-sm text-slate-500 text-center">You have not returned any books yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full font-body text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                          <th className="py-2 font-normal">Book</th>
                          <th className="py-2 font-normal">Issued</th>
                          <th className="py-2 font-normal">Due</th>
                          <th className="py-2 font-normal">Returned</th>
                          <th className="py-2 font-normal text-right">Fine</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.returned.map((r, i) => (
                          <tr key={`${r.title}-${r.issued_on}-${i}`} className="border-b border-slate-50 last:border-0">
                            <td className="py-2.5">
                              <p className="text-slate-900 font-medium">{r.title}</p>
                              <p className="text-xs text-slate-500">{r.author || ''}</p>
                            </td>
                            <td className="py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(r.issued_on)}</td>
                            <td className="py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(r.due_on)}</td>
                            <td className="py-2.5 whitespace-nowrap">
                              <span className="text-slate-800">{fmtDate(r.returned_on)}</span>
                              {r.days_late > 0 ? (
                                <span className="block text-xs text-red-600">{plural(r.days_late, 'day')} late</span>
                              ) : (
                                <span className="block text-xs text-green-600">On time</span>
                              )}
                            </td>
                            <td className="py-2.5 text-right">
                              {r.fine > 0 ? (
                                <span className="text-red-700 font-medium">{inr(r.fine)}</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {/* ---------------- Fine details + payment ---------------- */}
            {tab === 'fines' && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <Stat label="Total fine" value={inr(s.total_fine)} />
                  <Stat label="Paid" value={inr(s.fine_paid)} tone="text-green-700" />
                  <Stat
                    label="Pending"
                    value={inr(s.fine_pending)}
                    tone={s.fine_pending > 0 ? 'text-red-700' : 'text-green-700'}
                  />
                </div>

                {s.fine_pending > 0 && <FinePay pending={s.fine_pending} onPay={setPayRequest} />}

                <Card>
                  {data.fines.length === 0 ? (
                    <p className="font-body text-sm text-slate-500 text-center">
                      You have no fines. Return books on time to keep it that way.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full font-body text-sm">
                        <thead>
                          <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                            <th className="py-2 font-normal">Book</th>
                            <th className="py-2 font-normal">Due date</th>
                            <th className="py-2 font-normal">Late by</th>
                            <th className="py-2 font-normal text-right">Fine</th>
                            <th className="py-2 font-normal text-right">Paid</th>
                            <th className="py-2 font-normal text-right">Pending</th>
                            <th className="py-2 font-normal text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.fines.map((f, i) => {
                            const st = FINE_STATUS[f.status]
                            return (
                              <tr key={`${f.title}-${f.issued_on}-${i}`} className="border-b border-slate-50 last:border-0">
                                <td className="py-2.5 text-slate-900 font-medium">{f.title}</td>
                                <td className="py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(f.due_on)}</td>
                                <td className="py-2.5 text-slate-600 whitespace-nowrap">{plural(f.days_late, 'day')}</td>
                                <td className="py-2.5 text-right text-slate-900">{inr(f.fine)}</td>
                                <td className="py-2.5 text-right text-green-700">{inr(f.paid)}</td>
                                <td className="py-2.5 text-right text-slate-900">{inr(f.pending)}</td>
                                <td className="py-2.5 text-right">
                                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${st.cls}`}>
                                    {st.label}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>

                <p className="font-body text-xs text-slate-400">
                  Fine is {inr(s.fine_per_day)} per day after the due date (a book can be kept for {s.loan_days} days).
                  The fine of a book that is not returned yet keeps growing every day. You can pay here online or at
                  the library counter.
                </p>
              </>
            )}

            {/* ---------------- E-books ---------------- */}
            {tab === 'ebooks' && (
              <>
                {ebooks.length === 0 ? (
                  <Card className="text-center">
                    <p className="font-display text-lg text-slate-900">No e-books yet</p>
                    <p className="font-body text-sm text-slate-500 mt-2 max-w-md mx-auto">
                      E-books are added by the library admin. When they are added you can read them here or download
                      them. Until then you can load sample e-books to try this section.
                    </p>
                    <button
                      onClick={() => handleSeed(seedDemoEbooks)}
                      disabled={seeding}
                      className="mt-4 rounded-md border border-slate-200 bg-white px-4 py-2 font-body text-sm text-purple-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {seeding ? 'Loading…' : 'Load sample e-books'}
                    </button>
                  </Card>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="relative flex-1 min-w-48">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search by title or author"
                          className={`${INPUT} w-full pl-9`}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {categories.map((c) => (
                          <button
                            key={c}
                            onClick={() => setCategory(c)}
                            className={`rounded-full px-3 py-1.5 font-body text-xs border ${
                              category === c
                                ? 'bg-purple-600 border-purple-600 text-white'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>

                    {visibleEbooks.length === 0 && (
                      <Card className="text-center">
                        <p className="font-body text-sm text-slate-500">No e-books match your search.</p>
                      </Card>
                    )}

                    <div className="grid sm:grid-cols-2 gap-4">
                      {visibleEbooks.map((e) => (
                        <div key={e.id} className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col">
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-display text-base text-slate-900 leading-snug">{e.title}</p>
                            <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[10px] font-medium shrink-0">
                              {e.file_type}
                            </span>
                          </div>
                          <p className="font-body text-xs text-slate-500 mt-1">
                            {e.author || 'Unknown author'}
                            {e.category ? ` · ${e.category}` : ''}
                          </p>
                          {e.description && (
                            <p className="font-body text-sm text-slate-600 mt-2 flex-1">{e.description}</p>
                          )}
                          <p className="font-body text-xs text-slate-400 mt-3">
                            {fileSize(e.size_bytes)} · Added {fmtDate(e.added_on)}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-3">
                            {e.file_type === 'PDF' && (
                              <button
                                onClick={() => handleEbook(readEbook, e)}
                                className="rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-4 py-2"
                              >
                                Read
                              </button>
                            )}
                            <button
                              onClick={() => handleEbook(downloadEbook, e)}
                              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 py-2 font-body text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <Download size={14} /> Download
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      {payRequest && (
        <PaymentModal
          token={token}
          request={payRequest}
          studentName={session.display_name}
          onClose={handlePaymentClosed}
        />
      )}
    </div>
  )
}