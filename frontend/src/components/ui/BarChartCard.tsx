import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export function BarChartCard({
  data,
  incomeKey = 'income',
  expenseKey = 'expense',
  height = 320,
}: {
  data: { month: string; income: number; expense: number }[]
  incomeKey?: string
  expenseKey?: string
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fill: 'var(--chart-axis)', fontWeight: 600, fontSize: 11 }}
          axisLine={{ stroke: 'var(--border)', strokeWidth: 1 }}
          tickLine={{ stroke: 'var(--border)', strokeWidth: 1 }}
        />
        <YAxis
          tick={{ fill: 'var(--chart-axis)', fontWeight: 600, fontSize: 11 }}
          axisLine={{ stroke: 'var(--border)', strokeWidth: 1 }}
          tickLine={{ stroke: 'var(--border)', strokeWidth: 1 }}
        />
        <Tooltip
          cursor={{ fill: 'var(--border-subtle)' }}
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
        />
        <Legend
          wrapperStyle={{ fontWeight: 700, fontSize: 12, color: 'var(--text-secondary)' }}
        />
        <Bar dataKey={incomeKey} name="Income" fill="var(--chart-1)" stroke="var(--bg-page)" strokeWidth={1} radius={[2,2,0,0]} />
        <Bar dataKey={expenseKey} name="Expense" fill="var(--chart-2)" stroke="var(--bg-page)" strokeWidth={1} radius={[2,2,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
