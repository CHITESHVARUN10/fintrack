import { educationService } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Table } from '../components/ui/Table'
import { Badge } from '../components/ui/Badge'
import { formatCurrency, formatDate } from '../lib/format'
import type { EducationPayment } from '../types'

export function Education() {
  const { data, loading } = useAsync(() => educationService.list(), [])

  if (loading || !data) return <LoadingBlock label="Loading education…" />

  const total = data.reduce((s, e) => s + e.amount, 0)

  return (
    <div>
      <PageHeader
        title="Education"
        subtitle="School, college, coaching & course fees."
        action={
          <Button variant="yellow">
            <Icon name="add" className="text-xl" />
            Add Payment
          </Button>
        }
      />

      <Table<EducationPayment>
        rowKey={(e) => e.id}
        columns={[
          {
            key: 'title',
            header: 'Payment',
            render: (e) => (
              <div className="flex flex-col">
                <span className="font-bold">{e.title}</span>
                <span className="text-xs text-on-surface-variant">{e.institution}</span>
              </div>
            ),
          },
          { key: 'forMember', header: 'For', render: (e) => e.forMember },
          { key: 'category', header: 'Category', render: (e) => <Badge color="yellow">{e.category}</Badge> },
          { key: 'frequency', header: 'Frequency', align: 'center', render: (e) => e.frequency },
          {
            key: 'amount',
            header: 'Amount',
            align: 'right',
            render: (e) => <span className="font-bold">{formatCurrency(e.amount)}</span>,
          },
          {
            key: 'dueDate',
            header: 'Next Due',
            align: 'right',
            render: (e) => <span className="text-sm">{formatDate(e.dueDate)}</span>,
          },
        ]}
        rows={data}
      />

      <div className="w-full bg-on-surface text-white py-6 px-6 brutal mt-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-lg font-bold uppercase tracking-wider">
            Total Education Outlay
          </span>
          <span className="text-3xl md:text-4xl font-bold text-brand-yellow">
            {formatCurrency(total)}
          </span>
        </div>
      </div>
    </div>
  )
}
