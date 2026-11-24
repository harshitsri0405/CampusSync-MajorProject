import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { getStudentAnalytics } from '../api'

const RISK_STYLE = {
  low: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-red-50 text-red-700 border-red-200',
  unknown: 'bg-slate-50 text-slate-600 border-slate-200',
}
const BAR_COLOR = {
  safe: 'bg-green-500',
  warning: 'bg-amber-500',
  risk: 'bg-red-500',
  strong: 'bg-green-500',
  average: 'bg-blue-500',
  weak: 'bg-amber-500',
  failing: 'bg-red-500',
}

function Card({ title, children, right }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-slate-800">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  )
}

function Badge({ text, style }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${style}`}>{text}</span>
}

function Bar({ value, color, mark }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className="relative h-2.5 bg-slate-100 rounded-full">
      <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${v}%` }} />
      {mark != null && (
        <div className="absolute top-[-3px] h-4 w-0.5 bg-slate-500" style={{ left: `${mark}%` }} title={`${mark}%`} />
      )}
    </div>
  )
}

function Empty({ text }) {
  return <p className="text-sm text-slate-500">{text}</p>
}

export default function StudentAnalyticsPage({ session, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('attendance')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setData(await getStudentAnalytics())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const att = data?.attendance
  const perf = data?.performance
  const noData = data && !att.has_data && !perf.has_data

  return (
    <div className="min-h-screen bg-slate-50 font-body">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-600 hover:text-purple-600">
            <ArrowLeft size={16} /> Back
          </button>
          <h1 className="font-display text-xl font-bold text-slate-800">AI Analytics</h1>
        </div>

        {loading && <p className="text-slate-500 text-sm">Loading...</p>}
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        {noData && (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-6 text-center mb-4">
            <p className="text-slate-600 text-sm">
              Analytics ke liye data chahiye. Pehle Attendance aur Results pages me "Load sample data" dabao,
              phir yahan wapas aao.
            </p>
            <button onClick={load} className="mt-3 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-700">
              Refresh
            </button>
          </div>
        )}

        {data && !noData && (
          <>
            <div className="flex gap-6 border-b border-slate-200 mb-4">
              {[
                ['attendance', 'Attendance Risk'],
                ['performance', 'Performance'],
                ['plan', 'Study Plan'],
              ].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`pb-2 text-sm font-medium border-b-2 ${
                    tab === k ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'attendance' && (
              <>
                {!att.has_data ? (
                  <Card title="Attendance Risk"><Empty text={att.message} /></Card>
                ) : (
                  <>
                    <Card
                      title="Overall"
                      right={<Badge text={`${att.risk_level} risk`} style={RISK_STYLE[att.risk_level]} />}
                    >
                      <div className="flex items-end justify-between mb-2">
                        <div className="text-3xl font-bold text-slate-800">{att.overall_percentage}%</div>
                        <div className="text-xs text-slate-500">
                          {att.total_classes} classes | target {att.target}% | trend: {att.trend}
                          {att.trend_slope != null ? ` (${att.trend_slope > 0 ? '+' : ''}${att.trend_slope}%/week)` : ''}
                        </div>
                      </div>
                      <Bar
                        value={att.overall_percentage}
                        mark={att.target}
                        color={att.risk_level === 'low' ? 'bg-green-500' : att.risk_level === 'medium' ? 'bg-amber-500' : 'bg-red-500'}
                      />
                    </Card>

                    <Card title="Weekly attendance">
                      {att.weekly.length === 0 ? (
                        <Empty text="Weekly data nahi hai." />
                      ) : (
                        <div className="flex items-end gap-2 h-32">
                          {att.weekly.map((w) => (
                            <div key={w.week} className="flex-1 flex flex-col items-center justify-end h-full">
                              <span className="text-[10px] text-slate-500 mb-1">{Math.round(w.percentage)}%</span>
                              <div
                                className={`w-full rounded-t ${w.percentage >= att.target ? 'bg-green-500' : w.percentage >= 65 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ height: `${Math.max(4, w.percentage)}%` }}
                              />
                              <span className="text-[10px] text-slate-400 mt-1">{w.week.slice(-3)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>

                    <Card title="Subject-wise">
                      <div className="space-y-4">
                        {att.subjects.map((s) => (
                          <div key={s.subject}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-slate-800 font-medium">{s.subject}</span>
                              <span className="text-slate-600">
                                {s.percentage}% ({s.present}/{s.total})
                              </span>
                            </div>
                            <Bar value={s.percentage} mark={att.target} color={BAR_COLOR[s.status]} />
                            <div className="text-xs text-slate-500 mt-1">
                              {s.status === 'safe'
                                ? `Safe. ${s.can_skip} class(es) skip kar sakte ho (75% par rehkar).`
                                : `Agli ${s.classes_needed} classes attend karo to 75% ho jayega.`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </>
                )}
              </>
            )}

            {tab === 'performance' && (
              <>
                {!perf.has_data ? (
                  <Card title="Performance"><Empty text={perf.message} /></Card>
                ) : (
                  <>
                    <Card
                      title="Prediction (estimate)"
                      right={<Badge text={`confidence: ${perf.confidence}`} style={RISK_STYLE.unknown} />}
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-slate-500">Latest semester average</div>
                          <div className="text-2xl font-bold text-slate-800">{perf.current_average}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Predicted next</div>
                          <div className="text-2xl font-bold text-purple-600">{perf.predicted_next}%</div>
                          <div className="text-xs text-slate-500">{perf.predicted_status}</div>
                        </div>
                      </div>
                      {perf.semesters.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {perf.semesters.map((s) => (
                            <div key={s.semester}>
                              <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                                <span>Semester {s.semester}</span>
                                <span>{s.percentage}%</span>
                              </div>
                              <Bar value={s.percentage} mark={perf.pass_mark} color="bg-purple-500" />
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>

                    <Card title="Subject-wise analysis">
                      <div className="space-y-4">
                        {perf.subjects.map((s) => (
                          <div key={s.subject}>
                            <div className="flex justify-between items-center text-sm mb-1">
                              <span className="text-slate-800 font-medium">{s.subject}</span>
                              <span className="flex items-center gap-2 text-slate-600">
                                {s.percentage}%
                                <Badge
                                  text={s.status}
                                  style={
                                    s.status === 'failing'
                                      ? RISK_STYLE.high
                                      : s.status === 'weak'
                                      ? RISK_STYLE.medium
                                      : s.status === 'strong'
                                      ? RISK_STYLE.low
                                      : RISK_STYLE.unknown
                                  }
                                />
                              </span>
                            </div>
                            <Bar value={s.percentage} mark={perf.pass_mark} color={BAR_COLOR[s.status]} />
                            <div className="text-xs text-slate-500 mt-1">
                              {s.assessments} assessment(s)
                              {s.below_own_average ? ' | apne average se kaafi neeche' : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </>
                )}
              </>
            )}

            {tab === 'plan' && (
              <Card
                title="Study recommendations"
                right={
                  data.weak_subjects.length > 0 && (
                    <span className="text-xs text-slate-500">Weak: {data.weak_subjects.join(', ')}</span>
                  )
                }
              >
                {data.recommendations.length === 0 ? (
                  <Empty text="Abhi koi recommendation nahi hai." />
                ) : (
                  <ol className="space-y-3">
                    {data.recommendations.map((r) => (
                      <li key={r.priority} className="flex gap-3">
                        <span className="w-6 h-6 shrink-0 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center">
                          {r.priority}
                        </span>
                        <div>
                          <div className="text-sm font-medium text-slate-800">{r.title}</div>
                          <div className="text-xs text-slate-600">{r.detail}</div>
                          {r.hours_per_week != null && (
                            <div className="text-xs text-purple-600 mt-0.5">Suggested: {r.hours_per_week} hrs/week</div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            )}

            <p className="text-xs text-slate-500 mt-2">{data.note}</p>
          </>
        )}
      </div>
    </div>
  )
}