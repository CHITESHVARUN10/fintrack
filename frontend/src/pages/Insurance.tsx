import { insuranceService } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Table } from '../components/ui/Table'
import { Badge } from '../components/ui/Badge'
import { formatCurrency, formatDate } from '../lib/format'
import type { Insurance } from '../types'

export function Insurance() {
  const { data, loading } = useAsync(() => insuranceService.list(), [])

  if (loading || !data) return <LoadingBlock label="Loading insurance…" />

  const totalPremium = data
    .filter((i) => i.status === 'Active')
    .reduce((s, i) => s + i.premiumAmount, 0)

  return (
    <div>
      <PageHeader
        title="Insurance"
        subtitle="Life, health, vehicle & other policies."
        action={
          <Button variant="yellow">
            <Icon name="add" className="text-xl" />
            Add Policy
          </Button>
        }
      />

      <Table<Insurance>
        rowKey={(i) => i.id}
        columns={[
          {
            key: 'policyName',
            header: 'Policy',
            render: (i) => (
              <div className="flex flex-col">
                <span className="font-bold">{i.policyName}</span>
                <span className="text-xs text-on-surface-variant">
                  {i.insurer} · {i.policyNumber}
                </span>
              </div>
            ),
          },
          { key: 'insuranceType', header: 'Type', render: (i) => <Badge color="yellow">{i.insuranceType}</Badge> },
          {
            key: 'premiumAmount',
            header: 'Premium',
            align: 'right',
            render: (i) => (
              <span className="font-bold">
                {formatCurrency(i.premiumAmount)}
                <span className="text-xs font-normal">/{i.premiumFrequency.toLowerCase()}</span>
              </span>
            ),
          },
          {
            key: 'sumAssured',
            header: 'Sum Assured',
            align: 'right',
            render: (i) => formatCurrency(i.sumAssured),
          },
          {
            key: 'nextDueDate',
            header: 'Next Due',
            align: 'right',
            render: (i) => <span className="text-sm">{formatDate(i.nextDueDate)}</span>,
          },
          {
            key: 'tax80C',
            header: '80C',
            align: 'center',
            render: (i) => <Badge color={i.tax80C ? 'cyan' : 'surface'}>{i.tax80C ? 'Yes' : 'No'}</Badge>,
          },
          {
            key: 'status',
            header: 'Status',
            align: 'center',
            render: (i) => (
              <Badge color={i.status === 'Active' ? 'cyan' : 'error'}>{i.status}</Badge>
            ),
          },
        ]}
        rows={data}
      />

      <div className="w-full bg-on-surface text-white py-6 px-6 brutal mt-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-lg font-bold uppercase tracking-wider">
            Total Active Premium
          </span>
          <span className="text-3xl md:text-4xl font-bold text-brand-yellow">
            {formatCurrency(totalPremium)}
          </span>
        </div>
      </div>
    </div>
  )
}
