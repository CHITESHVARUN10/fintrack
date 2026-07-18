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
}: {
  data: DonutDatum[]
  centerLabel?: string
  height?: number
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="relative" style={{ height, overflow: 'visible' }}>
      <ResponsiveContainer width="100%" height="100%" style={{ zIndex: 2, position: 'relative' }}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={2}
            stroke="#1e1c10"
            strokeWidth={3}
          >
            {data.map((d) => (
              <Cell key={d.label} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            wrapperStyle={{ zIndex: 9999, pointerEvents: 'none' }}
            contentStyle={{
              border: '3px solid #1e1c10',
              borderRadius: 0,
              boxShadow: '4px 4px 0 0 #1e1c10',
              fontFamily: 'Space Grotesk',
              fontWeight: 700,
            }}
            formatter={(value: number, name: string) => [`${value}%`, name]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div
        className="pointer-events-none"
        style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1 }}
      >
        <div className="brutal-thin bg-surface-container-high w-24 h-24 rounded-full flex flex-col items-center justify-center text-center">
          <span className="text-xs font-bold uppercase">{centerLabel}</span>
          <span className="text-sm font-bold">{total}%</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1 px-2">
        {data.map((d) => (
          <span
            key={d.label}
            className="flex items-center gap-1 text-xs font-bold text-on-surface"
          >
            <span
              className="inline-block w-3 h-3 border-2 border-on-surface"
              style={{ background: d.color }}
            />
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}
