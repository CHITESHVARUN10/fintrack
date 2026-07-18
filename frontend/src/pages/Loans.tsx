import { useEffect, useState } from 'react'
import { apiClient } from '../services/apiClient'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Table } from '../components/ui/Table'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { ProgressBar } from '../components/ui/ProgressBar'
import { formatCurrency, formatDate, formatDay } from '../lib/format'
import type { EMILoan, LoanType } from '../types'

const LOAN_TYPES: LoanType[] = ['Home', 'Car', 'Personal', 'Education', 'Gold', 'Other']
const STATUSES = ['Active', 'Closed', 'Prepaid']

// Backend documents use Mongo `_id`; normalize so the frontend `EMILoan`
// type (and all call sites) stay unchanged.
function normalizeLoan(raw: Record<string, unknown>): EMILoan {
  return {
    id: String(raw._id ?? raw.id),
    memberId: String(raw.memberId ?? ''),
    loanName: (raw.loanName as string) ?? '',
    loanType: ((raw.loanType as LoanType) ?? 'Other'),
    lender: (raw.lender as string) ?? '',
    principalAmount: Number(raw.principalAmount ?? 0),
    outstandingAmount: Number(raw.outstandingAmount ?? 0),
    emiAmount: Number(raw.emiAmount ?? 0),
    emiDate: Number(raw.emiDate ?? 1),
    interestRate: Number(raw.interestRate ?? 0),
    tenureMonths: Number(raw.tenureMonths ?? 0),
    startDate: raw.startDate ? String(raw.startDate) : '',
    endDate: raw.endDate ? String(raw.endDate) : '',
    status: ((raw.status as EMILoan['status']) ?? 'Active'),
    notes: raw.notes as string | undefined,
  }
}

interface LoanFormProps {
  initial?: EMILoan | null
  onSaved: () => void
  onCancel: () => void
}

function LoanForm({ initial, onSaved, onCancel }: LoanFormProps) {
  const [loanName, setLoanName] = useState(initial?.loanName ?? '')
  const [loanType, setLoanType] = useState<LoanType>(initial?.loanType ?? 'Home')
  const [lender, setLender] = useState(initial?.lender ?? '')
  const [principalAmount, setPrincipalAmount] = useState(
    initial ? String(initial.principalAmount) : '',
  )
  const [outstandingAmount, setOutstandingAmount] = useState(
    initial ? String(initial.outstandingAmount) : '',
  )
  const [emiAmount, setEmiAmount] = useState(initial ? String(initial.emiAmount) : '')
  const [emiDate, setEmiDate] = useState(initial ? String(initial.emiDate) : '1')
  const [interestRate, setInterestRate] = useState(
    initial ? String(initial.interestRate) : '',
  )
  const [tenureMonths, setTenureMonths] = useState(
    initial ? String(initial.tenureMonths) : '',
  )
  const [startDate, setStartDate] = useState(initial?.startDate ?? '')
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [status, setStatus] = useState<EMILoan['status']>(initial?.status ?? 'Active')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const payload = {
      loanName,
      loanType,
      lender,
      principalAmount: Number(principalAmount),
      outstandingAmount: Number(outstandingAmount),
      emiAmount: Number(emiAmount),
      emiDate: Number(emiDate),
      interestRate: Number(interestRate),
      tenureMonths: Number(tenureMonths),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      status,
      notes: notes || undefined,
    }
    try {
      if (initial) {
        await apiClient.put(`/loans/${initial.id}`, payload)
      } else {
        await apiClient.post('/loans', payload)
      }
      onSaved()
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not save loan.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-lg">
      {error && (
        <div className="border-[3px] border-on-surface bg-red-100 px-sm py-2 font-bold text-sm">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Loan Name">
          <Input
            placeholder="e.g. Home Loan"
            value={loanName}
            onChange={(e) => setLoanName(e.target.value)}
            required
          />
        </Field>
        <Field label="Loan Type">
          <Select
            value={loanType}
            onChange={(e) => setLoanType(e.target.value as LoanType)}
          >
            {LOAN_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Lender">
          <Input
            placeholder="e.g. SBI"
            value={lender}
            onChange={(e) => setLender(e.target.value)}
          />
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as EMILoan['status'])}
          >
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Principal Amount">
          <div className="flex">
            <span className="bg-surface-container-high border-[4px] border-r-0 border-on-surface px-3 flex items-center font-bold">
              ₹
            </span>
            <Input
              type="number"
              placeholder="0.00"
              value={principalAmount}
              onChange={(e) => setPrincipalAmount(e.target.value)}
              className="border-l-0"
              required
            />
          </div>
        </Field>
        <Field label="Outstanding Amount">
          <div className="flex">
            <span className="bg-surface-container-high border-[4px] border-r-0 border-on-surface px-3 flex items-center font-bold">
              ₹
            </span>
            <Input
              type="number"
              placeholder="0.00"
              value={outstandingAmount}
              onChange={(e) => setOutstandingAmount(e.target.value)}
              className="border-l-0"
              required
            />
          </div>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="EMI Amount">
          <div className="flex">
            <span className="bg-surface-container-high border-[4px] border-r-0 border-on-surface px-3 flex items-center font-bold">
              ₹
            </span>
            <Input
              type="number"
              placeholder="0.00"
              value={emiAmount}
              onChange={(e) => setEmiAmount(e.target.value)}
              className="border-l-0"
              required
            />
          </div>
        </Field>
        <Field label="EMI Date (Day of Month)">
          <Input
            type="number"
            min={1}
            max={31}
            value={emiDate}
            onChange={(e) => setEmiDate(e.target.value)}
            className="w-24 text-center"
            required
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Interest Rate (%)">
          <Input
            type="number"
            placeholder="0"
            value={interestRate}
            onChange={(e) => setInterestRate(e.target.value)}
          />
        </Field>
        <Field label="Tenure (Months)">
          <Input
            type="number"
            placeholder="0"
            value={tenureMonths}
            onChange={(e) => setTenureMonths(e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Start Date">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="End Date">
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea placeholder="Additional details…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-sm pt-sm">
        <Button variant="white" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="yellow" type="submit" disabled={loading}>
          {loading ? 'Saving…' : initial ? 'Update' : 'Save'}
        </Button>
      </div>
    </form>
  )
}

export function Loans() {
  const [items, setItems] = useState<EMILoan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<EMILoan | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get('/loans')
      setItems(((res.data ?? []) as Record<string, unknown>[]).map(normalizeLoan))
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not load loans.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = async (loan: EMILoan) => {
    if (!window.confirm(`Delete "${loan.loanName}"?`)) return
    try {
      await apiClient.delete(`/loans/${loan.id}`)
      await load()
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not delete loan.'
      setError(msg)
    }
  }

  if (loading) return <LoadingBlock label="Loading loans…" />
  if (error)
    return (
      <div className="border-[3px] border-on-surface bg-red-100 p-md font-bold">
        {error}
      </div>
    )

  const totalOutstanding = items.reduce((s, l) => s + l.outstandingAmount, 0)
  const totalEmi = items.reduce((s, l) => s + l.emiAmount, 0)

  return (
    <div>
      <PageHeader
        title="EMI & Loans"
        subtitle="Track principal, interest and monthly EMIs."
        action={
          <Button variant="yellow" onClick={() => setOpen(true)}>
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
          {
            key: 'actions',
            header: '',
            align: 'center',
            render: (l) => (
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setEditing(l)}
                  className="bg-white p-2 brutal-thin hover:bg-surface-container-high"
                  title="Edit"
                >
                  <Icon name="edit" className="text-sm" />
                </button>
                <button
                  onClick={() => handleDelete(l)}
                  className="bg-error-container text-on-error-container p-2 brutal-thin hover:bg-error hover:text-on-error"
                  title="Delete"
                >
                  <Icon name="delete" className="text-sm" />
                </button>
              </div>
            ),
          },
        ]}
        rows={items}
      />

      {items.length === 0 && (
        <p className="font-bold text-on-surface-variant mt-6">
          No loans yet. Click “Add Loan” to create one.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-md mt-8">
        <div className="bg-white brutal p-md nb-card-enter nb-card-hover">
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

      <Modal
        open={open || !!editing}
        onClose={() => {
          setOpen(false)
          setEditing(null)
        }}
        title={editing ? 'Edit Loan' : 'Add Loan'}
      >
        <LoanForm
          initial={editing}
          onSaved={() => {
            setOpen(false)
            setEditing(null)
            load()
          }}
          onCancel={() => {
            setOpen(false)
            setEditing(null)
          }}
        />
      </Modal>
    </div>
  )
}
