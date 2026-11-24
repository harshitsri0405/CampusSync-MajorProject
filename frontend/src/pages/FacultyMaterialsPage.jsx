import { useCallback, useEffect, useState } from 'react'
import { Download, Eye, EyeOff, Pencil, Trash2, Upload, FileText } from 'lucide-react'
import {
  listFacultyClasses, facultyMaterialsMeta, facultyMaterialsList, uploadFacultyMaterial,
  updateFacultyMaterial, deleteFacultyMaterial, downloadFacultyMaterial,
} from '../api.js'

const INPUT =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const PRIMARY = 'rounded-md bg-green-600 px-5 py-2.5 font-body text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60'

const EXT_COLOR = {
  pdf: 'bg-red-50 text-red-700', ppt: 'bg-orange-50 text-orange-700', pptx: 'bg-orange-50 text-orange-700',
  doc: 'bg-blue-50 text-blue-700', docx: 'bg-blue-50 text-blue-700', xls: 'bg-green-50 text-green-700', xlsx: 'bg-green-50 text-green-700',
}
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export default function FacultyMaterialsPage({ session }) {
  const token = session.access_token
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [meta, setMeta] = useState(null)
  const [items, setItems] = useState([])
  const [category, setCategory] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  const [title, setTitle] = useState('')
  const [cat, setCat] = useState('Notes')
  const [desc, setDesc] = useState('')
  const [file, setFile] = useState(null)
  const [fileKey, setFileKey] = useState(0)

  const [editId, setEditId] = useState('')
  const [edit, setEdit] = useState({ title: '', description: '', category: 'Notes' })

  useEffect(() => {
    Promise.all([listFacultyClasses(token), facultyMaterialsMeta(token)])
      .then(([c, m]) => { setClasses(c.items); setMeta(m); if (c.items.length) setClassId(c.items[0].id) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  const load = useCallback(() => {
    if (!classId) return Promise.resolve()
    return facultyMaterialsList(token, { assignment_id: classId, category, q })
      .then((d) => { setItems(d.items); setError('') })
      .catch((e) => setError(e.message))
  }, [token, classId, category, q])

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  const cls = classes.find((c) => c.id === classId)

  async function upload(e) {
    e.preventDefault()
    setError(''); setOk('')
    if (!file) return setError('Pehle file chuno.')
    if (!title.trim()) return setError('Title likho.')
    if (meta && file.size > meta.max_mb * 1048576) return setError(`File ${meta.max_mb} MB se badi hai.`)
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('assignment_id', classId)
      fd.append('title', title.trim())
      fd.append('category', cat)
      fd.append('description', desc)
      fd.append('file', file)
      await uploadFacultyMaterial(token, fd)
      setOk('Upload ho gaya. Students ko notification bhej diya.')
      setTitle(''); setDesc(''); setFile(null); setFileKey(fileKey + 1)
      await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function toggle(m) {
    setError(''); setOk('')
    try { await updateFacultyMaterial(token, m.id, { is_visible: !m.is_visible }); await load() } catch (err) { setError(err.message) }
  }

  async function saveEdit(m) {
    setError(''); setOk('')
    try {
      await updateFacultyMaterial(token, m.id, edit)
      setEditId(''); setOk('Badlaav save ho gaye.')
      await load()
    } catch (err) { setError(err.message) }
  }

  async function remove(m) {
    if (!window.confirm(`"${m.title}" hamesha ke liye hata dein?`)) return
    setError(''); setOk('')
    try { await deleteFacultyMaterial(token, m.id); setOk('Material hata diya.'); await load() } catch (err) { setError(err.message) }
  }

  async function download(m) {
    setError('')
    try { await downloadFacultyMaterial(token, m.id, m.file_name) } catch (err) { setError(err.message) }
  }

  if (loading) return <p className="font-body text-sm text-slate-500">Loading...</p>
  if (classes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-xl mx-auto">
        <p className="font-display text-base text-slate-900 mb-1">Abhi koi class assign nahi hai</p>
        <p className="font-body text-sm text-slate-500">Pehle Dashboard ya My Classes se sample classes banao.</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <p className="font-body text-xs text-slate-500 mb-1">Class aur subject</p>
        <select className={`${INPUT} w-80 max-w-full`} value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.course} · Sem {c.semester} · {c.subject}{c.is_sample ? ' (SAMPLE)' : ''}</option>)}
        </select>
      </div>

      <form onSubmit={upload} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
        <p className="font-display text-base text-slate-900 mb-1">Naya material upload karo</p>
        <p className="font-body text-xs text-slate-500 mb-4">
          {cls ? `${cls.course} · Sem ${cls.semester} · ${cls.subject}` : ''} ke students ko dikhega.
          {meta ? ` Allowed: ${meta.extensions.join(', ')} (max ${meta.max_mb} MB).` : ''}
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <input className={INPUT} placeholder="Title (jaise: Unit 1 Notes)" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className={INPUT} value={cat} onChange={(e) => setCat(e.target.value)}>
            {(meta ? meta.categories : ['Notes']).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <textarea className={`${INPUT} sm:col-span-2`} rows={2} placeholder="Chhota description (optional)" maxLength={2000} value={desc} onChange={(e) => setDesc(e.target.value)} />
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <label className={`${OUTLINE} inline-flex items-center gap-1.5 cursor-pointer py-2`}>
              <Upload size={14} /> {file ? file.name : 'File chuno'}
              <input key={fileKey} type="file" className="hidden" onChange={(e) => setFile(e.target.files[0] || null)} />
            </label>
            {file && <span className="font-body text-xs text-slate-500">{fmtSize(file.size)}</span>}
            <button className={`${PRIMARY} ml-auto`} disabled={busy}>{busy ? 'Upload ho raha hai...' : 'Upload karo'}</button>
          </div>
        </div>
      </form>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700 mb-3">{ok}</p>}

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input className={`${INPUT} w-64`} placeholder="Title se search karo" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={INPUT} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Saari categories</option>
          {(meta ? meta.categories : []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="font-body text-sm text-slate-500 ml-auto">{items.length} material</span>
      </div>

      <div className="space-y-3">
        {items.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center font-body text-sm text-slate-500">
            Is class me abhi koi material upload nahi hua.
          </div>
        )}
        {items.map((m) => (
          <div key={m.id} className={`bg-white rounded-xl border shadow-sm p-4 ${m.is_visible ? 'border-slate-200' : 'border-slate-200 opacity-70'}`}>
            {editId === m.id ? (
              <div className="grid sm:grid-cols-2 gap-3">
                <input className={INPUT} value={edit.title} maxLength={200} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
                <select className={INPUT} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                  {meta.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <textarea className={`${INPUT} sm:col-span-2`} rows={2} value={edit.description} maxLength={2000} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
                <div className="sm:col-span-2 flex gap-2">
                  <button type="button" className={PRIMARY} onClick={() => saveEdit(m)}>Save</button>
                  <button type="button" className={OUTLINE} onClick={() => setEditId('')}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start gap-4">
                <span className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg text-[10px] font-medium uppercase ${EXT_COLOR[m.ext] || 'bg-slate-100 text-slate-600'}`}>
                  <FileText size={18} />{m.ext}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base text-slate-900 truncate">{m.title}</p>
                  <p className="font-body text-xs text-slate-500 mt-0.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 mr-2">{m.category}</span>
                    {fmtSize(m.size)} · {fmtDate(m.created_at)} · {m.downloads} download
                    {!m.is_visible && <span className="ml-2 text-amber-700">Students se chhupa hua</span>}
                  </p>
                  {m.description && <p className="font-body text-sm text-slate-600 mt-1.5">{m.description}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className={`${OUTLINE} inline-flex items-center gap-1.5`} onClick={() => download(m)}><Download size={14} /> Download</button>
                  <button className={`${OUTLINE} inline-flex items-center gap-1.5`} onClick={() => { setEditId(m.id); setEdit({ title: m.title, description: m.description, category: m.category }) }}><Pencil size={14} /> Edit</button>
                  <button className={`${OUTLINE} inline-flex items-center gap-1.5`} onClick={() => toggle(m)}>
                    {m.is_visible ? <><EyeOff size={14} /> Chhupao</> : <><Eye size={14} /> Dikhao</>}
                  </button>
                  <button className={`${OUTLINE} inline-flex items-center gap-1.5 text-red-600`} onClick={() => remove(m)}><Trash2 size={14} /> Hatao</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}