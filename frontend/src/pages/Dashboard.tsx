import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { dashboardService } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { Icon } from '../components/ui/Icon'
import { CountUp } from '../components/ui/CountUp'
import { LoadingBlock } from '../components/ui/PageHeader'
import { ChartPanel } from '../components/charts/ChartKit'
import { EntryTicks, type TickDatum } from '../components/entry-overview/EntryTicks'
import { formatCurrency, formatDate } from '../lib/format'
import { cn } from '../lib/cn'
import { Badge } from '../components/ui/Badge'
import './entry-overview.css'

const ledgerCurrency = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2,
})
const formatLedgerCurrency = (amount: number) => ledgerCurrency.format(amount)

const CAT_VARS = [
  'var(--fse-cat-1)',
  'var(--fse-cat-2)',
  'var(--fse-cat-3)',
  'var(--fse-cat-4)',
  'var(--fse-cat-5)',
  'var(--fse-cat-6)',
  'var(--fse-cat-7)',
  'var(--fse-cat-8)',
]
const VENDOR_VARS = [
  'var(--fse-ven-1)',
  'var(--fse-ven-2)',
  'var(--fse-ven-3)',
  'var(--fse-ven-4)',
  'var(--fse-ven-5)',
  'var(--fse-ven-6)',
  'var(--fse-ven-7)',
  'var(--fse-ven-8)',
]

/**
 * Largest-remainder (Hamilton) normalization so rounded percentages sum to
 * exactly 100. Keeps the unrounded raw share for tooltips; rounding only
 * happens for presentation, and original order is preserved.
 */
function normalizeTo100(
  entries: { label: string; value: number }[],
  total: number,
): { label: string; value: number; percent: number; raw: number }[] {
  if (!entries.length || total <= 0) return entries.map((e) => ({ ...e, percent: 0, raw: 0 }))
  const raws = entries.map((e) => ({ label: e.label, value: e.value, raw: (e.value / total) * 100 }))
  const floors = raws.map((r) => Math.floor(r.raw))
  const remainders = raws.map((r, i) => ({ idx: i, frac: r.raw - floors[i] }))
  const remaining = 100 - floors.reduce((a, b) => a + b, 0)
  const result = [...floors]
  remainders.sort((a, b) => b.frac - a.frac)
  if (remaining > 0) {
    for (let i = 0; i < remaining && i < remainders.length; i++) result[remainders[i].idx] += 1
  } else if (remaining < 0) {
    remainders.sort((a, b) => a.frac - b.frac)
    for (let i = 0; i < Math.abs(remaining) && i < remainders.length; i++) {
      if (result[remainders[i].idx] > 0) result[remainders[i].idx] -= 1
    }
  }
  return raws.map((r, i) => ({ label: r.label, value: r.value, raw: r.raw, percent: result[i] }))
}

const TYPE_META: Record<string, { icon: string; label: string }> = {
  subscription: { icon: 'subscriptions', label: 'Subscription' },
  loan: { icon: 'account_balance_wallet', label: 'Loan' },
  insurance: { icon: 'security', label: 'Insurance' },
  sip: { icon: 'show_chart', label: 'SIP' },
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

export function Dashboard() {
  const { activeMemberId, user, isAdmin, members } = useAuth()
  const selectedMember = isAdmin && activeMemberId !== user?.id ? activeMemberId : undefined
  const { data, loading, error } = useAsync(() => dashboardService.getSummary(selectedMember), [selectedMember])

  // Honest freshness: stamp the moment this payload arrived instead of a
  // permanent "just now" label. Keyed on the payload so each fetch re-stamps.
  const loadedAt = useMemo(() => (data ? new Date() : null), [data])

  const [activeCat, setActiveCat] = useState<number | null>(null)
  const [activeVendor, setActiveVendor] = useState<number | null>(null)
  const [activeBar, setActiveBar] = useState<string | null>(null)

  const memberName = useMemo(() => {
    const found = members?.find((m) => m.id === activeMemberId)
    return found?.name ?? user?.name ?? 'You'
  }, [members, activeMemberId, user?.name])

  const verification = useMemo(() => {
    if (!data) return null
    const txCategories: { label: string; value: number }[] =
      data.transactionCategoryEntries?.length > 0
        ? data.transactionCategoryEntries
        : Object.entries(data.transactionCategoryBreakdown || {}).map(([label, value]) => ({ label, value: Number(value) }))

    const categories = txCategories
      .filter((e) => e.value > 0)
      .slice()
      .sort((a, b) => b.value - a.value)
    const catTotal = categories.reduce((s, e) => s + e.value, 0)
    const maxCat = Math.max(...categories.map((e) => e.value), 1)
    const normalizedCats = normalizeTo100(categories, catTotal)

    const vendors = (data.transactionVendorEntries || []).filter((e) => e.value > 0)
    const vendorTotal = vendors.reduce((s, e) => s + e.value, 0)
    const normalizedVendors = normalizeTo100(vendors, vendorTotal)

    const catTicks: TickDatum[] = normalizedCats.map((e, i) => ({
      label: e.label,
      amount: e.value,
      percent: e.percent,
      color: CAT_VARS[i % CAT_VARS.length],
    }))
    const vendorTicks: TickDatum[] = normalizedVendors.map((e, i) => ({
      label: e.label,
      amount: e.value,
      percent: e.percent,
      color: VENDOR_VARS[i % VENDOR_VARS.length],
    }))

    return {
      categories,
      catTotal,
      maxCat,
      catTicks,
      vendorTicks,
      vendorTotal,
      actualSpend: data.transactionSpendThisMonth ?? data.adHocSpendThisMonth ?? 0,
      txnCount: data.transactionCountThisMonth ?? 0,
    }
  }, [data])

  if (loading) return <LoadingBlock label="Loading dashboard…" />
  if (error)
    return (
      <div className="fse-error" role="alert">
        Could not load dashboard.
      </div>
    )
  if (!data || !verification) return <div className="fse-empty">No dashboard data available.</div>

  const { categories, catTotal, maxCat, catTicks, vendorTicks, vendorTotal, actualSpend, txnCount } = verification
  const received = data.receivedIncomeThisMonth ?? 0
  const spent = data.spentThisMonth ?? actualSpend
  const net = Math.round((received - spent) * 100) / 100
  const visibleBars = categories.slice(0, 6)
  const hiddenBars = categories.length - visibleBars.length

  const chips: { label: string; color: 'yellow' | 'surface' | 'white' }[] = [
    { label: `Subscriptions: ${formatCurrency(data.monthlyBurnBreakdown?.Subscriptions || 0)}/mo`, color: 'yellow' },
    { label: `Investments SIP: ${formatCurrency(data.monthlyBurnBreakdown?.Investments || 0)}/mo`, color: 'surface' },
  ]

  return (
    <div className="fse-dash">
      <div className="fse-dash-head">
        <h1 className="fse-page-h1">Overview</h1>
        <div className="fse-live" title={loadedAt?.toLocaleString('en-IN')}>
          <span className="fse-live-dot" aria-hidden="true" />
          <span>
            Updated{' '}
            {loadedAt
              ? loadedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
              : '—'}{' '}
            · {memberName}
          </span>
        </div>
      </div>

      <section className="fse-kpis" aria-label="Key financial metrics">
        <div className="fse-kpi is-accent">
          <div className="fse-kpi-top">
            <span className="fse-kpi-label">Income Received This Month</span>
            <Icon name="account_balance_wallet" className="text-[18px]" aria-hidden="true" />
          </div>
          <div className="fse-kpi-value">
            <CountUp value={received} format={formatLedgerCurrency} />
          </div>
        </div>

        <div className="fse-kpi">
          <div className="fse-kpi-top">
            <span className="fse-kpi-label">Spent This Month</span>
            <Icon name="shopping_cart" className="text-[18px]" aria-hidden="true" />
          </div>
          <div className="fse-kpi-value">
            <CountUp value={spent} format={formatLedgerCurrency} />
          </div>
        </div>

        <div className="fse-kpi is-cyan">
          <div className="fse-kpi-top">
            <span className="fse-kpi-label">Investments Worth</span>
            <Icon name="show_chart" className="text-[18px]" aria-hidden="true" />
          </div>
          <div className="fse-kpi-value">
            <CountUp value={data.investmentPortfolioValue.totalCurrentValue} format={formatCurrency} />
          </div>
        </div>

        <div className="fse-kpi">
          <div className="fse-kpi-top">
            <span className="fse-kpi-label">Net This Month</span>
            <Icon name="savings" className="text-[18px]" aria-hidden="true" />
          </div>
          <div className="fse-kpi-value">
            <CountUp value={net} format={formatLedgerCurrency} />
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 2 }}>
            {received > 0
              ? `${Math.round(net / received * 100)}% of income`
              : 'No income this month'}
          </div>
        </div>
      </section>

      <section className="fse-analytics" aria-label="Spend analytics">
        <ChartPanel className="min-w-0">
          <div className="fse-panel">
            <div className="fse-panel-head">
              <h2>Monthly Spend Breakdown</h2>
              <p className="fse-panel-sub">From your transactions this month (individual)</p>
            </div>

            {categories.length === 0 ? (
              <p className="fse-empty">
                No transactions this month — import a statement or add one to see the breakdown.
              </p>
            ) : (
              <div className="fse-bars">
                {visibleBars.map((c, i) => {
                  const pct = Math.max(4, Math.round((c.value / maxCat) * 100))
                  const isActive = activeBar === c.label
                  const color = CAT_VARS[i % CAT_VARS.length]
                  return (
                    <button
                      key={c.label}
                      type="button"
                      className={cn('fse-bar-row', isActive && 'is-active')}
                      onMouseEnter={() => setActiveBar(c.label)}
                      onMouseLeave={() => setActiveBar(null)}
                      onFocus={() => setActiveBar(c.label)}
                      onBlur={() => setActiveBar(null)}
                      aria-pressed={isActive}
                      title={`${c.label}: ${formatCurrency(c.value)}`}
                    >
                      <span className="fse-bar-top">
                        <span className="fse-bar-cat">
                          <span className="fse-swatch" style={{ background: color }} />
                          <span>{c.label}</span>
                        </span>
                        <span className="fse-bar-amt">{formatCurrency(c.value)}</span>
                      </span>
                      <span className="fse-bar-track" aria-hidden="true">
                        <span
                          className="fse-bar-fill"
                          style={{ display: 'block', width: `${pct}%`, background: color }}
                        />
                      </span>
                    </button>
                  )
                })}
                {hiddenBars > 0 && (
                  <span className="fse-more">+{hiddenBars} more categories — open Transactions for all</span>
                )}
              </div>
            )}

            <div className="fse-panel-foot">
              <span className="fse-kicker">Actual spend (transactions) this month</span>
              <div className="fse-spend-line">
                <span className="fse-spend-val">{formatCurrency(actualSpend)}</span>
                <span className="fse-spend-count">{txnCount} txns</span>
              </div>
              <div className="fse-chips">
                {chips.map((c) => (
                  <Badge key={c.label} color={c.color}>{c.label}</Badge>
                ))}
              </div>
            </div>
          </div>
        </ChartPanel>

        <ChartPanel className="min-w-0" delay={0.06}>
          <div className="fse-panel">
            <div className="fse-panel-head">
              <h2>Category Breakdown</h2>
              <p className="fse-panel-sub">Your spend by category (transactions)</p>
            </div>
            <EntryTicks
              items={catTicks}
              total={catTotal}
              totalLabel="Total spend"
              activeIndex={activeCat}
              onActiveChange={setActiveCat}
            />
          </div>
        </ChartPanel>

        <ChartPanel className="min-w-0" delay={0.12}>
          <div className="fse-panel">
            <div className="fse-panel-head">
              <h2>Vendor Breakdown</h2>
              <p className="fse-panel-sub">Your top vendors this month</p>
            </div>
            <EntryTicks
              items={vendorTicks}
              total={vendorTotal}
              totalLabel="Top vendors"
              showAmountInLegend
              activeIndex={activeVendor}
              onActiveChange={setActiveVendor}
            />
          </div>
        </ChartPanel>
      </section>

      <section aria-label="Upcoming payments">
        <div className="fse-upcoming-head">
          <h2>Upcoming Payments</h2>
          <div className="fse-upcoming-actions">
            {data.upcomingPayments.length > 0 && (
              <Badge color="surface">{data.upcomingPayments.length} due this week</Badge>
            )}
            <Link to="/subscriptions" className="fse-text-link">View All →</Link>
          </div>
        </div>

        {data.upcomingPayments.length === 0 ? (
          <p className="fse-empty">No payments due in the next 7 days.</p>
        ) : (
          <div className="fse-strip">
            {data.upcomingPayments.map((p) => {
              const dueIn = daysUntil(p.dueDate)
              const meta = TYPE_META[p.type] ?? { icon: 'payments', label: p.type || 'Payment' }
              const urgent = dueIn <= 5
              const target = p.type === 'subscription' ? `/subscriptions/${p.id}` : '/investments'
              return (
                <article key={p.id} className={cn('fse-upcoming', urgent && 'is-accent')}>
                  <div className="fse-upcoming-top">
                    <div className="fse-upcoming-title">
                      <span className="fse-upcoming-icon">
                        <Icon name={meta.icon} className="text-base" aria-hidden="true" />
                      </span>
                      <span className="fse-upcoming-name">{p.name}</span>
                    </div>
                    <Badge color={urgent ? 'error' : 'surface'}>
                      {urgent ? `Due in ${Math.max(dueIn, 0)}d` : 'Upcoming'}
                    </Badge>
                  </div>
                  <div className="fse-upcoming-amt">{formatCurrency(p.amount)}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span
                      className="fse-kicker"
                      style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11 }}
                    >
                      {meta.label} · due {formatDate(p.dueDate)}
                    </span>
                    <Link to={target} className="fin-button fse-btn is-sm is-block">
                      Review {p.type === 'subscription' ? 'subscription' : 'payment'}
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* Member switching lives in the shared shell header (Header.tsx), which
          reads the same activeMemberId this page fetches against. */}
    </div>
  )
}
