const PURPLE = '#7C3AED'
const RED = '#DC2626'
const GRID = '#E2E8F0'
const INK = '#334155'
const MUTED = '#94A3B8'

function polar(cx, cy, r, angle) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
}

function pts(list) {
  return list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

// "Database Systems" -> ["Database", "Systems"] so long names do not run off the chart
function wrapName(name) {
  const words = name.split(' ')
  if (name.length <= 12 || words.length < 2) return [name]
  const mid = Math.ceil(words.length / 2)
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
}

export default function AttendanceRadar({ subjects, required = 75 }) {
  const n = subjects.length
  const W = 440
  const H = 368
  const cx = W / 2
  const cy = 170
  const R = 105

  // Scale starts at 50% so small differences stay visible; goes lower only if a subject needs it.
  const lowest = Math.min(...subjects.map((s) => s.percentage), required)
  const min = Math.max(0, Math.min(50, Math.floor((lowest - 10) / 10) * 10))
  const step = 100 - min > 50 ? 20 : 10
  const levels = []
  for (let v = min + step; v <= 100; v += step) levels.push(v)
  // always end the grid at 100%; swap the last ring instead of adding one right next to it
  if (levels[levels.length - 1] !== 100) {
    if (levels.length && 100 - levels[levels.length - 1] < step / 2 + 1) levels.pop()
    levels.push(100)
  }

  const frac = (v) => Math.min(1, Math.max(0, (v - min) / (100 - min)))
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const ring = (f) => pts(subjects.map((_, i) => polar(cx, cy, R * f, angle(i))))

  const dataPoints = subjects.map((s, i) => polar(cx, cy, R * frac(s.percentage), angle(i)))

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-md mx-auto"
      role="img"
      aria-label={`Radar chart of attendance by subject: ${subjects
        .map((s) => `${s.subject} ${s.percentage}%`)
        .join(', ')}. Required attendance is ${required}%.`}
    >
      {/* grid rings and spokes */}
      {levels.map((v) => (
        <polygon key={v} points={ring(frac(v))} fill="none" stroke={GRID} strokeWidth="1" />
      ))}
      {subjects.map((_, i) => {
        const [x, y] = polar(cx, cy, R, angle(i))
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={GRID} strokeWidth="1" />
      })}
      {levels.map((v) => (
        <text key={`t${v}`} x={cx + 4} y={cy - R * frac(v) - 3} fontSize="10" fill={MUTED}>
          {v}%
        </text>
      ))}

      {/* required line */}
      <polygon
        points={ring(frac(required))}
        fill="none"
        stroke="#64748B"
        strokeWidth="1.8"
        strokeDasharray="6 4"
      />

      {/* student's attendance */}
      <polygon points={pts(dataPoints)} fill={PURPLE} fillOpacity="0.15" stroke={PURPLE} strokeWidth="2" strokeLinejoin="round" />
      {dataPoints.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r="4.5"
          fill={subjects[i].percentage < required ? RED : PURPLE}
          stroke="#fff"
          strokeWidth="1.5"
        >
          <title>{`${subjects[i].subject}: ${subjects[i].present}/${subjects[i].total} classes (${subjects[i].percentage}%)`}</title>
        </circle>
      ))}

      {/* subject labels */}
      {subjects.map((s, i) => {
        const a = angle(i)
        const [x, y] = polar(cx, cy, R + 20, a)
        const cosA = Math.cos(a)
        const sinA = Math.sin(a)
        const anchor = cosA > 0.25 ? 'start' : cosA < -0.25 ? 'end' : 'middle'
        const lines = wrapName(s.subject)
        const count = lines.length + 1 // + percentage line
        const lineH = 14
        const startY = sinA < -0.5 ? y - (count - 1) * lineH : sinA > 0.5 ? y + 8 : y - ((count - 1) * lineH) / 2 + 4
        return (
          <text key={s.subject} x={x} y={startY} textAnchor={anchor} fontSize="12" fill={INK}>
            {lines.map((l, k) => (
              <tspan key={k} x={x} dy={k === 0 ? 0 : lineH}>
                {l}
              </tspan>
            ))}
            <tspan x={x} dy={lineH} fontWeight="600" fill={s.percentage < required ? RED : PURPLE}>
              {s.percentage}%
            </tspan>
          </text>
        )
      })}

      {/* legend */}
      <g transform={`translate(${cx - 110}, ${H - 16})`}>
        <rect x="0" y="-8" width="12" height="12" rx="2" fill={PURPLE} fillOpacity="0.35" stroke={PURPLE} />
        <text x="18" y="2" fontSize="11" fill={INK}>Your attendance</text>
        <line x1="130" y1="-2" x2="152" y2="-2" stroke="#64748B" strokeWidth="1.8" strokeDasharray="5 3" />
        <text x="158" y="2" fontSize="11" fill={INK}>{`Required ${required}%`}</text>
      </g>
    </svg>
  )
}
