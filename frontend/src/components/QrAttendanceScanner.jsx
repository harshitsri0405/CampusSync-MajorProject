import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Camera, CameraOff, CheckCircle2, AlertTriangle } from 'lucide-react'
import { getQrOverview, scanQrAttendance, createDemoQrSession } from '../api'

const READER_ID = 'qr-reader'

function fmtTime(v) {
  if (!v) return '-'
  return new Date(v + (String(v).endsWith('Z') ? '' : 'Z')).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function QrAttendanceScanner({ onMarked }) {
  const [overview, setOverview] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [manual, setManual] = useState('')

  const [demoSubject, setDemoSubject] = useState('')
  const [demo, setDemo] = useState(null)

  const scannerRef = useRef(null)
  const handlingRef = useRef(false)

  async function loadOverview() {
    try {
      setOverview(await getQrOverview())
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    loadOverview()
    return () => {
      stopScanner()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function stopScanner() {
    const s = scannerRef.current
    scannerRef.current = null
    if (!s) return
    try {
      await s.stop()
    } catch (e) {
      /* already stopped */
    }
    try {
      s.clear()
    } catch (e) {
      /* ignore */
    }
  }

  async function submit(code) {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const res = await scanQrAttendance(code)
      setResult(res)
      await loadOverview()
      if (res.attendance_recorded && onMarked) onMarked()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function onDecoded(text) {
    if (handlingRef.current) return
    handlingRef.current = true
    setScanning(false)
    await stopScanner()
    await submit(text)
    handlingRef.current = false
  }

  async function startScan() {
    setError('')
    setResult(null)
    handlingRef.current = false
    setScanning(true)
    await new Promise((r) => setTimeout(r, 60))
    try {
      const scanner = new Html5Qrcode(READER_ID)
      scannerRef.current = scanner
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 }, onDecoded, () => {})
    } catch (e) {
      scannerRef.current = null
      setScanning(false)
      setError('Camera start nahi hui. Browser me camera permission allow karo, ya neeche code type karo.')
    }
  }

  async function cancelScan() {
    setScanning(false)
    await stopScanner()
  }

  const submitManual = (e) => {
    e.preventDefault()
    if (!manual.trim()) return
    submit(manual.trim()).then(() => setManual(''))
  }

  async function makeDemo(e) {
    e.preventDefault()
    setError('')
    setDemo(null)
    try {
      setDemo(await createDemoQrSession(demoSubject))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <h3 className="font-display font-semibold text-slate-800 mb-1">QR se attendance lagao</h3>
        <p className="text-xs text-slate-500 mb-3">
          Faculty ka dikhaya QR scan karo. QR {overview?.valid_minutes ?? 10} minute tak valid rehta hai aur ek
          class me ek hi baar scan hota hai.
        </p>

        <div id={READER_ID} className={scanning ? 'w-full max-w-sm mx-auto mb-3' : 'hidden'} />

        {!scanning ? (
          <button
            onClick={startScan}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-700 disabled:opacity-50"
          >
            <Camera size={16} /> Scan QR
          </button>
        ) : (
          <button
            onClick={cancelScan}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50"
          >
            <CameraOff size={16} /> Stop camera
          </button>
        )}

        <form onSubmit={submitManual} className="flex gap-2 mt-4">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Ya code yahan paste/type karo"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
          />
          <button
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-purple-600 text-purple-600 text-sm hover:bg-purple-50 disabled:opacity-50"
          >
            Submit
          </button>
        </form>

        {busy && <p className="text-sm text-slate-500 mt-3">Check ho raha hai...</p>}
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        {result && (
          <div
            className={`mt-3 flex items-start gap-2 text-sm rounded-lg border p-3 ${
              result.attendance_recorded
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}
          >
            {result.attendance_recorded ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{result.message}</span>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <h3 className="font-display font-semibold text-slate-800 mb-3">Recent QR scans</h3>
        {!overview || overview.recent.length === 0 ? (
          <p className="text-sm text-slate-500">Abhi koi QR scan nahi hua.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {overview.recent.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium text-slate-800">{r.subject}</div>
                  <div className="text-xs text-slate-500">{fmtTime(r.scanned_at)}</div>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    r.attendance_recorded
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {r.attendance_recorded ? 'recorded' : 'not recorded'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-xl border border-dashed border-slate-300 p-5 mb-4">
        <h3 className="font-display font-semibold text-slate-800 mb-1">Demo QR (DEV ONLY)</h3>
        <p className="text-xs text-slate-500 mb-3">
          Faculty module abhi nahi bana. Testing ke liye apni class ka QR yahan banao, phir doosre
          device se scan karo ya neeche wala code upar paste karo. ENABLE_DEMO_DATA=true chahiye.
        </p>
        <form onSubmit={makeDemo} className="flex gap-2">
          <input
            required
            maxLength={100}
            value={demoSubject}
            onChange={(e) => setDemoSubject(e.target.value)}
            placeholder="Subject name (jo Attendance me already hai)"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <button className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-900">
            Generate QR
          </button>
        </form>
        {demo && (
          <div className="mt-4 text-center">
            <img src={demo.qr_image} alt="Demo QR" className="w-48 h-48 mx-auto border border-slate-200 rounded" />
            <div className="text-xs text-slate-500 mt-2">{demo.subject}</div>
            <div className="text-xs font-mono break-all text-slate-700 mt-1 select-all">{demo.code}</div>
          </div>
        )}
      </div>
    </div>
  )
}