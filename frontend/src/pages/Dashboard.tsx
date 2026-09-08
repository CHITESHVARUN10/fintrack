import { dashboardService } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { StatCard } from '../components/ui/StatCard'
import { Card, SectionTitle } from '../components/ui/Card'
import { Icon } from '../components/ui/Icon'
import { Button } from '../components/ui/Button'
import { DonutChart, type DonutDatum } from '../components/ui/DonutChart'
import { LoadingBlock } from '../components/ui/PageHeader'
import { formatCurrency, formatDate } from '../lib/format'

const BURN_COLORS = ['#FFE500', '#2EC4B6', '#E8487F', '#7B61FF', '#FF7A45', '#FFB347', '#6BCB77', '#4D96FF']

/**
 * Largest-remainder (Hamilton) normalization so rounded percentages sum to exactly 100.
 * Keeps underlying unrounded values for calculations; rounding only for presentation.
 * Preserves original order for display.
 */
function normalizeTo100(entries: { label: string; value: number }[], total: number): { label: string; value: number; percent: number; raw: number }[] {
  if (!entries.length || total <= 0) return entries.map(e => ({ ...e, percent: 0, raw: 0 }))
  const raws = entries.map(e => ({ label: e.label, value: e.value, raw: (e.value / total) * 100 }))
  const floors = raws.map(r => Math.floor(r.raw))
  const remainders = raws.map((r, i) => ({ idx: i, frac: r.raw - floors[i] }))
  let sumFloors = floors.reduce((a, b) => a + b, 0)
  let remaining = 100 - sumFloors
  // Sort by fractional part descending to distribute remaining points
  remainders.sort((a, b) => b.frac - a.frac)
  const resultPercents = [...floors]
  // Distribute one point at a time to largest remainders; if remaining negative (should not happen with floor) borrow from smallest remainders
  if (remaining > 0) {
    for (let i = 0; i < remaining && i < remainders.length; i++) {
      resultPercents[remainders[i].idx] += 1
    }
  } else if (remaining < 0) {
    // In case of floating weirdness, remove from smallest remainders
    remainders.sort((a, b) => a.frac - b.frac)
    for (let i = 0; i < Math.abs(remaining) && i < remainders.length; i++) {
      if (resultPercents[remainders[i].idx] > 0) resultPercents[remainders[i].idx] -= 1
    }
  }
  // Edge: if we have many entries and some floors are 0 but we still want to avoid 0% for non-zero values when possible,
  // largest remainder already handles it — the smallest non-zero will get 0 only if there are >100 categories or very tiny share.
  // For display, keep 0% but legend will still show the row with its amount; tooltip shows raw.
  return raws.map((r, i) => ({ label: r.label, value: r.value, raw: r.raw, percent: resultPercents[i] }))
}

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

  // Normalized percentages — ensures sum is exactly 100, center never shows 101%
  const normalizedCategories = normalizeTo100(burnEntries.map(([label, value]) => ({ label, value })), burnTotal)
  const donut: DonutDatum[] = normalizedCategories.map((e, i) => ({
    label: e.label,
    value: e.percent,
    color: BURN_COLORS[i % BURN_COLORS.length],
    // keep raw for tooltip if needed
  }))

  const vendorEntries: { label: string; value: number }[] = data.transactionVendorEntries || []
  const vendorTotal = vendorEntries.reduce((s, e) => s + e.value, 0)
  const normalizedVendors = normalizeTo100(vendorEntries.map(e => ({ label: e.label, value: e.value })), vendorTotal)
  const vendorDonut: DonutDatum[] = normalizedVendors.map((e, i) => ({
    label: e.label,
    value: e.percent,
    color: BURN_COLORS[i % BURN_COLORS.length],
  }))

  return (
    <div className="flex flex-col gap-xl min-w-0">
      <div className="flex flex-col sm:flex-row gap-sm sm:justify-between sm:items-end">
        <h2 className="text-4xl md:text-5xl font-bold uppercase tracking-tight text-on-surface">
          Overview
        </h2>
        <div className="font-bold text-on-surface-variant bg-surface-container-high px-sm py-xs brutal-thin w-fit max-w-full">
          Last updated: Just now
        </div>
      </div>

      {/* Stat cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md min-w-0">
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
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md lg:gap-xl min-w-0">
        <Card color="white" className="h-[420px] overflow-y-auto min-w-0">
          <h3 className="font-bold text-lg uppercase">Monthly Spend Breakdown</h3>
          <p className="text-xs font-bold text-on-surface-variant">From your transactions this month (individual)</p>
          {burnEntries.length === 0 ? (
            <p className="font-bold text-on-surface-variant mt-md">
              No transactions this month — import or add one.
            </p>
          ) : (
            <div className="flex flex-col gap-sm mt-md min-w-0">
              {burnEntries.map(([label, value]) => (
                <div key={label} className="flex flex-col gap-xs min-w-0">
                  <div className="flex justify-between items-center gap-sm min-w-0">
                    <span className="font-bold text-sm uppercase min-w-0 truncate">{label}</span>
                    <span className="font-bold text-sm whitespace-nowrap shrink-0">
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
          <div className="mt-lg pt-md border-t-[3px] border-on-surface flex flex-wrap justify-between items-center gap-sm">
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

        <Card color="white" className="h-[500px] flex flex-col overflow-hidden min-w-0">
          <h3 className="font-bold text-lg uppercase leading-none">Category Breakdown</h3>
          <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Your spend by category (transactions)</p>
          {donut.length === 0 ? (
            <p className="font-bold mt-md" style={{ color: 'var(--text-secondary)' }}>No data.</p>
          ) : (
            <>
              {/* Donut — fixed vertical region */}
              <div className="shrink-0 mt-2">
                <DonutChart data={donut} centerLabel="Total" height={200} />
              </div>
              {/* Legend — independent rows, scrolls internally, never overlaps */}
              <div className="flex-1 min-h-0 mt-3 pt-3 border-t flex flex-col" style={{ borderColor: 'var(--border)' }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 content-start overflow-y-auto custom-scrollbar pr-1 flex-1 min-h-0">
                  {normalizedCategories.map((d, i) => (
                    <div
                      key={`${d.label}-${i}`}
                      className="flex items-center gap-2 min-h-[38px] px-2 py-1.5 brutal-thin overflow-hidden"
                      style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}
                      title={`${d.label}: ${d.percent}% (₹${d.value.toLocaleString('en-IN')})`}
                    >
                      <span
                        className="w-3.5 h-3.5 shrink-0 border rounded-[2px]"
                        style={{ background: BURN_COLORS[i % BURN_COLORS.length], borderColor: 'var(--border)' }}
                      />
                      <span className="flex-1 min-w-0 truncate font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                        {d.label}
                      </span>
                      <span className="shrink-0 font-bold text-xs" style={{ color: 'var(--text-muted)' }}>
                        {d.percent}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </Card>

        <Card color="white" className="h-[500px] flex flex-col overflow-hidden min-w-0">
          <h3 className="font-bold text-lg uppercase leading-none">Vendor Breakdown</h3>
          <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Your top vendors this month</p>
          {vendorDonut.length === 0 ? (
            <p className="font-bold mt-md" style={{ color: 'var(--text-secondary)' }}>No vendor spend yet.</p>
          ) : (
            <>
              <div className="shrink-0 mt-2">
                <DonutChart data={vendorDonut} centerLabel="Total" height={200} />
              </div>
              <div className="flex-1 min-h-0 mt-3 pt-3 border-t flex flex-col overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-2">
                  {normalizedVendors.map((e, i) => {
                    const isUpi = /upi|@|UPI/.test(e.label)
                    const display = e.label.length > 28 ? `${e.label.slice(0, 20)}…${e.label.slice(-6)}` : e.label
                    return (
                      <div
                        key={`${e.label}-${i}`}
                        className="flex items-center gap-2 min-h-[44px] px-2 py-2 brutal-thin overflow-hidden"
                        style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}
                        title={`${e.label} — ${formatCurrency(e.value)} (${e.percent}%)`}
                      >
                        <span
                          className="w-3 h-3 shrink-0 rounded-[2px] border"
                          style={{ background: BURN_COLORS[i % BURN_COLORS.length], borderColor: 'var(--border)' }}
                        />
                        <span className="flex-1 min-w-0 font-bold text-xs leading-tight overflow-hidden">
                          <span className="block truncate" style={{ color: 'var(--text-primary)' }} title={e.label}>
                            {isUpi ? display : e.label}
                          </span>
                          <span className="block text-[10px] font-medium truncate" style={{ color: 'var(--text-muted)' }}>
                            {e.percent}% · {formatCurrency(e.value)}
                          </span>
                        </span>
                        <span className="shrink-0 font-bold text-xs whitespace-nowrap text-right min-w-[70px]" style={{ color: 'var(--text-primary)' }}>
                          {formatCurrency(e.value)}
                        </span>
                      </div>
                    )
                  })}
                </div>
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
