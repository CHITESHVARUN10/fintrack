import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

export interface DonutDatum {
  label: string
  value: number
  color: string
}

export function DonutChart({
  data,
  centerLabel = 'Total',
  height = 240,
  showLegend = false,
}: {
  data: DonutDatum[]
  centerLabel?: string
  height?: number
  showLegend?: boolean
}) {
  // Center total is sum of normalized percents — must be exactly 100 for complete distribution
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="flex flex-col items-center w-full">
      <div className="relative w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" style={{ zIndex: 2, position: 'relative' }}>
          <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={2}
            stroke="var(--border)"
            strokeWidth={2}
          >
            {data.map((d) => (
              <Cell key={d.label} fill={d.color} stroke="var(--border)" strokeWidth={1.5} />
            ))}
            </Pie>
            <Tooltip
              wrapperStyle={{ zIndex: 9999, pointerEvents: 'none' }}
              contentStyle={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 0,
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                fontFamily: 'Space Grotesk',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
              labelStyle={{ color: 'var(--text-secondary)' }}
              itemStyle={{ color: 'var(--text-primary)' }}
              formatter={(value: number, name: string) => [`${value}%`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div
          className="pointer-events-none"
          style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1 }}
        >
          <div
            className="w-24 h-24 rounded-full flex flex-col items-center justify-center text-center"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          >
            <span className="text-xs font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>{centerLabel}</span>
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{total}%</span>
          </div>
        </div>
      </div>
      {showLegend && (
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 mt-3 px-2 w-full">
          {data.map((d) => (
            <span
              key={d.label}
              className="flex items-center gap-1.5 text-xs font-bold"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span
                className="inline-block w-3 h-3 rounded-[2px] shrink-0"
                style={{ background: d.color, border: '1px solid var(--border)' }}
              />
              <span className="truncate max-w-[90px]" style={{ color: 'var(--text-primary)' }} title={d.label}>{d.label}</span>
              <span style={{ color: 'var(--text-muted)' }}>{d.value}%</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
