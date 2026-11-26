import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { CheckCircle2, MapPin, ScanLine, XCircle } from 'lucide-react'
import { studentQrScan, studentQrHistory } from '../api.js'
import { getPosition } from '../geo.js'

const IST = { timeZone: 'Asia/Kolkata' }
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-IN', { ...IST, hour: '2-digit', minute: '2-digit', second: '2-digit' })
const fmtDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export default function StudentQrScanPage({ session }) {
  const token = session.access_token
  const [phase, setPhase] = useState('idle') // idle | scanning | verifying | done
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const scanner = useRef(null)
  const handled = useRef(false)

  function loadHistory() {
    studentQrHistory(token).then((d) => setHistory(d.items)).catch(() => {})
  }

  async function stopScanner() {
    const sc = scanner.current
    scanner.current = null
    if (sc) {
      try { await sc.stop() } catch (e) { /* band hi tha */ }
      try { sc.clear() } catch (e) { /* ignore */ }
    }
  }

  useEffect(() => { loadHistory(); return () => { stopScanner() } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function onDecoded(text) {
    if (handled.current) return
    handled.current = true
    setPhase('verifying')
    try {
      const pos = await getPosition({ timeout: 20000, maximumAge: 5000 })
      const r = await studentQrScan(token, {
        code: text, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy || 0,
      })
      setResult(r)
      loadHistory()
    } catch (e) { setError(e.message) }
    setPhase('done')
  }

  useEffect(() => {
    if (phase !== 'scanning') return undefined
    let cancelled = false
    const sc = new Html5Qrcode('qr-reader')
    scanner.current = sc
    sc.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, onDecoded, () => {})
      .catch(() => {
        if (!cancelled) { setError('Unable to open the camera. Please allow camera access in your browser.'); setPhase('idle') }
      })
    return () => { cancelled = true; stopScanner() }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  async function begin() {
    setError(''); setResult(null); handled.current = false
    try { await getPosition({ timeout: 15000 }) } catch (e) { return setError(e.message) }
    setPhase('scanning')
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-4">
        <h1 className="font-display text-2xl text-slate-900">QR Attendance</h1>
        <p className="font-body text-sm text-slate-500">Scan the faculty's QR code in class. You must be near the classroom.</p>
      </div>

      <div className="bg-white rounded-2xl border border-purple-100 shadow-sm p-5">
        {phase === 'idle' && (
          <div className="text-center py-4">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-purple-50 text-purple-600"><ScanLine size={30} /></span>
            <p className="font-body text-sm text-slate-600 mt-3 mb-4">When you start scanning, your browser will ask for <b>location</b> and <b>camera</b> permission.</p>
            <button onClick={begin} className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 font-body text-sm font-medium text-white hover:bg-purple-700">
              <MapPin size={16} /> Start scan
            </button>
          </div>
        )}

        {phase === 'scanning' && (
          <div>
            <div id="qr-reader" className="mx-auto w-full max-w-sm overflow-hidden rounded-xl" />
            <p className="text-center font-body text-sm text-slate-500 mt-3">Hold the QR code in front of the camera.</p>
            <div className="text-center mt-2">
              <button onClick={() => setPhase('idle')} className="font-body text-sm text-purple-700 underline">Cancel</button>
            </div>
          </div>
        )}

        {phase === 'verifying' && <p className="text-center font-body text-sm text-slate-600 py-8">Verifying your location...</p>}

        {phase === 'done' && result && (
          <div className="text-center py-2">
            <CheckCircle2 size={48} className="mx-auto text-green-600" />
            <p className="font-display text-xl text-slate-900 mt-2">Attendance recorded</p>
            <div className="mt-4 rounded-xl bg-purple-50 p-4 text-left font-body text-sm space-y-1.5">
              <p><span className="text-slate-500">Subject:</span> <b className="text-slate-900">{result.subject}</b></p>
              <p><span className="text-slate-500">Date:</span> <b className="text-slate-900">{fmtDay(result.day)}</b></p>
              <p><span className="text-slate-500">Time:</span> <b className="text-slate-900">{fmtTime(result.scanned_at)}</b></p>
              <p><span className="text-slate-500">Distance from class:</span> <b className="text-slate-900">{result.distance_m} m</b></p>
            </div>
            <p className="font-body text-xs text-slate-400 mt-3">It will appear on the Attendance page once faculty saves it to the register.</p>
            <button onClick={() => { setPhase('idle'); setResult(null) }} className="mt-4 rounded-lg border border-purple-200 px-4 py-2 font-body text-sm text-purple-700 hover:bg-purple-50">OK</button>
          </div>
        )}

        {phase === 'done' && !result && (
          <div className="text-center py-2">
            <XCircle size={48} className="mx-auto text-red-500" />
            <p className="font-display text-lg text-slate-900 mt-2">Attendance not taken</p>
            <p className="font-body text-sm text-red-600 mt-2">{error}</p>
            <button onClick={begin} className="mt-4 rounded-lg bg-purple-600 px-5 py-2 font-body text-sm text-white hover:bg-purple-700">Scan again</button>
          </div>
        )}

        {phase === 'idle' && error && <p className="font-body text-sm text-red-600 mt-3 text-center">{error}</p>}
      </div>

      {history.length > 0 && (
        <div className="mt-5">
          <p className="font-display text-base text-slate-900 mb-2">My previous scans</p>
          <div className="bg-white rounded-xl border border-purple-100 shadow-sm divide-y divide-purple-50">
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 font-body text-sm">
                <div>
                  <p className="text-slate-900">{h.subject}</p>
                  <p className="text-xs text-slate-500">{fmtDay(h.day)} · {fmtTime(h.scanned_at)} · {h.distance_m} m</p>
                </div>
                <span className={`text-xs ${h.in_register ? 'text-green-700' : 'text-slate-400'}`}>{h.in_register ? 'In register' : 'Pending faculty confirmation'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}