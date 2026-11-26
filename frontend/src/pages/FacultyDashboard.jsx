import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import FacultyLayout, { FACULTY_NAV } from '../components/FacultyLayout.jsx'
import FacultyHomePage from './FacultyHomePage.jsx'
import FacultyProfilePage from './FacultyProfilePage.jsx'
import FacultyClassesPage from './FacultyClassesPage.jsx'
import FacultyAttendancePage from './FacultyAttendancePage.jsx'
import FacultyMarksPage from './FacultyMarksPage.jsx'
import FacultyAssignmentsPage from './FacultyAssignmentsPage.jsx'
import FacultyNoticesPage from './FacultyNoticesPage.jsx'
import FacultyMentorPage from './FacultyMentorPage.jsx'
import FacultyComplaintsPage from './FacultyComplaintsPage.jsx'
import FacultyMaterialsPage from './FacultyMaterialsPage.jsx'
import FacultyQrPage from './FacultyQrPage.jsx'
import FacultyTabbedPage from './FacultyTabbedPage.jsx'
import FacultyExamCopiesTab from './FacultyExamCopiesTab.jsx'
import FacultyTaskFilesTab from './FacultyTaskFilesTab.jsx'
import FacultyExamsPage from './FacultyExamsPage.jsx'
import FacultyPlannerPage from './FacultyPlannerPage.jsx'
import FacultyTimetablePage from './FacultyTimetablePage.jsx'
import FacultyAnalyticsPage from './FacultyAnalyticsPage.jsx'
import FacultyHostelPage from './FacultyHostelPage.jsx'
import { facultyHostelAccess } from '../api.js'

const VIEW_KEY = 'faculty_view'

function ComingSoon({ title }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-10 text-center max-w-xl mx-auto mt-6">
      <h2 className="font-display text-xl text-slate-900 mb-2">{title}</h2>
      <p className="font-body text-sm text-slate-500">This section will be available in a later step.</p>
    </div>
  )
}

function FacultyMarksHub({ session }) {
  return <FacultyTabbedPage session={session} tabs={[
    { key: 'entry', label: 'Marks Entry', component: FacultyMarksPage },
    { key: 'copies', label: 'Exam Copies', component: FacultyExamCopiesTab },
  ]} />
}

function FacultyAssignmentsHub({ session }) {
  return <FacultyTabbedPage session={session} tabs={[
    { key: 'list', label: 'Assignments', component: FacultyAssignmentsPage },
    { key: 'files', label: 'Files', component: FacultyTaskFilesTab },
  ]} />
}

// sidebar key -> page
const PAGES = {
  profile: FacultyProfilePage,
  classes: FacultyClassesPage,
  attendance: FacultyAttendancePage,
  marks: FacultyMarksHub,
  assignments: FacultyAssignmentsHub,
  notices: FacultyNoticesPage,
  mentor: FacultyMentorPage,
  complaints: FacultyComplaintsPage,
  materials: FacultyMaterialsPage,
  qr: FacultyQrPage,
  exams: FacultyExamsPage,
  planner: FacultyPlannerPage,
  timetable: FacultyTimetablePage,
  analytics: FacultyAnalyticsPage,
  hostel: FacultyHostelPage,
}

// The Hostel menu item exists only for wardens. It is added to (or removed from) the shared nav list.
function syncHostelNav(isWarden) {
  const at = FACULTY_NAV.findIndex((n) => n.key === 'hostel')
  if (isWarden && at < 0) {
    const sample = FACULTY_NAV[0] || {}
    FACULTY_NAV.push({ key: 'hostel', label: 'Hostel', icon: typeof sample.icon === 'string' ? 'Building2' : Building2 })
  } else if (!isWarden && at >= 0) {
    FACULTY_NAV.splice(at, 1)
  }
}

export default function FacultyDashboard({ session, onLogout }) {
  const [isWarden, setIsWarden] = useState(false)
  const [accessChecked, setAccessChecked] = useState(false)
  const [view, setView] = useState(() => {
    const saved = sessionStorage.getItem(VIEW_KEY)
    return saved && (saved === 'hostel' || FACULTY_NAV.some((n) => n.key === saved)) ? saved : 'home'
  })

  // Find out whether this faculty account is an active warden.
  useEffect(() => {
    let alive = true
    facultyHostelAccess(session.access_token)
      .then((r) => { if (alive) { syncHostelNav(!!r.is_warden); setIsWarden(!!r.is_warden) } })
      .catch(() => { if (alive) { syncHostelNav(false); setIsWarden(false) } })
      .finally(() => { if (alive) setAccessChecked(true) })
    return () => { alive = false }
  }, [session.access_token])

  // A non-warden can never stay on the hostel view.
  useEffect(() => {
    if (accessChecked && !isWarden && view === 'hostel') setView('home')
  }, [accessChecked, isWarden, view])

  useEffect(() => {
    sessionStorage.setItem(VIEW_KEY, view)
  }, [view])

  function handleLogout() {
    sessionStorage.removeItem(VIEW_KEY)
    syncHostelNav(false)
    onLogout()
  }

  const Page = view === 'hostel' && !isWarden ? null : PAGES[view]
  const label = (FACULTY_NAV.find((n) => n.key === view) || {}).label || ''

  return (
    <FacultyLayout session={session} view={view} onNavigate={setView} onLogout={handleLogout}>
      {view === 'home' ? (
        <FacultyHomePage session={session} onNavigate={setView} />
      ) : view === 'hostel' && !isWarden ? (
        <p className="font-body text-sm text-slate-500">{accessChecked ? 'Hostel access is limited to wardens.' : 'Loading...'}</p>
      ) : Page ? (
        <Page session={session} />
      ) : (
        <ComingSoon title={label} />
      )}
    </FacultyLayout>
  )
}