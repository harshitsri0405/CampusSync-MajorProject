import { useCallback, useEffect, useState } from 'react'
import { Download, Lock, Send, Undo2 } from 'lucide-react'
import {
  listFacultyClasses, facultyMarksSheet, saveFacultyMarks, publishFacultyMarks, unpublishFacultyMarks, downloadFacultyMarksCsv,
} from '../api.js'

const INPUT =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'

function toVals(sheet) {
  const v = {}
  sheet.items.forEach((s) => {
    v[s.id] = {}
    sheet.components.forEach((c) => { v[s.id][c.key] = s.parts[c.key] === null || s.parts[c.key] === undefined ? '' : String(s.parts[c.key]) })
  })
  return v
}

export default function FacultyMarksPage({ session }) {
  const token = session.access_token
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [sheet, setSheet] = useState(null)
  const [vals, setVals] = useState({})
  const [orig, setOrig] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    listFacultyClasses(token)
      .then((d) => { setClasses(d.items); if (d.items.length) setClassId(d.items[0].id); else setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [token])

  const load = useCallback(() => {
    if (!classId) return Promise.resolve()
    setLoading(true)
    return facultyMarksSheet(token, classId)
      .then((d) => { setSheet(d); setVals(toVals(d)); setOrig(toVals(d)); setError('') })
      .catch((e) => { setSheet(null); setError(e.message) })
      .finally(() => setLoading(false))
  }, [token, classId])

  useEffect(() => { setOk(''); load() }, [load])

  const comps = sheet ? sheet.components : []
  const items = sheet ? sheet.items : []
  const dirty = items.filter((s) => !s.published && comps.some((c) => vals[s.id] && vals[s.id][c.key] !== orig[s.id][c.key]))
  const allPublished = items.length > 0 && items.every((s) => s.published)
  const anyPublished = items.some((s) => s.published)

  function setVal(sid, key, raw) {
    if (!/^\d{0,3}$/.test(raw)) return
    setVals({ ...vals, [sid]: { ...vals[sid], [key]: raw } })
  }

  function liveInternal(s) {
    const entered = comps.filter((c) => vals[s.id] && vals[s.id][c.key] !== '')
    if (entered.length === 0) return s.internal
    return entered.reduce((sum, c) => sum + Number(vals[s.id][c.key]), 0)
  }

  async function save() {
    setError(''); setOk('')
    const rows = []
    for (const s of dirty) {
      const parts = {}
      for (const c of comps) {
        const raw = vals[s.id][c.key]
        if (raw === '') { parts[c.key] = null; continue }
        const n = Number(raw)
        if (n > c.max) return setError(`${s.name}: ${c.label} ke marks ${c.max} se zyada nahi ho sakte.`)
        parts[c.key] = n
      }
      if (Object.values(parts).some((x) => x !== null)) rows.push({ student_id: s.id, parts })
    }
    if (rows.length === 0) return setError('Koi marks bhare nahi gaye.')
    setBusy(true)
    try {
      const r = await saveFacultyMarks(token, { assignment_id: classId, rows })
      setOk(`${r.saved} students ke marks save ho gaye.`)
      await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function publish() {
    setError(''); setOk('')
    if (dirty.length > 0) return setError('Pehle Save karo, phir Publish.')
    if (!window.confirm('Marks students ko dikhne lagenge aur lock ho jayenge. Publish karna hai?')) return
    setBusy(true)
    try {
      const r = await publishFacultyMarks(token, classId)
      setOk(`${r.published} students ke marks publish ho gaye.`)
      await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function unpublish() {
    if (!window.confirm('Marks students se hat jayenge. Unpublish karna hai?')) return
    setBusy(true); setError(''); setOk('')
    try {
      const r = await unpublishFacultyMarks(token, classId)
      setOk(`${r.unpublished} students ke marks unpublish ho gaye.`)
      await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function download() {
    setBusy(true); setError('')
    try { await downloadFacultyMarksCsv(token, classId) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (!loading && classes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-xl mx-auto">
        <p className="font-display text-base text-slate-900 mb-1">No classes are assigned yet</p>
        <p className="font-body text-sm text-slate-500">First create sample classes from the Dashboard or My Classes.</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-body text-xs text-slate-500 mb-1">Class and subject</p>
          <select className={`${INPUT} w-80 max-w-full`} value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.course} · Sem {c.semester} · {c.subject}{c.is_sample ? ' (SAMPLE)' : ''}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy || !sheet} onClick={download}><Download size={15} /> CSV</button>
          {anyPublished && <button className={`${OUTLINE} flex items-center gap-1.5`} disabled={busy} onClick={unpublish}><Undo2 size={15} /> Unpublish</button>}
          {!allPublished && (
            <button className="rounded-lg bg-slate-800 px-3 py-1.5 font-body text-sm text-white hover:bg-slate-900 disabled:opacity-60 flex items-center gap-1.5" disabled={busy || !sheet} onClick={publish}>
              <Send size={15} /> Publish
            </button>
          )}
        </div>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700 mb-3">{ok}</p>}
      {loading && <p className="font-body text-sm text-slate-500">Loading...</p>}

      {sheet && !loading && (
        <>
          <div className="flex flex-wrap gap-3 mb-3 font-body text-sm">
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700">Students: {sheet.summary.students}</span>
            <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-blue-700">Marks bhare: {sheet.summary.entered}</span>
            <span className="rounded-lg bg-green-50 px-3 py-1.5 text-green-700">Published: {sheet.summary.published}</span>
          </div>
          <p className="font-body text-xs text-slate-500 mb-3">
            Internal = {comps.map((c) => `${c.label} (${c.max})`).join(' + ')} = {sheet.internal_max}. External ({sheet.external_max}) Admin ke Exams & Results se aate hain. Khali box ko 0 maana jata hai, par pehle kam se kam ek part bharo.
          </p>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full font-body text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-3 font-medium">Student</th>
                  {comps.map((c) => <th key={c.key} className="px-2 py-3 font-medium text-center">{c.label}<span className="block normal-case text-slate-400">/{c.max}</span></th>)}
                  <th className="px-3 py-3 font-medium text-right">Internal<span className="block normal-case text-slate-400">/{sheet.internal_max}</span></th>
                  <th className="px-3 py-3 font-medium text-right">External<span className="block normal-case text-slate-400">/{sheet.external_max}</span></th>
                  <th className="px-3 py-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && <tr><td colSpan={comps.length + 4} className="px-4 py-8 text-center text-slate-500">This class has no students.</td></tr>}
                {items.map((s) => {
                  const internal = liveInternal(s)
                  return (
                    <tr key={s.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2.5 text-slate-900 whitespace-nowrap">{s.name}<span className="block text-xs text-slate-400">{s.college_id}</span></td>
                      {comps.map((c) => (
                        <td key={c.key} className="px-2 py-2 text-center">
                          <input
                            className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-center font-body text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-slate-100 disabled:text-slate-500"
                            inputMode="numeric" disabled={s.published} value={vals[s.id] ? vals[s.id][c.key] : ''}
                            onChange={(e) => setVal(s.id, c.key, e.target.value)}
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right text-slate-900">
                        {internal === null || internal === undefined ? '-' : internal}
                        {s.legacy && <span className="block text-xs text-amber-600">parts nahi</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-700">{s.external === null || s.external === undefined ? '-' : s.external}</td>
                      <td className="px-3 py-2.5 text-right">
                        {s.published ? (
                          <span className="inline-flex items-center gap-1 rounded bg-green-50 px-2 py-0.5 text-xs text-green-700"><Lock size={11} /> Published</span>
                        ) : s.internal !== null ? (
                          <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">Saved</span>
                        ) : (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Pending</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {items.length > 0 && !allPublished && (
            <button className="mt-4 rounded-md bg-green-600 px-5 py-2.5 font-body text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60" disabled={busy || dirty.length === 0} onClick={save}>
              {busy ? 'Saving...' : dirty.length ? `Save marks (${dirty.length})` : 'Save marks'}
            </button>
          )}
        </>
      )}
    </div>
  )
}