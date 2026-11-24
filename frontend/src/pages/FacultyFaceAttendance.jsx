import { useCallback, useEffect, useState } from 'react'
import { Camera, ScanFace, Trash2, Upload, Check, X, AlertTriangle } from 'lucide-react'
import {
  facultyFaceStatus, facultyFaceEnroll, facultyFaceRemove, facultyFaceMatch,
  facultyAttendanceSheet, saveFacultyAttendance,
} from '../api.js'

const INPUT =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500'
const OUTLINE = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60'
const PRIMARY = 'rounded-md bg-green-600 px-5 py-2.5 font-body text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60'

const todayStr = () => new Date().toLocaleDateString('en-CA')

// ---------- face-api (browser me chalta hai, photo server par nahi jaati) ----------
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/'
let _api = null

function loadFaceApi() {
  if (!_api) {
    _api = (async () => {
      const mod = await import('@vladmandic/face-api')
      const faceapi = mod.default && mod.default.nets ? mod.default : mod
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ])
      return faceapi
    })().catch((e) => {
      _api = null
      throw new Error('Face models load nahi hue. Internet check karo aur dobara try karo.')
    })
  }
  return _api
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Photo khul nahi payi. JPG ya PNG file do.')) }
    img.src = url
  })
}

function toCanvas(img, maxSide = 1600) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  const c = document.createElement('canvas')
  c.width = Math.round(img.naturalWidth * scale)
  c.height = Math.round(img.naturalHeight * scale)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  return c
}

function cropFace(canvas, box) {
  const pad = box.width * 0.15
  const x = Math.max(0, box.x - pad)
  const y = Math.max(0, box.y - pad)
  const w = Math.min(canvas.width - x, box.width + pad * 2)
  const h = Math.min(canvas.height - y, box.height + pad * 2)
  const c = document.createElement('canvas')
  c.width = 96
  c.height = Math.max(1, Math.round((96 * h) / w))
  c.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.7)
}

async function detectFaces(faceapi, file) {
  const img = await loadImage(file)
  const canvas = toCanvas(img)
  const opts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
  const dets = await faceapi.detectAllFaces(canvas, opts).withFaceLandmarks().withFaceDescriptors()
  return { canvas, dets }
}

// ---------- Enroll ----------
function EnrollPanel({ token, cls, data, reload }) {
  const [consent, setConsent] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [q, setQ] = useState('')

  async function addPhoto(student, file) {
    if (!file) return
    if (!consent) return setError('Pehle upar "student ki sahmati li hai" tick karo.')
    setBusyId(student.id); setError(''); setOk('')
    try {
      const faceapi = await loadFaceApi()
      const { dets } = await detectFaces(faceapi, file)
      if (dets.length === 0) throw new Error('Photo me chehra nahi mila. Seedhi, saaf roshni wali photo do.')
      if (dets.length > 1) throw new Error('Photo me ek se zyada chehre hain. Sirf is student ki akeli photo do.')
      await facultyFaceEnroll(token, {
        assignment_id: cls.id, student_id: student.id, consent: true,
        descriptor: Array.from(dets[0].descriptor),
      })
      setOk(`${student.name} ki photo enrol ho gayi.`)
      await reload()
    } catch (e) { setError(e.message) } finally { setBusyId('') }
  }

  async function remove(student) {
    if (!window.confirm(`${student.name} ka saara face data hata dein?`)) return
    setBusyId(student.id); setError(''); setOk('')
    try {
      await facultyFaceRemove(token, cls.id, student.id)
      setOk(`${student.name} ka face data hata diya.`)
      await reload()
    } catch (e) { setError(e.message) } finally { setBusyId('') }
  }

  const rows = data.items.filter((s) => `${s.name} ${s.college_id}`.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 font-body text-sm text-amber-800">
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            Maine student ki <b>sahmati (consent)</b> le li hai. Photo server par save nahi hoti, sirf chehre ke numbers (face data) save hote hain,
            jo student ke kehne par kabhi bhi hataye ja sakte hain.
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <input className={`${INPUT} w-64`} placeholder="Student ya ID search karo" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="font-body text-sm text-slate-600">Enrolled: {data.enrolled} / {data.total}</span>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700 mb-3">{ok}</p>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full font-body text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Student</th><th className="px-4 py-3 font-medium">College ID</th>
              <th className="px-4 py-3 font-medium">Face photos</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Koi student nahi mila.</td></tr>}
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5 text-slate-900">{s.name}</td>
                <td className="px-4 py-2.5 text-slate-700">{s.college_id}</td>
                <td className="px-4 py-2.5">
                  {s.photos > 0
                    ? <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs text-green-700">{s.photos} / {data.max_photos} enrolled</span>
                    : <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">Enrol nahi</span>}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-2">
                    {busyId === s.id ? (
                      <span className="text-xs text-slate-500 py-1.5">Scan ho raha hai...</span>
                    ) : (
                      <>
                        {s.photos < data.max_photos && (
                          <label className={`${OUTLINE} inline-flex items-center gap-1.5 cursor-pointer`}>
                            <Camera size={14} /> Photo
                            <input type="file" accept="image/*" className="hidden"
                              onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; addPhoto(s, f) }} />
                          </label>
                        )}
                        {s.photos > 0 && (
                          <button className={`${OUTLINE} inline-flex items-center gap-1.5 text-red-600`} onClick={() => remove(s)}>
                            <Trash2 size={14} /> Hatao
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------- Class photo se attendance ----------
function TakePanel({ token, cls, data }) {
  const students = data.items
  const [day, setDay] = useState(todayStr())
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [res, setRes] = useState(null)
  const [present, setPresent] = useState({})

  async function run() {
    setError(''); setOk(''); setRes(null)
    if (files.length === 0) return setError('Pehle class ki photo chuno.')
    if (data.enrolled === 0) return setError('Pehle "Face Enroll" tab me students ki photo enrol karo.')
    setBusy(true)
    try {
      setProgress('Face models load ho rahe hain...')
      const faceapi = await loadFaceApi()
      const descs = []
      const thumbs = []
      for (let i = 0; i < files.length; i++) {
        setProgress(`Photo ${i + 1} / ${files.length} scan ho rahi hai...`)
        const { canvas, dets } = await detectFaces(faceapi, files[i])
        dets.forEach((d) => {
          descs.push(Array.from(d.descriptor))
          thumbs.push(cropFace(canvas, d.detection.box))
        })
      }
      if (descs.length === 0) throw new Error('Kisi photo me chehra nahi mila. Roshni aur distance theek karke dobara photo lo.')
      if (descs.length > 100) throw new Error('Ek baar me 100 se zyada chehre nahi. Kam photos chuno.')

      setProgress(`${descs.length} chehre mile, pehchaan ho rahi hai...`)
      const r = await facultyFaceMatch(token, { assignment_id: cls.id, descriptors: descs })
      const found = {}
      const unknown = []
      r.faces.forEach((f) => {
        const thumb = thumbs[f.index]
        if (f.student_id && f.status !== 'unknown') found[f.student_id] = { status: f.status, thumb, distance: f.distance }
        else unknown.push(thumb)
      })
      setRes({ found, unknown, faces: descs.length })
      setPresent(Object.fromEntries(students.map((s) => [s.id, found[s.id] ? found[s.id].status === 'match' : false])))
    } catch (e) { setError(e.message || 'Scan fail ho gaya.') } finally { setBusy(false); setProgress('') }
  }

  async function save() {
    setError(''); setOk('')
    setBusy(true)
    try {
      const sheet = await facultyAttendanceSheet(token, cls.id, day)
      if (!sheet.editable) throw new Error(`${sheet.edit_days} din se purani attendance badal nahi sakte.`)
      if (sheet.marked && !window.confirm('Is din ki attendance pehle lag chuki hai. Naye result se badal dein?')) return
      const r = await saveFacultyAttendance(token, {
        assignment_id: cls.id, day,
        records: students.map((s) => ({ student_id: s.id, status: present[s.id] ? 'present' : 'absent' })),
      })
      setOk(`Attendance save ho gayi: ${r.present} present, ${r.absent} absent.`)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const pCount = students.filter((s) => present[s.id]).length

  return (
    <div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="font-body text-xs text-slate-500 mb-1">Date</p>
            <input className={INPUT} type="date" max={todayStr()} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          </div>
          <div>
            <p className="font-body text-xs text-slate-500 mb-1">Class ki photo (ek ya zyada)</p>
            <label className={`${OUTLINE} inline-flex items-center gap-1.5 cursor-pointer py-2`}>
              <Upload size={14} /> {files.length ? `${files.length} photo chuni` : 'Photo chuno / click karo'}
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { setFiles(Array.from(e.target.files)); setRes(null) }} />
            </label>
          </div>
          <button className={PRIMARY} disabled={busy || files.length === 0} onClick={run}>
            {busy && progress ? progress : 'Pehchano'}
          </button>
        </div>
        <p className="font-body text-xs text-slate-500 mt-3">
          Tips: saamne se, roshni me, chehre saaf dikhein. Ek photo me 15-20 students se zyada na rakho. Bade class ke liye 2-3 photo lo.
          Enrolled students: {data.enrolled} / {data.total}.
        </p>
      </div>

      {error && <p className="font-body text-sm text-red-600 mb-3">{error}</p>}
      {ok && <p className="font-body text-sm text-green-700 mb-3">{ok}</p>}

      {res && (
        <>
          <div className="flex flex-wrap gap-3 mb-3 font-body text-sm">
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700">Chehre mile: {res.faces}</span>
            <span className="rounded-lg bg-green-50 px-3 py-1.5 text-green-700">Present: {pCount}</span>
            <span className="rounded-lg bg-red-50 px-3 py-1.5 text-red-700">Absent: {students.length - pCount}</span>
            <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-amber-700">Pehchane nahi gaye: {res.unknown.length}</span>
          </div>

          <p className="font-body text-sm text-amber-700 mb-3 flex items-center gap-1.5">
            <AlertTriangle size={15} /> Save se pehle list dekh lo. "Check karo" wale students ko khud confirm karo, wo abhi Absent hain.
          </p>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full font-body text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">Face</th><th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Result</th><th className="px-4 py-3 font-medium text-right">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const f = res.found[s.id]
                  const v = !!present[s.id]
                  return (
                    <tr key={s.id} className={`border-b border-slate-100 last:border-0 ${f && f.status === 'unsure' ? 'bg-amber-50/50' : ''}`}>
                      <td className="px-4 py-2">
                        {f ? <img src={f.thumb} alt="" className="h-12 w-12 rounded-lg object-cover border border-slate-200" />
                          : <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-300"><ScanFace size={20} /></span>}
                      </td>
                      <td className="px-4 py-2 text-slate-900">{s.name}<span className="block text-xs text-slate-400">{s.college_id}</span></td>
                      <td className="px-4 py-2 text-xs">
                        {s.photos === 0 && <span className="text-slate-400">Face enrol nahi, khud mark karo</span>}
                        {s.photos > 0 && !f && <span className="text-slate-500">Photo me nahi mila</span>}
                        {f && f.status === 'match' && <span className="text-green-700">Auto-match (distance {f.distance})</span>}
                        {f && f.status === 'unsure' && <span className="text-amber-700">Check karo (distance {f.distance})</span>}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setPresent({ ...present, [s.id]: true })}
                            className={`flex items-center gap-1 rounded-md border px-3 py-1 text-xs ${v ? 'bg-green-600 border-green-600 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                            <Check size={13} /> P
                          </button>
                          <button onClick={() => setPresent({ ...present, [s.id]: false })}
                            className={`flex items-center gap-1 rounded-md border px-3 py-1 text-xs ${!v ? 'bg-red-600 border-red-600 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                            <X size={13} /> A
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {res.unknown.length > 0 && (
            <div className="mt-4">
              <p className="font-body text-xs text-slate-500 mb-2">Ye chehre kisi enrolled student se match nahi hue (dusri class ke, ya enrol nahi):</p>
              <div className="flex flex-wrap gap-2">
                {res.unknown.map((t, i) => <img key={i} src={t} alt="" className="h-12 w-12 rounded-lg object-cover border border-slate-200 opacity-80" />)}
              </div>
            </div>
          )}

          <button className={`${PRIMARY} mt-4`} disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Attendance save karo'}</button>
        </>
      )}
    </div>
  )
}

export default function FacultyFaceAttendance({ token, cls }) {
  const [mode, setMode] = useState('take')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => (
    facultyFaceStatus(token, cls.id).then((d) => { setData(d); setError('') }).catch((e) => setError(e.message)).finally(() => setLoading(false))
  ), [token, cls.id])

  useEffect(() => { setLoading(true); load() }, [load])

  if (loading) return <p className="font-body text-sm text-slate-500">Loading...</p>
  if (error) return <p className="font-body text-sm text-red-600">{error}</p>
  if (!data) return null

  return (
    <div>
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit mb-4">
        {[['take', 'Photo se attendance'], ['enroll', 'Face Enroll']].map(([k, label]) => (
          <button key={k} onClick={() => setMode(k)}
            className={`rounded-md px-3 py-1.5 font-body text-sm ${mode === k ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600'}`}>{label}</button>
        ))}
      </div>
      {mode === 'take' && <TakePanel token={token} cls={cls} data={data} />}
      {mode === 'enroll' && <EnrollPanel token={token} cls={cls} data={data} reload={load} />}
    </div>
  )
}