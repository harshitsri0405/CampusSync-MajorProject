import { useCallback, useEffect, useState } from 'react'
import { Library, BookCheck, Clock, AlertTriangle, Plus, Pencil, Trash2, Search, X, Database, ArrowLeftRight, Undo2, PowerOff, Power, IndianRupee } from 'lucide-react'
import {
  librarySummary, listAdminBooks, saveAdminBook, toggleAdminBook, deleteAdminBook, findLibraryStudents,
  listLibraryIssues, issueBook, returnBook, seedDemoAdminLibrary,
} from '../api.js'

const ACCENT = '#2563EB'
const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const PRIMARY = 'rounded-lg px-4 py-2 font-body text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const STATUS = {
  active: { label: 'Issued', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  overdue: { label: 'Overdue', cls: 'bg-red-50 text-red-700 border-red-200' },
  returned: { label: 'Returned', cls: 'bg-green-50 text-green-700 border-green-200' },
}
const PAGE_SIZE = 10

const fmt = (d) => {
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
      <span className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${color}1A`, color }}><Icon size={20} /></span>
      <div>
        <p className="font-display text-2xl text-slate-900 leading-tight">{value}</p>
        <p className="font-body text-xs text-slate-500">{label}</p>
      </div>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-display text-lg text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

const Label = ({ children }) => <label className="font-body text-sm text-slate-600 mb-1 block">{children}</label>

function Pager({ page, total, setPage }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  return (
    <div className="flex items-center justify-between mt-3 font-body text-sm text-slate-500">
      <span>Total: {total}</span>
      <div className="flex items-center gap-2">
        <button className={OUTLINE} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page} / {pages}</span>
        <button className={OUTLINE} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  )
}

/* ---------------------------------- Books ---------------------------------- */
function Books({ token, setError, setInfo, onChanged, tick }) {
  const [data, setData] = useState({ items: [], total: 0, categories: [] })
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [availability, setAvailability] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setPage(1) }, [q, category, availability])

  const load = useCallback(() => {
    setLoading(true)
    return listAdminBooks(token, { q, category, availability, page, pageSize: PAGE_SIZE })
      .then((d) => { setData(d); setError('') })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, q, category, availability, page, setError])

  useEffect(() => { load() }, [load, tick])

  async function save(e) {
    e.preventDefault()
    setFormError(''); setSaving(true)
    try {
      await saveAdminBook(token, form.id, { title: form.title, author: form.author, category: form.category, isbn: form.isbn, copies: Number(form.copies), shelf: form.shelf })
      setInfo(form.id ? 'Book update ho gayi.' : 'Book add ho gayi.')
      setForm(null)
      await load()
      onChanged()
    } catch (err) { setFormError(err.message) } finally { setSaving(false) }
  }

  async function run(fn, ok) {
    setBusy(true); setError(''); setInfo('')
    try { await fn(); setInfo(ok); await load(); onChanged() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-3 text-slate-400" />
            <input className={`${INPUT} pl-9 w-64`} placeholder="Title, author ya ISBN" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={`${INPUT} w-44`} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {data.categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className={`${INPUT} w-44`} value={availability} onChange={(e) => setAvailability(e.target.value)}>
            <option value="">All books</option>
            <option value="available">Available</option>
            <option value="unavailable">Not available</option>
          </select>
        </div>
        <button className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: ACCENT }} onClick={() => { setFormError(''); setInfo(''); setForm({ title: '', author: '', category: '', isbn: '', copies: 1, shelf: '' }) }}><Plus size={16} /> Add Book</button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
            <th className="px-4 py-3 font-medium">Book</th><th className="px-4 py-3 font-medium">Category</th><th className="px-4 py-3 font-medium">Shelf</th><th className="px-4 py-3 font-medium">Copies</th><th className="px-4 py-3 font-medium">Available</th><th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>}
            {!loading && data.items.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{q || category || availability ? 'Koi book match nahi hui.' : 'Abhi koi book nahi hai. "Add Book" dabao.'}</td></tr>}
            {!loading && data.items.map((b) => (
              <tr key={b.id} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/60 ${b.is_active ? '' : 'opacity-60'}`}>
                <td className="px-4 py-3"><p className="text-slate-900 font-medium">{b.title}{!b.is_active && <span className="ml-2 text-xs text-slate-500">(inactive)</span>}</p><p className="text-xs text-slate-500">{b.author || '-'}{b.isbn ? ` · ${b.isbn}` : ''}</p></td>
                <td className="px-4 py-3 text-slate-700">{b.category || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{b.shelf || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{b.copies}</td>
                <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${b.available > 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{b.available} / {b.copies}</span></td>
                <td className="px-4 py-3"><div className="flex justify-end gap-2">
                  <button className={`${OUTLINE} flex items-center gap-1`} onClick={() => { setFormError(''); setInfo(''); setForm({ id: b.id, title: b.title, author: b.author || '', category: b.category || '', isbn: b.isbn || '', copies: b.copies, shelf: b.shelf || '' }) }}><Pencil size={13} /> Edit</button>
                  <button className={`${OUTLINE} flex items-center gap-1`} disabled={busy} onClick={() => run(() => toggleAdminBook(token, b.id), b.is_active ? 'Book deactivate ho gayi.' : 'Book activate ho gayi.')}>{b.is_active ? <PowerOff size={13} /> : <Power size={13} />}{b.is_active ? 'Deactivate' : 'Activate'}</button>
                  <button className="rounded-lg border border-red-200 bg-white px-3 py-1.5 font-body text-sm text-red-600 hover:bg-red-50 flex items-center gap-1" disabled={busy} onClick={() => window.confirm(`"${b.title}" delete karni hai?`) && run(() => deleteAdminBook(token, b.id), 'Book delete ho gayi.')}><Trash2 size={13} /> Delete</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={data.total} setPage={setPage} />

      {form && (
        <Modal title={form.id ? 'Edit Book' : 'Add Book'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-4">
            {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
            <div><Label>Title *</Label><input className={INPUT} maxLength={150} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Author</Label><input className={INPUT} maxLength={100} value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} /></div>
              <div><Label>Category</Label><input className={INPUT} maxLength={50} list="lib-cats" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /><datalist id="lib-cats">{data.categories.map((c) => <option key={c} value={c} />)}</datalist></div>
              <div><Label>ISBN</Label><input className={INPUT} maxLength={20} value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} /></div>
              <div><Label>Shelf</Label><input className={INPUT} maxLength={30} value={form.shelf} onChange={(e) => setForm({ ...form, shelf: e.target.value })} placeholder="e.g. A-12" /></div>
              <div><Label>Copies *</Label><input className={INPUT} type="number" min={1} max={500} value={form.copies} onChange={(e) => setForm({ ...form, copies: e.target.value })} /></div>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className={PRIMARY} style={{ background: ACCENT }}>{saving ? 'Saving...' : 'Save'}</button>
              <button type="button" className={OUTLINE} onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

/* ------------------------------ Issue / Return ------------------------------ */
function Issues({ token, rules, setError, setInfo, onChanged, tick }) {
  const [data, setData] = useState({ items: [], total: 0 })
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [issue, setIssue] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [ret, setRet] = useState(null)
  const [studentQ, setStudentQ] = useState('')
  const [students, setStudents] = useState([])
  const [bookQ, setBookQ] = useState('')
  const [books, setBooks] = useState([])

  useEffect(() => { setPage(1) }, [status, q])

  const load = useCallback(() => {
    setLoading(true)
    return listLibraryIssues(token, { status, q, page, pageSize: PAGE_SIZE })
      .then((d) => { setData(d); setError('') })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, status, q, page, setError])

  useEffect(() => { load() }, [load, tick])

  useEffect(() => {
    if (!issue || studentQ.trim().length < 1 || issue.student) return setStudents([])
    const t = setTimeout(() => findLibraryStudents(token, studentQ.trim()).then((d) => setStudents(d.items)).catch(() => setStudents([])), 250)
    return () => clearTimeout(t)
  }, [token, studentQ, issue])

  useEffect(() => {
    if (!issue || issue.book) return setBooks([])
    const t = setTimeout(() => listAdminBooks(token, { q: bookQ.trim(), availability: 'available', page: 1, pageSize: 6 }).then((d) => setBooks(d.items)).catch(() => setBooks([])), 250)
    return () => clearTimeout(t)
  }, [token, bookQ, issue])

  async function submitIssue(e) {
    e.preventDefault()
    setFormError('')
    if (!issue.student || !issue.book) return setFormError('Student aur book dono chuno.')
    setSaving(true)
    try {
      const r = await issueBook(token, { student_id: issue.student.id, book_id: issue.book.id, days: Number(issue.days) })
      setInfo(`Book issue ho gayi. Wapsi ki date: ${fmt(r.due_on)}`)
      setIssue(null)
      await load()
      onChanged()
    } catch (err) { setFormError(err.message) } finally { setSaving(false) }
  }

  async function submitReturn(e) {
    e.preventDefault()
    setFormError(''); setSaving(true)
    try {
      const r = await returnBook(token, ret.row.id, ret.fine)
      setInfo(`Book wapas le li.${r.fine ? ` Fine liya: ₹${r.fine}.` : ''}`)
      setRet(null)
      await load()
      onChanged()
    } catch (err) { setFormError(err.message) } finally { setSaving(false) }
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-3 text-slate-400" />
            <input className={`${INPUT} pl-9 w-64`} placeholder="Student ya book" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={`${INPUT} w-40`} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All records</option>
            <option value="active">Issued (abhi)</option>
            <option value="overdue">Overdue</option>
            <option value="returned">Returned</option>
          </select>
        </div>
        <button className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: ACCENT }} onClick={() => { setFormError(''); setInfo(''); setStudentQ(''); setBookQ(''); setIssue({ student: null, book: null, days: rules.loan_days }) }}><ArrowLeftRight size={16} /> Issue Book</button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
            <th className="px-4 py-3 font-medium">Student</th><th className="px-4 py-3 font-medium">Book</th><th className="px-4 py-3 font-medium">Issued</th><th className="px-4 py-3 font-medium">Due</th><th className="px-4 py-3 font-medium">Fine</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium text-right">Action</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>}
            {!loading && data.items.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Koi record nahi mila.</td></tr>}
            {!loading && data.items.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3"><p className="text-slate-900 font-medium">{r.student}</p><p className="text-xs text-slate-500">{r.college_id}</p></td>
                <td className="px-4 py-3 text-slate-700">{r.book}</td>
                <td className="px-4 py-3 text-slate-700">{fmt(r.issued_on)}</td>
                <td className="px-4 py-3 text-slate-700">{r.returned_on ? `Wapas: ${fmt(r.returned_on)}` : fmt(r.due_on)}</td>
                <td className="px-4 py-3 text-slate-700">{r.status === 'returned' ? `₹${r.fine_paid}` : r.fine_due ? <span className="text-red-600 font-medium">₹{r.fine_due} ({r.overdue_days} din)</span> : '-'}</td>
                <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span></td>
                <td className="px-4 py-3 text-right">{r.status !== 'returned' && <button className={`${OUTLINE} inline-flex items-center gap-1`} onClick={() => { setFormError(''); setInfo(''); setRet({ row: r, fine: r.fine_due }) }}><Undo2 size={13} /> Return</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={data.total} setPage={setPage} />

      {issue && (
        <Modal title="Issue Book" onClose={() => setIssue(null)}>
          <form onSubmit={submitIssue} className="space-y-4">
            {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
            <div>
              <Label>Student *</Label>
              {issue.student ? (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-body text-sm"><span>{issue.student.name} ({issue.student.college_id}) · {issue.student.holding}/{rules.max_books} books</span><button type="button" className="text-slate-500" onClick={() => setIssue({ ...issue, student: null })}><X size={15} /></button></div>
              ) : (
                <>
                  <input className={INPUT} placeholder="Naam ya college ID type karo" value={studentQ} onChange={(e) => setStudentQ(e.target.value)} />
                  {students.length > 0 && <div className="mt-1 rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-44 overflow-y-auto">{students.map((s) => (
                    <button type="button" key={s.id} className="w-full text-left px-3 py-2 font-body text-sm hover:bg-slate-50" onClick={() => setIssue({ ...issue, student: s })}>{s.name} <span className="text-slate-500">({s.college_id}) · {s.holding} books</span></button>
                  ))}</div>}
                </>
              )}
            </div>
            <div>
              <Label>Book * (sirf available)</Label>
              {issue.book ? (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-body text-sm"><span>{issue.book.title} · {issue.book.available} copies</span><button type="button" className="text-slate-500" onClick={() => setIssue({ ...issue, book: null })}><X size={15} /></button></div>
              ) : (
                <>
                  <input className={INPUT} placeholder="Title ya ISBN type karo" value={bookQ} onChange={(e) => setBookQ(e.target.value)} />
                  {books.length > 0 && <div className="mt-1 rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-44 overflow-y-auto">{books.map((b) => (
                    <button type="button" key={b.id} className="w-full text-left px-3 py-2 font-body text-sm hover:bg-slate-50" onClick={() => setIssue({ ...issue, book: b })}>{b.title} <span className="text-slate-500">· {b.available} available</span></button>
                  ))}</div>}
                </>
              )}
            </div>
            <div><Label>Kitne din ke liye</Label><input className={INPUT} type="number" min={1} max={60} value={issue.days} onChange={(e) => setIssue({ ...issue, days: e.target.value })} /></div>
            <p className="font-body text-xs text-slate-500">Ek student ke paas max {rules.max_books} books ho sakti hain. Late wapsi par ₹{rules.fine_per_day} per din fine.</p>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className={PRIMARY} style={{ background: ACCENT }}>{saving ? 'Saving...' : 'Issue'}</button>
              <button type="button" className={OUTLINE} onClick={() => setIssue(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {ret && (
        <Modal title="Book wapas lo" onClose={() => setRet(null)}>
          <form onSubmit={submitReturn} className="space-y-4">
            {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
            <p className="font-body text-sm text-slate-700"><b>{ret.row.book}</b> · {ret.row.student}</p>
            {ret.row.overdue_days > 0 && <p className="font-body text-sm text-red-600">{ret.row.overdue_days} din late. Suggested fine: ₹{ret.row.fine_due}</p>}
            <div><Label>Fine liya (₹)</Label><input className={INPUT} type="number" min={0} max={10000} step={1} value={ret.fine} onChange={(e) => setRet({ ...ret, fine: e.target.value })} /></div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className={PRIMARY} style={{ background: ACCENT }}>{saving ? 'Saving...' : 'Confirm return'}</button>
              <button type="button" className={OUTLINE} onClick={() => setRet(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

export default function AdminLibraryPage({ session }) {
  const token = session.access_token
  const [tab, setTab] = useState('books')
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  const loadSummary = useCallback(() => librarySummary(token).then(setSummary).catch((e) => setError(e.message)), [token])
  useEffect(() => { loadSummary() }, [loadSummary])

  async function seed() {
    setBusy(true); setError(''); setInfo('')
    try { const r = await seedDemoAdminLibrary(token); setInfo(r.message); await loadSummary(); setTick((t) => t + 1) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const rules = summary ? summary.rules : { loan_days: 14, fine_per_day: 2, max_books: 3 }

  return (
    <div className="max-w-6xl mx-auto">
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <Stat icon={Library} label={`${summary.titles} titles · ${summary.copies} copies`} value={summary.copies} color="#2563EB" />
          <Stat icon={BookCheck} label="Available copies" value={summary.available} color="#16A34A" />
          <Stat icon={Clock} label="Abhi issue" value={summary.issued} color="#D97706" />
          <Stat icon={AlertTriangle} label="Overdue" value={summary.overdue} color="#DC2626" />
          <Stat icon={IndianRupee} label="Fine collected" value={`₹${summary.fines_collected}`} color="#7C3AED" />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
          {[['books', 'Book Inventory', Library], ['issues', 'Issue / Return', ArrowLeftRight]].map(([k, label, Icon]) => (
            <button key={k} onClick={() => { setTab(k); setError(''); setInfo('') }}
              className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 font-body text-sm ${tab === k ? 'text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              style={tab === k ? { background: ACCENT } : undefined}><Icon size={15} /> {label}</button>
          ))}
        </div>
        <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy} onClick={seed}><Database size={15} /> Sample data</button>
      </div>
      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {info && <p className="font-body text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{info}</p>}
      {tab === 'books'
        ? <Books token={token} setError={setError} setInfo={setInfo} onChanged={loadSummary} tick={tick} />
        : <Issues token={token} rules={rules} setError={setError} setInfo={setInfo} onChanged={loadSummary} tick={tick} />}
    </div>
  )
}