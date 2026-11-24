import { useEffect, useRef, useState } from 'react'
import StudentLayout from '../components/StudentLayout.jsx'
import StudentHome from './StudentHome.jsx'
import StudentProfilePage from './StudentProfilePage.jsx'
import StudentAttendancePage from './StudentAttendancePage.jsx'
import StudentResultsPage from './StudentResultsPage.jsx'
import StudentTimetablePage from './StudentTimetablePage.jsx'
import StudentAssignmentsPage from './StudentAssignmentsPage.jsx'
import StudentFeesPage from './StudentFeesPage.jsx'
import StudentLibraryPage from './StudentLibraryPage.jsx'
import StudentNoticesPage from './StudentNoticesPage.jsx'
import StudentSyllabusPage from './StudentSyllabusPage.jsx'
import StudentGalleryPage from './StudentGalleryPage.jsx'
import StudentMentorPage from './StudentMentorPage.jsx'
import StudentComplaintsPage from './StudentComplaintsPage.jsx'
import StudentPlacementPage from './StudentPlacementPage.jsx'
import StudentDocumentsPage from './StudentDocumentsPage.jsx'
import StudentAIAnalyticsPage from './StudentAnalyticsPage.jsx'
import StudentLeavePage from './StudentLeavePage.jsx'
import StudentHostelPage from './StudentHostelPage.jsx'
import { fetchStudentPhotoUrl } from '../api.js'


const VIEW_KEY = 'student_view'

// sidebar key -> page component (every page receives { session, onBack })
const PAGES = {
  profile: StudentProfilePage,
  attendance: StudentAttendancePage,
  results: StudentResultsPage,
  timetable: StudentTimetablePage,
  assignments: StudentAssignmentsPage,
  fees: StudentFeesPage,
  library: StudentLibraryPage,
  notices: StudentNoticesPage,
  syllabus: StudentSyllabusPage,
  gallery: StudentGalleryPage,
  mentor: StudentMentorPage,
  complaints: StudentComplaintsPage,
  placement: StudentPlacementPage,
  documents: StudentDocumentsPage,
  analytics: StudentAIAnalyticsPage,
  leave: StudentLeavePage,
  hostel: StudentHostelPage,
  
}

export default function StudentDashboard({ session, onLogout }) {
  // after login the student always lands on Home; a page refresh keeps the page that was open
  const [view, setView] = useState(() => {
    const saved = sessionStorage.getItem(VIEW_KEY)
    return saved && PAGES[saved] ? saved : 'home'
  })
  const [photoUrl, setPhotoUrl] = useState(null)
  const photoRef = useRef(null)

  useEffect(() => {
    sessionStorage.setItem(VIEW_KEY, view)
  }, [view])

  // futuristic theme: active only while the student wing is open (styles live in index.css)
  useEffect(() => {
    document.body.classList.add('theme-future')
    return () => document.body.classList.remove('theme-future')
  }, [])

  // load the profile photo once for the sidebar, the top bar and the Home page
  useEffect(() => {
    let alive = true
    fetchStudentPhotoUrl(session.access_token).then((url) => {
      if (!alive) {
        if (url) URL.revokeObjectURL(url)
        return
      }
      setPhotoUrl(url)
    })
    return () => {
      alive = false
    }
  }, [session.access_token])

  useEffect(() => {
    photoRef.current = photoUrl
  }, [photoUrl])

  useEffect(
    () => () => {
      if (photoRef.current) URL.revokeObjectURL(photoRef.current)
    },
    []
  )

  function changePhoto(url) {
    if (photoRef.current && photoRef.current !== url) URL.revokeObjectURL(photoRef.current)
    setPhotoUrl(url)
  }

  function handleLogout() {
    sessionStorage.removeItem(VIEW_KEY)
    onLogout()
  }

  const Page = PAGES[view]

  return (
    <StudentLayout
      session={session}
      view={view}
      onNavigate={setView}
      onLogout={handleLogout}
      photoUrl={photoUrl}
    >
      {view === 'home' || !Page ? (
        <StudentHome session={session} photoUrl={photoUrl} onPhotoChange={changePhoto} onNavigate={setView} />
      ) : (
        <Page session={session} onBack={() => setView('home')} />
      )}
    </StudentLayout>
  )
}