import { useState } from 'react'
import { Link } from 'react-router-dom'
import { investmentService } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { formatCurrency, formatCompact } from '../lib/format'
import type { Investment } from '../types'

type Tab = 'all' | 'stock' | 'mf_sip' | 'fd' | 'real_estate'

const tabLabel: Record<Tab, string> = {
  all: 'All',
  stock: 'Stocks',
  mf_sip: 'Mutual Funds / SIP',
  fd: 'Fixed Deposits',
  real_estate: 'Real Estate',
}

function gainLoss(inv: Investment) {
  const g = inv.currentValue - inv.totalInvested
  return { g, pct: inv.totalInvested ? (g / inv.totalInvested) * 100 : 0 }
}

function InvestmentCard({ inv }: { inv: Investment }) {
  const { g, pct } = gainLoss(inv)
  const positive = g >= 0
  return (
    <div className="bg-white brutal p-md flex flex-col gap-3">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-bold">{inv.title}</h3>
          <span className="text-xs text-on-surface-variant uppercase">{inv.investmentType.replace('_', ' ')}</span>
        </div>
        <Badge color={positive ? 'cyan' : 'error'}>
          {positive ? '+' : ''}
          {pct.toFixed(1)}%
        </Badge>
      </div>

      {inv.ticker && (
        <div className="text-xs font-bold text-on-surface-variant">{inv.ticker}</div>
      )}

      <div className="grid grid-cols-2 gap-2 text-sm">
        {inv.quantity != null && (
          <div>
            <div className="text-xs text-on-surface-variant">Qty</div>
            <div className="font-bold">{inv.quantity}</div>
          </div>
        )}
        {inv.units != null && (
          <div>
            <div className="text-xs text-on-surface-variant">Units</div>
            <div className="font-bold">{inv.units}</div>
          </div>
        )}
        {inv.nav != null && (
          <div>
            <div className="text-xs text-on-surface-variant">NAV</div>
            <div className="font-bold">{inv.nav}</div>
          </div>
        )}
        {inv.interestRate != null && (
          <div>
            <div className="text-xs text-on-surface-variant">Interest</div>
            <div className="font-bold">{inv.interestRate}%</div>
          </div>
        )}
        {inv.sipAmount != null && (
          <div>
            <div className="text-xs text-on-surface-variant">SIP</div>
            <div className="font-bold">{formatCurrency(inv.sipAmount)}/mo</div>
          </div>
        )}
      </div>

      <div className="mt-auto pt-3 border-t-2 border-on-surface">
        <div className="flex justify-between items-end">
          <div>
            <div className="text-xs text-on-surface-variant">Current Value</div>
            <div className="text-xl font-bold">{formatCompact(inv.currentValue)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-on-surface-variant">Invested</div>
            <div className="font-bold">{formatCompact(inv.totalInvested)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Investments() {
  const [tab, setTab] = useState<Tab>('all')
  const { data, loading } = useAsync(
    () => investmentService.list(tab === 'all' ? undefined : tab),
    [tab],
  )

  if (loading || !data) return <LoadingBlock label="Loading investments…" />

  const totalInvested = data.reduce((s, i) => s + i.totalInvested, 0)
  const currentValue = data.reduce((s, i) => s + i.currentValue, 0)
  const gain = currentValue - totalInvested

  return (
    <div>
      <PageHeader
        title="Investments"
        subtitle="Stocks, mutual funds, FDs & real estate."
        action={
          <Link to="/investments/add-sip">
            <Button variant="yellow">
              <Icon name="add" className="text-xl" />
              Add SIP
            </Button>
          </Link>
        }
      />

      <div className="flex flex-wrap gap-sm mb-lg border-b-[3px] border-on-surface pb-md">
        {(Object.keys(tabLabel) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`brutal-sm px-4 py-2 font-bold uppercase ${
              tab === t
                ? 'bg-brand-yellow text-on-surface'
                : 'bg-white text-on-surface hover:bg-surface-container-high'
            }`}
          >
            {tabLabel[t]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md mb-8">
        {data.map((inv) => (
          <InvestmentCard key={inv.id} inv={inv} />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        <div className="bg-white brutal p-md">
          <span className="font-bold uppercase text-sm text-on-surface-variant">Invested</span>
          <p className="text-2xl font-bold mt-1">{formatCompact(totalInvested)}</p>
        </div>
        <div className="bg-brand-yellow brutal p-md">
          <span className="font-bold uppercase text-sm text-on-surface-variant">Current Value</span>
          <p className="text-2xl font-bold mt-1">{formatCompact(currentValue)}</p>
        </div>
        <div className={`brutal p-md ${gain >= 0 ? 'bg-tertiary-container' : 'bg-error-container'}`}>
          <span className="font-bold uppercase text-sm text-on-surface-variant">Total Gain / Loss</span>
          <p className="text-2xl font-bold mt-1">
            {gain >= 0 ? '+' : ''}
            {formatCompact(gain)}
          </p>
        </div>
      </div>
    </div>
  )
}
