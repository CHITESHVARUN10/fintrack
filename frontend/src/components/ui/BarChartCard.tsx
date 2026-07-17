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
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="0" stroke="#1e1c10" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fill: '#1e1c10', fontWeight: 700, fontSize: 12 }}
          axisLine={{ stroke: '#1e1c10', strokeWidth: 3 }}
          tickLine={{ stroke: '#1e1c10', strokeWidth: 3 }}
        />
        <YAxis
          tick={{ fill: '#1e1c10', fontWeight: 700, fontSize: 12 }}
          axisLine={{ stroke: '#1e1c10', strokeWidth: 3 }}
          tickLine={{ stroke: '#1e1c10', strokeWidth: 3 }}
        />
        <Tooltip
          cursor={{ fill: 'rgba(30,28,16,0.06)' }}
          contentStyle={{
            border: '3px solid #1e1c10',
            borderRadius: 0,
            boxShadow: '4px 4px 0 0 #1e1c10',
            fontFamily: 'Space Grotesk',
            fontWeight: 700,
          }}
        />
        <Legend
          wrapperStyle={{ fontWeight: 700, fontSize: 12 }}
        />
        <Bar dataKey={incomeKey} name="Income" fill="#FFE500" stroke="#1e1c10" strokeWidth={3} />
        <Bar dataKey={expenseKey} name="Expense" fill="#1e1c10" stroke="#1e1c10" strokeWidth={3} />
      </BarChart>
    </ResponsiveContainer>
  )
}
