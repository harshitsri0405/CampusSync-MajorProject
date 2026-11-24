import { useState } from 'react'
import {
  Home, Landmark, Building2, GraduationCap, BookOpen, Users, ClipboardList, CalendarCheck, FileText,
  Clock, Wallet, FolderOpen, Bell, Images, AlertCircle, Briefcase, MessageCircle, BookMarked,
  ShieldCheck, LogOut, Menu, X,
} from 'lucide-react'

export const ADMIN_NAV = [
  { key: 'home', label: 'Dashboard', icon: Home },
  { key: 'college', label: 'College Information', icon: Landmark },
  { key: 'departments', label: 'Departments', icon: Building2 },
  { key: 'courses', label: 'Courses', icon: GraduationCap },
  { key: 'subjects', label: 'Subjects', icon: BookOpen },
  { key: 'faculty', label: 'Faculty', icon: Users },
  { key: 'students', label: 'Students', icon: ClipboardList },
  { key: 'academic', label: 'Academic Year', icon: CalendarCheck },
  { key: 'timetable', label: 'Timetable', icon: Clock },
  { key: 'exams', label: 'Exams & Results', icon: FileText },
  { key: 'fees', label: 'Fees', icon: Wallet },
  { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { key: 'notices', label: 'Notices', icon: Bell },
  { key: 'syllabus', label: 'Syllabus', icon: FolderOpen },
  { key: 'library', label: 'Library', icon: BookMarked },
  { key: 'placement', label: 'Placement', icon: Briefcase },
  { key: 'complaints', label: 'Complaints', icon: AlertCircle },
  { key: 'mentor', label: 'Mentor', icon: MessageCircle },
  { key: 'gallery', label: 'Gallery', icon: Images },
  { key: 'reports', label: 'Reports', icon: FileText },
  { key: 'settings', label: 'System Settings', icon: ShieldCheck },
]

export default function AdminLayout({ session, view, onNavigate, onLogout, children }) {
  const [open, setOpen] = useState(false)
  const current = ADMIN_NAV.find((n) => n.key === view) || ADMIN_NAV[0]
  const initial = (session.display_name || 'A').trim().charAt(0).toUpperCase()

  function go(key) {
    onNavigate(key)
    setOpen(false)
  }

  return (
    <div className="min-h-screen bg-canvas-100">
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-brand-900 border-r border-brand-800 flex flex-col transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 h-16 border-b border-brand-800">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-canvas-100 text-brand-900">
              <ShieldCheck size={18} />
            </span>
            <div>
              <p className="font-display text-base text-white leading-tight">CampusSync</p>
              <p className="font-body text-xs text-brand-200 leading-tight">Admin panel</p>
            </div>
          </div>
          <button className="lg:hidden text-brand-200" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {ADMIN_NAV.map((item) => {
            const Icon = item.icon
            const active = item.key === view
            return (
              <button
                key={item.key}
                onClick={() => go(item.key)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 font-body text-sm text-left transition-colors ${
                  active ? 'bg-canvas-100 text-brand-900 font-medium' : 'text-brand-100 hover:bg-brand-800'
                }`}
              >
                <Icon size={17} />
                {item.label}
              </button>
            )
          })}
        </nav>
      </aside>

      <div className="lg:pl-64 flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 h-16 bg-canvas-50 border-b border-canvas-200 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-stone-600" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={22} />
            </button>
            <h1 className="font-display text-lg text-stone-900">{current.label}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="font-body text-sm text-stone-900 leading-tight">{session.display_name}</p>
              <p className="font-body text-xs text-stone-500 leading-tight">Administrator</p>
            </div>
            <span className="w-9 h-9 rounded-full flex items-center justify-center bg-brand-700 text-white font-body text-sm">
              {initial}
            </span>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 rounded-md border border-canvas-300 bg-white px-3 py-1.5 font-body text-sm text-stone-700 hover:bg-canvas-100"
            >
              <LogOut size={15} /> Logout
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}