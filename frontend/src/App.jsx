import { useState, useEffect } from 'react'
import Login from './pages/Login.jsx'
import Wizard from './pages/Wizard.jsx'
import Dashboard from './pages/Dashboard.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [selectedRole, setSelectedRole] = useState(null) // null = gate screen

  useEffect(() => {
    const saved = localStorage.getItem('erp_session')
    if (saved) setSession(JSON.parse(saved))
  }, [])

  function handleAuthenticated(result) {
    localStorage.setItem('erp_session', JSON.stringify(result))
    setSession(result)
  }

  function handleLogout() {
    localStorage.removeItem('erp_session')
    setSession(null)
    setSelectedRole(null)
  }

  if (session) {
    return <Dashboard session={session} onLogout={handleLogout} />
  }

  if (selectedRole) {
    return (
      <Wizard
        roleKey={selectedRole}
        onBack={() => setSelectedRole(null)}
        onAuthenticated={handleAuthenticated}
      />
    )
  }

  return <Login onSelectRole={setSelectedRole} />
}
