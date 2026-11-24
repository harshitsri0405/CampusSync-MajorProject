import { useEffect, useState } from 'react'
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



const VIEW_KEY = 'faculty_view'

function ComingSoon({ title }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-10 text-center max-w-xl mx-auto mt-6">
      <h2 className="font-display text-xl text-slate-900 mb-2">{title}</h2>
      <p className="font-body text-sm text-slate-500">Ye section agle step me ban raha hai.</p>
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

// sidebar key -> page. Next steps add: attendance, marks, assignments ... here.
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


}

export default function FacultyDashboard({ session, onLogout }) {
  const [view, setView] = useState(() => {
    const saved = sessionStorage.getItem(VIEW_KEY)
    return saved && FACULTY_NAV.some((n) => n.key === saved) ? saved : 'home'
  })

  useEffect(() => {
    sessionStorage.setItem(VIEW_KEY, view)
  }, [view])

  function handleLogout() {
    sessionStorage.removeItem(VIEW_KEY)
    onLogout()
  }

  const Page = PAGES[view]
  const label = (FACULTY_NAV.find((n) => n.key === view) || {}).label || ''

  return (
    <FacultyLayout session={session} view={view} onNavigate={setView} onLogout={handleLogout}>
      {view === 'home' ? (
        <FacultyHomePage session={session} onNavigate={setView} />
      ) : Page ? (
        <Page session={session} />
      ) : (
        <ComingSoon title={label} />
      )}
    </FacultyLayout>
  )
}