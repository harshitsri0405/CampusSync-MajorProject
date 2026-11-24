import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronUp, Clock, MapPin, Search } from 'lucide-react'
import { getNotices, markNoticeRead, markAllNoticesRead, seedDemoNotices } from '../api.js'

const TABS = [
  { key: 'college', label: 'College Notices' },
  { key: 'department', label: 'Department Notices' },
  { key: 'event', label: 'Event Announcements' },
]

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function startOfToday() {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

function fmtDate(s) {
  return parseDate(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtTime(t) {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

function postedText(s) {
  const diff = Math.round((startOfToday() - parseDate(s)) / 86400000)
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return `${diff} days ago`
}

function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-xl border border-slate-200 p-6 ${className}`}>{children}</div>
}

export default function StudentNoticesPage({ session, onBack }) {
  const token = session.access_token
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('college')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setData(await getNotices(token))
  }

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function handleSeed() {
    setSeeding(true)
    setError('')
    try {
      await seedDemoNotices(token)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSeeding(false)
    }
  }

  async function toggle(n) {
    const willOpen = openId !== n.id
    setOpenId(willOpen ? n.id : null)
    if (willOpen && !n.is_read) {
      // show it as read straight away, then tell the server
      setData((d) => ({ ...d, notices: d.notices.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)) }))
      try {
        await markNoticeRead(token, n.id)
      } catch {
        /* the badge is only cosmetic, ignore a failed save */
      }
    }
  }

  async function handleReadAll() {
    setMarkingAll(true)
    setError('')
    try {
      await markAllNoticesRead(token)
      setData((d) => ({ ...d, notices: d.notices.map((x) => ({ ...x, is_read: true })) }))
    } catch (e) {
      setError(e.message)
    } finally {
      setMarkingAll(false)
    }
  }

  const notices = data ? data.notices : []
  const hasData = notices.length > 0
  const totalUnread = notices.filter((n) => !n.is_read).length
  const unreadIn = (cat) => notices.filter((n) => n.category === cat && !n.is_read).length
  const today = startOfToday()

  const q = search.trim().toLowerCase()
  let list = notices.filter(
    (n) =>
      n.category === tab &&
      (!q ||
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        (n.venue || '').toLowerCase().includes(q))
  )

  if (tab === 'event') {
    const isUpcoming = (n) => n.event_date && parseDate(n.event_date) >= today
    const upcoming = list.filter(isUpcoming).sort((a, b) => a.event_date.localeCompare(b.event_date))
    const past = list
      .filter((n) => !isUpcoming(n))
      .sort((a, b) => (b.event_date || b.posted_on).localeCompare(a.event_date || a.posted_on))
    list = [...upcoming, ...past]
  } else {
    list = [...list].sort(
      (a, b) => Number(b.is_important) - Number(a.is_important) || b.posted_on.localeCompare(a.posted_on)
    )
  }

  function renderNotice(n) {
    const open = openId === n.id
    const isEvent = n.category === 'event'
    const isPast = isEvent && n.event_date && parseDate(n.event_date) < today
    const evDate = isEvent && n.event_date ? parseDate(n.event_date) : null

    return (
      <div
        key={n.id}
        className={`bg-white rounded-xl border p-5 ${
          n.is_important ? 'border-red-200' : 'border-slate-200'
        } ${isPast ? 'opacity-60' : ''}`}
      >
        <button type="button" onClick={() => toggle(n)} className="w-full text-left">
          <div className="flex items-start gap-4">
            {evDate && (
              <div className="shrink-0 w-14 rounded-lg border border-purple-200 bg-purple-50 text-center py-1.5">
                <p className="font-body text-[10px] uppercase text-purple-700">
                  {evDate.toLocaleDateString('en-IN', { month: 'short' })}
                </p>
                <p className="font-display text-xl text-slate-900 leading-none">{evDate.getDate()}</p>
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {!n.is_read && <span className="w-2 h-2 rounded-full bg-purple-600 shrink-0" aria-label="Unread" />}
                {n.is_important && (
                  <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-medium">
                    Important
                  </span>
                )}
                {!n.is_read && (
                  <span className="rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-[10px] font-medium">
                    New
                  </span>
                )}
                {isPast && (
                  <span className="rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 text-[10px] font-medium">
                    Over
                  </span>
                )}
              </div>

              <h2 className="font-display text-lg text-slate-900 leading-snug mt-1">{n.title}</h2>

              <p className="font-body text-xs text-slate-500 mt-1">
                {n.posted_by ? `${n.posted_by} · ` : ''}Posted {postedText(n.posted_on)} ({fmtDate(n.posted_on)})
              </p>

              {isEvent && (
                <p className="font-body text-xs text-slate-600 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  {n.event_time && (
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {fmtTime(n.event_time)}
                    </span>
                  )}
                  {n.venue && (
                    <span className="flex items-center gap-1">
                      <MapPin size={12} /> {n.venue}
                    </span>
                  )}
                </p>
              )}
            </div>

            <span className="text-slate-400 shrink-0 mt-1">
              {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          </div>
        </button>

        {open && (
          <p className="font-body text-sm text-slate-700 whitespace-pre-line mt-4 pt-4 border-t border-slate-100">
            {n.body}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="w-full bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-body text-sm"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="font-display text-lg text-slate-900 ml-2">Notices</h1>
        {data && data.department_known && (
          <span className="font-body text-sm text-slate-500 ml-auto">{data.department}</span>
        )}
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {loading && <p className="font-body text-slate-400">Loading notices…</p>}
        {error && <p className="font-body text-sm text-red-600">{error}</p>}

        {!loading && data && !hasData && (
          <Card className="text-center p-8">
            <p className="font-display text-lg text-slate-900">No notices yet</p>
            <p className="font-body text-sm text-slate-500 mt-2 max-w-md mx-auto">
              College notices, department notices and event announcements will appear here once they are posted.
              Until then you can load sample notices to try this screen.
            </p>
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="mt-5 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-body text-sm font-medium px-5 py-2.5 disabled:opacity-60"
            >
              {seeding ? 'Loading…' : 'Load sample data'}
            </button>
          </Card>
        )}

        {hasData && (
          <>
            <div className="flex flex-wrap gap-1 border-b border-slate-200">
              {TABS.map((t) => {
                const unread = unreadIn(t.key)
                return (
                  <button
                    key={t.key}
                    onClick={() => {
                      setTab(t.key)
                      setOpenId(null)
                    }}
                    className={`px-4 py-2.5 font-body text-sm -mb-px border-b-2 flex items-center gap-2 ${
                      tab === t.key
                        ? 'border-purple-600 text-purple-700 font-medium'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {t.label}
                    {unread > 0 && (
                      <span className="rounded-full bg-purple-600 text-white px-1.5 py-0.5 text-[10px] leading-none">
                        {unread}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-48">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search notices"
                  className="w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 py-2 font-body text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              {totalUnread > 0 && (
                <button
                  onClick={handleReadAll}
                  disabled={markingAll}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 font-body text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  {markingAll ? 'Saving…' : `Mark all as read (${totalUnread})`}
                </button>
              )}
            </div>

            {tab === 'department' && !data.department_known && (
              <Card className="text-center">
                <p className="font-body text-sm text-slate-500">
                  Department notices are shown by department. Open <strong>Student Profile</strong> and fill in your
                  <strong> Department</strong> under Academic Information to see them here.
                </p>
              </Card>
            )}

            {list.length === 0 && !(tab === 'department' && !data.department_known) && (
              <Card className="text-center">
                <p className="font-body text-sm text-slate-500">
                  {q
                    ? 'No notices match your search.'
                    : tab === 'event'
                    ? 'No events have been announced yet.'
                    : tab === 'department'
                    ? 'There are no department notices yet.'
                    : 'There are no college notices yet.'}
                </p>
              </Card>
            )}

            <div className="space-y-3">{list.map(renderNotice)}</div>
          </>
        )}
      </div>
    </div>
  )
}