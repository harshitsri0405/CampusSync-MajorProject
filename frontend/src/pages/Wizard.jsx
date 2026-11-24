import { useState } from 'react'
import {
  ArrowLeft,
  Lock,
  ClipboardList,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  PartyPopper,
  LogIn,
  Users2,
  ShieldCheck,
  Settings,
  Compass,
  ChevronRight,
} from 'lucide-react'
import { ROLES, generatePassword, passwordChecks, passwordStrength } from '../roles.js'
import DynamicIcon from '../components/DynamicIcon.jsx'
import SidePanel from '../components/SidePanel.jsx'
import { registerRole, login } from '../api.js'

const STEP_DETAILS = 0
const STEP_SECURITY = 1
const STEP_REVIEW = 2
const STEP_COMPLETE = 3

function emptyDetails(role) {
  const v = {}
  role.detailsFields.forEach((f) => (v[f.name] = ''))
  return v
}

export default function Wizard({ roleKey, onBack, onAuthenticated }) {
  const role = ROLES[roleKey]

  const [authMode, setAuthMode] = useState('register') // 'register' | 'login'
  const [step, setStep] = useState(STEP_DETAILS)
  const [details, setDetails] = useState(() => emptyDetails(role))
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [suggestion, setSuggestion] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState(null)

  // Simple sign-in state (separate from the register wizard)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const checks = passwordChecks(password)
  const strength = passwordStrength(password)
  const passwordsMatch = confirmPassword.length > 0 && confirmPassword === password
  const allChecksPass = checks.every((c) => c.pass)

  function updateDetail(name, value) {
    setDetails((d) => ({ ...d, [name]: value }))
  }

  function handleSuggest() {
    setSuggestion(generatePassword())
    setShowPassword(true)
  }

  function useSuggestion() {
    setPassword(suggestion)
    setConfirmPassword(suggestion)
    setSuggestion('')
  }

  async function handleCreateAccount() {
    setError('')
    setLoading(true)
    try {
      const payload = {}
      role.backendFields.forEach((name) => (payload[name] = details[name]))
      payload.password = password
      const result = await registerRole(role.key, payload)
      setSession(result)
      setStep(STEP_COMPLETE)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(role.key, loginUsername, loginPassword)
      onAuthenticated(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ---------- Sign-in mode: one simple card, no stepper ----------
  if (authMode === 'login') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-stretch">
        <div className="hidden md:block">
          <SidePanel variant="gate" />
        </div>
        <div className="flex-1 flex items-center justify-center px-6 py-16">
          <div className="w-full max-w-sm">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 font-body text-sm text-slate-500 hover:text-slate-800 mb-8"
            >
              <ArrowLeft size={15} /> Back
            </button>

            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
              style={{ backgroundColor: role.tint }}
            >
              <LogIn size={22} style={{ color: role.accent }} strokeWidth={2} />
            </div>
            <p className="font-body text-center text-sm font-medium mt-3" style={{ color: role.accent }}>
              {role.wing} Sign In
            </p>
            <h1 className="font-display text-2xl text-slate-900 text-center mt-1">Welcome back</h1>

            <form onSubmit={handleLogin} className="mt-8 space-y-4">
              <div>
                <label className="font-body text-sm text-slate-600">{role.usernameLabel}</label>
                <input
                  required
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-body text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="font-body text-sm text-slate-600">Password</label>
                <div className="mt-1 flex gap-2">
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="flex-1 min-w-0 rounded-lg border border-slate-200 px-3 py-2.5 font-body text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="px-3 rounded-lg border border-slate-200 text-slate-500"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && <p className="font-body text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg py-2.5 font-body font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: role.accent }}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="text-center font-body text-sm text-slate-500 mt-6">
              New here?{' '}
              <button
                onClick={() => {
                  setAuthMode('register')
                  setError('')
                }}
                className="font-medium"
                style={{ color: role.accent }}
              >
                Create an account
              </button>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ---------- Register mode: 4-step wizard ----------
  const progressPct = [25, 50, 75, 100][step]

  return (
    <div className="min-h-screen bg-slate-50 flex items-stretch">
      <div className="hidden md:block">
        <SidePanel variant="wizard" currentStepIndex={step} />
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl">
          {step !== STEP_COMPLETE && (
            <button
              onClick={() => (step === STEP_DETAILS ? onBack() : setStep(step - 1))}
              className="flex items-center gap-1.5 font-body text-sm text-slate-500 hover:text-slate-800 mb-6"
            >
              <ArrowLeft size={15} /> Back
            </button>
          )}

          {step === STEP_DETAILS && (
            <StepHeading
              icon={<DynamicIcon name={role.detailsIcon} size={22} style={{ color: role.accent }} />}
              tint={role.tint}
              eyebrow={`${role.wing} Setup`}
              title={role.setupLabel}
              subtitle={`Please provide the required information to create ${role.wing.toLowerCase()} account`}
              progressPct={progressPct}
              accent={role.accent}
            />
          )}
          {step === STEP_SECURITY && (
            <StepHeading
              icon={<Lock size={20} style={{ color: role.accent }} />}
              tint={role.tint}
              eyebrow={`${role.wing} Setup`}
              title="Account Security"
              subtitle={`Set up a strong password to secure your ${role.wing.toLowerCase()} account`}
              progressPct={progressPct}
              accent={role.accent}
            />
          )}
          {step === STEP_REVIEW && (
            <StepHeading
              icon={<ClipboardList size={20} style={{ color: role.accent }} />}
              tint={role.tint}
              eyebrow={`${role.wing} Setup`}
              title="Review & Create"
              subtitle={`Please review your information before creating ${role.wing.toLowerCase()} account`}
              progressPct={progressPct}
              accent={role.accent}
            />
          )}
          {step === STEP_COMPLETE && (
            <StepHeading
              icon={<CheckCircle2 size={22} className="text-emerald-600" />}
              tint="#DCFCE7"
              eyebrow={`${role.wing} Setup`}
              title="Setup Complete!"
              subtitle={`Your ${role.wing.toLowerCase()} account has been created successfully.`}
            />
          )}

          {step === STEP_DETAILS && (
            <Card>
              <CardHeader icon={<DynamicIcon name={role.detailsIcon} size={16} />} title={role.detailsTitle} />
              <div className="grid sm:grid-cols-2 gap-4">
                {role.detailsFields.map((f) => (
                  <div key={f.name} className={f.span === 'full' ? 'sm:col-span-2' : ''}>
                    <label className="font-body text-sm text-slate-600">{f.label}</label>
                    <div className="mt-1 relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <DynamicIcon name={f.icon} size={15} />
                      </span>
                      <input
                        required
                        value={details[f.name]}
                        onChange={(e) => updateDetail(f.name, e.target.value)}
                        placeholder={f.placeholder}
                        className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2.5 font-body text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <PrimaryButton onClick={() => setStep(STEP_SECURITY)} accent={role.accent}>
                Continue <ChevronRight size={16} />
              </PrimaryButton>

              <p className="text-center font-body text-sm text-slate-500 mt-4">
                Already have an account?{' '}
                <button onClick={() => setAuthMode('login')} className="font-medium" style={{ color: role.accent }}>
                  Sign in
                </button>
              </p>
            </Card>
          )}

          {step === STEP_SECURITY && (
            <Card>
              <CardHeader icon={<Lock size={16} />} title="Set Password" />

              <label className="font-body text-sm text-slate-600">Password</label>
              <div className="mt-1 flex gap-2">
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 min-w-0 rounded-lg border border-slate-200 px-3 py-2.5 font-body text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="px-3 rounded-lg border border-slate-200 text-slate-500"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {!suggestion ? (
                <button
                  type="button"
                  onClick={handleSuggest}
                  className="mt-2 font-body text-xs underline text-slate-400 hover:text-slate-700"
                >
                  Suggest a strong password instead
                </button>
              ) : (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                  <span className="font-mono text-xs text-slate-700 flex-1 min-w-0 truncate">{suggestion}</span>
                  <button type="button" onClick={useSuggestion} className="font-body text-xs font-medium" style={{ color: role.accent }}>
                    Use this
                  </button>
                  <button type="button" onClick={handleSuggest} className="font-body text-xs text-slate-400">
                    Try another
                  </button>
                </div>
              )}

              <p className="font-body text-xs text-slate-400 mt-3">Must be at least 8 characters long.</p>
              <div className="mt-2 space-y-1.5">
                {checks.map((c) => (
                  <div key={c.label} className="flex items-center gap-2">
                    {c.pass ? (
                      <CheckCircle2 size={15} className="text-emerald-500" />
                    ) : (
                      <Circle size={15} className="text-slate-300" />
                    )}
                    <span className={`font-body text-sm ${c.pass ? 'text-slate-700' : 'text-slate-400'}`}>
                      {c.label}
                    </span>
                  </div>
                ))}
              </div>

              <label className="font-body text-sm text-slate-600 block mt-5">Confirm Password</label>
              <input
                required
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-body text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {confirmPassword && (
                <div className="flex items-center gap-2 mt-1.5">
                  {passwordsMatch ? (
                    <>
                      <CheckCircle2 size={15} className="text-emerald-500" />
                      <span className="font-body text-sm text-emerald-600">Passwords match</span>
                    </>
                  ) : (
                    <span className="font-body text-sm text-red-500">Passwords don't match yet</span>
                  )}
                </div>
              )}

              <div className="mt-5 rounded-lg bg-emerald-50 border border-emerald-100 p-3 flex gap-2">
                <ShieldCheck size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-body text-sm font-medium text-emerald-800">Password Security Tips</p>
                  <p className="font-body text-xs text-emerald-700 mt-0.5">
                    Use a strong password that you don't use for other accounts.
                  </p>
                </div>
              </div>

              <PrimaryButton
                onClick={() => setStep(STEP_REVIEW)}
                accent={role.accent}
                disabled={!allChecksPass || !passwordsMatch}
              >
                Continue <ChevronRight size={16} />
              </PrimaryButton>
              <BackLink onClick={() => setStep(STEP_DETAILS)} />
            </Card>
          )}

          {step === STEP_REVIEW && (
            <Card>
              <CardHeader icon={<DynamicIcon name={role.detailsIcon} size={16} />} title={role.detailsTitle} />
              <dl className="space-y-3">
                {role.detailsFields.map((f) => (
                  <div key={f.name} className="flex justify-between gap-4 text-sm">
                    <dt className="font-body text-slate-500 shrink-0">{f.label}</dt>
                    <dd className="font-body text-slate-800 font-medium text-right break-words">
                      {details[f.name] || '—'}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5 pt-5 border-t border-slate-100">
                <p className="font-body text-sm font-semibold text-slate-800 mb-3">
                  {role.wing} Account Summary
                </p>
                <div className="flex justify-between text-sm">
                  <span className="font-body text-slate-500">Password</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-slate-800">{'•'.repeat(Math.min(password.length, 10))}</span>
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{
                        color: strength.label === 'Strong' ? '#059669' : '#B45309',
                        backgroundColor: strength.label === 'Strong' ? '#DCFCE7' : '#FEF3C7',
                      }}
                    >
                      {strength.label}
                    </span>
                  </span>
                </div>
              </div>

              <div className="mt-5 rounded-lg bg-blue-50 border border-blue-100 p-3 flex gap-2">
                <Compass size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <p className="font-body text-xs text-blue-700">
                  Please verify all details. You won't be able to change the institution details later.
                </p>
              </div>

              {error && <p className="font-body text-sm text-red-600 mt-3">{error}</p>}

              <PrimaryButton onClick={handleCreateAccount} accent={role.accent} disabled={loading}>
                {loading ? 'Creating…' : `Create ${role.wing} Account`}
              </PrimaryButton>
              <BackLink onClick={() => setStep(STEP_SECURITY)} />
            </Card>
          )}

          {step === STEP_COMPLETE && (
            <Card>
              <div className="flex justify-center mb-2">
                <PartyPopper size={28} className="text-emerald-500" />
              </div>
              <p className="font-body text-sm font-semibold text-slate-800 mb-3">What's Next?</p>
              <div className="space-y-1">
                <NextItem icon={<LogIn size={16} />} title="Login to Dashboard" desc={`Access your ${role.wing.toLowerCase()} dashboard to get started.`} />
                <NextItem icon={<Users2 size={16} />} title="Explore Your Wing" desc="Every feature for this module unlocks one step at a time." />
                <NextItem icon={<Settings size={16} />} title="Configure System" desc="Customize settings to fit your needs." />
              </div>

              <PrimaryButton onClick={() => onAuthenticated(session)} accent={role.accent}>
                Go to Dashboard
              </PrimaryButton>
              <button
                onClick={onBack}
                className="w-full text-center font-body text-sm text-slate-500 hover:text-slate-800 mt-3"
              >
                Login Later
              </button>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function StepHeading({ icon, tint, eyebrow, title, subtitle, progressPct, accent }) {
  return (
    <div className="text-center mb-6">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: tint }}>
        {icon}
      </div>
      <p className="font-body text-sm text-slate-500 mt-2">{eyebrow}</p>
      <h1 className="font-display text-2xl text-slate-900 mt-1">{title}</h1>
      {subtitle && <p className="font-body text-sm text-slate-500 mt-1">{subtitle}</p>}
      {typeof progressPct === 'number' && (
        <div className="h-1 w-full max-w-xs mx-auto bg-slate-100 rounded-full overflow-hidden mt-4">
          <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, backgroundColor: accent }} />
        </div>
      )}
    </div>
  )
}

function Card({ children }) {
  return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-7">{children}</div>
}

function CardHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <span className="text-slate-400">{icon}</span>
      <p className="font-body text-sm font-semibold text-slate-800">{title}</p>
    </div>
  )
}

function PrimaryButton({ children, onClick, accent, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full mt-6 rounded-lg py-2.5 font-body font-medium text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
      style={{ backgroundColor: accent }}
    >
      {children}
    </button>
  )
}

function BackLink({ onClick }) {
  return (
    <button onClick={onClick} className="w-full text-center font-body text-sm text-slate-500 hover:text-slate-800 mt-3">
      ← Back to Previous
    </button>
  )
}

function NextItem({ icon, title, desc }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-b-0">
      <span className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-body text-sm font-medium text-slate-800">{title}</p>
        <p className="font-body text-xs text-slate-500">{desc}</p>
      </div>
      <ChevronRight size={14} className="text-slate-300 ml-auto mt-2 shrink-0" />
    </div>
  )
}
