import { useState } from 'react'

export default function FacultyTabbedPage({ session, tabs }) {
  const [tab, setTab] = useState(tabs[0].key)
  const current = tabs.find((t) => t.key === tab) || tabs[0]
  const Page = current.component
  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-4 py-1.5 font-body text-sm ${tab === t.key ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Page key={current.key} session={session} />
    </div>
  )
}