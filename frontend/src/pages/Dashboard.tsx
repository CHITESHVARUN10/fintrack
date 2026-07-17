import { dashboardService } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { StatCard } from '../components/ui/StatCard'
import { Card, SectionTitle } from '../components/ui/Card'
import { Icon } from '../components/ui/Icon'
import { Button } from '../components/ui/Button'
import { BarChartCard } from '../components/ui/BarChartCard'
import { DonutChart, type DonutDatum } from '../components/ui/DonutChart'
import { LoadingBlock } from '../components/ui/PageHeader'
import { formatCurrency } from '../lib/format'
import type { UpcomingPayment } from '../types'

const colorMap: Record<UpcomingPayment['color'], string> = {
  white: 'bg-white',
  yellow: 'bg-brand-yellow',
  cyan: 'bg-tertiary-container',
  error: 'bg-error-container',
}

export function Dashboard() {
  const { data, loading } = useAsync(() => dashboardService.getSummary(), [])

  if (loading || !data) return <LoadingBlock label="Loading dashboard…" />

  const donut: DonutDatum[] = data.breakdown.map((b) => ({
    label: b.label,
    value: b.value,
    color: b.color,
  }))

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex justify-between items-end">
        <h2 className="text-4xl md:text-5xl font-bold uppercase tracking-tight text-on-surface">
          Overview
        </h2>
        <div className="font-bold text-on-surface-variant bg-surface-container-high px-sm py-xs brutal-thin">
          Last updated: Just now
        </div>
      </div>

      {/* Stat cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md">
        <StatCard
          label="Monthly Income"
          value={formatCurrency(data.monthlyIncome)}
          delta={data.deltas.income}
          icon="account_balance_wallet"
          color="yellow"
        />
        <StatCard
          label="Total Outflow"
          value={formatCurrency(data.monthlyOutflow)}
          delta={data.deltas.outflow}
          icon="shopping_cart"
          color="white"
        />
        <StatCard
          label="Investments Worth"
          value={formatCurrency(data.investmentsWorth)}
          delta={data.deltas.investments}
          icon="show_chart"
          color="cyan"
        />
        <StatCard
          label="Net Savings"
          value={formatCurrency(data.netSavings)}
          delta={data.deltas.savings}
          icon="savings"
          color="white"
        />
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-md lg:gap-xl">
        <Card color="white" className="lg:col-span-2 h-[400px]">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-lg uppercase">Income vs Expense</h3>
            <div className="flex gap-sm">
              <div className="flex items-center gap-xs">
                <div className="w-4 h-4 bg-brand-yellow brutal-thin" />
                <span className="font-bold text-xs">Income</span>
              </div>
              <div className="flex items-center gap-xs">
                <div className="w-4 h-4 bg-on-surface brutal-thin" />
                <span className="font-bold text-xs">Expense</span>
              </div>
            </div>
          </div>
          <div className="flex-grow mt-2">
            <BarChartCard data={data.incomeVsExpense} />
          </div>
        </Card>

        <Card color="surface" className="h-[400px]">
          <h3 className="font-bold text-lg uppercase">Breakdown</h3>
          <DonutChart data={donut} centerLabel="Total" />
          <div className="grid grid-cols-2 gap-xs mt-2">
            {data.breakdown.map((b) => (
              <div key={b.label} className="flex items-center gap-xs p-xs bg-white brutal-thin">
                <div
                  className="w-4 h-4 brutal-thin"
                  style={{ background: b.color }}
                />
                <span className="font-bold text-xs">
                  {b.label} ({b.value}%)
                </span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* Upcoming payments */}
      <section className="flex flex-col gap-md pb-xl">
        <SectionTitle
          action={
            <a className="font-bold underline hover:bg-brand-yellow px-1" href="#">
              View All
            </a>
          }
        >
          Upcoming Payments
        </SectionTitle>
        <div className="flex gap-md overflow-x-auto no-scrollbar pb-sm pt-xs pl-xs -ml-xs">
          {data.upcomingPayments.map((p) => (
            <div
              key={p.id}
              className={`min-w-[280px] brutal p-md flex flex-col gap-sm brutal-hover transition-brutal cursor-pointer ${colorMap[p.color]}`}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-xs">
                  <div className="w-10 h-10 bg-surface-variant brutal-thin flex items-center justify-center">
                    <Icon name={p.icon} />
                  </div>
                  <span className="font-bold">{p.name}</span>
                </div>
                <span
                  className={`border-2 border-on-surface px-2 py-1 font-bold text-xs ${
                    p.dueInDays <= 5
                      ? 'bg-error-container text-on-error-container'
                      : 'bg-white'
                  }`}
                >
                  Due in {p.dueInDays} days
                </span>
              </div>
              <div className="font-bold text-2xl mt-sm">{formatCurrency(p.amount)}</div>
              <Button
                variant={p.action === 'Pay Now' ? 'primary' : 'white'}
                size="sm"
                block
              >
                {p.action}
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
