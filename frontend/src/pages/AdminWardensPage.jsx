import { useCallback, useEffect, useState } from 'react'
import { adminWardenList, adminWardenCreate, adminWardenSetActive, adminWardenResetPassword } from '../api.js'

const field = 'w-full rounded-md border border-slate-300 px-3 py-2 font-body text-sm focus:outline-none focus:ring-2 focus:ring-slate-400'
const EMPTY = { name: '', login_id: '', password: '', phone: '' }

export default function AdminWardensPage({ session }) {
  const token = session.access_token
  const [items, setItems] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const load = useCallback(() => adminWardenList(token).then((d) => setItems(d.items)).catch((e) => setError(e.message)), [token])
  useEffect(() => { load() }, [load])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function create(e) {
    e.preventDefault()
    setBusy(true); setError(''); setOk('')
    try {
      await adminWardenCreate(token, form)
      setOk(`Warden account created. Login ID: ${form.login_id.trim()}. Share the password with the warden securely.`)
      setForm(EMPTY)
      await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function toggle(w) {
    setError(''); setOk('')
    try { const r = await adminWardenSetActive(token, w.id, !w.is_active); setOk(r.message); await load() } catch (err) { setError(err.message) }
  }
  async function reset(w) {
    const pw = window.prompt(`Enter a new password for ${w.name} (minimum 8 characters):`)
    if (!pw) return
    setError(''); setOk('')
    try { const r = await adminWardenResetPassword(token, w.id, pw); setOk(r.message) } catch (err) { setError(err.message) }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="font-display text-2xl text-slate-900">Hostel Wardens</h2>
      <p className="font-body text-sm text-slate-500 mb-5">Create warden accounts. A warden signs in through the Faculty login and gets access to the Hostel section only.</p>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700 mb-3">{ok}</p>}

      <form onSubmit={create} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5">
        <h3 className="font-display text-base text-slate-900 mb-3">Create warden account</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="font-body text-xs text-slate-600">Full name
            <input className={field} required minLength={2} maxLength={120} value={form.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <label className="font-body text-xs text-slate-600">Login ID
            <input className={field} required minLength={3} maxLength={40} pattern="[A-Za-z0-9._\-]+" title="Letters, numbers, dot, underscore and hyphen only" value={form.login_id} onChange={(e) => set('login_id', e.target.value)} />
          </label>
          <label className="font-body text-xs text-slate-600">Password (minimum 8 characters)
            <input type="password" className={field} required minLength={8} maxLength={72} autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} />
          </label>
          <label className="font-body text-xs text-slate-600">Phone (optional)
            <input className={field} maxLength={20} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </label>
        </div>
        <button type="submit" disabled={busy} className="mt-4 rounded-md bg-slate-900 px-4 py-2 font-body text-sm text-white hover:bg-slate-800 disabled:opacity-60">{busy ? 'Creating...' : 'Create warden'}</button>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-display text-base text-slate-900 mb-3">Warden accounts</h3>
        {!items ? <p className="font-body text-sm text-slate-500">Loading...</p> : items.length === 0 ? (
          <p className="font-body text-sm text-slate-500">No warden accounts yet.</p>
        ) : (
          <table className="w-full font-body text-sm">
            <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200"><th className="py-2 pr-3">Name</th><th className="pr-3">Login ID</th><th className="pr-3">Phone</th><th className="pr-3">Hostel access</th><th /></tr></thead>
            <tbody>
              {items.map((w) => (
                <tr key={w.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3 text-slate-800">{w.name}</td>
                  <td className="pr-3 text-slate-600">{w.login_id}</td>
                  <td className="pr-3 text-slate-600">{w.phone || '-'}</td>
                  <td className="pr-3"><span className={`rounded px-2 py-0.5 text-xs ${w.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{w.is_active ? 'Enabled' : 'Disabled'}</span></td>
                  <td className="whitespace-nowrap text-right">
                    <button onClick={() => toggle(w)} className="text-xs text-slate-700 hover:underline mr-3">{w.is_active ? 'Disable' : 'Enable'}</button>
                    <button onClick={() => reset(w)} className="text-xs text-slate-700 hover:underline">Reset password</button>
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