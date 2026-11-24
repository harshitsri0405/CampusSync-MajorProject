import { useEffect, useState } from 'react'
import { getInstitution, saveInstitution } from '../api.js'

const INPUT =
  'w-full rounded-md border border-canvas-300 bg-white px-3 py-2 font-body text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-canvas-100 disabled:text-stone-500'

const FIELDS = [
  { key: 'college_code', label: 'College code', maxLength: 30 },
  { key: 'email', label: 'Email', type: 'email', maxLength: 120 },
  { key: 'contact_number', label: 'Contact number', maxLength: 20 },
  { key: 'city', label: 'City', maxLength: 80 },
  { key: 'state_name', label: 'State', maxLength: 80 },
  { key: 'country', label: 'Country', maxLength: 80 },
]

const EMPTY = { college_code: '', address: '', city: '', state_name: '', country: '', email: '', contact_number: '' }

function toForm(d) {
  const f = { ...EMPTY }
  Object.keys(EMPTY).forEach((k) => (f[k] = d[k] || ''))
  return f
}

export default function AdminCollegePage({ session }) {
  const [info, setInfo] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  useEffect(() => {
    let alive = true
    getInstitution(session.access_token)
      .then((d) => {
        if (!alive) return
        setInfo(d)
        setForm(toForm(d))
        setEditing(!d.filled) // old admins with no details land directly in edit mode
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [session.access_token])

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setDone('')
    setSaving(true)
    try {
      const d = await saveInstitution(session.access_token, form)
      setInfo(d)
      setForm(toForm(d))
      setEditing(false)
      setDone('College information save ho gayi.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setForm(toForm(info))
    setError('')
    setEditing(false)
  }

  if (loading) return <p className="font-body text-sm text-stone-500">Loading...</p>
  if (!info) return <p className="font-body text-sm text-red-600">{error || 'Data load nahi hua.'}</p>

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-xl border border-canvas-200 shadow-sm p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-display text-lg text-stone-900">College Information</h2>
          {!editing && (
            <button
              onClick={() => {
                setDone('')
                setEditing(true)
              }}
              className="rounded-md bg-brand-700 px-4 py-2 font-body text-sm text-white hover:bg-brand-800"
            >
              Edit
            </button>
          )}
        </div>

        {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
        {done && <p className="font-body text-sm text-green-600 mb-3">{done}</p>}
        {!info.filled && editing && (
          <p className="font-body text-sm text-stone-600 mb-3">
            Abhi tak college ki details save nahi hui hain. Neeche bharke Save karo.
          </p>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="font-body text-sm text-stone-600 mb-1 block">College name</label>
            <input className={INPUT} value={info.college_name} disabled readOnly />
            <p className="font-body text-xs text-stone-400 mt-1">College name login ke liye use hota hai, isliye yahan se change nahi hota.</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="font-body text-sm text-stone-600 mb-1 block">{f.label}</label>
                <input
                  className={INPUT}
                  type={f.type || 'text'}
                  maxLength={f.maxLength}
                  value={form[f.key]}
                  disabled={!editing}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={editing ? '' : '-'}
                />
              </div>
            ))}
          </div>

          <div>
            <label className="font-body text-sm text-stone-600 mb-1 block">Address</label>
            <textarea
              className={INPUT}
              rows={3}
              maxLength={300}
              value={form.address}
              disabled={!editing}
              onChange={(e) => set('address', e.target.value)}
              placeholder={editing ? '' : '-'}
            />
          </div>

          {editing && (
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-brand-700 px-5 py-2.5 font-body text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              {info.filled && (
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-md border border-canvas-300 bg-white px-4 py-2 font-body text-sm text-stone-700 hover:bg-canvas-100"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
