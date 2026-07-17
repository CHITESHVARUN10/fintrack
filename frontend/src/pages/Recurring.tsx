import { recurringService } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { formatCurrency, formatDay } from '../lib/format'

const categoryIcon: Record<string, string> = {
  Household: 'home',
  Utility: 'electric_bolt',
  Staff: 'groups',
  Society: 'apartment',
  Vehicle: 'directions_car',
  Other: 'receipt_long',
}

export function Recurring() {
  const { data, loading } = useAsync(() => recurringService.list(), [])

  if (loading || !data) return <LoadingBlock label="Loading payments…" />

  const total = data.reduce((s, x) => s + x.amount, 0)

  return (
    <div>
      <PageHeader
        title="Recurring Payments"
        subtitle="Fixed household &amp; utility obligations."
        action={
          <Button variant="yellow">
            <Icon name="add" className="text-xl" />
            Add Payment
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md mb-8">
        {data.map((p) => (
          <div key={p.id} className="bg-white brutal p-md flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-xs">
                <div className="w-10 h-10 bg-surface-variant brutal-thin flex items-center justify-center">
                  <Icon name={categoryIcon[p.category] ?? 'receipt_long'} />
                </div>
                <span className="font-bold">{p.title}</span>
              </div>
              <Badge color="yellow">{p.category}</Badge>
            </div>
            <div className="font-bold text-2xl">{formatCurrency(p.amount)}</div>
            <div className="flex items-center gap-2 font-bold text-xs text-on-surface-variant">
              <Icon name="event" className="text-sm" />
              Due on {formatDay(p.dueDate)} · {p.paymentMethod}
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
            Total Monthly Outflow
          </span>
          <span className="text-3xl md:text-4xl font-bold text-brand-yellow">
            {formatCurrency(total)}
          </span>
        </div>
      </div>
    </div>
  )
}
