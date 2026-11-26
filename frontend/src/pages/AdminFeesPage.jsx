import { useCallback, useEffect, useState } from 'react'
import {
  IndianRupee, Wallet, AlertTriangle, TrendingUp, Plus, Pencil, Trash2, Search, X, Database, Printer, Receipt, Banknote, Layers,
} from 'lucide-react'
import {
  listCourses, feeSummary, feeStructure, saveFeeItem, deleteFeeItem, feeCollection, feeStudent, recordPayment, listFeePayments, seedDemoFees,
} from '../api.js'

const ACCENT = '#2563EB'
const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100'
const PRIMARY = 'rounded-lg px-4 py-2 font-body text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const MODES = ['UPI', 'Cash', 'Net Banking', 'Card', 'Cheque']
const STATUS = {
  paid: { label: 'Paid', cls: 'bg-green-50 text-green-700 border-green-200' },
  partial: { label: 'Partial', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  pending: { label: 'Pending', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  overdue: { label: 'Overdue', cls: 'bg-red-50 text-red-700 border-red-200' },
}
const PAGE_SIZE = 10

const rs = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`
const today = () => new Date().toLocaleDateString('en-CA')
const fmt = (d) => {
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function printReceipt(r) {
  const w = window.open('', '_blank', 'width=520,height=640')
  if (!w) return alert('Popup block ho gaya. Browser me popup allow karo.')
  const row = (k, v) => `<tr><td style="padding:6px 0;color:#64748b">${k}</td><td style="padding:6px 0;text-align:right"><b>${esc(v)}</b></td></tr>`
  w.document.write(`<html><head><title>${esc(r.receipt_no)}</title></head><body style="font-family:Arial,sans-serif;padding:28px;color:#0f172a">
    <h2 style="margin:0">CampusSync</h2><p style="margin:2px 0 18px;color:#64748b">Fee Receipt</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
    ${row('Receipt no', r.receipt_no)}${row('Date', fmt(r.paid_on))}${row('Student', r.student_name)}${row('College ID', r.college_id)}
    ${row('Class', `${r.course} · Sem ${r.semester}`)}${row('Fee', r.fee_name)}${row('Mode', r.mode)}${r.reference ? row('Reference', r.reference) : ''}
    ${row('Received by', r.received_by || '-')}</table>
    <h1 style="margin:20px 0 0">Amount paid: ${esc(rs(r.amount))}</h1>
    <script>window.onload=function(){window.print()}<\/script></body></html>`)
  w.document.close()
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

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
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

/* ------------------------------- Collection ------------------------------- */
function Collection({ token, courseId, semester, setError, setInfo, onChanged }) {
  const [data, setData] = useState({ items: [], total: 0, class: null })
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [receipt, setReceipt] = useState(null)

  const load = useCallback(() => {
    if (!courseId) return Promise.resolve()
    setLoading(true)
    return feeCollection(token, { courseId, semester, search, status, page, pageSize: PAGE_SIZE })
      .then((d) => { setData(d); setError('') })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, courseId, semester, search, status, page, setError])

  useEffect(() => { setPage(1) }, [courseId, semester, search, status])
  useEffect(() => { load() }, [load])

  async function openStudent(id) {
    setError(''); setFormError('')
    try {
      const d = await feeStudent(token, id)
      setDetail(d)
      const open = d.items.find((i) => i.balance > 0)
      setForm(open ? { fee_item_id: open.id, amount: open.balance, paid_on: today(), mode: 'UPI', reference: '' } : null)
    } catch (e) { setError(e.message) }
  }

  async function pay(e) {
    e.preventDefault()
    setFormError(''); setSaving(true)
    try {
      const r = await recordPayment(token, { student_id: detail.student.id, fee_item_id: form.fee_item_id, amount: Number(form.amount), paid_on: form.paid_on, mode: form.mode, reference: form.reference })
      setReceipt(r)
      setInfo(`Payment record ho gayi. Receipt: ${r.receipt_no}`)
      await openStudent(detail.student.id)
      await load()
      onChanged()
    } catch (err) { setFormError(err.message) } finally { setSaving(false) }
  }

  if (!courseId) return <div className="bg-white rounded-xl border border-slate-200 p-10 text-center font-body text-sm text-slate-500">Course aur semester chuno.</div>
  const c = data.class
  const selItem = detail && form && detail.items.find((i) => i.id === form.fee_item_id)

  return (
    <>
      {c && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Stat icon={Layers} label={`${c.students} students · ${c.fees} fees`} value={rs(c.billed)} color="#2563EB" />
          <Stat icon={Wallet} label="Collected" value={rs(c.collected)} color="#16A34A" />
          <Stat icon={IndianRupee} label="Outstanding" value={rs(c.outstanding)} color="#D97706" />
          <Stat icon={AlertTriangle} label="Overdue students" value={c.overdue_students} color="#DC2626" />
        </div>
      )}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap gap-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-3 text-slate-400" />
          <input className={`${INPUT} pl-9 w-64`} placeholder="Naam ya college ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className={`${INPUT} w-40`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All status</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Student</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Paid</th>
              <th className="px-4 py-3 font-medium">Balance</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>}
            {!loading && data.items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                {c && c.fees === 0 ? 'Is class ki fee structure nahi bani. "Fee Structure" tab me fees add karo.' : 'No students found.'}
              </td></tr>
            )}
            {!loading && data.items.map((r) => (
              <tr key={r.student_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3"><p className="text-slate-900 font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.college_id}</p></td>
                <td className="px-4 py-3 text-slate-700">{rs(r.total)}</td>
                <td className="px-4 py-3 text-slate-700">{rs(r.paid)}</td>
                <td className="px-4 py-3 text-slate-900 font-medium">{rs(r.balance)}</td>
                <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span></td>
                <td className="px-4 py-3 text-right"><button className={`${OUTLINE} inline-flex items-center gap-1`} onClick={() => openStudent(r.student_id)}><Banknote size={14} /> Collect</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={data.total} setPage={setPage} />

      {detail && (
        <Modal wide title={`${detail.student.name} (${detail.student.college_id})`} onClose={() => { setDetail(null); setForm(null); setReceipt(null) }}>
          {receipt && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-center justify-between font-body text-sm text-green-800">
              <span>Receipt <b>{receipt.receipt_no}</b> · {rs(receipt.amount)} · {receipt.mode}</span>
              <button className={`${OUTLINE} inline-flex items-center gap-1`} onClick={() => printReceipt(receipt)}><Printer size={14} /> Print</button>
            </div>
          )}
          <div className="overflow-x-auto mb-5">
            <table className="w-full font-body text-sm">
              <thead><tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                <th className="py-2 font-medium">Fee</th><th className="py-2 font-medium">Due</th><th className="py-2 font-medium">Amount</th><th className="py-2 font-medium">Paid</th><th className="py-2 font-medium">Balance</th>
              </tr></thead>
              <tbody>
                {detail.items.length === 0 && <tr><td colSpan={5} className="py-4 text-slate-500">Is student ki class ke liye fees nahi bani.</td></tr>}
                {detail.items.map((i) => (
                  <tr key={i.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 text-slate-900">{i.name}</td>
                    <td className={`py-2 ${i.overdue ? 'text-red-600 font-medium' : 'text-slate-700'}`}>{fmt(i.due_date)}{i.overdue ? ' (overdue)' : ''}</td>
                    <td className="py-2 text-slate-700">{rs(i.amount)}</td>
                    <td className="py-2 text-slate-700">{rs(i.paid)}</td>
                    <td className="py-2 text-slate-900 font-medium">{rs(i.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {form ? (
            <form onSubmit={pay} className="space-y-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
              <p className="font-display text-base text-slate-900">Payment lo</p>
              {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Fee *</Label>
                  <select className={INPUT} value={form.fee_item_id} onChange={(e) => { const it = detail.items.find((i) => i.id === e.target.value); setForm({ ...form, fee_item_id: e.target.value, amount: it ? it.balance : '' }) }}>
                    {detail.items.filter((i) => i.balance > 0).map((i) => <option key={i.id} value={i.id}>{i.name} (balance {rs(i.balance)})</option>)}
                  </select>
                </div>
                <div>
                  <Label>Amount (₹) *</Label>
                  <input className={INPUT} type="number" min={1} max={selItem ? selItem.balance : undefined} step={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div>
                  <Label>Date *</Label>
                  <input className={INPUT} type="date" max={today()} value={form.paid_on} onChange={(e) => setForm({ ...form, paid_on: e.target.value })} />
                </div>
                <div>
                  <Label>Mode *</Label>
                  <select className={INPUT} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>{MODES.map((m) => <option key={m}>{m}</option>)}</select>
                </div>
                {form.mode !== 'Cash' && (
                  <div className="sm:col-span-2">
                    <Label>Transaction / cheque reference *</Label>
                    <input className={INPUT} maxLength={60} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
                  </div>
                )}
              </div>
              <button type="submit" disabled={saving} className={PRIMARY} style={{ background: ACCENT }}>{saving ? 'Saving...' : 'Record payment'}</button>
            </form>
          ) : detail.items.length > 0 && (
            <p className="font-body text-sm text-green-700">Saari fees poori bhari ja chuki hain.</p>
          )}

          {detail.payments.length > 0 && (
            <div className="mt-5">
              <p className="font-display text-base text-slate-900 mb-2">Payment history</p>
              {detail.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between border-b border-slate-100 py-2 font-body text-sm">
                  <span className="text-slate-700">{fmt(p.paid_on)} · {p.fee_name} · {p.mode} · <span className="text-slate-500">{p.receipt_no}</span></span>
                  <span className="flex items-center gap-3"><b>{rs(p.amount)}</b><button className="text-slate-500 hover:text-slate-800" onClick={() => printReceipt(p)} aria-label="Print receipt"><Printer size={15} /></button></span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

/* ------------------------------ Fee structure ------------------------------ */
function Structure({ token, courseId, semester, setError, setInfo, onChanged }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    if (!courseId) { setData(null); return Promise.resolve() }
    setLoading(true)
    return feeStructure(token, courseId, semester)
      .then((d) => { setData(d); setError('') })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, courseId, semester, setError])

  useEffect(() => { load() }, [load])

  async function save(e) {
    e.preventDefault()
    setFormError(''); setSaving(true)
    try {
      await saveFeeItem(token, form.id, { course_id: courseId, semester: Number(semester), name: form.name, amount: Number(form.amount), due_date: form.due_date })
      setInfo(form.id ? 'Fee update ho gayi.' : 'Fee add ho gayi.')
      setForm(null)
      await load()
      onChanged()
    } catch (err) { setFormError(err.message) } finally { setSaving(false) }
  }

  async function remove(it) {
    if (!window.confirm(`"${it.name}" delete karni hai?`)) return
    setError(''); setInfo('')
    try { await deleteFeeItem(token, it.id); setInfo('Fee delete ho gayi.'); await load(); onChanged() } catch (e) { setError(e.message) }
  }

  if (!courseId) return <div className="bg-white rounded-xl border border-slate-200 p-10 text-center font-body text-sm text-slate-500">Course aur semester chuno.</div>
  if (loading || !data) return <p className="font-body text-sm text-slate-500">Loading...</p>

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="font-body text-sm text-slate-600">{data.students} active students · har student ka total <b>{rs(data.total_per_student)}</b></p>
        <button className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: ACCENT }} onClick={() => { setFormError(''); setInfo(''); setForm({ name: '', amount: '', due_date: '' }) }}><Plus size={16} /> Add Fee</button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
            <th className="px-4 py-3 font-medium">Fee</th><th className="px-4 py-3 font-medium">Amount</th><th className="px-4 py-3 font-medium">Due date</th><th className="px-4 py-3 font-medium">Collected</th><th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr></thead>
          <tbody>
            {data.items.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Is class ki koi fee nahi bani. "Add Fee" dabao.</td></tr>}
            {data.items.map((it) => (
              <tr key={it.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3 text-slate-900 font-medium">{it.name}</td>
                <td className="px-4 py-3 text-slate-700">{rs(it.amount)}</td>
                <td className="px-4 py-3 text-slate-700">{fmt(it.due_date)}</td>
                <td className="px-4 py-3 text-slate-700">{rs(it.collected)} <span className="text-xs text-slate-400">({it.payments} payments)</span></td>
                <td className="px-4 py-3"><div className="flex justify-end gap-2">
                  <button className={`${OUTLINE} flex items-center gap-1`} onClick={() => { setFormError(''); setInfo(''); setForm({ id: it.id, name: it.name, amount: it.amount, due_date: it.due_date }) }}><Pencil size={13} /> Edit</button>
                  <button className="rounded-lg border border-red-200 bg-white px-3 py-1.5 font-body text-sm text-red-600 hover:bg-red-50 flex items-center gap-1" onClick={() => remove(it)}><Trash2 size={13} /> Delete</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && (
        <Modal title={form.id ? 'Edit Fee' : 'Add Fee'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-4">
            {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
            <div><Label>Fee ka naam *</Label><input className={INPUT} maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Tuition Fee" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Amount (₹) *</Label><input className={INPUT} type="number" min={1} step={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div><Label>Due date *</Label><input className={INPUT} type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
            </div>
            <p className="font-body text-xs text-slate-500">Ye fee is course aur semester ke saare students par lagti hai.</p>
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

/* -------------------------------- Payments -------------------------------- */
function Payments({ token, setError }) {
  const [data, setData] = useState({ items: [], total: 0 })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => { setPage(1) }, [search])
  useEffect(() => {
    setLoading(true)
    listFeePayments(token, { search, page, pageSize: PAGE_SIZE })
      .then((d) => { setData(d); setError('') })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, search, page, setError])

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="relative w-72">
          <Search size={15} className="absolute left-3 top-3 text-slate-400" />
          <input className={`${INPUT} pl-9`} placeholder="Naam, ID ya receipt no" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
            <th className="px-4 py-3 font-medium">Receipt</th><th className="px-4 py-3 font-medium">Student</th><th className="px-4 py-3 font-medium">Fee</th><th className="px-4 py-3 font-medium">Amount</th><th className="px-4 py-3 font-medium">Mode</th><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium text-right">Print</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>}
            {!loading && data.items.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Abhi koi payment nahi hai.</td></tr>}
            {!loading && data.items.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3 text-slate-700">{p.receipt_no}</td>
                <td className="px-4 py-3"><p className="text-slate-900">{p.student_name}</p><p className="text-xs text-slate-500">{p.college_id}</p></td>
                <td className="px-4 py-3 text-slate-700">{p.fee_name}</td>
                <td className="px-4 py-3 text-slate-900 font-medium">{rs(p.amount)}</td>
                <td className="px-4 py-3 text-slate-700">{p.mode}</td>
                <td className="px-4 py-3 text-slate-700">{fmt(p.paid_on)}</td>
                <td className="px-4 py-3 text-right"><button className={OUTLINE} onClick={() => printReceipt(p)} aria-label="Print receipt"><Printer size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={data.total} setPage={setPage} />
    </>
  )
}

export default function AdminFeesPage({ session }) {
  const token = session.access_token
  const [tab, setTab] = useState('collection')
  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState('')
  const [semester, setSemester] = useState(1)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  const loadSummary = useCallback(() => feeSummary(token).then(setSummary).catch((e) => setError(e.message)), [token])

  useEffect(() => {
    listCourses(token, { page: 1, pageSize: 100, status: 'active' }).then((d) => setCourses(d.items)).catch((e) => setError(e.message))
  }, [token])
  useEffect(() => { loadSummary() }, [loadSummary])

  const course = courses.find((c) => c.id === courseId)
  const changed = () => { loadSummary() }

  async function seed() {
    setBusy(true); setError(''); setInfo('')
    try { const r = await seedDemoFees(token); setInfo(r.message); await loadSummary(); setTick((t) => t + 1) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const TABS = [['collection', 'Fee Collection', Wallet], ['structure', 'Fee Structure', Layers], ['payments', 'Payments', Receipt]]

  return (
    <div className="max-w-6xl mx-auto">
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Stat icon={IndianRupee} label="Total billed" value={rs(summary.billed)} color="#2563EB" />
          <Stat icon={Wallet} label={`Collected (${summary.collection_pct}%)`} value={rs(summary.collected)} color="#16A34A" />
          <Stat icon={TrendingUp} label="Outstanding" value={rs(summary.outstanding)} color="#D97706" />
          <Stat icon={AlertTriangle} label={`Overdue · ${summary.defaulters} defaulters`} value={rs(summary.overdue)} color="#DC2626" />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
          {TABS.map(([k, label, Icon]) => (
            <button key={k} onClick={() => { setTab(k); setError(''); setInfo('') }}
              className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 font-body text-sm ${tab === k ? 'text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              style={tab === k ? { background: ACCENT } : undefined}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy} onClick={seed}><Database size={15} /> Sample data</button>
      </div>

      {tab !== 'payments' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap gap-2">
          <select className={`${INPUT} w-72`} value={courseId} onChange={(e) => { setCourseId(e.target.value); setSemester(1) }}>
            <option value="">Select course</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.department_name})</option>)}
          </select>
          <select className={`${INPUT} w-36`} value={semester} onChange={(e) => setSemester(Number(e.target.value))}>
            {Array.from({ length: course ? course.semesters : 8 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Semester {n}</option>)}
          </select>
        </div>
      )}

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {info && <p className="font-body text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{info}</p>}

      {tab === 'collection' && <Collection key={tick} token={token} courseId={courseId} semester={semester} setError={setError} setInfo={setInfo} onChanged={changed} />}
      {tab === 'structure' && <Structure key={tick} token={token} courseId={courseId} semester={semester} setError={setError} setInfo={setInfo} onChanged={changed} />}
      {tab === 'payments' && <Payments key={tick} token={token} setError={setError} />}
    </div>
  )
}