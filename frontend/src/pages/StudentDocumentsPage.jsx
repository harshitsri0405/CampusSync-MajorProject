import { useEffect, useState } from 'react'
import { ArrowLeft, CreditCard, FileText, Printer, Send, Trash2, Upload, ExternalLink } from 'lucide-react'
import {
  getDocumentsOverview,
  requestStudentDocument,
  uploadStudentDocument,
  deleteStudentDocument,
  seedDocumentsDemo,
  openStudentDocument,
} from '../api'

const STATUS_STYLE = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
}

function Card({ title, children, right }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-slate-800">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  )
}

function fmtDate(v) {
  if (!v) return '-'
  return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtSize(b) {
  if (!b) return ''
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
}

export default function StudentDocumentsPage({ session, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [tab, setTab] = useState('idcard')
  const [busy, setBusy] = useState(false)

  const [reqType, setReqType] = useState('bonafide')
  const [reqPurpose, setReqPurpose] = useState('')

  const [upTitle, setUpTitle] = useState('')
  const [upType, setUpType] = useState('other')
  const [upFile, setUpFile] = useState(null)

  const [bonafideReq, setBonafideReq] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setData(await getDocumentsOverview())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function run(fn, okMsg) {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      await fn()
      if (okMsg) setInfo(okMsg)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const submitRequest = (e) => {
    e.preventDefault()
    run(async () => {
      await requestStudentDocument(reqType, reqPurpose)
      setReqPurpose('')
    }, 'Request bhej di gayi')
  }

  const submitUpload = (e) => {
    e.preventDefault()
    if (!upFile) {
      setError('Pehle file choose karo')
      return
    }
    run(async () => {
      await uploadStudentDocument(upTitle, upType, upFile)
      setUpTitle('')
      setUpFile(null)
      e.target.reset()
    }, 'Document upload ho gaya')
  }

  const remove = (id) => {
    if (!window.confirm('Ye document delete karna hai?')) return
    run(() => deleteStudentDocument(id), 'Document delete ho gaya')
  }

  const p = data?.profile
  const isEmpty = data && data.documents.length === 0 && data.requests.length === 0
  const requestable = data ? data.doc_types.filter((t) => t.requestable) : []

  return (
    <div className="min-h-screen bg-slate-50 font-body">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-slate-600 hover:text-purple-600"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <h1 className="font-display text-xl font-bold text-slate-800">Documents</h1>
        </div>

        {loading && <p className="text-slate-500 text-sm">Loading...</p>}
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        {info && <p className="text-green-600 text-sm mb-3">{info}</p>}

        {isEmpty && (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-6 text-center mb-4">
            <p className="text-slate-600 text-sm mb-3">Abhi koi document ya request nahi hai.</p>
            <button
              disabled={busy}
              onClick={() => run(() => seedDocumentsDemo(), 'Sample data load ho gaya')}
              className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-700 disabled:opacity-50"
            >
              Load sample data
            </button>
          </div>
        )}

        {data && (
          <>
            <div className="flex gap-6 border-b border-slate-200 mb-4">
              {[
                ['idcard', 'ID Card'],
                ['documents', 'My Documents'],
                ['requests', 'Requests'],
              ].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`pb-2 text-sm font-medium border-b-2 ${
                    tab === k
                      ? 'border-purple-600 text-purple-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'idcard' && (
              <>
                <Card
                  title="Student ID Card"
                  right={
                    <button
                      onClick={() => window.print()}
                      className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800"
                    >
                      <Printer size={16} /> Print
                    </button>
                  }
                >
                  <div className="print-area">
                    <div className="max-w-sm mx-auto border-2 border-purple-600 rounded-xl overflow-hidden">
                      <div className="bg-purple-600 text-white text-center py-2 font-display font-semibold">
                        STUDENT ID CARD
                      </div>
                      <div className="p-4 flex gap-4">
                        <div className="w-20 h-24 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center text-2xl font-bold">
                          {(p.name || '?').trim().charAt(0).toUpperCase()}
                        </div>
                        <div className="text-sm text-slate-700 space-y-1">
                          <div className="font-semibold text-base text-slate-900">{p.name || '-'}</div>
                          <div>ID: <span className="font-mono">{p.college_id || '-'}</span></div>
                          <div>Course: {p.course || '-'}</div>
                          <div>Semester: {p.semester || '-'}</div>
                          {p.department && <div>Dept: {p.department}</div>}
                          {p.blood_group && <div>Blood Group: {p.blood_group}</div>}
                          {p.phone && <div>Phone: {p.phone}</div>}
                        </div>
                      </div>
                      <div className="bg-slate-50 text-center text-xs text-slate-500 py-1.5">
                        System generated card
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    Profile photo feature abhi nahi bana hai, isliye photo ki jagah initial dikh raha hai.
                  </p>
                </Card>
                <Card title="Marksheet">
                  <p className="text-sm text-slate-600">
                    Apni marksheet / grade card Results page se print karo (Results → Grade Card). Official
                    copy chahiye to Requests tab me marksheet ki request bhejo.
                  </p>
                </Card>
              </>
            )}

            {tab === 'documents' && (
              <>
                <Card title="Upload document">
                  <form onSubmit={submitUpload} className="grid gap-3 md:grid-cols-4">
                    <input
                      required
                      maxLength={120}
                      value={upTitle}
                      onChange={(e) => setUpTitle(e.target.value)}
                      placeholder="Title"
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm md:col-span-2"
                    />
                    <select
                      value={upType}
                      onChange={(e) => setUpType(e.target.value)}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    >
                      {data.doc_types.map((t) => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                    </select>
                    <input
                      type="file"
                      accept={data.allowed_ext.join(',')}
                      onChange={(e) => setUpFile(e.target.files[0] || null)}
                      className="text-sm md:col-span-3"
                    />
                    <button
                      disabled={busy}
                      className="flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-700 disabled:opacity-50"
                    >
                      <Upload size={16} /> Upload
                    </button>
                  </form>
                  <p className="text-xs text-slate-500 mt-2">
                    Allowed: {data.allowed_ext.join(', ')} | Max {data.max_file_mb} MB
                  </p>
                </Card>

                <Card title="My documents">
                  {data.documents.length === 0 ? (
                    <p className="text-sm text-slate-500">Koi document nahi hai.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {data.documents.map((d) => (
                        <li key={d.id} className="py-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <FileText size={18} className="text-purple-600 shrink-0" />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-slate-800 truncate">{d.title}</div>
                              <div className="text-xs text-slate-500">
                                {d.doc_label} | {fmtDate(d.created_at)}
                                {d.size_bytes ? ` | ${fmtSize(d.size_bytes)}` : ''}
                                {!d.has_file ? ' | file attached nahi' : ''}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {d.has_file && (
                              <button
                                onClick={() => openStudentDocument(d.id).catch((e) => setError(e.message))}
                                className="text-purple-600 hover:text-purple-800"
                                title="Open"
                              >
                                <ExternalLink size={16} />
                              </button>
                            )}
                            {d.can_delete && (
                              <button
                                onClick={() => remove(d.id)}
                                className="text-red-500 hover:text-red-700"
                                title="Delete"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </>
            )}

            {tab === 'requests' && (
              <>
                <Card title="Naya request">
                  <form onSubmit={submitRequest} className="grid gap-3 md:grid-cols-4">
                    <select
                      value={reqType}
                      onChange={(e) => setReqType(e.target.value)}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    >
                      {requestable.map((t) => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                    </select>
                    <input
                      maxLength={300}
                      value={reqPurpose}
                      onChange={(e) => setReqPurpose(e.target.value)}
                      placeholder="Purpose (e.g. bank, scholarship)"
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm md:col-span-2"
                    />
                    <button
                      disabled={busy}
                      className="flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-700 disabled:opacity-50"
                    >
                      <Send size={16} /> Request
                    </button>
                  </form>
                </Card>

                <Card title="Request history">
                  {data.requests.length === 0 ? (
                    <p className="text-sm text-slate-500">Koi request nahi hai.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {data.requests.map((r) => (
                        <li key={r.id} className="py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <CreditCard size={16} className="text-purple-600" />
                              <span className="text-sm font-medium text-slate-800">{r.doc_label}</span>
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full border ${
                                  STATUS_STYLE[r.status] || 'bg-slate-50 text-slate-600 border-slate-200'
                                }`}
                              >
                                {r.status}
                              </span>
                            </div>
                            {r.doc_type === 'bonafide' && r.status === 'approved' && (
                              <button
                                onClick={() => {
                                  setBonafideReq(r)
                                  setTimeout(() => window.print(), 150)
                                }}
                                className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800"
                              >
                                <Printer size={16} /> Print
                              </button>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {fmtDate(r.created_at)}
                            {r.purpose ? ` | ${r.purpose}` : ''}
                          </div>
                          {r.remarks && <div className="text-xs text-slate-600 mt-1">Remarks: {r.remarks}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                {bonafideReq && (
                  <div className="print-area bg-white rounded-xl border border-slate-200 p-8 mb-4">
                    <h2 className="text-center font-display text-xl font-bold mb-6 underline">
                      BONAFIDE CERTIFICATE
                    </h2>
                    <p className="text-sm text-slate-800 leading-7">
                      This is to certify that <b>{p.name || '-'}</b> (ID: {p.college_id || '-'}) is a
                      bonafide student of this college, currently studying in <b>{p.course || '-'}</b>,
                      Semester <b>{p.semester || '-'}</b>.
                      {bonafideReq.purpose ? ` This certificate is issued for: ${bonafideReq.purpose}.` : ''}
                    </p>
                    <div className="flex justify-between mt-12 text-sm text-slate-700">
                      <span>Date: {fmtDate(bonafideReq.processed_at || new Date())}</span>
                      <span>Principal / Registrar</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-6">System generated copy.</p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}