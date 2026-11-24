import { useState } from 'react'
import { Camera, Droplets, Sparkles, ShieldAlert, Wifi, Wrench, Zap } from 'lucide-react'
import { createHostelComplaint, markHostelSeen, openHostelPhoto } from '../api.js'
import {
  BTN,
  Card,
  Empty,
  Field,
  INPUT,
  Message,
  NewDot,
  StatusPill,
  fmtUtc,
} from './HostelShared.jsx'

const ICONS = {
  electricity: Zap,
  water: Droplets,
  wifi: Wifi,
  maintenance: Wrench,
  cleanliness: Sparkles,
  security: ShieldAlert,
}

const STEPS = { open: 1, in_progress: 2, resolved: 3, rejected: 3 }

function Progress({ status }) {
  const reached = STEPS[status] || 1
  const color = status === 'rejected' ? 'bg-red-500' : status === 'resolved' ? 'bg-green-500' : 'bg-purple-500'
  return (
    <div className="flex gap-1 mt-2">
      {[1, 2, 3].map((n) => (
        <span key={n} className={`h-1.5 flex-1 rounded-full ${reached >= n ? color : 'bg-slate-200'}`} />
      ))}
    </div>
  )
}

export default function HostelComplaintsTab({ data, reload }) {
  const rules = data.rules
  const [category, setCategory] = useState(data.complaint_categories[0]?.key || 'electricity')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState([])
  const [fileKey, setFileKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [view, setView] = useState('active')
  const [openId, setOpenId] = useState(null)

  function pickFiles(e) {
    const chosen = Array.from(e.target.files || [])
    if (chosen.length > rules.max_photos) {
      setError(`Maximum ${rules.max_photos} photos hi chun sakte ho.`)
      setFiles([])
      setFileKey((k) => k + 1)
      return
    }
    const big = chosen.find((f) => f.size > rules.max_photo_mb * 1024 * 1024)
    if (big) {
      setError(`"${big.name}" ${rules.max_photo_mb} MB se badi hai.`)
      setFiles([])
      setFileKey((k) => k + 1)
      return
    }
    setError('')
    setFiles(chosen)
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!title.trim()) {
      setError('Complaint ka title likho.')
      return
    }
    if (description.trim().length < rules.min_reason_len) {
      setError(`Description kam se kam ${rules.min_reason_len} characters ka likho.`)
      return
    }
    setBusy(true)
    try {
      await createHostelComplaint({ category, title: title.trim(), description: description.trim(), files })
      setTitle('')
      setDescription('')
      setFiles([])
      setFileKey((k) => k + 1)
      setInfo('Complaint darj ho gayi. Yahin se status track kar sakte ho.')
      setView('active')
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function toggle(c) {
    const next = openId === c.id ? null : c.id
    setOpenId(next)
    if (next && c.has_unseen_update) {
      try {
        await markHostelSeen('complaint', c.id)
        await reload()
      } catch (e) {
        /* the dot is only a convenience */
      }
    }
  }

  const active = data.complaints.filter((c) => c.status === 'open' || c.status === 'in_progress')
  const history = data.complaints.filter((c) => c.status === 'resolved' || c.status === 'rejected')
  const shown = view === 'active' ? active : history

  return (
    <>
      <Card title="Nayi complaint">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={INPUT}>
                {data.complaint_categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <input
                value={title}
                maxLength={150}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Chhota sa title"
                className={INPUT}
              />
            </Field>
          </div>

          <Field label="Problem ki detail">
            <textarea
              rows={3}
              maxLength={rules.max_reason_len * 2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kya problem hai, kab se hai"
              className={INPUT}
            />
          </Field>

          <Field
            label="Photos (optional)"
            hint={`Maximum ${rules.max_photos} photos | ${rules.allowed_ext.join(', ')} | har photo ${rules.max_photo_mb} MB tak`}
          >
            <input
              key={fileKey}
              type="file"
              multiple
              accept={rules.allowed_ext.join(',')}
              onChange={pickFiles}
              className="font-body text-sm"
            />
            {files.length > 0 && (
              <p className="font-body text-xs text-slate-500 mt-1 flex items-center gap-1">
                <Camera size={12} /> {files.map((f) => f.name).join(', ')}
              </p>
            )}
          </Field>

          <Message error={error} info={info} />
          <button disabled={busy} className={BTN}>
            {busy ? 'Submitting...' : 'Raise complaint'}
          </button>
        </form>
      </Card>

      <div className="flex gap-6 border-b border-slate-200 mb-4">
        {[
          ['active', `Track status (${active.length})`],
          ['history', `Resolution history (${history.length})`],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setView(k)}
            className={`pb-2 font-body text-sm font-medium border-b-2 ${
              view === k
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card>
          <Empty>{view === 'active' ? 'Koi active complaint nahi hai.' : 'Abhi koi resolved complaint nahi hai.'}</Empty>
        </Card>
      ) : (
        shown.map((c) => {
          const Icon = ICONS[c.category] || Wrench
          return (
            <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-5 mb-3">
              <button type="button" onClick={() => toggle(c)} className="w-full text-left">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-purple-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-base text-slate-900">{c.title}</span>
                      <StatusPill status={c.status} />
                      {c.has_unseen_update && <NewDot />}
                    </div>
                    <p className="font-body text-xs text-slate-500 mt-0.5">
                      {c.category_label} | {fmtUtc(c.created_at)}
                    </p>
                    <Progress status={c.status} />
                  </div>
                </div>
              </button>

              {openId === c.id && (
                <div className="mt-4 space-y-2 font-body text-sm text-slate-700">
                  <p>{c.description}</p>
                  {c.photos.length > 0 && (
                    <div className="flex flex-wrap gap-3">
                      {c.photos.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => openHostelPhoto(p.id).catch((err) => setError(err.message))}
                          className="flex items-center gap-1 text-purple-600 hover:text-purple-800"
                        >
                          <Camera size={14} /> {p.name || 'Photo'}
                        </button>
                      ))}
                    </div>
                  )}
                  {c.resolution_note && (
                    <p>
                      <span className="text-slate-400">Warden update: </span>
                      {c.resolution_note}
                      {c.resolved_by ? ` (${c.resolved_by})` : ''}
                    </p>
                  )}
                  {c.resolved_at && (
                    <p className="text-xs text-slate-500">
                      {c.status === 'rejected' ? 'Closed' : 'Resolved'} on {fmtUtc(c.resolved_at)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </>
  )
}
