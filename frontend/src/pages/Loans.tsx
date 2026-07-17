import { loanService } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Table } from '../components/ui/Table'
import { Badge } from '../components/ui/Badge'
import { ProgressBar } from '../components/ui/ProgressBar'
import { formatCurrency, formatDate, formatDay } from '../lib/format'
import type { EMILoan } from '../types'

export function Loans() {
  const { data, loading } = useAsync(() => loanService.list(), [])

  if (loading || !data) return <LoadingBlock label="Loading loans…" />

  const totalOutstanding = data.reduce((s, l) => s + l.outstandingAmount, 0)
  const totalEmi = data.reduce((s, l) => s + l.emiAmount, 0)

  return (
    <div>
      <PageHeader
        title="EMI & Loans"
        subtitle="Track principal, interest and monthly EMIs."
        action={
          <Button variant="yellow">
            <Icon name="add" className="text-xl" />
            Add Loan
          </Button>
        }
      />

      <Table<EMILoan>
        rowKey={(l) => l.id}
        columns={[
          {
            key: 'loanName',
            header: 'Loan',
            render: (l) => (
              <div className="flex flex-col">
                <span className="font-bold">{l.loanName}</span>
                <span className="text-xs text-on-surface-variant">
                  {l.lender} · {l.loanType}
                </span>
              </div>
            ),
          },
          { key: 'principalAmount', header: 'Principal', align: 'right', render: (l) => formatCurrency(l.principalAmount) },
          {
            key: 'outstandingAmount',
            header: 'Outstanding',
            align: 'right',
            render: (l) => (
              <span className="font-bold">{formatCurrency(l.outstandingAmount)}</span>
            ),
          },
          {
            key: 'emiAmount',
            header: 'EMI',
            align: 'right',
            render: (l) => formatCurrency(l.emiAmount),
          },
          {
            key: 'emiDate',
            header: 'EMI Date',
            align: 'center',
            render: (l) => formatDay(l.emiDate),
          },
          {
            key: 'progress',
            header: 'Repaid',
            render: (l) => {
              const pct = Math.round(
                ((l.principalAmount - l.outstandingAmount) / l.principalAmount) * 100,
              )
              return (
                <div className="w-32">
                  <ProgressBar value={pct} />
                  <span className="text-xs font-bold mt-1 block">{pct}%</span>
                </div>
              )
            },
          },
          {
            key: 'status',
            header: 'Status',
            align: 'center',
            render: (l) => (
              <Badge color={l.status === 'Active' ? 'cyan' : 'surface'}>{l.status}</Badge>
            ),
          },
          {
            key: 'endDate',
            header: 'Ends',
            align: 'right',
            render: (l) => <span className="text-sm">{formatDate(l.endDate)}</span>,
          },
        ]}
        rows={data}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-md mt-8">
        <div className="bg-white brutal p-md">
          <span className="font-bold uppercase text-sm text-on-surface-variant">
            Total Outstanding
          </span>
          <p className="text-3xl font-bold text-error mt-1">
            {formatCurrency(totalOutstanding)}
          </p>
        </div>
        <div className="bg-brand-yellow brutal p-md">
          <span className="font-bold uppercase text-sm text-on-surface-variant">
            Total Monthly EMI
          </span>
          <p className="text-3xl font-bold mt-1">{formatCurrency(totalEmi)}</p>
        </div>
      </div>
    </div>
  )
}
