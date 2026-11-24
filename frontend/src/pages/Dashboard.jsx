import { ROLES } from '../roles.js'
import StudentDashboard from './StudentDashboard.jsx'
import AdminDashboard from './AdminDashboard.jsx'
import FacultyDashboard from './FacultyDashboard.jsx'


export default function Dashboard({ session, onLogout }) {
  if (session.role === 'student') {
    return <StudentDashboard session={session} onLogout={onLogout} />
  }
  if (session.role === 'admin') return <AdminDashboard session={session} onLogout={onLogout} />
if (session.role === 'faculty') return <FacultyDashboard session={session} onLogout={onLogout} />
  const role = ROLES[session.role]

  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-xl border border-line bg-[#EFEBE1] p-8 text-center">
        <p
          className="font-mono text-xs uppercase tracking-widest"
          style={{ color: role.accent }}
        >
          {role.wing}
        </p>
        <h1 className="font-display text-3xl text-ink mt-2">
          Welcome, {session.display_name}
        </h1>
        <p className="font-body text-ink/60 mt-2">
          Only the {role.wing.toLowerCase()} module is unlocked for this account. This is where
          its dashboard will live next — attendance, results, and the rest of the features
          get built one at a time on top of this login.
        </p>
        <button
          onClick={onLogout}
          className="mt-6 rounded-md px-4 py-2 font-body text-sm text-white"
          style={{ backgroundColor: role.accent }}
        >
          Log out
        </button>
      </div>
    </div>
  )
}
