import { useEffect, useState } from 'react'
import AdminLayout, { ADMIN_NAV } from '../components/AdminLayout.jsx'
import AdminHomePage from './AdminHomePage.jsx'
import AdminCollegePage from './AdminCollegePage.jsx'
import AdminDepartmentsPage from './AdminDepartmentsPage.jsx'
import AdminCoursesPage from './AdminCoursesPage.jsx'
import AdminSubjectsPage from './AdminSubjectsPage.jsx'
import AdminFacultyPage from './AdminFacultyPage.jsx'
import AdminStudentsPage from './AdminStudentsPage.jsx'
import AdminAcademicPage from './AdminAcademicPage.jsx'
import AdminTimetablePage from './AdminTimetablePage.jsx'
import AdminExamsPage from './AdminExamsPage.jsx'
import AdminFeesPage from './AdminFeesPage.jsx'
import AdminAttendancePage from './AdminAttendancePage.jsx'
import AdminNoticesPage from './AdminNoticesPage.jsx'
import AdminSyllabusPage from './AdminSyllabusPage.jsx'
import AdminLibraryPage from './AdminLibraryPage.jsx'
import AdminPlacementPage from './AdminPlacementPage.jsx'
import AdminComplaintsPage from './AdminComplaintsPage.jsx'
import AdminMentorPage from './AdminMentorPage.jsx'
import AdminGalleryPage from './AdminGalleryPage.jsx'
import AdminReportsPage from './AdminReportsPage.jsx'
import AdminSettingsPage from './AdminSettingsPage.jsx'

const VIEW_KEY = 'admin_view'

function ComingSoon({ title }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-10 text-center max-w-xl mx-auto mt-6">
      <h2 className="font-display text-xl text-slate-900 mb-2">{title}</h2>
      <p className="font-body text-sm text-slate-500">Ye section abhi ban raha hai - coming soon.</p>
    </div>
  )
}

// sidebar key -> real page. Keys not listed here show "coming soon".
// Next steps will add: departments, courses, subjects ... here.
const PAGES = {
  college: AdminCollegePage,
  departments: AdminDepartmentsPage,
  courses: AdminCoursesPage,
   subjects: AdminSubjectsPage,
     faculty: AdminFacultyPage,
       students: AdminStudentsPage,
  academic: AdminAcademicPage,
 timetable: AdminTimetablePage,
  exams: AdminExamsPage,
    fees: AdminFeesPage,
     attendance: AdminAttendancePage,
  notices: AdminNoticesPage,
  syllabus: AdminSyllabusPage,
  library: AdminLibraryPage,
  placement: AdminPlacementPage,
  complaints: AdminComplaintsPage,
  mentor: AdminMentorPage,
  gallery: AdminGalleryPage,
    reports: AdminReportsPage,
    settings: AdminSettingsPage,


}

export default function AdminDashboard({ session, onLogout }) {
  const [view, setView] = useState(() => {
    const saved = sessionStorage.getItem(VIEW_KEY)
    return saved && ADMIN_NAV.some((n) => n.key === saved) ? saved : 'home'
  })

  useEffect(() => {
    sessionStorage.setItem(VIEW_KEY, view)
  }, [view])

  function handleLogout() {
    sessionStorage.removeItem(VIEW_KEY)
    onLogout()
  }

  const Page = PAGES[view]
  const label = (ADMIN_NAV.find((n) => n.key === view) || {}).label || ''

  return (
    <AdminLayout session={session} view={view} onNavigate={setView} onLogout={handleLogout}>
      {view === 'home' ? (
        <AdminHomePage session={session} onNavigate={setView} />
      ) : Page ? (
        <Page session={session} onBack={() => setView('home')} />
      ) : (
        <ComingSoon title={label} />
      )}
    </AdminLayout>
  )
}
