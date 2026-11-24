import { useState } from 'react'
import { Card, Empty, fmtDay } from './HostelShared.jsx'

const CATEGORY_STYLE = {
  general: 'bg-slate-100 text-slate-600',
  mess: 'bg-amber-50 text-amber-700',
  maintenance: 'bg-purple-50 text-purple-700',
  holiday: 'bg-green-50 text-green-700',
}

export default function HostelNoticesTab({ data }) {
  const [filter, setFilter] = useState('all')
  const list = data.notices.filter((n) => filter === 'all' || n.category === filter)

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        {[{ key: 'all', label: 'All' }, ...data.notice_categories].map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter(c.key)}
            className={`rounded-full border px-3.5 py-1 font-body text-sm ${
              filter === c.key
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Card>
          <Empty>Abhi koi hostel notice nahi hai.</Empty>
        </Card>
      ) : (
        list.map((n) => (
          <div
            key={n.id}
            className={`bg-white rounded-xl border p-5 mb-3 ${n.is_important ? 'border-red-200' : 'border-slate-200'}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              {n.is_important && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-50 text-red-700">Important</span>
              )}
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  CATEGORY_STYLE[n.category] || CATEGORY_STYLE.general
                }`}
              >
                {n.category_label}
              </span>
              <span className="font-body text-xs text-slate-400 ml-auto">{fmtDay(n.posted_on)}</span>
            </div>
            <p className="font-display text-base text-slate-900 mt-2">{n.title}</p>
            {n.body && <p className="font-body text-sm text-slate-600 mt-1 whitespace-pre-line">{n.body}</p>}
            {n.posted_by && <p className="font-body text-xs text-slate-400 mt-2">Posted by {n.posted_by}</p>}
          </div>
        ))
      )}
    </>
  )
}
