import { useCallback, useEffect, useRef, useState } from 'react'
import { Images, FolderOpen, Plus, Pencil, Trash2, Search, X, Database, ArrowLeft, ArrowRight, ArrowLeftIcon, Upload, ImageOff, CalendarDays } from 'lucide-react'
import {
  gallerySummary, listAdminAlbums, getAdminAlbum, saveAdminAlbum, deleteAdminAlbum, uploadGalleryPhotos, updateGalleryPhoto,
  moveGalleryPhoto, deleteGalleryPhoto, adminGalleryPhotoUrl, seedDemoAdminGallery,
} from '../api.js'

const ACCENT = '#2563EB'
const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const PRIMARY = 'rounded-lg px-4 py-2 font-body text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const DANGER = 'rounded-lg border border-red-200 bg-white px-3 py-1.5 font-body text-sm text-red-600 hover:bg-red-50 disabled:opacity-60'
const CATS = {
  event: { label: 'Event', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  workshop: { label: 'Workshop', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  sports: { label: 'Sports', cls: 'bg-green-50 text-green-700 border-green-200' },
  cultural: { label: 'Cultural', cls: 'bg-pink-50 text-pink-700 border-pink-200' },
  achievement: { label: 'Achievement', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
}
const PAGE_SIZE = 9
const MAX_MB = 5

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

const Label = ({ children }) => <label className="font-body text-sm text-slate-600 mb-1 block">{children}</label>

// A picture that needs the login token, so it is fetched and shown through a temporary blob URL.
function Photo({ token, photoId, className = '' }) {
  const [url, setUrl] = useState(null)
  const [done, setDone] = useState(false)
  useEffect(() => {
    let alive = true
    let made = null
    setUrl(null); setDone(false)
    if (!photoId) { setDone(true); return undefined }
    adminGalleryPhotoUrl(token, photoId).then((u) => {
      made = u
      if (alive) { setUrl(u); setDone(true) } else if (u) URL.revokeObjectURL(u)
    })
    return () => { alive = false; if (made) URL.revokeObjectURL(made) }
  }, [token, photoId])
  if (url) return <img src={url} alt="" className={`object-cover ${className}`} />
  return <div className={`flex items-center justify-center bg-slate-100 text-slate-400 ${className}`}>{done ? <ImageOff size={22} /> : <span className="font-body text-xs">...</span>}</div>
}

export default function AdminGalleryPage({ session }) {
  const token = session.access_token
  const [summary, setSummary] = useState(null)
  const [data, setData] = useState({ items: [], total: 0 })
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [open, setOpen] = useState(null) // album detail
  const [caps, setCaps] = useState({})
  const fileRef = useRef(null)

  const loadSummary = useCallback(() => gallerySummary(token).then(setSummary).catch((e) => setError(e.message)), [token])
  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { setPage(1) }, [q, category])

  const load = useCallback(() => {
    setLoading(true)
    return listAdminAlbums(token, { q, category, page, pageSize: PAGE_SIZE }).then((d) => { setData(d); setError('') }).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [token, q, category, page])
  useEffect(() => { load() }, [load])

  const loadAlbum = useCallback((id) => getAdminAlbum(token, id).then((d) => { setOpen(d); setCaps({}) }).catch((e) => setError(e.message)), [token])
  const refresh = async () => { await Promise.all([load(), loadSummary(), open ? loadAlbum(open.id) : Promise.resolve()]) }

  async function run(fn, ok) {
    setBusy(true); setError(''); setInfo('')
    try { const r = await fn(); if (ok) setInfo(typeof ok === 'function' ? ok(r) : ok); await refresh() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function saveAlbum(e) {
    e.preventDefault(); setFormError('')
    try {
      const { id, ...body } = form
      await saveAdminAlbum(token, id, { ...body, event_date: body.event_date || null, description: body.description || null })
      setInfo(id ? 'Album update ho gaya.' : 'Album ban gaya. Ab photos upload karo.')
      setForm(null)
      await refresh()
    } catch (err) { setFormError(err.message) }
  }

  async function removeAlbum(a) {
    if (!window.confirm(`"${a.title}" aur uski ${a.photos} photos delete karni hain? Ye wapas nahi aayengi.`)) return
    setBusy(true); setError(''); setInfo('')
    try { await deleteAdminAlbum(token, a.id); setInfo('Album delete ho gaya.'); setOpen(null); await Promise.all([load(), loadSummary()]) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function onFiles(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    const bad = files.find((f) => !/^image\/(jpeg|png|webp)$/.test(f.type))
    if (bad) return setError(`'${bad.name}' JPG, PNG ya WEBP nahi hai.`)
    const big = files.find((f) => f.size > MAX_MB * 1024 * 1024)
    if (big) return setError(`'${big.name}' ${MAX_MB} MB se badi hai.`)
    if (files.length > 20) return setError('Ek baar me 20 se zyada photos nahi.')
    await run(() => uploadGalleryPhotos(token, open.id, files), (r) => `${r.added} photos upload ho gayi.`)
  }

  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const blank = { category: 'event', title: '', description: '', event_date: '' }

  return (
    <div className="max-w-6xl mx-auto">
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Stat icon={FolderOpen} label="Albums" value={summary.albums} color="#2563EB" />
          <Stat icon={Images} label="Photos" value={summary.photos} color="#7C3AED" />
          <Stat icon={CalendarDays} label="Events" value={summary.categories.event || 0} color="#D97706" />
          <Stat icon={Images} label="Sports + Cultural" value={(summary.categories.sports || 0) + (summary.categories.cultural || 0)} color="#16A34A" />
        </div>
      )}

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {info && <p className="font-body text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{info}</p>}

      {open ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <button className={`${OUTLINE} flex items-center gap-1.5`} onClick={() => { setOpen(null); setInfo('') }}><ArrowLeftIcon size={15} /> Saare albums</button>
            <div className="flex gap-2">
              <button className={`${OUTLINE} flex items-center gap-1`} onClick={() => { setFormError(''); setForm({ id: open.id, category: open.category, title: open.title, description: open.description || '', event_date: open.event_date || '' }) }}><Pencil size={13} /> Album edit</button>
              <button className={`${DANGER} flex items-center gap-1`} disabled={busy} onClick={() => removeAlbum(open)}><Trash2 size={13} /> Album delete</button>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
            <div className="flex flex-wrap items-center gap-2 mb-1"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${CATS[open.category].cls}`}>{CATS[open.category].label}</span>{open.event_date && <span className="font-body text-xs text-slate-500">{fmt(open.event_date)}</span>}</div>
            <h2 className="font-display text-xl text-slate-900">{open.title}</h2>
            {open.description && <p className="font-body text-sm text-slate-600 mt-1">{open.description}</p>}
            <div className="mt-4">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={onFiles} />
              <button className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: ACCENT }} disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}><Upload size={15} /> {busy ? 'Upload ho raha hai...' : 'Photos upload karo'}</button>
              <p className="font-body text-xs text-slate-500 mt-2">JPG, PNG ya WEBP, har photo max {MAX_MB} MB, ek baar me 20 tak, album me 100 tak.</p>
            </div>
          </div>
          {open.items.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center font-body text-sm text-slate-500">Is album me abhi koi photo nahi hai.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {open.items.map((p, i) => (
                <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <Photo token={token} photoId={p.has_file ? p.id : null} className="w-full h-36" />
                  <div className="p-2.5">
                    <input className={`${INPUT} !py-1.5`} maxLength={150} placeholder="Caption" value={caps[p.id] !== undefined ? caps[p.id] : p.caption || ''}
                      onChange={(e) => setCaps({ ...caps, [p.id]: e.target.value })}
                      onBlur={() => caps[p.id] !== undefined && caps[p.id] !== (p.caption || '') && run(() => updateGalleryPhoto(token, p.id, caps[p.id]), 'Caption save ho gaya.')} />
                    <div className="flex items-center justify-between mt-2">
                      <span className="flex gap-1">
                        <button className={OUTLINE} disabled={busy || i === 0} onClick={() => run(() => moveGalleryPhoto(token, p.id, 'up'))} aria-label="Pehle"><ArrowLeft size={13} /></button>
                        <button className={OUTLINE} disabled={busy || i === open.items.length - 1} onClick={() => run(() => moveGalleryPhoto(token, p.id, 'down'))} aria-label="Baad me"><ArrowRight size={13} /></button>
                      </span>
                      <button className={DANGER} disabled={busy} onClick={() => window.confirm('Ye photo delete karni hai?') && run(() => deleteGalleryPhoto(token, p.id), 'Photo delete ho gayi.')} aria-label="Delete"><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input className={`${INPUT} pl-9 w-64`} placeholder="Album search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <select className={`${INPUT} w-44`} value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            </div>
            <div className="flex gap-2">
              <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy} onClick={() => run(() => seedDemoAdminGallery(token), (r) => r.message)}><Database size={15} /> Sample data</button>
              <button className={`${PRIMARY} flex items-center gap-1.5`} style={{ background: ACCENT }} onClick={() => { setFormError(''); setInfo(''); setForm(blank) }}><Plus size={16} /> New Album</button>
            </div>
          </div>
          {loading ? <p className="font-body text-sm text-slate-500">Loading...</p> : data.items.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center font-body text-sm text-slate-500">{q || category ? 'Koi album match nahi hua.' : 'Abhi koi album nahi hai. "New Album" dabao.'}</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.items.map((a) => (
                <button key={a.id} className="text-left bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition" onClick={() => { setInfo(''); loadAlbum(a.id) }}>
                  <Photo token={token} photoId={a.cover_photo_id} className="w-full h-40" />
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2 mb-1.5"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${CATS[a.category].cls}`}>{CATS[a.category].label}</span><span className="font-body text-xs text-slate-500">{a.photos} photos</span></div>
                    <p className="font-display text-base text-slate-900">{a.title}</p>
                    {a.event_date && <p className="font-body text-xs text-slate-500 mt-0.5">{fmt(a.event_date)}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mt-3 font-body text-sm text-slate-500">
            <span>Total: {data.total}</span>
            <div className="flex items-center gap-2">
              <button className={OUTLINE} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page} / {pages}</span>
              <button className={OUTLINE} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        </>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-lg text-slate-900">{form.id ? 'Edit Album' : 'New Album'}</h3>
              <button onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={20} /></button>
            </div>
            <form onSubmit={saveAlbum} className="p-6 space-y-4">
              {formError && <p className="font-body text-sm text-red-600">{formError}</p>}
              <div><Label>Title *</Label><input className={INPUT} maxLength={100} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Category *</Label><select className={INPUT} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><Label>Event date</Label><input className={INPUT} type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} /></div>
              </div>
              <div><Label>Description</Label><textarea className={INPUT} rows={3} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="flex gap-3"><button type="submit" className={PRIMARY} style={{ background: ACCENT }}>Save</button><button type="button" className={OUTLINE} onClick={() => setForm(null)}>Cancel</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}