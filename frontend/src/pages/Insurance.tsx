import { useEffect, useState } from 'react'
import { apiClient } from '../services/apiClient'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Table } from '../components/ui/Table'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { formatCurrency, formatDate } from '../lib/format'
import type { Insurance, InsuranceType, PremiumFrequency } from '../types'

const INSURANCE_TYPES: InsuranceType[] = [
  'Life',
  'Health',
  'Vehicle',
  'Term',
  'Home',
  'Other',
]
const PREMIUM_FREQUENCIES: PremiumFrequency[] = [
  'Monthly',
  'Quarterly',
  'Half-Yearly',
  'Yearly',
]
const STATUSES = ['Active', 'Lapsed', 'Matured', 'Claimed']

// Backend documents use Mongo `_id`; normalize so the frontend `Insurance`
// type (and all call sites) stay unchanged.
function normalizeInsurance(raw: Record<string, unknown>): Insurance {
  return {
    id: String(raw._id ?? raw.id),
    memberId: String(raw.memberId ?? ''),
    policyName: (raw.policyName as string) ?? '',
    insurer: (raw.insurer as string) ?? '',
    insuranceType: ((raw.insuranceType as InsuranceType) ?? 'Other'),
    premiumAmount: Number(raw.premiumAmount ?? 0),
    premiumFrequency: ((raw.premiumFrequency as PremiumFrequency) ?? 'Yearly'),
    nextDueDate: raw.nextDueDate ? String(raw.nextDueDate) : '',
    startDate: raw.startDate ? String(raw.startDate) : '',
    endDate: raw.endDate ? String(raw.endDate) : '',
    sumAssured: Number(raw.sumAssured ?? 0),
    nominee: (raw.nominee as string) ?? '',
    policyNumber: (raw.policyNumber as string) ?? '',
    status: ((raw.status as Insurance['status']) ?? 'Active'),
    tax80C: Boolean(raw.tax80C),
    notes: raw.notes as string | undefined,
  }
}

interface InsuranceFormProps {
  initial?: Insurance | null
  onSaved: () => void
  onCancel: () => void
}

function InsuranceForm({ initial, onSaved, onCancel }: InsuranceFormProps) {
  const [policyName, setPolicyName] = useState(initial?.policyName ?? '')
  const [insurer, setInsurer] = useState(initial?.insurer ?? '')
  const [insuranceType, setInsuranceType] = useState<InsuranceType>(
    initial?.insuranceType ?? 'Life',
  )
  const [policyNumber, setPolicyNumber] = useState(initial?.policyNumber ?? '')
  const [sumAssured, setSumAssured] = useState(
    initial ? String(initial.sumAssured) : '',
  )
  const [premiumAmount, setPremiumAmount] = useState(
    initial ? String(initial.premiumAmount) : '',
  )
  const [premiumFrequency, setPremiumFrequency] = useState<PremiumFrequency>(
    initial?.premiumFrequency ?? 'Yearly',
  )
  const [nextDueDate, setNextDueDate] = useState(
    initial?.nextDueDate ? initial.nextDueDate.slice(0, 10) : '',
  )
  const [startDate, setStartDate] = useState(
    initial?.startDate ? initial.startDate.slice(0, 10) : '',
  )
  const [endDate, setEndDate] = useState(
    initial?.endDate ? initial.endDate.slice(0, 10) : '',
  )
  const [nominee, setNominee] = useState(initial?.nominee ?? '')
  const [status, setStatus] = useState<Insurance['status']>(initial?.status ?? 'Active')
  const [tax80C, setTax80C] = useState(initial?.tax80C ?? false)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const payload = {
      policyName,
      insurer,
      insuranceType,
      policyNumber,
      sumAssured: Number(sumAssured),
      premiumAmount: Number(premiumAmount),
      premiumFrequency,
      nextDueDate: nextDueDate || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      nominee,
      status,
      tax80C,
      notes: notes || undefined,
    }
    try {
      if (initial) {
        await apiClient.put(`/insurance/${initial.id}`, payload)
      } else {
        await apiClient.post('/insurance', payload)
      }
      onSaved()
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not save policy.'
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
        <Field label="Policy Name">
          <Input
            placeholder="e.g. Term Plan"
            value={policyName}
            onChange={(e) => setPolicyName(e.target.value)}
            required
          />
        </Field>
        <Field label="Insurer">
          <Input
            placeholder="e.g. LIC"
            value={insurer}
            onChange={(e) => setInsurer(e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Type">
          <Select
            value={insuranceType}
            onChange={(e) => setInsuranceType(e.target.value as InsuranceType)}
          >
            {INSURANCE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as Insurance['status'])}
          >
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Policy Number">
          <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} />
        </Field>
        <Field label="Nominee">
          <Input value={nominee} onChange={(e) => setNominee(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Sum Assured">
          <div className="flex">
            <span className="bg-surface-container-high border-[4px] border-r-0 border-on-surface px-3 flex items-center font-bold">
              ₹
            </span>
            <Input
              type="number"
              placeholder="0.00"
              value={sumAssured}
              onChange={(e) => setSumAssured(e.target.value)}
              className="border-l-0"
              required
            />
          </div>
        </Field>
        <Field label="Premium Amount">
          <div className="flex">
            <span className="bg-surface-container-high border-[4px] border-r-0 border-on-surface px-3 flex items-center font-bold">
              ₹
            </span>
            <Input
              type="number"
              placeholder="0.00"
              value={premiumAmount}
              onChange={(e) => setPremiumAmount(e.target.value)}
              className="border-l-0"
              required
            />
          </div>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Premium Frequency">
          <Select
            value={premiumFrequency}
            onChange={(e) => setPremiumFrequency(e.target.value as PremiumFrequency)}
          >
            {PREMIUM_FREQUENCIES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
        </Field>
        <Field label="Next Due Date">
          <Input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
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
      <Field label="80C Tax Benefit?">
        <label className="flex items-center gap-sm cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={tax80C}
            onChange={(e) => setTax80C(e.target.checked)}
            className="w-5 h-5 accent-brand-yellow"
          />
          <span className="font-bold">{tax80C ? 'Yes' : 'No'}</span>
        </label>
      </Field>
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

export function Insurance() {
  const [items, setItems] = useState<Insurance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Insurance | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get('/insurance')
      setItems(((res.data ?? []) as Record<string, unknown>[]).map(normalizeInsurance))
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not load insurance.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = async (ins: Insurance) => {
    if (!window.confirm(`Delete "${ins.policyName}"?`)) return
    try {
      await apiClient.delete(`/insurance/${ins.id}`)
      await load()
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not delete policy.'
      setError(msg)
    }
  }

  if (loading) return <LoadingBlock label="Loading insurance…" />
  if (error)
    return (
      <div className="border-[3px] border-on-surface bg-red-100 p-md font-bold">
        {error}
      </div>
    )

  const totalPremium = items
    .filter((i) => i.status === 'Active')
    .reduce((s, i) => s + i.premiumAmount, 0)

  return (
    <div>
      <PageHeader
        title="Insurance"
        subtitle="Life, health, vehicle & other policies."
        action={
          <Button variant="yellow" onClick={() => setOpen(true)}>
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
          {
            key: 'actions',
            header: '',
            align: 'center',
            render: (i) => (
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setEditing(i)}
                  className="bg-white p-2 brutal-thin hover:bg-surface-container-high active:translate-x-[2px] active:translate-y-[2px]"
                  title="Edit"
                >
                  <Icon name="edit" className="text-sm" />
                </button>
                <button
                  onClick={() => handleDelete(i)}
                  className="bg-error-container text-on-error-container p-2 brutal-thin hover:bg-error hover:text-on-error active:translate-x-[2px] active:translate-y-[2px]"
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
          No policies yet. Click “Add Policy” to create one.
        </p>
      )}

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

      <Modal
        open={open || !!editing}
        onClose={() => {
          setOpen(false)
          setEditing(null)
        }}
        title={editing ? 'Edit Policy' : 'Add Policy'}
      >
        <InsuranceForm
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
