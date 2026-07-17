import { useState } from 'react'
import { subscriptionService } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { formatCurrency, formatDay } from '../lib/format'
import type { Subscription } from '../types'

type Freq = 'monthly' | 'yearly'

export function Subscriptions() {
  const [freq, setFreq] = useState<Freq>('monthly')
  const { data, loading } = useAsync(() => subscriptionService.list(freq), [freq])

  if (loading || !data) return <LoadingBlock label="Loading subscriptions…" />

  const total = data
    .filter((s) => s.status === 'Active')
    .reduce((s, x) => s + x.amount, 0)
  const cadence = freq === 'monthly' ? 'mo' : 'yr'

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        subtitle="Monthly and yearly subscription services."
        action={
          <Button variant="yellow">
            <Icon name="add" className="text-xl" />
            Add Subscription
          </Button>
        }
      />

      <div className="flex flex-wrap gap-sm mb-lg border-b-[3px] border-on-surface pb-md">
        {(['monthly', 'yearly'] as Freq[]).map((f) => (
          <button
            key={f}
            onClick={() => setFreq(f)}
            className={`brutal-sm px-4 py-2 font-bold uppercase ${
              freq === f
                ? 'bg-brand-yellow text-on-surface'
                : 'bg-white text-on-surface hover:bg-surface-container-high'
            }`}
          >
            {f === 'monthly' ? 'Monthly' : 'Yearly'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md mb-8">
        {data.map((sub: Subscription) => (
          <div key={sub.id} className="bg-white brutal p-md flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-xs">
                <div className="w-10 h-10 bg-surface-variant brutal-thin flex items-center justify-center">
                  <Icon name="subscriptions" />
                </div>
                <span className="font-bold">{sub.name}</span>
              </div>
              <Badge color={sub.status === 'Active' ? 'cyan' : 'surface'}>
                {sub.status}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-bold text-2xl">
                {formatCurrency(sub.amount)}
                <span className="text-sm font-normal">/{cadence}</span>
              </span>
              <Badge color="yellow">{sub.category}</Badge>
            </div>
            <div className="flex items-center gap-2 font-bold text-xs text-on-surface-variant">
              <Icon name="event_repeat" className="text-sm" />
              Billing on {formatDay(sub.billingDate)} · {sub.paymentMethod}
            </div>
            <div className="flex gap-2 mt-2">
              <button className="bg-white p-2 brutal-thin hover:bg-surface-container-high" title="Edit">
                <Icon name="edit" className="text-sm" />
              </button>
              <button
                className="bg-error-container text-on-error-container p-2 brutal-thin hover:bg-error hover:text-on-error"
                title="Delete"
              >
                <Icon name="delete" className="text-sm" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="w-full bg-on-surface text-white py-6 px-6 brutal">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-lg font-bold uppercase tracking-wider">
            Total {freq} Spending
          </span>
          <span className="text-3xl md:text-4xl font-bold text-brand-yellow">
            {formatCurrency(total)}
            <span className="text-base font-normal">/{cadence}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
