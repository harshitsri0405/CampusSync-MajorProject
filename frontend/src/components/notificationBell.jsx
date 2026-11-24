import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Bell, Briefcase, MessageCircle, Wallet } from 'lucide-react'
import { getNotifications, markNotificationRead, markAllNotificationsRead, seedDemoNotifications } from '../api.js'

const ICONS = { mentor: MessageCircle, complaint: AlertCircle, fees: Wallet, placement: Briefcase }
const DESKTOP_KEY = 'cs_desktop_alerts'
const POLL_MS = 30000

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

export default function NotificationBell({ token, onNavigate }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [desktopOn, setDesktopOn] = useState(false)
  const [notice, setNotice] = useState('')
  const known = useRef(null) // ids already seen, so only new ones raise a desktop alert
  const desktopRef = useRef(false)
  const box = useRef(null)

  // restore the desktop-alert choice (only if the browser still allows it)
  useEffect(() => {
    const on =
      localStorage.getItem(DESKTOP_KEY) === 'on' && 'Notification' in window && Notification.permission === 'granted'
    setDesktopOn(on)
  }, [])

  useEffect(() => {
    desktopRef.current = desktopOn
  }, [desktopOn])

  async function refresh() {
    try {
      const d = await getNotifications(token)
      setItems(d.items)
      setUnread(d.unread)
      if (known.current === null) {
        known.current = new Set(d.items.map((n) => n.id))
        return
      }
      d.items.forEach((n) => {
        if (known.current.has(n.id)) return
        known.current.add(n.id)
        if (!n.is_read && desktopRef.current && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(n.title, { body: n.body || '' })
          } catch {
            /* ignore */
          }
        }
      })
    } catch {
      /* the bell is not critical, ignore a failed refresh */
    }
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // close when the user clicks outside
  useEffect(() => {
    function onDown(e) {
      if (box.current && !box.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  async function openItem(n) {
    if (!n.is_read) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
      setUnread((u) => Math.max(u - 1, 0))
      try {
        await markNotificationRead(token, n.id)
      } catch {
        /* cosmetic */
      }
    }
    setOpen(false)
    if (n.view) onNavigate(n.view)
  }

  async function readAll() {
    setItems((list) => list.map((x) => ({ ...x, is_read: true })))
    setUnread(0)
    try {
      await markAllNotificationsRead(token)
    } catch {
      /* cosmetic */
    }
  }

  async function toggleDesktop() {
    setNotice('')
    if (!('Notification' in window)) {
      setNotice('Your browser does not support desktop notifications.')
      return
    }
    if (desktopOn) {
      setDesktopOn(false)
      localStorage.setItem(DESKTOP_KEY, 'off')
      return
    }
    let permission = Notification.permission
    if (permission === 'default') permission = await Notification.requestPermission()
    if (permission === 'granted') {
      setDesktopOn(true)
      localStorage.setItem(DESKTOP_KEY, 'on')
    } else {
      setNotice('Notifications are blocked. Allow them in your browser settings (the lock icon next to the address).')
    }
  }

  async function addSamples() {
    try {
      await seedDemoNotifications(token)
      await refresh()
    } catch (e) {
      setNotice(e.message)
    }
  }

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        className="relative p-2 rounded-full text-slate-600 hover:bg-slate-100"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] leading-[18px] text-center px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[70vh] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="font-display text-base text-slate-900">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={readAll} className="font-body text-xs text-purple-700 hover:text-purple-900">
                Mark all as read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="font-body text-sm text-slate-500">No notifications yet.</p>
              <button type="button" onClick={addSamples} className="mt-2 font-body text-xs text-purple-700 hover:text-purple-900">
                Add sample notifications
              </button>
            </div>
          ) : (
            <ul>
              {items.map((n) => {
                const Icon = ICONS[n.kind] || Bell
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-slate-50 hover:bg-slate-50 ${
                        n.is_read ? '' : 'bg-purple-50/50'
                      }`}
                    >
                      <span className="mt-0.5 w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-body text-sm text-slate-900 font-medium leading-snug">{n.title}</span>
                          {!n.is_read && <span className="mt-1.5 w-2 h-2 rounded-full bg-purple-600 shrink-0" />}
                        </span>
                        {n.body && <span className="block font-body text-xs text-slate-600 mt-0.5">{n.body}</span>}
                        <span className="block font-body text-[11px] text-slate-400 mt-1">{timeAgo(n.created_at)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="px-4 py-3 border-t border-slate-100">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="font-body text-xs text-slate-600">
                Desktop alerts
                <span className="block text-[11px] text-slate-400">Pop-up when something new arrives (works while CampusSync is open)</span>
              </span>
              <input type="checkbox" checked={desktopOn} onChange={toggleDesktop} className="shrink-0" />
            </label>
            {notice && <p className="font-body text-xs text-red-600 mt-2">{notice}</p>}
          </div>
        </div>
      )}
    </div>
  )
}