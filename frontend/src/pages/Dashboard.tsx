import { dashboardService } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { StatCard } from '../components/ui/StatCard'
import { Card, SectionTitle } from '../components/ui/Card'
import { Icon } from '../components/ui/Icon'
import { Button } from '../components/ui/Button'
import { DonutChart, type DonutDatum } from '../components/ui/DonutChart'
import { LoadingBlock } from '../components/ui/PageHeader'
import { formatCurrency, formatDate } from '../lib/format'

const BURN_COLORS = ['#FFE500', '#00fcfb', '#1e1c10', '#FF6B6B', '#9b5de5', '#00bbf9']

const TYPE_META: Record<string, { icon: string; bg: string }> = {
  subscription: { icon: 'subscriptions', bg: 'bg-brand-yellow' },
  loan: { icon: 'account_balance_wallet', bg: 'bg-white' },
  insurance: { icon: 'security', bg: 'bg-tertiary-container' },
  sip: { icon: 'show_chart', bg: 'bg-white' },
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

export function Dashboard() {
  const { data, loading, error } = useAsync(() => dashboardService.getSummary(), [])

  if (loading || !data) return <LoadingBlock label="Loading dashboard…" />
  if (error)
    return (
      <div className="border-[3px] border-on-surface bg-red-100 p-md font-bold">
        Could not load dashboard.
      </div>
    )

  // Use transaction data for individual (current month) — fallback to old burn breakdown
  const txCategoryEntries: { label: string; value: number }[] =
    (data.transactionCategoryEntries && data.transactionCategoryEntries.length > 0
      ? data.transactionCategoryEntries
      : Object.entries(data.monthlyBurnBreakdown).map(([label, value]) => ({ label, value: value as number }))) as any
  const burnEntries = txCategoryEntries
    .map((e: any) => [e.label, e.value] as [string, number])
    .filter(([, v]) => v > 0)
  const burnTotal = burnEntries.reduce((s, [, v]) => s + v, 0)
  const maxBurn = Math.max(...burnEntries.map(([, v]) => v), 1)

  const donut: DonutDatum[] = burnEntries.map(([label, value], i) => ({
    label,
    value: burnTotal ? Math.round((value / burnTotal) * 100) : 0,
    color: BURN_COLORS[i % BURN_COLORS.length],
  }))

  const vendorEntries: { label: string; value: number }[] = data.transactionVendorEntries || []
  const vendorTotal = vendorEntries.reduce((s, e) => s + e.value, 0)
  const vendorDonut: DonutDatum[] = vendorEntries.map((e, i) => ({
    label: e.label,
    value: vendorTotal ? Math.round((e.value / vendorTotal) * 100) : 0,
    color: BURN_COLORS[i % BURN_COLORS.length],
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
          valueNumber={data.monthlyIncome}
          icon="account_balance_wallet"
          color="yellow"
          stagger={0}
        />
        <StatCard
          label="Monthly Outflow"
          value={formatCurrency(data.monthlyObligations)}
          valueNumber={data.monthlyObligations}
          icon="shopping_cart"
          color="white"
          stagger={60}
        />
        <StatCard
          label="Investments Worth"
          value={formatCurrency(data.investmentPortfolioValue.totalCurrentValue)}
          valueNumber={data.investmentPortfolioValue.totalCurrentValue}
          icon="show_chart"
          color="cyan"
          stagger={120}
        />
        <StatCard
          label="Net Monthly Savings"
          value={formatCurrency(data.netMonthlyFlow)}
          valueNumber={data.netMonthlyFlow}
          icon="savings"
          color="white"
          stagger={180}
        />
      </section>

      {/* Charts — transaction based, individual */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-md lg:gap-xl">
        <Card color="white" className="h-[420px] overflow-y-auto">
          <h3 className="font-bold text-lg uppercase">Monthly Spend Breakdown</h3>
          <p className="text-xs font-bold text-on-surface-variant">From your transactions this month (individual)</p>
          {burnEntries.length === 0 ? (
            <p className="font-bold text-on-surface-variant mt-md">
              No transactions this month — import or add one.
            </p>
          ) : (
            <div className="flex flex-col gap-sm mt-md">
              {burnEntries.map(([label, value]) => (
                <div key={label} className="flex flex-col gap-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm uppercase">{label}</span>
                    <span className="font-bold text-sm">
                      {formatCurrency(value)}
                    </span>
                  </div>
                  <div className="h-4 bg-surface-variant brutal-thin">
                    <div
                      className="h-full bg-on-surface"
                      style={{ width: `${(value / maxBurn) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-lg pt-md border-t-[3px] border-on-surface flex justify-between items-center">
            <span className="font-bold text-xs uppercase text-on-surface-variant">
              Actual Spend (Transactions) this month
            </span>
            <span className="font-bold">
              {formatCurrency(data.transactionSpendThisMonth ?? data.adHocSpendThisMonth)}
              <span className="text-xs font-normal"> · {data.transactionCountThisMonth ?? 0} txns</span>
            </span>
          </div>
          <div className="mt-sm flex flex-wrap gap-xs text-xs font-bold">
            <span className="brutal-thin bg-brand-yellow px-2 py-1">Subscriptions: {formatCurrency(data.monthlyBurnBreakdown?.Subscriptions || 0)}/mo</span>
            <span className="brutal-thin bg-white px-2 py-1">Recurring: {formatCurrency(data.monthlyBurnBreakdown?.Recurring || 0)}/mo</span>
            <span className="brutal-thin bg-surface-variant px-2 py-1">Investments SIP: {formatCurrency(data.monthlyBurnBreakdown?.Investments || 0)}/mo</span>
          </div>
        </Card>

        <Card color="surface" className="min-h-[420px] flex flex-col overflow-hidden">
          <h3 className="font-bold text-lg uppercase mb-2">Category Breakdown</h3>
          <p className="text-xs font-bold text-on-surface-variant">Your spend by category (transactions)</p>
          {donut.length === 0 ? (
            <p className="font-bold text-on-surface-variant mt-md">No data.</p>
          ) : (
            <>
              <DonutChart data={donut} centerLabel="Total" />
              <div className="grid grid-cols-2 gap-xs mt-2">
                {donut.map((d) => (
                  <div
                    key={d.label}
                    className="flex items-center gap-xs p-xs bg-white brutal-thin"
                  >
                    <div
                      className="w-4 h-4 brutal-thin"
                      style={{ background: d.color }}
                    />
                    <span className="font-bold text-xs">
                      {d.label} ({d.value}%)
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card color="white" className="min-h-[420px] flex flex-col overflow-hidden">
          <h3 className="font-bold text-lg uppercase mb-2">Vendor Breakdown</h3>
          <p className="text-xs font-bold text-on-surface-variant">Your top vendors this month</p>
          {vendorDonut.length === 0 ? (
            <p className="font-bold text-on-surface-variant mt-md">No vendor spend yet.</p>
          ) : (
            <>
              <DonutChart data={vendorDonut} centerLabel="Vendors" />
              <div className="flex flex-col gap-xs mt-2 max-h-[140px] overflow-y-auto">
                {vendorEntries.map((e) => (
                  <div key={e.label} className="flex justify-between items-center bg-surface-variant brutal-thin px-2 py-1">
                    <span className="font-bold text-xs truncate pr-2">{e.label}</span>
                    <span className="font-bold text-xs">{formatCurrency(e.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
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
        {data.upcomingPayments.length === 0 ? (
          <p className="font-bold text-on-surface-variant">
            No payments due in the next 7 days.
          </p>
        ) : (
          <div className="flex gap-md overflow-x-auto no-scrollbar pb-sm pt-xs pl-xs -ml-xs">
            {data.upcomingPayments.map((p) => {
              const dueInDays = daysUntil(p.dueDate)
              const meta = TYPE_META[p.type] ?? {
                icon: 'payments',
                bg: 'bg-surface-variant',
              }
              const action = dueInDays <= 5 ? 'Pay Now' : 'Schedule'
              return (
                <div
                  key={p.id}
                  className={`min-w-[280px] brutal p-md flex flex-col gap-sm nb-card-enter nb-card-hover cursor-pointer ${meta.bg}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-xs">
                      <div className="w-10 h-10 bg-surface-variant brutal-thin flex items-center justify-center">
                        <Icon name={meta.icon} />
                      </div>
                      <span className="font-bold">{p.name}</span>
                    </div>
                    <span
                      className={`border-2 border-on-surface px-2 py-1 font-bold text-xs ${
                        dueInDays <= 5
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-white'
                      }`}
                    >
                      Due {formatDate(p.dueDate)}
                    </span>
                  </div>
                  <div className="font-bold text-2xl mt-sm">
                    {formatCurrency(p.amount)}
                  </div>
                  <Button
                    variant={action === 'Pay Now' ? 'primary' : 'white'}
                    size="sm"
                    block
                  >
                    {action}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
