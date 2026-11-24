import { useCallback, useEffect, useState } from 'react'
import {
  Building2, Briefcase, Users, Trophy, IndianRupee, Plus, Pencil, Trash2, Search, X, Database, CalendarClock, Check, Handshake, BarChart3,
} from 'lucide-react'
import {
  listCourses, placementSummary, listPlacementCompanies, savePlacementCompany, deletePlacementCompany, listPlacementDrives, savePlacementDrive,
  deletePlacementDrive, placementApplicants, setApplicationStatus, scheduleInterview, updateInterview, makeOffer, listPlacementStats,
  savePlacementStat, deletePlacementStat, listRecruiters, addRecruiter, deleteRecruiter, seedDemoAdminPlacement,
} from '../api.js'

const ACCENT = '#2563EB'
const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const PRIMARY = 'rounded-lg px-4 py-2 font-body text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const DANGER = 'rounded-lg border border-red-200 bg-white px-3 py-1.5 font-body text-sm text-red-600 hover:bg-red-50 disabled:opacity-60'
const JOB_TYPES = ['Full time', 'Internship', 'Internship + PPO']
const MODES = ['On campus', 'Off campus', 'Virtual']
const DRIVE_STATUS = {
  open: { label: 'Open', cls: 'bg-green-50 text-green-700 border-green-200' },
  closed: { label: 'Applications closed', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed: { label: 'Completed', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
}
const APP_STATUS = {
  applied: 'bg-slate-100 text-slate-700 border-slate-200', shortlisted: 'bg-blue-50 text-blue-700 border-blue-200',
  interview: 'bg-violet-50 text-violet-700 border-violet-200', selected: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200', withdrawn: 'bg-slate-100 text-slate-500 border-slate-200',
}
const NEXT_LABEL = { shortlisted: 'Shortlist', interview: 'Interview', selected: 'Select', rejected: 'Reject' }
const PAGE_SIZE = 10

const fmt = (d) => {
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
const clock = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className={`bg-white rounded-2xl shadow-xl w-full my-4 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
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
const Th = ({ children, right }) => <th className={`px-4 py-3 font-medium ${right ? 'text-right' : ''}`}>{children}</th>
const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

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

/* -------------------------------- Companies -------------------------------- */
function Companies({ token, setError, setInfo, onChanged, tick }) {
  const [data, setData] = useState({ items: [], total: 0 })
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setPage(1) }, [q])
  const load = useCallback(() => {
    setLoading(true)
    return listPlacementCompanies(token, { q, page, pageSize: PAGE_SIZE }).then((d) => { setData(d); setError('') }).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [token, q, page, setError])
  useEffect(() => { load() }, [load, tick])

  async function save(e) {
    e.preventDefault(); setFormError(''); setSaving(true)
    try {
      const { id, ...body } = form
      await savePlacementCompany(token, id, body)
      setInfo(id ? 'Company update ho gayi.' : 'Company add ho gayi.')
      setForm(null); await load(); onChanged()
    } catch (err) { setFormError(err.message) } finally { setSaving(false) }
  }

  async function remove(c) {
    if (!window.confirm(`"${c.name}" delete karni hai?`)) return
    setError(''); setInfo('')
    try { await deletePlacementCompany(token, c.id); setInfo('Company delete ho gayi.'); await load(); onChanged() } catch (e) { setError(e.message) }
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input className={`${INPUT} pl-9 w-72`} placeholder="Naam, industry ya city" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: ACCENT }} onClick={() => { setFormError(''); setInfo(''); setForm({ name: '', industry: '', website: '', location: '', description: '' }) }}><Plus size={16} /> Add Company</button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200"><Th>Company</Th><Th>Industry</Th><Th>Location</Th><Th>Drives</Th><Th right>Actions</Th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>}
            {!loading && data.items.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">{q ? 'Koi company match nahi hui.' : 'Abhi koi company nahi hai. "Add Company" dabao.'}</td></tr>}
            {!loading && data.items.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3"><p className="text-slate-900 font-medium">{c.name}</p>{c.website && <p className="text-xs text-slate-500">{c.website}</p>}</td>
                <td className="px-4 py-3 text-slate-700">{c.industry || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{c.location || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{c.drives}</td>
                <td className="px-4 py-3"><div className="flex justify-end gap-2">
                  <button className={`${OUTLINE} flex items-center gap-1`} onClick={() => { setFormError(''); setInfo(''); setForm({ id: c.id, name: c.name, industry: c.industry || '', website: c.website || '', location: c.location || '', description: c.description || '' }) }}><Pencil size={13} /> Edit</button>
                  <button className={`${DANGER} flex items-center gap-1`} onClick={() => remove(c)}><Trash2 size={13} /> Delete</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={data.total} setPage={setPage} />
      {form && (
        <Modal title={form.id ? 'Edit Company' : 'Add Company'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-4">
            {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
            <div><Label>Company ka naam *</Label><input className={INPUT} maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Industry</Label><input className={INPUT} maxLength={100} value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></div>
              <div><Label>Location</Label><input className={INPUT} maxLength={100} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            </div>
            <div><Label>Website</Label><input className={INPUT} maxLength={200} placeholder="https://..." value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
            <div><Label>Description</Label><textarea className={INPUT} rows={3} maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="flex gap-3"><button type="submit" disabled={saving} className={PRIMARY} style={{ background: ACCENT }}>{saving ? 'Saving...' : 'Save'}</button><button type="button" className={OUTLINE} onClick={() => setForm(null)}>Cancel</button></div>
          </form>
        </Modal>
      )}
    </>
  )
}

/* --------------------------------- Drives --------------------------------- */
function Drives({ token, courses, setError, setInfo, onChanged, tick, onOpenApplicants }) {
  const [data, setData] = useState({ items: [], total: 0 })
  const [companies, setCompanies] = useState([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setPage(1) }, [q, status])
  useEffect(() => { listPlacementCompanies(token, { page: 1, pageSize: 100 }).then((d) => setCompanies(d.items)).catch(() => setCompanies([])) }, [token, tick])
  const load = useCallback(() => {
    setLoading(true)
    return listPlacementDrives(token, { q, status, page, pageSize: PAGE_SIZE }).then((d) => { setData(d); setError('') }).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [token, q, status, page, setError])
  useEffect(() => { load() }, [load, tick])

  const blank = { company_id: '', role_title: '', package_lpa: '', job_type: 'Full time', mode: 'On campus', location: '', drive_date: '', apply_by: '', min_cgpa: '', max_backlogs: '', courses: [], skills: '', selection_process: '', description: '' }

  async function save(e) {
    e.preventDefault(); setFormError(''); setSaving(true)
    try {
      const { id, ...f } = form
      await savePlacementDrive(token, id, { ...f, package_lpa: Number(f.package_lpa), min_cgpa: numOrNull(f.min_cgpa), max_backlogs: numOrNull(f.max_backlogs), courses: f.courses.length ? f.courses : null })
      setInfo(id ? 'Drive update ho gayi.' : 'Drive ban gayi. Eligible students ko ab dikhegi.')
      setForm(null); await load(); onChanged()
    } catch (err) { setFormError(err.message) } finally { setSaving(false) }
  }

  async function remove(d) {
    if (!window.confirm(`"${d.company} - ${d.role_title}" delete karni hai?`)) return
    setError(''); setInfo('')
    try { await deletePlacementDrive(token, d.id); setInfo('Drive delete ho gayi.'); await load(); onChanged() } catch (e) { setError(e.message) }
  }

  const toggleCourse = (name) => setForm((f) => ({ ...f, courses: f.courses.includes(name) ? f.courses.filter((c) => c !== name) : [...f.courses, name] }))

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input className={`${INPUT} pl-9 w-64`} placeholder="Company ya role" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className={`${INPUT} w-44`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All drives</option><option value="open">Applications open</option><option value="closed">Applications closed</option></select>
        </div>
        <button className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: ACCENT }} onClick={() => { setFormError(''); setInfo(''); setForm(blank) }}><Plus size={16} /> Create Drive</button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200"><Th>Drive</Th><Th>Package</Th><Th>Dates</Th><Th>Eligibility</Th><Th>Applications</Th><Th>Status</Th><Th right>Actions</Th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>}
            {!loading && data.items.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">{q || status ? 'Koi drive match nahi hui.' : 'Abhi koi drive nahi hai. Pehle company add karo, fir "Create Drive".'}</td></tr>}
            {!loading && data.items.map((d) => (
              <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3"><p className="text-slate-900 font-medium">{d.role_title}</p><p className="text-xs text-slate-500">{d.company} · {d.job_type} · {d.mode}</p></td>
                <td className="px-4 py-3 text-slate-700">{d.package_lpa} LPA</td>
                <td className="px-4 py-3 text-slate-700"><p>Drive: {fmt(d.drive_date)}</p><p className="text-xs text-slate-500">Apply by: {fmt(d.apply_by)}</p></td>
                <td className="px-4 py-3 text-xs text-slate-600">{d.min_cgpa !== null ? `CGPA ≥ ${d.min_cgpa}` : 'Any CGPA'}<br />{d.max_backlogs !== null ? `Backlogs ≤ ${d.max_backlogs}` : 'Any backlogs'}<br />{d.courses.length ? d.courses.join(', ') : 'All courses'}</td>
                <td className="px-4 py-3"><button className="text-blue-600 hover:underline" onClick={() => onOpenApplicants(d.id)}>{d.applications} dekho</button></td>
                <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${DRIVE_STATUS[d.status].cls}`}>{DRIVE_STATUS[d.status].label}</span></td>
                <td className="px-4 py-3"><div className="flex justify-end gap-2">
                  <button className={`${OUTLINE} flex items-center gap-1`} onClick={() => { setFormError(''); setInfo(''); setForm({ id: d.id, company_id: d.company_id, role_title: d.role_title, package_lpa: d.package_lpa, job_type: d.job_type, mode: d.mode, location: d.location || '', drive_date: d.drive_date, apply_by: d.apply_by, min_cgpa: d.min_cgpa ?? '', max_backlogs: d.max_backlogs ?? '', courses: d.courses, skills: d.skills || '', selection_process: d.selection_process || '', description: d.description || '' }) }}><Pencil size={13} /> Edit</button>
                  <button className={`${DANGER} flex items-center gap-1`} onClick={() => remove(d)}><Trash2 size={13} /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={data.total} setPage={setPage} />
      {form && (
        <Modal wide title={form.id ? 'Edit Drive' : 'Create Drive'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-4">
            {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Company *</Label><select className={INPUT} value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}><option value="">Select company</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><Label>Role *</Label><input className={INPUT} maxLength={100} value={form.role_title} onChange={(e) => setForm({ ...form, role_title: e.target.value })} /></div>
              <div><Label>Package (LPA) *</Label><input className={INPUT} type="number" step="0.1" min={0.1} max={200} value={form.package_lpa} onChange={(e) => setForm({ ...form, package_lpa: e.target.value })} /></div>
              <div><Label>Location</Label><input className={INPUT} maxLength={100} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
              <div><Label>Job type</Label><select className={INPUT} value={form.job_type} onChange={(e) => setForm({ ...form, job_type: e.target.value })}>{JOB_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div><Label>Mode</Label><select className={INPUT} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>{MODES.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div><Label>Drive date *</Label><input className={INPUT} type="date" value={form.drive_date} onChange={(e) => setForm({ ...form, drive_date: e.target.value })} /></div>
              <div><Label>Apply by *</Label><input className={INPUT} type="date" value={form.apply_by} onChange={(e) => setForm({ ...form, apply_by: e.target.value })} /></div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="font-display text-base text-slate-900">Eligibility criteria</p>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Minimum CGPA</Label><input className={INPUT} type="number" step="0.1" min={0} max={10} value={form.min_cgpa} onChange={(e) => setForm({ ...form, min_cgpa: e.target.value })} placeholder="Khaali = koi limit nahi" /></div>
                <div><Label>Max backlogs</Label><input className={INPUT} type="number" min={0} max={20} value={form.max_backlogs} onChange={(e) => setForm({ ...form, max_backlogs: e.target.value })} placeholder="Khaali = koi limit nahi" /></div>
              </div>
              <div>
                <Label>Courses (kuch na chuno to sabke liye)</Label>
                <div className="flex flex-wrap gap-2">{courses.map((c) => (
                  <label key={c.id} className={`cursor-pointer rounded-full border px-3 py-1 font-body text-sm ${form.courses.includes(c.name) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-600'}`}>
                    <input type="checkbox" className="hidden" checked={form.courses.includes(c.name)} onChange={() => toggleCourse(c.name)} />{c.name}
                  </label>
                ))}</div>
              </div>
            </div>
            <div><Label>Skills (comma se alag)</Label><input className={INPUT} maxLength={300} value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Selection process (ek line me ek round)</Label><textarea className={INPUT} rows={4} maxLength={1500} value={form.selection_process} onChange={(e) => setForm({ ...form, selection_process: e.target.value })} /></div>
              <div><Label>Description</Label><textarea className={INPUT} rows={4} maxLength={1500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            </div>
            <div className="flex gap-3"><button type="submit" disabled={saving} className={PRIMARY} style={{ background: ACCENT }}>{saving ? 'Saving...' : 'Save drive'}</button><button type="button" className={OUTLINE} onClick={() => setForm(null)}>Cancel</button></div>
          </form>
        </Modal>
      )}
    </>
  )
}

/* ------------------------------- Applications ------------------------------- */
function Applications({ token, setError, setInfo, onChanged, tick, driveId, setDriveId }) {
  const [drives, setDrives] = useState([])
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [round, setRound] = useState(null)
  const [offer, setOffer] = useState(null)
  const [formError, setFormError] = useState('')

  useEffect(() => { listPlacementDrives(token, { page: 1, pageSize: 100 }).then((d) => setDrives(d.items)).catch(() => setDrives([])) }, [token, tick])
  const load = useCallback(() => {
    if (!driveId) { setData(null); return Promise.resolve() }
    setLoading(true)
    return placementApplicants(token, driveId, status).then((d) => { setData(d); setError('') }).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [token, driveId, status, setError])
  useEffect(() => { load() }, [load, tick])

  async function run(fn, ok) {
    setBusy(true); setError(''); setInfo('')
    try { await fn(); setInfo(ok); await load(); onChanged() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function submitRound(e) {
    e.preventDefault(); setFormError('')
    try {
      await scheduleInterview(token, round.appId, { round_name: round.round_name, scheduled_at: round.scheduled_at, mode: round.mode, venue: round.venue || null, instructions: round.instructions || null })
      setInfo('Round schedule ho gaya.'); setRound(null); await load(); onChanged()
    } catch (err) { setFormError(err.message) }
  }

  async function submitOffer(e) {
    e.preventDefault(); setFormError('')
    try { await makeOffer(token, offer.appId, offer.joining_date); setInfo('Offer de diya gaya.'); setOffer(null); await load(); onChanged() } catch (err) { setFormError(err.message) }
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap gap-2">
        <select className={`${INPUT} w-96`} value={driveId} onChange={(e) => { setDriveId(e.target.value); setStatus('') }}>
          <option value="">Drive chuno</option>
          {drives.map((d) => <option key={d.id} value={d.id}>{d.company} - {d.role_title} ({fmt(d.drive_date)})</option>)}
        </select>
        {data && <select className={`${INPUT} w-44`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All status</option>{Object.keys(APP_STATUS).map((s) => <option key={s} value={s}>{s}</option>)}</select>}
      </div>
      {!driveId ? <div className="bg-white rounded-xl border border-slate-200 p-10 text-center font-body text-sm text-slate-500">Applications dekhne ke liye drive chuno.</div>
        : loading || !data ? <p className="font-body text-sm text-slate-500">Loading...</p> : (
          <>
            <div className="flex flex-wrap gap-2 mb-3">{Object.entries(data.counts).map(([k, v]) => <span key={k} className={`rounded-full border px-3 py-1 font-body text-xs font-medium ${APP_STATUS[k]}`}>{k}: {v}</span>)}</div>
            {data.items.length === 0 ? <div className="bg-white rounded-xl border border-slate-200 p-8 text-center font-body text-sm text-slate-500">Koi application nahi mili.</div> : (
              <div className="space-y-3">
                {data.items.map((a) => (
                  <div key={a.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-display text-base text-slate-900">{a.name} <span className="font-body text-xs text-slate-500">({a.college_id})</span></p>
                        <p className="font-body text-xs text-slate-500">{a.course} · Sem {a.semester} · Applied {fmt(a.applied_on)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {a.offer && <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">Offer: {a.offer}</span>}
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${APP_STATUS[a.status]}`}>{a.status}</span>
                      </div>
                    </div>
                    {a.interviews.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {a.interviews.map((i) => (
                          <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 font-body text-sm">
                            <span className="text-slate-700"><b>{i.round_name}</b> · {fmt(i.date)}, {clock(i.time)} · {i.mode}{i.venue ? ` · ${i.venue}` : ''}</span>
                            {i.status === 'scheduled' ? (
                              <span className="flex gap-1.5">
                                <button className={OUTLINE} disabled={busy} onClick={() => run(() => updateInterview(token, i.id, 'completed', 'cleared'), 'Round cleared mark hua.')}>Cleared</button>
                                <button className={OUTLINE} disabled={busy} onClick={() => run(() => updateInterview(token, i.id, 'completed', 'not_cleared'), 'Round not cleared mark hua.')}>Not cleared</button>
                                <button className={DANGER} disabled={busy} onClick={() => window.confirm('Ye round cancel karna hai?') && run(() => updateInterview(token, i.id, 'cancelled'), 'Round cancel ho gaya.')}>Cancel</button>
                              </span>
                            ) : <span className="text-xs capitalize text-slate-600">{i.status}{i.status === 'completed' ? ` · ${i.result.replace('_', ' ')}` : ''}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {a.next.map((n) => (
                        <button key={n} className={n === 'rejected' ? DANGER : OUTLINE} disabled={busy}
                          onClick={() => (n === 'rejected' ? window.confirm(`${a.name} ko reject karna hai?`) : true) && run(() => setApplicationStatus(token, a.id, n), `Status badal gaya: ${n}`)}>{NEXT_LABEL[n]}</button>
                      ))}
                      {a.can_schedule && <button className={`${OUTLINE} flex items-center gap-1`} onClick={() => { setFormError(''); setInfo(''); setRound({ appId: a.id, name: a.name, round_name: '', scheduled_at: '', mode: 'In person', venue: '', instructions: '' }) }}><CalendarClock size={14} /> Schedule round</button>}
                      {a.can_offer && <button className={`${PRIMARY} flex items-center gap-1`} style={{ background: '#16A34A' }} onClick={() => { setFormError(''); setInfo(''); setOffer({ appId: a.id, name: a.name, joining_date: '' }) }}><Handshake size={14} /> Make offer</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

      {round && (
        <Modal title={`Round schedule karo · ${round.name}`} onClose={() => setRound(null)}>
          <form onSubmit={submitRound} className="space-y-4">
            {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
            <div><Label>Round ka naam *</Label><input className={INPUT} maxLength={60} value={round.round_name} onChange={(e) => setRound({ ...round, round_name: e.target.value })} placeholder="e.g. Technical Interview" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Date aur time *</Label><input className={INPUT} type="datetime-local" value={round.scheduled_at} onChange={(e) => setRound({ ...round, scheduled_at: e.target.value })} /></div>
              <div><Label>Mode</Label><select className={INPUT} value={round.mode} onChange={(e) => setRound({ ...round, mode: e.target.value })}><option>In person</option><option>Online</option></select></div>
            </div>
            <div><Label>Venue / meeting link</Label><input className={INPUT} maxLength={200} value={round.venue} onChange={(e) => setRound({ ...round, venue: e.target.value })} /></div>
            <div><Label>Instructions</Label><textarea className={INPUT} rows={3} maxLength={500} value={round.instructions} onChange={(e) => setRound({ ...round, instructions: e.target.value })} /></div>
            <p className="font-body text-xs text-slate-500">Time India time (IST) me maana jata hai.</p>
            <div className="flex gap-3"><button type="submit" className={PRIMARY} style={{ background: ACCENT }}>Schedule</button><button type="button" className={OUTLINE} onClick={() => setRound(null)}>Cancel</button></div>
          </form>
        </Modal>
      )}
      {offer && (
        <Modal title={`Offer · ${offer.name}`} onClose={() => setOffer(null)}>
          <form onSubmit={submitOffer} className="space-y-4">
            {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
            <p className="font-body text-sm text-slate-600">Offer drive ke role aur package ke saath banega. Student use apne Placement page par accept ya decline karega.</p>
            <div><Label>Joining date (optional)</Label><input className={INPUT} type="date" value={offer.joining_date} onChange={(e) => setOffer({ ...offer, joining_date: e.target.value })} /></div>
            <div className="flex gap-3"><button type="submit" className={PRIMARY} style={{ background: ACCENT }}>Offer do</button><button type="button" className={OUTLINE} onClick={() => setOffer(null)}>Cancel</button></div>
          </form>
        </Modal>
      )}
    </>
  )
}

/* -------------------------------- Statistics -------------------------------- */
function Statistics({ token, setError, setInfo, tick }) {
  const [items, setItems] = useState([])
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [year, setYear] = useState('')
  const [recruiters, setRecruiters] = useState([])
  const [rec, setRec] = useState({ company_name: '', offers: '', highest_package: '' })

  const load = useCallback(() => listPlacementStats(token).then((d) => { setItems(d.items); setError('') }).catch((e) => setError(e.message)), [token, setError])
  useEffect(() => { load() }, [load, tick])
  const loadRec = useCallback(() => (year ? listRecruiters(token, year).then((d) => setRecruiters(d.items)).catch((e) => setError(e.message)) : Promise.resolve(setRecruiters([]))), [token, year, setError])
  useEffect(() => { loadRec() }, [loadRec])

  const NUM = ['total_students', 'placed_students', 'offers_made', 'companies_visited']
  const PKG = ['highest_package', 'average_package', 'median_package']

  async function save(e) {
    e.preventDefault(); setFormError('')
    try {
      const body = { academic_year: form.academic_year }
      NUM.forEach((k) => { body[k] = Number(form[k]) })
      PKG.forEach((k) => { body[k] = Number(form[k]) })
      await savePlacementStat(token, body)
      setInfo('Statistics save ho gayi.'); setForm(null); await load()
    } catch (err) { setFormError(err.message) }
  }

  async function removeStat(s) {
    if (!window.confirm(`${s.academic_year} ki statistics aur recruiters delete karne hain?`)) return
    setError(''); setInfo('')
    try { await deletePlacementStat(token, s.id); setInfo('Statistics delete ho gayi.'); if (year === s.academic_year) setYear(''); await load() } catch (e) { setError(e.message) }
  }

  async function addRec(e) {
    e.preventDefault(); setError(''); setInfo('')
    try {
      await addRecruiter(token, { academic_year: year, company_name: rec.company_name, offers: Number(rec.offers), highest_package: numOrNull(rec.highest_package) })
      setRec({ company_name: '', offers: '', highest_package: '' }); setInfo('Recruiter add ho gaya.'); await loadRec()
    } catch (err) { setError(err.message) }
  }

  const blank = { academic_year: '', total_students: '', placed_students: '', offers_made: '', companies_visited: '', highest_package: '', average_package: '', median_package: '' }
  const L = { total_students: 'Total students', placed_students: 'Placed students', offers_made: 'Offers made', companies_visited: 'Companies visited', highest_package: 'Highest (LPA)', average_package: 'Average (LPA)', median_package: 'Median (LPA)' }

  return (
    <>
      <div className="flex justify-end mb-4"><button className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: ACCENT }} onClick={() => { setFormError(''); setInfo(''); setForm(blank) }}><Plus size={16} /> Add / Update Year</button></div>
      {items.length === 0 ? <div className="bg-white rounded-xl border border-slate-200 p-10 text-center font-body text-sm text-slate-500">Abhi koi statistics nahi hai. "Add / Update Year" se saal ke numbers daalo.</div> : (
        <div className="grid md:grid-cols-2 gap-4 mb-5">
          {items.map((s) => (
            <div key={s.id} className={`bg-white rounded-xl border shadow-sm p-4 ${year === s.academic_year ? 'border-blue-400 ring-1 ring-blue-200' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between mb-2"><p className="font-display text-lg text-slate-900">{s.academic_year}</p><span className="font-display text-xl" style={{ color: ACCENT }}>{s.placement_pct}%</span></div>
              <p className="font-body text-sm text-slate-600">{s.placed_students} / {s.total_students} placed · {s.offers_made} offers · {s.companies_visited} companies</p>
              <p className="font-body text-sm text-slate-600">Highest {s.highest_package} · Avg {s.average_package} · Median {s.median_package} LPA</p>
              <div className="flex gap-2 mt-3">
                <button className={OUTLINE} onClick={() => setYear(year === s.academic_year ? '' : s.academic_year)}>{year === s.academic_year ? 'Recruiters chhupao' : 'Recruiters'}</button>
                <button className={OUTLINE} onClick={() => { setFormError(''); setForm({ academic_year: s.academic_year, ...Object.fromEntries([...NUM, ...PKG].map((k) => [k, s[k]])) }) }}><Pencil size={13} /></button>
                <button className={DANGER} onClick={() => removeStat(s)}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {year && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="font-display text-base text-slate-900 mb-3">Top recruiters · {year}</p>
          <form onSubmit={addRec} className="flex flex-wrap gap-2 mb-3">
            <input className={`${INPUT} w-56`} placeholder="Company ka naam" maxLength={100} value={rec.company_name} onChange={(e) => setRec({ ...rec, company_name: e.target.value })} />
            <input className={`${INPUT} w-28`} type="number" min={1} placeholder="Offers" value={rec.offers} onChange={(e) => setRec({ ...rec, offers: e.target.value })} />
            <input className={`${INPUT} w-36`} type="number" step="0.1" min={0} placeholder="Highest LPA" value={rec.highest_package} onChange={(e) => setRec({ ...rec, highest_package: e.target.value })} />
            <button className={PRIMARY} style={{ background: ACCENT }}>Add</button>
          </form>
          {recruiters.length === 0 ? <p className="font-body text-sm text-slate-500">Is saal ke koi recruiters nahi jude.</p> : recruiters.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b border-slate-100 py-2 font-body text-sm">
              <span className="text-slate-800">{r.company_name}</span>
              <span className="flex items-center gap-3 text-slate-600">{r.offers} offers{r.highest_package ? ` · ${r.highest_package} LPA` : ''}<button className="text-red-500 hover:text-red-700" onClick={() => { setError(''); setInfo(''); deleteRecruiter(token, r.id).then(loadRec).catch((e) => setError(e.message)) }} aria-label="Remove"><Trash2 size={14} /></button></span>
            </div>
          ))}
        </div>
      )}
      {form && (
        <Modal title="Placement statistics" onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-4">
            {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
            <div><Label>Academic year * (jaise 2025-26)</Label><input className={INPUT} maxLength={7} value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              {[...NUM, ...PKG].map((k) => (
                <div key={k}><Label>{L[k]} *</Label><input className={INPUT} type="number" min={0} step={NUM.includes(k) ? 1 : 0.1} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>
              ))}
            </div>
            <p className="font-body text-xs text-slate-500">Same saal dobara save karne par wahi saal update hota hai.</p>
            <div className="flex gap-3"><button type="submit" className={PRIMARY} style={{ background: ACCENT }}>Save</button><button type="button" className={OUTLINE} onClick={() => setForm(null)}>Cancel</button></div>
          </form>
        </Modal>
      )}
    </>
  )
}

export default function AdminPlacementPage({ session }) {
  const token = session.access_token
  const [tab, setTab] = useState('companies')
  const [courses, setCourses] = useState([])
  const [summary, setSummary] = useState(null)
  const [driveId, setDriveId] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  const loadSummary = useCallback(() => placementSummary(token).then(setSummary).catch((e) => setError(e.message)), [token])
  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { listCourses(token, { page: 1, pageSize: 100, status: 'active' }).then((d) => setCourses(d.items)).catch(() => setCourses([])) }, [token])

  async function seed() {
    setBusy(true); setError(''); setInfo('')
    try { const r = await seedDemoAdminPlacement(token); setInfo(r.message); await loadSummary(); setTick((t) => t + 1) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const TABS = [['companies', 'Companies', Building2], ['drives', 'Drives', Briefcase], ['applications', 'Applications', Users], ['stats', 'Statistics', BarChart3]]

  return (
    <div className="max-w-6xl mx-auto">
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <Stat icon={Building2} label="Companies" value={summary.companies} color="#2563EB" />
          <Stat icon={Briefcase} label="Open drives" value={summary.open_drives} color="#16A34A" />
          <Stat icon={Users} label="Applications" value={summary.applications} color="#7C3AED" />
          <Stat icon={Trophy} label={`Selected · ${summary.offers} offers`} value={summary.selected} color="#D97706" />
          <Stat icon={IndianRupee} label="Highest offer (LPA)" value={summary.highest_package} color="#DC2626" />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex flex-wrap rounded-lg border border-slate-300 bg-white p-1">
          {TABS.map(([k, label, Icon]) => (
            <button key={k} onClick={() => { setTab(k); setError(''); setInfo('') }}
              className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 font-body text-sm ${tab === k ? 'text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              style={tab === k ? { background: ACCENT } : undefined}><Icon size={15} /> {label}</button>
          ))}
        </div>
        <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy} onClick={seed}><Database size={15} /> Sample data</button>
      </div>
      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {info && <p className="font-body text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{info}</p>}
      {tab === 'companies' && <Companies token={token} setError={setError} setInfo={setInfo} onChanged={loadSummary} tick={tick} />}
      {tab === 'drives' && <Drives token={token} courses={courses} setError={setError} setInfo={setInfo} onChanged={loadSummary} tick={tick} onOpenApplicants={(id) => { setDriveId(id); setTab('applications'); setError(''); setInfo('') }} />}
      {tab === 'applications' && <Applications token={token} setError={setError} setInfo={setInfo} onChanged={loadSummary} tick={tick} driveId={driveId} setDriveId={setDriveId} />}
      {tab === 'stats' && <Statistics token={token} setError={setError} setInfo={setInfo} tick={tick} />}
    </div>
  )
}