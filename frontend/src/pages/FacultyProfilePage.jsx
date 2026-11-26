import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2, UserCircle } from 'lucide-react'
import { getFacultyProfile, saveFacultyProfile, uploadFacultyPhoto, deleteFacultyPhoto, fetchFacultyPhoto } from '../api.js'

const INPUT =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-slate-100 disabled:text-slate-500'

const FIXED = [
  ['Name', 'name'], ['Employee ID', 'employee_id'], ['Department', 'department'],
  ['Designation', 'designation'], ['Email', 'email'], ['Phone', 'phone'],
]

export default function FacultyProfilePage({ session }) {
  const token = session.access_token
  const fileRef = useRef(null)
  const [p, setP] = useState(null)
  const [form, setForm] = useState({ qualification: '', experience_years: '', about: '' })
  const [photo, setPhoto] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  function apply(d) {
    setP(d)
    setForm({ qualification: d.qualification || '', experience_years: d.experience_years ?? '', about: d.about || '' })
  }

  async function loadPhoto(has) {
    setPhoto((old) => { if (old) URL.revokeObjectURL(old); return null })
    if (has) setPhoto(await fetchFacultyPhoto(token))
  }

  useEffect(() => {
    getFacultyProfile(token)
      .then((d) => { apply(d); return loadPhoto(d.has_photo) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function save(e) {
    e.preventDefault()
    setError(''); setOk('')
    const exp = String(form.experience_years).trim()
    if (exp !== '' && !/^\d+$/.test(exp)) return setError('Experience sirf poora number (saal) hona chahiye.')
    setBusy(true)
    try {
      apply(await saveFacultyProfile(token, { qualification: form.qualification, experience_years: exp === '' ? null : Number(exp), about: form.about }))
      setOk('Profile save ho gayi.')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function onPick(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError(''); setOk(''); setBusy(true)
    try {
      await uploadFacultyPhoto(token, file)
      await loadPhoto(true)
      setP((x) => ({ ...x, has_photo: true }))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function removePhoto() {
    if (!window.confirm('Photo hata deni hai?')) return
    setError(''); setOk(''); setBusy(true)
    try {
      await deleteFacultyPhoto(token)
      await loadPhoto(false)
      setP((x) => ({ ...x, has_photo: false }))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (loading) return <p className="font-body text-sm text-slate-500">Loading...</p>
  if (!p) return <p className="font-body text-sm text-red-600">{error || 'Profile load nahi hui.'}</p>

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {error && <p className="font-body text-sm text-red-600">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700">{ok}</p>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-wrap items-center gap-5">
        <span className="w-24 h-24 rounded-full overflow-hidden bg-green-50 text-green-600 flex items-center justify-center border border-slate-200">
          {photo ? <img src={photo} alt="Profile" className="w-full h-full object-cover" /> : <UserCircle size={56} />}
        </span>
        <div>
          <p className="font-display text-lg text-slate-900">{p.name}</p>
          <p className="font-body text-sm text-slate-500 mb-3">{[p.designation, p.department].filter(Boolean).join(' · ') || 'Faculty'}</p>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPick} />
          <div className="flex gap-2">
            <button className="rounded-md bg-green-600 px-3 py-1.5 font-body text-sm text-white hover:bg-green-700 disabled:opacity-60 flex items-center gap-1.5" disabled={busy} onClick={() => fileRef.current.click()}>
              <Camera size={15} /> {p.has_photo ? 'Photo badlo' : 'Photo upload'}
            </button>
            {p.has_photo && (
              <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60 flex items-center gap-1.5" disabled={busy} onClick={removePhoto}>
                <Trash2 size={15} /> Remove
              </button>
            )}
          </div>
          <p className="font-body text-xs text-slate-400 mt-2">JPG, PNG ya WEBP, 2 MB tak.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-display text-base text-slate-900 mb-1">Official details</h3>
        <p className="font-body text-xs text-slate-500 mb-4">Ye details Admin set karta hai. Badalni ho to Admin se kaho.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          {FIXED.map(([label, key]) => (
            <div key={key}>
              <label className="font-body text-sm text-slate-600 mb-1 block">{label}</label>
              <input className={INPUT} value={p[key] || ''} disabled readOnly placeholder="-" />
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <h3 className="font-display text-base text-slate-900">Meri details</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="font-body text-sm text-slate-600 mb-1 block">Qualification</label>
            <input className={INPUT} maxLength={150} value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} placeholder="jaise M.Tech" />
          </div>
          <div>
            <label className="font-body text-sm text-slate-600 mb-1 block">Experience (saal)</label>
            <input className={INPUT} inputMode="numeric" value={form.experience_years} onChange={(e) => setForm({ ...form, experience_years: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="font-body text-sm text-slate-600 mb-1 block">About</label>
          <textarea className={INPUT} rows={3} maxLength={500} value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} />
        </div>
        <button type="submit" disabled={busy} className="rounded-md bg-green-600 px-5 py-2.5 font-body text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60">
          {busy ? 'Saving...' : 'Save'}
        </button>
      </form>
    </div>
  )
}