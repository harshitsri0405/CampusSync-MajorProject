import { ArrowRight } from 'lucide-react'
import DynamicIcon from './DynamicIcon.jsx'

export default function RoleCard({ role, active, onSelect }) {
  return (
    <button
      onClick={() => onSelect(role.key)}
      className={`text-left rounded-xl border-2 p-6 transition-all bg-white hover:shadow-md ${
        active ? 'shadow-md' : 'border-slate-200'
      }`}
      style={active ? { borderColor: role.accent } : {}}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: role.tint }}
      >
        <DynamicIcon name={role.icon} size={22} color={role.accent} strokeWidth={2} />
      </div>
      <p className="font-display text-lg text-slate-900">{role.wing}</p>
      <p className="font-body text-sm text-slate-500 mt-1 leading-snug">{role.description}</p>
      <ArrowRight size={16} className="mt-4" style={{ color: role.accent }} />
    </button>
  )
}
