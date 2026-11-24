import { useState } from 'react'
import {
  Home, UserCircle, Users, CalendarCheck, QrCode, FileText, ClipboardList, FolderOpen, ListChecks, Clock,
  BarChart3, MessageCircle, AlertCircle, Bell, TrendingUp, GraduationCap, FileBarChart, CalendarOff,
  GraduationCap as Logo, LogOut, Menu, X,
} from 'lucide-react'

export const FACULTY_NAV = [
  { key: 'home', label: 'Dashboard', icon: Home },
  { key: 'profile', label: 'My Profile', icon: UserCircle },
  { key: 'classes', label: 'My Classes', icon: Users },
  { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { key: 'qr', label: 'QR Attendance', icon: QrCode },
  { key: 'marks', label: 'Marks', icon: FileText },
  { key: 'assignments', label: 'Assignments', icon: ClipboardList },
  { key: 'materials', label: 'Study Materials', icon: FolderOpen },
  { key: 'planner', label: 'Course Planner', icon: ListChecks },
  { key: 'timetable', label: 'Timetable', icon: Clock },
  { key: 'analytics', label: 'Student Analytics', icon: BarChart3 },
  { key: 'mentor', label: 'Mentor Chat', icon: MessageCircle },
  { key: 'complaints', label: 'Complaints', icon: AlertCircle },
  { key: 'notices', label: 'Notices', icon: Bell },
  { key: 'performance', label: 'My Performance', icon: TrendingUp },
  { key: 'exams', label: 'Examinations', icon: GraduationCap },
  { key: 'reports', label: 'Reports', icon: FileBarChart },
  { key: 'leave', label: 'Leave', icon: CalendarOff },
]

export default function FacultyLayout({ session, view, onNavigate, onLogout, children }) {
  const [open, setOpen] = useState(false)
  const current = FACULTY_NAV.find((n) => n.key === view) || FACULTY_NAV[0]
  const initial = (session.display_name || 'F').trim().charAt(0).toUpperCase()

  function go(key) {
    onNavigate(key)
    setOpen(false)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-green-600 text-white">
              <Logo size={18} />
            </span>
            <div>
              <p className="font-display text-base text-slate-900 leading-tight">CampusSync</p>
              <p className="font-body text-xs text-slate-500 leading-tight">Faculty panel</p>
            </div>
          </div>
          <button className="lg:hidden text-slate-500" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {FACULTY_NAV.map((item) => {
            const Icon = item.icon
            const active = item.key === view
            return (
              <button
                key={item.key}
                onClick={() => go(item.key)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 font-body text-sm text-left transition-colors ${
                  active ? 'bg-green-600 text-white' : 'text-slate-600 hover:bg-slate-100'
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
        <header className="sticky top-0 z-20 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-slate-600" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={22} />
            </button>
            <h1 className="font-display text-lg text-slate-900">{current.label}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="font-body text-sm text-slate-900 leading-tight">{session.display_name}</p>
              <p className="font-body text-xs text-slate-500 leading-tight">Faculty</p>
            </div>
            <span className="w-9 h-9 rounded-full flex items-center justify-center bg-green-600 text-white font-body text-sm">{initial}</span>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 font-body text-sm text-slate-700 hover:bg-slate-50"
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