import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { facultyHostelList, facultyHostelRooms, facultyHostelRoomCreate, facultyHostelRoomUpdate, facultyHostelRoomDelete } from '../api.js'

const field = 'w-full rounded-md border border-slate-300 px-3 py-2 font-body text-sm focus:outline-none focus:ring-2 focus:ring-green-500'
const CAP = { Single: 1, Double: 2, Triple: 3 }
const STATE = {
  vacant: ['Vacant', 'bg-green-100 text-green-700'], partial: ['Partially occupied', 'bg-blue-100 text-blue-700'],
  full: ['Full', 'bg-slate-200 text-slate-700'], maintenance: ['Under maintenance', 'bg-amber-100 text-amber-700'],
}

export default function WardenRoomsTab({ session }) {
  const token = session.access_token
  const [hostels, setHostels] = useState([])
  const [hostelId, setHostelId] = useState('')
  const [floor, setFloor] = useState('')
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [rooms, setRooms] = useState(null)
  const [form, setForm] = useState(null)
  const [editId, setEditId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => { facultyHostelList(token).then((d) => setHostels(d.items)).catch((e) => setError(e.message)) }, [token])

  const load = useCallback(() => {
    return facultyHostelRooms(token, { hostel_id: hostelId, floor, status, q })
      .then((d) => { setRooms(d.items); setError('') }).catch((e) => setError(e.message))
  }, [token, hostelId, floor, status, q])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const hostelOf = (id) => hostels.find((h) => h.id === id)

  function openNew() {
    setEditId('')
    setForm({ hostel_id: hostelId || hostels[0]?.id || '', room_no: '', floor: 0, room_type: 'Double', capacity: 2, is_active: true, notes: '' })
  }
  function openEdit(r) {
    setEditId(r.id)
    setForm({ hostel_id: r.hostel_id, room_no: r.room_no, floor: r.floor, room_type: r.room_type, capacity: r.capacity, is_active: r.is_active, notes: r.notes })
  }
  async function save(e) {
    e.preventDefault()
    setBusy(true); setError(''); setOk('')
    const payload = { ...form, floor: Number(form.floor), capacity: Number(form.capacity) }
    try {
      if (editId) { const { hostel_id, ...rest } = payload; await facultyHostelRoomUpdate(token, editId, rest) }
      else await facultyHostelRoomCreate(token, payload)
      setOk('Room saved.'); setForm(null); setEditId(''); await load()
      facultyHostelList(token).then((d) => setHostels(d.items)).catch(() => {})
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function remove(r) {
    if (!window.confirm(`Delete room ${r.room_no}?`)) return
    setError(''); setOk('')
    try { await facultyHostelRoomDelete(token, r.id); setOk('Room deleted.'); await load() } catch (err) { setError(err.message) }
  }

  if (hostels.length === 0 && !error) return <p className="font-body text-sm text-slate-500">Add a hostel first, then you can create rooms.</p>
  const maxFloor = hostelOf(form?.hostel_id)?.floors ?? 30

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          <select className="rounded-md border border-slate-300 px-3 py-2 font-body text-sm" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
            <option value="">All hostels</option>{hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <input type="number" min="0" max="30" placeholder="Floor" className="w-24 rounded-md border border-slate-300 px-3 py-2 font-body text-sm" value={floor} onChange={(e) => setFloor(e.target.value)} />
          <select className="rounded-md border border-slate-300 px-3 py-2 font-body text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All rooms</option><option value="available">Available</option><option value="vacant">Vacant</option>
            <option value="partial">Partially occupied</option><option value="full">Full</option><option value="maintenance">Under maintenance</option>
          </select>
          <input placeholder="Search room no." maxLength={30} className="rounded-md border border-slate-300 px-3 py-2 font-body text-sm" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-2 font-body text-sm text-white hover:bg-green-700"><Plus size={15} /> Add room</button>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700 mb-3">{ok}</p>}

      {form && (
        <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5">
          <h3 className="font-display text-base text-slate-900 mb-3">{editId ? 'Edit room' : 'Add room'}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="font-body text-xs text-slate-600">Hostel
              <select className={field} disabled={!!editId} value={form.hostel_id} onChange={(e) => set('hostel_id', e.target.value)}>
                {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </label>
            <label className="font-body text-xs text-slate-600">Room number
              <input className={field} required maxLength={20} value={form.room_no} onChange={(e) => set('room_no', e.target.value)} placeholder="e.g. 101" />
            </label>
            <label className="font-body text-xs text-slate-600">Floor (0 = ground)
              <input type="number" min="0" max={maxFloor} required className={field} value={form.floor} onChange={(e) => set('floor', e.target.value)} />
            </label>
            <label className="font-body text-xs text-slate-600">Room type
              <select className={field} value={form.room_type} onChange={(e) => setForm((f) => ({ ...f, room_type: e.target.value, capacity: CAP[e.target.value] }))}>
                <option>Single</option><option>Double</option><option>Triple</option>
              </select>
            </label>
            <label className="font-body text-xs text-slate-600">Capacity (beds)
              <input type="number" min="1" max="6" required className={field} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
            </label>
            <label className="font-body text-xs text-slate-600 md:col-span-2">Notes (optional)
              <input className={field} maxLength={200} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </label>
            <label className="flex items-center gap-2 font-body text-sm text-slate-700 self-end pb-2">
              <input type="checkbox" checked={!form.is_active} onChange={(e) => set('is_active', !e.target.checked)} /> Under maintenance
            </label>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" disabled={busy} className="rounded-md bg-green-600 px-4 py-2 font-body text-sm text-white hover:bg-green-700 disabled:opacity-60">{busy ? 'Saving...' : 'Save room'}</button>
            <button type="button" onClick={() => { setForm(null); setEditId('') }} className="rounded-md border border-slate-300 px-4 py-2 font-body text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 overflow-x-auto">
        {!rooms ? <p className="font-body text-sm text-slate-500">Loading...</p> : rooms.length === 0 ? (
          <p className="font-body text-sm text-slate-500">No rooms match these filters.</p>
        ) : (
          <table className="w-full font-body text-sm">
            <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-3">Hostel</th><th className="pr-3">Room</th><th className="pr-3">Floor</th><th className="pr-3">Type</th><th className="pr-3">Occupied</th><th className="pr-3">Free beds</th><th className="pr-3">Status</th><th />
            </tr></thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3 text-slate-700">{r.hostel_name}</td>
                  <td className="pr-3 text-slate-900">{r.room_no}</td><td className="pr-3">{r.floor === 0 ? 'Ground' : r.floor}</td>
                  <td className="pr-3">{r.room_type}</td><td className="pr-3">{r.occupied} / {r.capacity}</td><td className="pr-3">{r.available_beds}</td>
                  <td className="pr-3"><span className={`rounded px-2 py-0.5 text-xs ${STATE[r.state][1]}`}>{STATE[r.state][0]}</span></td>
                  <td className="whitespace-nowrap text-right">
                    <button onClick={() => openEdit(r)} className="text-slate-500 hover:text-slate-800 mr-3" aria-label="Edit room"><Pencil size={15} /></button>
                    <button onClick={() => remove(r)} className="text-red-500 hover:text-red-700" aria-label="Delete room"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}