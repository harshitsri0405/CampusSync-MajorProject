import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { facultyHostelList, facultyHostelWardens, facultyHostelCreate, facultyHostelUpdate, facultyHostelDelete } from '../api.js'

const field = 'w-full rounded-md border border-slate-300 px-3 py-2 font-body text-sm focus:outline-none focus:ring-2 focus:ring-green-500'
const EMPTY = { name: '', hostel_type: 'Boys', address: '', floors: 4, info: '', warden_profile_id: '', contact_phone: '' }

export default function WardenHostelsTab({ session }) {
  const token = session.access_token
  const [items, setItems] = useState(null)
  const [wardens, setWardens] = useState([])
  const [form, setForm] = useState(null)
  const [editId, setEditId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const load = useCallback(() => facultyHostelList(token).then((d) => setItems(d.items)).catch((e) => setError(e.message)), [token])
  useEffect(() => { load(); facultyHostelWardens(token).then((d) => setWardens(d.items)).catch(() => setWardens([])) }, [load, token])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  function edit(h) {
    setEditId(h.id)
    setForm({ name: h.name, hostel_type: h.hostel_type, address: h.address, floors: h.floors, info: h.info, warden_profile_id: h.warden?.id || '', contact_phone: h.contact_phone })
  }
  async function save(e) {
    e.preventDefault()
    setBusy(true); setError(''); setOk('')
    const payload = { ...form, floors: Number(form.floors), warden_profile_id: form.warden_profile_id || null }
    try {
      if (editId) await facultyHostelUpdate(token, editId, payload)
      else await facultyHostelCreate(token, payload)
      setOk('Hostel saved.'); setForm(null); setEditId(''); await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function remove(h) {
    if (!window.confirm(`Delete "${h.name}"?`)) return
    setError(''); setOk('')
    try { await facultyHostelDelete(token, h.id); setOk('Hostel deleted.'); await load() } catch (err) { setError(err.message) }
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => { setEditId(''); setForm({ ...EMPTY }) }} className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-2 font-body text-sm text-white hover:bg-green-700"><Plus size={15} /> Add hostel</button>
      </div>
      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700 mb-3">{ok}</p>}

      {form && (
        <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5">
          <h3 className="font-display text-base text-slate-900 mb-3">{editId ? 'Edit hostel' : 'Add hostel'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="font-body text-xs text-slate-600">Hostel name
              <input className={field} required minLength={2} maxLength={120} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </label>
            <label className="font-body text-xs text-slate-600">Type
              <select className={field} value={form.hostel_type} onChange={(e) => set('hostel_type', e.target.value)}><option>Boys</option><option>Girls</option></select>
            </label>
            <label className="font-body text-xs text-slate-600">Number of floors
              <input type="number" min="1" max="30" required className={field} value={form.floors} onChange={(e) => set('floors', e.target.value)} />
            </label>
            <label className="font-body text-xs text-slate-600">Assigned warden
              <select className={field} value={form.warden_profile_id} onChange={(e) => set('warden_profile_id', e.target.value)}>
                <option value="">Not assigned</option>
                {wardens.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.login_id})</option>)}
              </select>
            </label>
            <label className="font-body text-xs text-slate-600">Contact phone
              <input className={field} maxLength={20} value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} />
            </label>
            <label className="font-body text-xs text-slate-600">Address / location
              <input className={field} maxLength={300} value={form.address} onChange={(e) => set('address', e.target.value)} />
            </label>
          </div>
          <label className="block font-body text-xs text-slate-600 mt-3">Hostel information (rules, facilities)
            <textarea rows={3} maxLength={2000} className={field} value={form.info} onChange={(e) => set('info', e.target.value)} />
          </label>
          <div className="flex gap-2 mt-4">
            <button type="submit" disabled={busy} className="rounded-md bg-green-600 px-4 py-2 font-body text-sm text-white hover:bg-green-700 disabled:opacity-60">{busy ? 'Saving...' : 'Save hostel'}</button>
            <button type="button" onClick={() => { setForm(null); setEditId('') }} className="rounded-md border border-slate-300 px-4 py-2 font-body text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
          </div>
        </form>
      )}

      {!items ? <p className="font-body text-sm text-slate-500">Loading...</p> : items.length === 0 ? (
        <p className="font-body text-sm text-slate-500">No hostels added yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((h) => (
            <div key={h.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-base text-slate-900">{h.name}</p>
                  <p className="font-body text-xs text-slate-500">{h.hostel_type} hostel · {h.floors} floor(s){h.address ? ` · ${h.address}` : ''}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => edit(h)} className="text-slate-500 hover:text-slate-800" aria-label="Edit hostel"><Pencil size={15} /></button>
                  <button onClick={() => remove(h)} className="text-red-500 hover:text-red-700" aria-label="Delete hostel"><Trash2 size={15} /></button>
                </div>
              </div>
              <p className="font-body text-sm text-slate-700 mt-3">Warden: {h.warden ? `${h.warden.name} (${h.warden.login_id})${h.warden.phone ? ` · ${h.warden.phone}` : ''}` : 'Not assigned'}</p>
              {h.contact_phone && <p className="font-body text-xs text-slate-500">Hostel contact: {h.contact_phone}</p>}
              <p className="font-body text-xs text-slate-500 mt-2">{h.rooms} rooms · {h.occupied_beds} of {h.beds} beds occupied</p>
              {h.info && <p className="font-body text-sm text-slate-600 mt-2 whitespace-pre-line">{h.info}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}