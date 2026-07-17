import { expenseService } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Table } from '../components/ui/Table'
import { Badge } from '../components/ui/Badge'
import { formatCurrency, formatDate } from '../lib/format'
import type { AdHocExpense } from '../types'

export function Expenses() {
  const { data, loading } = useAsync(() => expenseService.list(), [])

  if (loading || !data) return <LoadingBlock label="Loading expenses…" />

  const total = data.reduce((s, e) => s + e.amount, 0)

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Ad-hoc, variable and daily spending."
        action={
          <Button variant="yellow">
            <Icon name="add" className="text-xl" />
            Quick Add
          </Button>
        }
      />

      <Table<AdHocExpense>
        rowKey={(e) => e.id}
        columns={[
          { key: 'title', header: 'Title', render: (e) => <span className="font-bold">{e.title}</span> },
          { key: 'category', header: 'Category', render: (e) => <Badge color="yellow">{e.category}</Badge> },
          {
            key: 'tags',
            header: 'Tags',
            render: (e) =>
              e.tags?.map((t) => (
                <span key={t} className="inline-block bg-surface-container-high brutal-thin px-1 mr-1 text-xs font-bold">
                  #{t}
                </span>
              )),
          },
          { key: 'paymentMode', header: 'Mode', align: 'center', render: (e) => e.paymentMode ?? '—' },
          { key: 'date', header: 'Date', align: 'right', render: (e) => <span className="text-sm">{formatDate(e.date)}</span> },
          {
            key: 'amount',
            header: 'Amount',
            align: 'right',
            render: (e) => <span className="font-bold">{formatCurrency(e.amount)}</span>,
          },
        ]}
        rows={data}
      />

      <div className="w-full bg-on-surface text-white py-6 px-6 brutal mt-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-lg font-bold uppercase tracking-wider">
            Total Logged Spend
          </span>
          <span className="text-3xl md:text-4xl font-bold text-brand-yellow">
            {formatCurrency(total)}
          </span>
        </div>
      </div>
    </div>
  )
}
