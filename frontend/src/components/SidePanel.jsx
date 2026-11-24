import { GraduationCap, ShieldCheck } from 'lucide-react'

const STEPS = [
  { key: 'details', label: 'Account Details', desc: 'Provide required information' },
  { key: 'security', label: 'Account Security', desc: 'Set up your secure password' },
  { key: 'review', label: 'Review & Create', desc: 'Confirm your details' },
  { key: 'complete', label: 'Complete', desc: 'Your account is ready' },
]

export default function SidePanel({ variant = 'gate', currentStepIndex = 0 }) {
  return (
    <div className="relative w-full md:w-[300px] shrink-0 bg-gradient-to-b from-[#0F1B33] to-[#16233F] text-white overflow-hidden">
      {/* soft abstract campus-at-dusk backdrop, no external image needed */}
      <div className="absolute inset-0 opacity-40" style={{
        backgroundImage:
          'radial-gradient(circle at 20% 20%, rgba(37,99,235,0.35), transparent 40%), radial-gradient(circle at 80% 70%, rgba(124,58,237,0.25), transparent 45%)',
      }} />

      <div className="relative p-8 flex flex-col h-full">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-900/40">
            <ShieldCheck size={20} className="text-white" strokeWidth={2.2} />
          </div>
          <div>
            <p className="font-display text-lg leading-none">
              Campus<span className="text-blue-400">Sync</span>
            </p>
            <p className="text-[11px] text-white/50 mt-1">Smart Campus Management System</p>
          </div>
        </div>

        {variant === 'gate' && (
          <div className="mt-16">
            <div className="w-10 h-px bg-blue-400 mb-4" />
            <p className="font-body text-white/80 leading-relaxed">
              One Campus. One Platform.
              <br />
              Connected. Efficient. Smart.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 text-xs text-white/60 border border-white/15 rounded-full px-3 py-1.5">
              <ShieldCheck size={12} /> Secure · Reliable · Efficient
            </div>
          </div>
        )}

        {variant === 'wizard' && (
          <div className="mt-14 space-y-0">
            {STEPS.map((step, i) => {
              const done = i < currentStepIndex
              const active = i === currentStepIndex
              return (
                <div key={step.key} className="flex gap-3 pb-8 last:pb-0 relative">
                  {i !== STEPS.length - 1 && (
                    <span className="absolute left-[15px] top-8 bottom-0 w-px bg-white/15" />
                  )}
                  <span
                    className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                      done
                        ? 'bg-blue-500 text-white'
                        : active
                        ? 'bg-blue-500 text-white ring-4 ring-blue-500/25'
                        : 'bg-white/10 text-white/50'
                    }`}
                  >
                    {done ? '✓' : i + 1}
                  </span>
                  <div>
                    <p className={`font-body text-sm font-medium ${active || done ? 'text-white' : 'text-white/50'}`}>
                      {step.label}
                    </p>
                    <p className="font-body text-xs text-white/40 mt-0.5">{step.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-auto pt-8 flex items-start gap-3 bg-white/5 rounded-xl p-4 border border-white/10">
          <ShieldCheck size={18} className="text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-body text-sm font-medium text-white">Secure & Reliable</p>
            <p className="font-body text-xs text-white/50 mt-0.5">
              Your information is protected with enterprise-grade security.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
