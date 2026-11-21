import { useMemo } from 'react'
import { formatCurrency } from '../../lib/format'
import '../../pages/entry-overview.css'

export interface TickDatum {
  label: string
  amount: number
  percent: number
  color: string
}

const TICKS = 60
const CX = 105
const CY = 105
const R_INNER = 64
const R_OUTER = 94

/**
 * Segmented 60-tick radial donut used by the overview panels. Every slice keeps
 * at least one tick so a tiny category stays visible, and the remainder is
 * topped up from the largest slice so the ring always closes.
 */
export function EntryTicks({
  items,
  total,
  totalLabel,
  showAmountInLegend = false,
  activeIndex,
  onActiveChange,
}: {
  items: TickDatum[]
  total: number
  totalLabel: string
  showAmountInLegend?: boolean
  activeIndex?: number | null
  onActiveChange?: (index: number | null) => void
}) {
  const tickMap = useMemo(() => {
    if (!items.length) return []
    const counts = items.map((item) => Math.max(1, Math.round((item.percent / 100) * TICKS)))
    let sum = counts.reduce((a, b) => a + b, 0)
    // Trim from the smallest slices first so the ring never overflows.
    while (sum > TICKS) {
      let smallest = -1
      for (let i = 0; i < counts.length; i++) {
        if (counts[i] > 1 && (smallest < 0 || counts[i] < counts[smallest])) smallest = i
      }
      if (smallest < 0) break
      counts[smallest] -= 1
      sum -= 1
    }
    const map: number[] = []
    counts.forEach((count, idx) => {
      for (let i = 0; i < count; i++) map.push(idx)
    })
    while (map.length < TICKS) map.push(0)
    return map.slice(0, TICKS)
  }, [items])

  const active = activeIndex != null ? items[activeIndex] : undefined

  if (!items.length) {
    return <p className="fse-empty">No spend recorded this month yet.</p>
  }

  return (
    <>
      <div className="fse-donut-stage">
        <svg
          className="fse-donut-svg"
          viewBox="0 0 210 210"
          role="img"
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') onActiveChange?.(null)
          }}
          aria-label={`${totalLabel} ${formatCurrency(total)}`}
        >
          {tickMap.map((sliceIdx, i) => {
            const angle = (i / TICKS) * Math.PI * 2 - Math.PI / 2
            const x1 = CX + Math.cos(angle) * R_INNER
            const y1 = CY + Math.sin(angle) * R_INNER
            const x2 = CX + Math.cos(angle) * R_OUTER
            const y2 = CY + Math.sin(angle) * R_OUTER
            return (
              <line
                key={i}
                className="fse-donut-tick"
                x1={x1.toFixed(2)}
                y1={y1.toFixed(2)}
                x2={x2.toFixed(2)}
                y2={y2.toFixed(2)}
                strokeWidth="5.2"
                strokeLinecap="butt"
                style={{
                  stroke: items[sliceIdx].color,
                  opacity: activeIndex == null || activeIndex === sliceIdx ? 1 : 0.2,
                }}
                onMouseEnter={() => onActiveChange?.(sliceIdx)}
                onClick={() => onActiveChange?.(sliceIdx)}
                aria-hidden="true"
              />
            )
          })}
        </svg>
        <div className="fse-donut-center">
          <div className="fse-donut-val">
            {formatCurrency(active ? active.amount : total)}
          </div>
          <div className="fse-donut-lbl">
            {active ? `${active.label} · ${active.percent}%` : totalLabel}
          </div>
        </div>
      </div>

      <div
        className="fse-legend"
        onMouseLeave={() => onActiveChange?.(null)}
        role="group"
        aria-label={`${totalLabel} by slice`}
      >
        {items.map((item, idx) => {
          const isActive = activeIndex === idx
          return (
            <button
              key={`${item.label}-${idx}`}
              type="button"
              className={`fse-legend-item${isActive ? ' is-active' : ''}`}
              onMouseEnter={() => onActiveChange?.(idx)}
              onFocus={() => onActiveChange?.(idx)}
              onBlur={() => onActiveChange?.(null)}
              onClick={() => onActiveChange?.(isActive ? null : idx)}
              aria-pressed={isActive}
              title={`${item.label}: ${formatCurrency(item.amount)} (${item.percent}%)`}
            >
              <span className="fse-legend-left">
                <span className="fse-swatch" style={{ background: item.color }} />
                <span className="fse-legend-body">
                  <span className="fse-legend-name">{item.label}</span>
                  {showAmountInLegend && (
                    <span className="fse-legend-sub">
                      {item.percent}% · {formatCurrency(item.amount)}
                    </span>
                  )}
                </span>
              </span>
              <span className="fse-legend-val">
                {showAmountInLegend ? formatCurrency(item.amount) : `${item.percent}%`}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}
