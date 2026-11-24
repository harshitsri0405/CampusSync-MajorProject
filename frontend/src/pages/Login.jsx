
import { useState, useEffect } from 'react'
import { Lock } from 'lucide-react'
import { ROLES, ROLE_ORDER } from '../roles.js'
import RoleCard from '../components/RoleCard.jsx'

// Dynamic rotating background images
const bgImages = [
  'https://images.unsplash.com/photo-1541829070764-84a7d30dd3f3?q=80&w=1200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=1200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1562774053-701939374585?q=80&w=1200&auto=format&fit=crop'
]

export default function Login({ onSelectRole }) {
  const [currentBgIndex, setCurrentBgIndex] = useState(0)

  // Change background every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBgIndex((prevIndex) => (prevIndex + 1) % bgImages.length)
    }, 4000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="login-page min-h-screen flex flex-col relative overflow-hidden">

      {/* Background Image Slideshow */}
      {bgImages.map((img, index) => (
        <div
          key={img}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out bg-cover bg-center ${
            index === currentBgIndex
              ? 'opacity-100 scale-105'
              : 'opacity-0 scale-100'
          }`}
          style={{
            backgroundImage: `url("${img}")`,
            transitionProperty: 'opacity, transform',
            transitionDuration: '1000ms'
          }}
        />
      ))}

      {/* Burgundy Background Overlay */}
      <div className="login-overlay absolute inset-0 z-0" />

      {/* Header */}
      <header className="login-header relative z-10 w-full px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="login-logo w-10 h-10 rounded-xl flex items-center justify-center shadow-lg">
            <svg
              className="w-6 h-6"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
            </svg>
          </div>

          <div>
            <h1 className="text-xl font-bold tracking-tight">
              CampusSync
            </h1>
            <p className="text-xs login-header-subtitle">
              Smart Campus Management System
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">

        <div className="login-panel w-full max-w-5xl p-8 md:p-12 text-center">

          {/* Heading */}
          <p className="login-highlight font-body text-sm font-semibold">
            Welcome to CampusSync
          </p>

          <h1 className="login-heading font-display text-4xl font-bold mt-2">
            Login to Your Account
          </h1>

          <p className="login-subtitle font-body mt-3">
            Select your role to continue
          </p>

          <div className="login-heading-line w-12 h-1 mx-auto mt-4 rounded-full" />

          {/* Role Cards */}
          <div className="login-role-grid grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-10 text-left">

            {ROLE_ORDER.map((key) => (
              <div className="role-card-shell" key={key}>
                <RoleCard
                  role={ROLES[key]}
                  active={false}
                  onSelect={onSelectRole}
                />
              </div>
            ))}

          </div>

          {/* Security Footer */}
          <div className="login-security flex items-center justify-center gap-3 mt-10">
            <span className="login-divider h-px w-16" />

            <span className="flex items-center gap-2 font-body text-xs font-medium">
              <Lock size={14} />
              Your data is protected and secure
            </span>

            <span className="login-divider h-px w-16" />
          </div>

        </div>
      </main>
    </div>
  )
}
