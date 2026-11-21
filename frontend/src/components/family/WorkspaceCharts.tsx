import { useMemo, useState } from 'react'
import { formatCurrency, formatCompact } from '../../lib/format'
import { CATEGORY_SERIES, percentLabel, shareOf } from './workspaceTheme'

// Charts that only the family workspace routes use: a 60-tick radial share
// donut (member / category / vendor / mode) and flat vertical member bars.
// Both draw from live API aggregates — no sample series.

export interface ShareSlice {
  label: string
  value: number
  color?: string
}

const TICKS = 60
const CENTER = 98
const R_IN = 60
const R_OUT = 88

export type TickHoverEffect = 'slice' | 'tick'

export function TickDonut({
  slices,
  total,
  centerLabel = 'Total',
  caption,
  emptyLabel = 'No spend in this range.',
  legendColumns = 2,
  footer,
  hoverEffect = 'slice',
}: {
  slices: ShareSlice[]
  total: number
  centerLabel?: string
  caption?: string
  emptyLabel?: string
  legendColumns?: 2 | 3
  footer?: string
  /**
   * How the ring reacts to a pointer. `slice` lifts every tick in the hovered
   * group, `tick` lifts only the tick under the pointer — the same two modes
   * the reference radial chart exposes.
   */
  hoverEffect?: TickHoverEffect
}) {
  const [active, setActive] = useState<number | null>(null)
  const [hoverTick, setHoverTick] = useState<number | null>(null)

  const items = useMemo(
    () =>
      slices
        .filter((s) => s.value > 0)
        .map((s, i) => ({ ...s, color: s.color ?? CATEGORY_SERIES[i % CATEGORY_SERIES.length] })),
    [slices],
  )

  const tickMap = useMemo(() => {
    if (!items.length) return []
    const base = items.reduce((sum, s) => sum + s.value, 0) || 1
    const counts = items.map((s) => Math.max(1, Math.round((s.value / base) * TICKS)))
    const map: number[] = []
    counts.forEach((count, idx) => {
      for (let i = 0; i < count; i++) map.push(idx)
    })
    while (map.length > TICKS) map.pop()
    while (map.length < TICKS) map.push(map.length % items.length)
    return map
  }, [items])

  if (!items.length || total <= 0) {
    return <div className="fw-donut-empty">{emptyLabel}</div>
  }

  const focused = active != null ? items[active] : null

  return (
    <div className="min-w-0">
      <div className="fw-donut-stage">
        <svg
          width="196"
          height="196"
          viewBox="0 0 196 196"
          role="img"
          aria-label={`${centerLabel} share across ${items.length} ${items.length === 1 ? 'group' : 'groups'}, total ${formatCurrency(total)}`}
          onMouseLeave={() => {
            setActive(null)
            setHoverTick(null)
          }}
        >
          {tickMap.map((itemIndex, tick) => {
            const angle = (tick / TICKS) * Math.PI * 2 - Math.PI / 2
            const dim = active != null && active !== itemIndex
            const groupActive = active === itemIndex
            const lifted = hoverEffect === 'tick' ? hoverTick === tick : groupActive
            const lift = lifted ? (hoverEffect === 'tick' ? 12 : 9) : 0
            const dx = Math.cos(angle) * lift
            const dy = Math.sin(angle) * lift
            return (
              <line
                key={tick}
                className="fw-donut-tick"
                x1={(CENTER + Math.cos(angle) * R_IN).toFixed(1)}
                y1={(CENTER + Math.sin(angle) * R_IN).toFixed(1)}
                x2={(CENTER + Math.cos(angle) * R_OUT).toFixed(1)}
                y2={(CENTER + Math.sin(angle) * R_OUT).toFixed(1)}
                stroke={items[itemIndex].color}
                strokeWidth={lifted ? 5.6 : 4.8}
                strokeLinecap="butt"
                style={{
                  opacity: dim ? 0.2 : 1,
                  cursor: 'pointer',
                  transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`,
                }}
                onMouseEnter={() => {
                  setActive(itemIndex)
                  if (hoverEffect === 'tick') setHoverTick(tick)
                }}
                onMouseLeave={() => {
                  setActive(null)
                  setHoverTick(null)
                }}
                onClick={() => setActive(groupActive ? null : itemIndex)}
              />
            )
          })}
        </svg>
        <div className="fw-donut-center">
          <div className="fw-label" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{centerLabel}</div>
          <div className="fw-donut-center__val">
            {focused ? formatCurrency(focused.value) : formatCompact(total)}
          </div>
          <div className="fw-donut-center__sub">
            {focused
              ? `${focused.label} · ${percentLabel(focused.value, total)}`
              : (caption ?? `100.0% of ${formatCurrency(total)}`)}
          </div>
        </div>
      </div>

      <div className={`fw-donut-legend${legendColumns === 3 ? ' fw-donut-legend--3' : ''}`}>
        {items.map((s, i) => (
          <button
            key={s.label}
            type="button"
            className="fw-donut-leg"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            title={`${s.label}: ${formatCurrency(s.value)} (${percentLabel(s.value, total)})`}
          >
            <span className="fw-swatch" style={{ background: s.color }} />
            <span>
              {s.label} {shareOf(s.value, total).toFixed(1)}%
            </span>
          </button>
        ))}
      </div>

      {footer && <div className="fw-mono" style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 10 }}>{footer}</div>}
    </div>
  )
}

export interface BarDatum {
  label: string
  value: number
  color?: string
}

// Flat vertical bars with the value above and the label below. Keeps long
// member names readable by wrapping them onto the axis line.
export function VerticalBars({
  data,
  height = 220,
  valueFormat = formatCompact,
}: {
  data: BarDatum[]
  height?: number
  valueFormat?: (n: number) => string
}) {
  if (!data.length) {
    return <div className="fw-empty" style={{ padding: '44px 12px' }}>No member spend in this range.</div>
  }

  const max = Math.max(1, ...data.map((d) => d.value))
  const plotTop = 24
  const plotBottom = 168
  const plotHeight = plotBottom - plotTop
  const slot = 360 / data.length
  const barWidth = Math.min(72, slot * 0.52)

  return (
    <svg
      viewBox="0 0 460 220"
      width="100%"
      height={height}
      role="img"
      aria-label={`Spend by member: ${data.map((d) => `${d.label} ${valueFormat(d.value)}`).join(', ')}`}
      style={{ fontFamily: 'var(--font-mono)', maxWidth: '100%' }}
    >
      <line x1="52" y1={plotTop} x2="438" y2={plotTop} stroke="var(--border)" strokeOpacity="0.25" strokeDasharray="3 3" />
      <line x1="52" y1={(plotTop + plotBottom) / 2} x2="438" y2={(plotTop + plotBottom) / 2} stroke="var(--border)" strokeOpacity="0.25" strokeDasharray="3 3" />
      <line x1="52" y1={plotBottom} x2="438" y2={plotBottom} stroke="var(--border)" strokeWidth="2" />
      <text x="45" y={plotTop + 3} textAnchor="end" fontSize="9.5" fontWeight="700" fill="var(--text-secondary)">
        {valueFormat(max)}
      </text>
      <text x="45" y={(plotTop + plotBottom) / 2 + 3} textAnchor="end" fontSize="9.5" fontWeight="700" fill="var(--text-secondary)">
        {valueFormat(max / 2)}
      </text>
      <text x="45" y={plotBottom + 3} textAnchor="end" fontSize="9.5" fontWeight="700" fill="var(--text-secondary)">
        ₹0
      </text>

      {data.map((d, i) => {
        const barHeight = Math.max(2, Math.round((d.value / max) * plotHeight))
        const cx = 90 + i * slot + slot / 2
        const color = d.color ?? CATEGORY_SERIES[i % CATEGORY_SERIES.length]
        return (
          <g key={d.label}>
            <rect
              x={cx - barWidth / 2}
              y={plotBottom - barHeight}
              width={barWidth}
              height={barHeight}
              fill={color}
              stroke="var(--border)"
              strokeWidth="2.2"
            >
              <title>{`${d.label}: ${formatCurrency(d.value)}`}</title>
            </rect>
            <text
              x={cx}
              y={plotBottom - barHeight - 8}
              textAnchor="middle"
              fontSize="11"
              fontWeight="800"
              fill="var(--text-primary)"
            >
              {valueFormat(d.value)}
            </text>
            <text x={cx} y={plotBottom + 20} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-primary)">
              {d.label.length > 16 ? `${d.label.slice(0, 15)}…` : d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
