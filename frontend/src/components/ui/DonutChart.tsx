import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

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
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
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
            contentStyle={{
              border: '3px solid #1e1c10',
              borderRadius: 0,
              boxShadow: '4px 4px 0 0 #1e1c10',
              fontFamily: 'Space Grotesk',
              fontWeight: 700,
            }}
            formatter={(value: number, name: string) => [`${value}%`, name]}
          />
          <Legend
            wrapperStyle={{ fontWeight: 700, fontSize: 12 }}
            iconType="square"
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="brutal-thin bg-surface-container-high w-24 h-24 rounded-full flex flex-col items-center justify-center text-center">
          <span className="text-xs font-bold uppercase">{centerLabel}</span>
          <span className="text-sm font-bold">{total}%</span>
        </div>
      </div>
    </div>
  )
}
