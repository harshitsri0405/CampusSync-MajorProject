import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Check, MapPin, QrCode, X } from 'lucide-react'
import {
  listFacultyClasses, facultyQrStart, facultyQrCurrent, facultyQrHistory, facultyQrCode, facultyQrScans,
  facultyQrClose, facultyQrFinalize, facultyAttendanceSheet, saveFacultyAttendance,
} from '../api.js'
import { getPosition } from '../geo.js'

const INPUT =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const PRIMARY = 'rounded-md bg-green-600 px-5 py-2.5 font-body text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60'

const IST = { timeZone: 'Asia/Kolkata' }
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { ...IST, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '')
const fmtDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function FacultyQrPage({ session }) {
  const token = session.access_token
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [loading, setLoading] = useState(true)
  const [cur, setCur] = useState(null)
  const [history, setHistory] = useState([])
  const [radius, setRadius] = useState(100)
  const [minutes, setMinutes] = useState(10)
  const [qrImg, setQrImg] = useState('')
  const [data, setData] = useState(null)
  const [present, setPresent] = useState({})
  const [tick, setTick] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    listFacultyClasses(token)
      .then((d) => { setClasses(d.items); if (d.items.length) setClassId(d.items[0].id) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  const loadSession = useCallback(async () => {
    if (!classId) return
    try {
      const [c, h] = await Promise.all([facultyQrCurrent(token, classId), facultyQrHistory(token, classId)])
      setCur(c.session)
      setHistory(h.items)
    } catch (e) { setError(e.message) }
  }, [token, classId])

  useEffect(() => {
    setCur(null); setData(null); setPresent({}); setQrImg(''); setOk(''); setError('')
    loadSession()
  }, [loadSession])

  useEffect(() => {
    if (!cur) return undefined
    const t = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [cur])

  const active = !!cur && !cur.closed_at && new Date(cur.expires_at).getTime() > tick
  const curId = cur ? cur.id : null

  // QR badalta rehta hai
  useEffect(() => {
    if (!curId || !active) return undefined
    let stop = false
    async function pull() {
      try {
        const r = await facultyQrCode(token, curId)
        const url = await QRCode.toDataURL(r.code, { width: 320, margin: 1, errorCorrectionLevel: 'M' })
        if (!stop) setQrImg(url)
      } catch (e) { if (!stop) setQrImg('') }
    }
    pull()
    const t = setInterval(pull, 8000)
    return () => { stop = true; clearInterval(t) }
  }, [token, curId, active])

  // scan hue students
  useEffect(() => {
    if (!curId) return undefined
    let stop = false
    async function pull() {
      try { const r = await facultyQrScans(token, curId); if (!stop) setData(r) } catch (e) { /* agli baar */ }
    }
    pull()
    const t = setInterval(pull, active ? 4000 : 15000)
    return () => { stop = true; clearInterval(t) }
  }, [token, curId, active])

  useEffect(() => {
    if (!data) return
    setPresent((prev) => {
      const next = { ...prev }
      data.items.forEach((i) => { if (i.scanned_at) next[i.id] = true; else if (!(i.id in next)) next[i.id] = false })
      return next
    })
  }, [data])

  async function start() {
    setError(''); setOk(''); setBusy(true)
    try {
      const pos = await getPosition()
      const r = await facultyQrStart(token, {
        assignment_id: classId, lat: pos.coords.latitude, lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy || 0, radius_m: Number(radius), minutes: Number(minutes),
      })
      setData(null); setPresent({}); setQrImg('')
      setCur(r)
      loadSession()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function closeSession() {
    setError(''); setBusy(true)
    try { await facultyQrClose(token, cur.id); await loadSession() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function finalize() {
    setError(''); setOk(''); setBusy(true)
    try {
      const sheet = await facultyAttendanceSheet(token, classId, cur.day)
      if (!sheet.editable) throw new Error(`Attendance older than ${sheet.edit_days} days cannot be changed.`)
      if (sheet.marked && !window.confirm('Attendance for this day has already been taken. Replace it with the result of this QR session?')) return
      const r = await saveFacultyAttendance(token, {
        assignment_id: classId, day: cur.day,
        records: data.items.map((s) => ({ student_id: s.id, status: present[s.id] ? 'present' : 'absent' })),
      })
      await facultyQrFinalize(token, cur.id)
      setOk(`Attendance saved to the register: ${r.present} present, ${r.absent} absent.`)
      setCur(null); setData(null); setQrImg('')
      await loadSession()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (loading) return <p className="font-body text-sm text-slate-500">Loading...</p>
  if (classes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-xl mx-auto">
        <p className="font-display text-base text-slate-900 mb-1">No classes are assigned yet</p>
        <p className="font-body text-sm text-slate-500">First create sample classes from the Dashboard or My Classes.</p>
      </div>
    )
  }

  const left = cur ? Math.max(0, Math.floor((new Date(cur.expires_at).getTime() - tick) / 1000)) : 0
  const pCount = data ? data.items.filter((s) => present[s.id]).length : 0

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <p className="font-body text-xs text-slate-500 mb-1">Class and subject</p>
        <select className={`${INPUT} w-80 max-w-full`} value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.course} · Sem {c.semester} · {c.subject}{c.is_sample ? ' (SAMPLE)' : ''}</option>)}
        </select>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700 mb-3">{ok}</p>}

      {!active && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
          <p className="font-display text-base text-slate-900 flex items-center gap-2"><QrCode size={18} className="text-green-600" /> New QR attendance session</p>
          <p className="font-body text-xs text-slate-500 mt-1 mb-4">
            When you start, your current position is saved as the classroom location. Your browser will ask for location permission.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="font-body text-xs text-slate-500 mb-1">Location radius</p>
              <select className={INPUT} value={radius} onChange={(e) => setRadius(e.target.value)}>
                {[50, 100, 200, 500].map((r) => <option key={r} value={r}>{r} meter</option>)}
              </select>
            </div>
            <div>
              <p className="font-body text-xs text-slate-500 mb-1">Session duration</p>
              <select className={INPUT} value={minutes} onChange={(e) => setMinutes(e.target.value)}>
                {[5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m} minute</option>)}
              </select>
            </div>
            <button className={`${PRIMARY} inline-flex items-center gap-1.5`} disabled={busy} onClick={start}>
              <MapPin size={15} /> {busy ? 'Getting your location...' : 'Start session with my location'}
            </button>
          </div>
          <p className="font-body text-xs text-slate-400 mt-3">GPS can be off by 20-50 m indoors, so a radius of 100 m or more is recommended.</p>
        </div>
      )}

      {cur && active && (
        <div className="grid md:grid-cols-[340px,1fr] gap-4 mb-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-center">
            {qrImg ? <img src={qrImg} alt="Attendance QR" className="mx-auto w-full max-w-[320px] rounded-lg" /> : <div className="h-[320px] flex items-center justify-center font-body text-sm text-slate-400">Generating QR code...</div>}
            <p className="font-body text-xs text-slate-500 mt-3">This QR code refreshes every 20 seconds. Let students scan it directly from this screen.</p>
            <p className="font-display text-2xl text-slate-900 mt-3">{mmss(left)}</p>
            <p className="font-body text-xs text-slate-500">until the session ends</p>
            <p className="font-body text-xs text-slate-500 mt-3">Radius {cur.radius_m} m · GPS accuracy ±{cur.accuracy} m</p>
            <button className={`${OUTLINE} mt-3`} disabled={busy} onClick={closeSession}>End session now</button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="font-body text-xs text-slate-500">{cur.subject} · {fmtDay(cur.day)}</p>
            <p className="font-display text-4xl text-slate-900 mt-1">{data ? data.scanned : 0}<span className="text-xl text-slate-400"> / {data ? data.total : '-'}</span></p>
            <p className="font-body text-sm text-slate-500">students ne scan kiya</p>
            <div className="mt-4 h-2 rounded-full bg-slate-100 overflow-hidden">
              <span className="block h-full bg-green-500 transition-all" style={{ width: `${data && data.total ? (data.scanned * 100) / data.total : 0}%` }} />
            </div>
            <p className="font-body text-xs text-slate-400 mt-3">After the session ends, save the attendance to the register from the list below.</p>
          </div>
        </div>
      )}

      {cur && !active && !cur.finalized && (
        <p className="font-body text-sm text-amber-700 mb-3">This session has ended. Review the list below and save it to the register.</p>
      )}

      {cur && data && (
        <>
          <div className="flex flex-wrap gap-3 mb-3 font-body text-sm">
            <span className="rounded-lg bg-green-50 px-3 py-1.5 text-green-700">Present: {pCount}</span>
            <span className="rounded-lg bg-red-50 px-3 py-1.5 text-red-700">Absent: {data.items.length - pCount}</span>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full font-body text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">Student</th><th className="px-4 py-3 font-medium">Scan time</th>
                  <th className="px-4 py-3 font-medium">Distance</th><th className="px-4 py-3 font-medium text-right">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => {
                  const v = !!present[s.id]
                  return (
                    <tr key={s.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5 text-slate-900">{s.name}<span className="block text-xs text-slate-400">{s.college_id}</span></td>
                      <td className="px-4 py-2.5 text-slate-700">{s.scanned_at ? fmtTime(s.scanned_at) : <span className="text-slate-400">Not scanned</span>}</td>
                      <td className="px-4 py-2.5 text-slate-700">{s.distance_m !== null ? `${s.distance_m} m` : '-'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setPresent({ ...present, [s.id]: true })}
                            className={`flex items-center gap-1 rounded-md border px-3 py-1 text-xs ${v ? 'bg-green-600 border-green-600 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}><Check size={13} /> P</button>
                          <button onClick={() => setPresent({ ...present, [s.id]: false })}
                            className={`flex items-center gap-1 rounded-md border px-3 py-1 text-xs ${!v ? 'bg-red-600 border-red-600 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}><X size={13} /> A</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button className={`${PRIMARY} mt-4`} disabled={busy} onClick={finalize}>{busy ? 'Saving...' : 'Save to attendance register'}</button>
        </>
      )}

      {history.length > 0 && (
        <div className="mt-6">
          <p className="font-display text-base text-slate-900 mb-2">Pichhle QR sessions</p>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full font-body text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Start</th>
                  <th className="px-4 py-3 font-medium text-right">Scan</th><th className="px-4 py-3 font-medium">In register</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 text-slate-900">{fmtDay(h.day)}</td>
                    <td className="px-4 py-2.5 text-slate-700">{fmtTime(h.starts_at)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{h.scanned} / {h.total}</td>
                    <td className="px-4 py-2.5">{h.finalized ? <span className="text-green-700">Saved</span> : <span className="text-slate-400">Pending</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}