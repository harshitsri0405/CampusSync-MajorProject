import { useState } from 'react'
import NotificationBell from './NotificationBell.jsx'
import {
  Home,
  User,
  CalendarCheck,
  FileText,
  Clock,
  ClipboardList,
  BookMarked,
  Wallet,
  BookOpen,
  Bell,
  Images,
  AlertCircle,
  Briefcase,
  MessageCircle,
  FolderOpen,
  Sparkles,
  LogOut,
  Menu,
  X,
  CalendarX,
  Building2,
} from 'lucide-react'
import StudentAvatar from './StudentAvatar.jsx'

export const NAV_TOP = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'profile', label: 'Student Profile', icon: User },
]

export const NAV_GROUPS = [
  {
    title: 'Academics',
    items: [
      { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
      { key: 'results', label: 'Results', icon: FileText },
      { key: 'timetable', label: 'Timetable', icon: Clock },
      { key: 'assignments', label: 'Assignments', icon: ClipboardList },
      { key: 'syllabus', label: 'Syllabus', icon: BookMarked },
    ],
  },
  {
    title: 'Campus',
    items: [
      { key: 'fees', label: 'Fee Management', icon: Wallet },
      { key: 'library', label: 'Library', icon: BookOpen },
      { key: 'notices', label: 'Notices', icon: Bell },
      { key: 'gallery', label: 'Gallery', icon: Images },
      { key: 'complaints', label: 'Complaint Portal', icon: AlertCircle },
      { key: 'leave', label: 'Leave', icon: CalendarX },
      { key: 'hostel', label: 'Hostel', icon: Building2 },
    ],
  },
  {
    title: 'Career and support',
    items: [
      { key: 'placement', label: 'Placement', icon: Briefcase },
      { key: 'mentor', label: 'Mentor', icon: MessageCircle },
      { key: 'documents', label: 'Documents', icon: FolderOpen },
      { key: 'analytics', label: 'AI Analytics', icon: Sparkles },
    ],
  },
]

const ALL_ITEMS = [...NAV_TOP, ...NAV_GROUPS.flatMap((g) => g.items)]

export default function StudentLayout({ session, view, onNavigate, onLogout, photoUrl, children }) {
  const [open, setOpen] = useState(false)
  const current = ALL_ITEMS.find((i) => i.key === view)

  function go(key) {
    onNavigate(key)
    setOpen(false)
    window.scrollTo({ top: 0 })
  }

  function renderItem(item) {
    const Icon = item.icon
    const active = view === item.key
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => go(item.key)}
        className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 font-body text-sm text-left transition-colors ${
          active
            ? 'bg-purple-50 text-purple-700 font-medium'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`}
      >
        <Icon size={18} className={active ? 'text-purple-600' : 'text-slate-400'} />
        {item.label}
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <p className="font-display text-xl text-slate-900">
            Campus<span className="text-purple-600">Sync</span>
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="lg:hidden text-slate-400 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          <div className="space-y-1">{NAV_TOP.map(renderItem)}</div>
          {NAV_GROUPS.map((g) => (
            <div key={g.title}>
              <p className="px-3 mb-1 font-body text-[11px] uppercase tracking-wide text-slate-400">{g.title}</p>
              <div className="space-y-1">{g.items.map(renderItem)}</div>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <StudentAvatar name={session.display_name} photoUrl={photoUrl} size={36} />
            <div className="min-w-0">
              <p className="font-body text-sm text-slate-900 font-medium truncate">{session.display_name}</p>
              <p className="font-body text-xs text-slate-400">Student</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="mt-1 w-full flex items-center gap-2 rounded-lg px-3 py-2 font-body text-sm text-slate-600 hover:bg-slate-50 hover:text-red-600"
          >
            <LogOut size={16} /> Log out
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="lg:hidden p-1.5 rounded-md border border-slate-200 text-slate-600"
          >
            <Menu size={18} />
          </button>
          <h1 className="font-display text-lg text-slate-900">{current ? current.label : 'Student'}</h1>
          <div className="ml-auto flex items-center gap-3">

            <NotificationBell token={session.access_token} onNavigate={go} />
            <span className="hidden sm:block font-body text-sm text-slate-600">{session.display_name}</span>
            <StudentAvatar name={session.display_name} photoUrl={photoUrl} size={32} />
          </div>
        </header>

        <main className="student-embedded">{children}</main>
      </div>
    </div>
  )
}