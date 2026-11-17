import { useId, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { motion, useReducedMotion } from 'framer-motion'
import { CountUp } from '../ui/CountUp'
import { AXIS_TICK, compactINR, sharePct, CAT_COLORS } from './chartTheme'

// Shared chart language: thin coloured lines, gradient fills that fall to
// nothing, a dotted horizontal grid, and one floating tooltip card. The
// brutalist frame stays outside the plot; the data ink stays quiet.

// Tooltip payload is intentionally loose: recharts types differ per chart.
interface TooltipPayload {
  name?: string | number
  value?: number | string
  color?: string
  dataKey?: string | number
  payload?: Record<string, unknown>
}

export function ChartTooltip({
  active,
  payload,
  label,
  valueFormat = compactINR,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string | number
  valueFormat?: (n: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="nb-chart-tooltip" role="status">
      {label != null && label !== '' && <div className="nb-chart-tooltip-label">{label}</div>}
      {payload.map((p, i) => {
        const raw = typeof p.value === 'number' ? p.value : Number(p.value ?? 0)
        const share = p.payload?.sharePct
        const bar = p.payload?.fill as string | undefined
        return (
          <div className="nb-chart-tooltip-row" key={`${p.dataKey ?? p.name ?? i}`}>
            <span
              className="nb-chart-tooltip-dot"
              style={{ background: p.color || bar || 'var(--chart-1)' }}
            />
            <span className="nb-chart-tooltip-name">{p.name}</span>
            <span className="nb-chart-tooltip-value">
              {valueFormat(raw)}
              {share != null && <span className="nb-chart-tooltip-share">{Number(share).toFixed(1)}%</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export interface TrendSeries {
  key: string
  name: string
  color: string
  /** Fill colour; defaults to the stroke colour. */
  fill?: string
}

export function AreaTrend({
  data,
  xKey,
  series,
  height = 260,
  valueFormat = compactINR,
  legend = true,
  dotGrid = false,
}: {
  data: object[]
  xKey: string
  series: TrendSeries[]
  height?: number
  valueFormat?: (n: number) => string
  legend?: boolean
  dotGrid?: boolean
}) {
  const reduce = useReducedMotion()
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <div className="min-w-0">
      {legend && (
        <div className="nb-chart-legend">
          {series.map((s) => (
            <span className="nb-chart-legend-item" key={s.key}>
              <span className="nb-chart-legend-line" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div className={dotGrid ? 'nb-chart-dots' : undefined} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 6, left: -10, bottom: 0 }}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.key} id={`${uid}-fill-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.fill ?? s.color} stopOpacity={0.34} />
                  <stop offset="65%" stopColor={s.fill ?? s.color} stopOpacity={0.08} />
                  <stop offset="100%" stopColor={s.fill ?? s.color} stopOpacity={0.01} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="2 6" vertical={false} />
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              tickMargin={10}
              minTickGap={22}
              interval="preserveStartEnd"
            />
            <YAxis
              width={46}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              tickFormatter={valueFormat}
            />
            <Tooltip
              cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4', strokeOpacity: 0.35 }}
              content={<ChartTooltip valueFormat={valueFormat} />}
            />
            {series.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                fill={`url(#${uid}-fill-${i})`}
                fillOpacity={1}
                dot={
                  data.length === 1
                    ? { r: 3.5, strokeWidth: 2, stroke: s.color, fill: 'var(--bg-card)' }
                    : false
                }
                activeDot={{ r: 4, strokeWidth: 2, stroke: s.color, fill: 'var(--bg-card)' }}
                animationDuration={reduce ? 0 : 760}
                animationBegin={reduce ? 0 : 60 + i * 120}
                animationEasing="ease-out"
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export interface ShareDatum {
  label: string
  value: number
}

export function ShareDonut({
  data,
  colors = CAT_COLORS,
  height = 240,
  centerLabel = 'Total',
  centerValue,
  centerFormat = compactINR,
  centerCaption,
  legend = true,
  valueFormat = compactINR,
}: {
  data: ShareDatum[]
  colors?: string[]
  height?: number
  centerLabel?: string
  centerValue?: number
  centerFormat?: (n: number) => string
  centerCaption?: string
  legend?: boolean
  valueFormat?: (n: number) => string
}) {
  const reduce = useReducedMotion()
  const [active, setActive] = useState<number | null>(null)
  const total = data.reduce((s, d) => s + d.value, 0)
  const center = centerValue ?? total

  return (
    <div className="min-w-0">
      <div className="relative min-w-0" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={data.length === 1 ? 0 : 1.5}
              cornerRadius={3}
              stroke="var(--bg-card)"
              strokeWidth={2}
              onMouseEnter={(_, i) => setActive(i)}
              onMouseLeave={() => setActive(null)}
              animationDuration={reduce ? 0 : 820}
              animationEasing="ease-out"
            >
              {data.map((d, i) => (
                <Cell
                  key={d.label}
                  fill={colors[i % colors.length]}
                  className="nb-chart-slice"
                  style={{ opacity: active == null || active === i ? 1 : 0.28 }}
                />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip valueFormat={valueFormat} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
            {centerLabel}
          </span>
          <span className="text-xl font-bold tabular-nums leading-tight" style={{ color: 'var(--text-primary)' }}>
            <CountUp value={center} format={centerFormat} />
          </span>
          <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
            {centerCaption ?? `${sharePct(center, total)} of ${valueFormat(total)}`}
          </span>
        </div>
      </div>
      {legend && (
        <div className="nb-chart-legend nb-chart-legend-wrap mt-2">
          {data.map((d, i) => (
            <span className="nb-chart-legend-item" key={d.label}>
              <span className="nb-chart-legend-dot" style={{ background: colors[i % colors.length] }} />
              <span className="truncate max-w-[110px]" title={d.label}>{d.label}</span>
              <span className="opacity-60 tabular-nums">{sharePct(d.value, total)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function BarRank({
  data,
  categoryKey,
  valueKey,
  color = 'var(--chart-1)',
  height = 280,
  horizontal = true,
  valueFormat = compactINR,
  labelWidth = 88,
}: {
  data: object[]
  categoryKey: string
  valueKey: string
  color?: string
  height?: number
  horizontal?: boolean
  valueFormat?: (n: number) => string
  labelWidth?: number
}) {
  const reduce = useReducedMotion()
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <div style={{ height }} className="min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        {horizontal ? (
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`${uid}-bar`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={color} stopOpacity={0.72} />
                <stop offset="100%" stopColor={color} stopOpacity={1} />
              </linearGradient>
            </defs>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey={categoryKey}
              width={labelWidth}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
            />
            <Tooltip
              cursor={{ fill: 'var(--chart-grid)' }}
              content={<ChartTooltip valueFormat={valueFormat} />}
            />
            <Bar
              dataKey={valueKey}
              fill={`url(#${uid}-bar)`}
              radius={[0, 4, 4, 0]}
              barSize={12}
              background={{ fill: 'var(--bg-elevated)', radius: 4 }}
              animationDuration={reduce ? 0 : 700}
              animationEasing="ease-out"
            >
              <LabelList
                dataKey={valueKey}
                position="right"
                formatter={(value: number) => valueFormat(value)}
                style={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 700 }}
              />
            </Bar>
          </BarChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 6, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id={`${uid}-bar`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={1} />
                <stop offset="100%" stopColor={color} stopOpacity={0.55} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey={categoryKey} tickLine={false} axisLine={false} tick={AXIS_TICK} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={valueFormat} width={46} />
            <Tooltip
              cursor={{ fill: 'var(--chart-grid)' }}
              content={<ChartTooltip valueFormat={valueFormat} />}
            />
            <Bar
              dataKey={valueKey}
              fill={`url(#${uid}-bar)`}
              radius={[4, 4, 0, 0]}
              maxBarSize={46}
              animationDuration={reduce ? 0 : 700}
              animationEasing="ease-out"
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

// A single authored moment for the overview: the panel itself rises once.
export function ChartPanel({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-30px' }}
      transition={{ duration: 0.35, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}
