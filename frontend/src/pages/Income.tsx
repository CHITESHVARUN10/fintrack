import { useEffect, useState } from 'react'
import { apiClient } from '../services/apiClient'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { formatCurrency, formatDay } from '../lib/format'
import type { Income, IncomeCategory } from '../types'

const CATEGORIES: IncomeCategory[] = [
  'Salary',
  'Freelance',
  'Rental',
  'Business',
  'Other',
]

// Backend documents use Mongo `_id`; normalize so the frontend `Income`
// type (and all call sites) stay unchanged.
function normalizeIncome(raw: Record<string, unknown>): Income {
  return {
    id: String(raw._id ?? raw.id),
    memberId: String(raw.memberId ?? ''),
    title: (raw.title as string) ?? '',
    amount: Number(raw.amount ?? 0),
    creditDate: Number(raw.creditDate ?? 1),
    category: ((raw.category as IncomeCategory) ?? 'Other'),
    taxable: Boolean(raw.taxable),
    startDate: raw.startDate ? String(raw.startDate) : '',
    endDate: raw.endDate ? String(raw.endDate) : null,
    notes: raw.notes as string | undefined,
  }
}

interface IncomeFormProps {
  initial?: Income | null
  onSaved: () => void
  onCancel: () => void
}

function IncomeForm({ initial, onSaved, onCancel }: IncomeFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [category, setCategory] = useState<IncomeCategory>(
    initial?.category ?? 'Salary',
  )
  const [creditDate, setCreditDate] = useState(
    initial ? String(initial.creditDate) : '1',
  )
  const [taxable, setTaxable] = useState(initial?.taxable ?? true)
  const [startDate, setStartDate] = useState(initial?.startDate ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const payload = {
      title,
      amount: Number(amount),
      category,
      creditDate: Number(creditDate),
      taxable,
      startDate: startDate || undefined,
      notes: notes || undefined,
    }
    try {
      if (initial) {
        await apiClient.put(`/income/${initial.id}`, payload)
      } else {
        await apiClient.post('/income', payload)
      }
      onSaved()
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not save income.'
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
      <Field label="Title">
        <Input
          placeholder="e.g. Main Salary"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Amount">
          <div className="flex">
            <span className="bg-surface-container-high border-[4px] border-r-0 border-on-surface px-3 flex items-center font-bold">
              ₹
            </span>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="border-l-0"
              required
            />
          </div>
        </Field>
        <Field label="Category">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as IncomeCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg items-end">
        <Field label="Credit Date (Day of Month)">
          <Input
            type="number"
            min={1}
            max={31}
            value={creditDate}
            onChange={(e) => setCreditDate(e.target.value)}
            className="w-24 text-center"
            required
          />
        </Field>
        <Field label="Taxable Income?">
          <label className="flex items-center gap-sm cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={taxable}
              onChange={(e) => setTaxable(e.target.checked)}
              className="w-5 h-5 accent-brand-yellow"
            />
            <span className="font-bold">{taxable ? 'Yes' : 'No'}</span>
          </label>
        </Field>
      </div>
      <Field label="Start Date">
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </Field>
      <Field label="Notes">
        <Textarea
          placeholder="Additional details…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
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

export function Income({ initialAddOpen = false }: { initialAddOpen?: boolean }) {
  const [items, setItems] = useState<Income[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(initialAddOpen)
  const [editing, setEditing] = useState<Income | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get('/income')
      setItems(((res.data ?? []) as Record<string, unknown>[]).map(normalizeIncome))
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not load income.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = async (inc: Income) => {
    if (!window.confirm(`Delete "${inc.title}"?`)) return
    try {
      await apiClient.delete(`/income/${inc.id}`)
      await load()
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not delete income.'
      setError(msg)
    }
  }

  if (loading) return <LoadingBlock label="Loading income…" />
  if (error)
    return (
      <div className="border-[3px] border-on-surface bg-red-100 p-md font-bold">
        {error}
      </div>
    )

  const total = items.reduce((s, i) => s + i.amount, 0)

  return (
    <div>
      <PageHeader
        title="Income Sources"
        subtitle="All recurring monthly income streams."
        action={
          <Button variant="yellow" onClick={() => setOpen(true)}>
            <Icon name="add" className="text-xl" />
            Add Income
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-md lg:gap-8 mb-8">
        {items.map((inc) => (
          <div
            key={inc.id}
            className="bg-white brutal p-md flex flex-col gap-4 relative group nb-card-enter nb-card-hover"
          >
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold">{inc.title}</h2>
                <Badge color={inc.taxable ? 'yellow' : 'surface'}>
                  {inc.category}
                </Badge>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(inc)}
                  className="bg-white p-2 brutal-thin hover:bg-surface-container-high"
                  title="Edit"
                >
                  <Icon name="edit" className="text-sm" />
                </button>
                <button
                  onClick={() => handleDelete(inc)}
                  className="bg-error-container text-on-error-container p-2 brutal-thin hover:bg-error hover:text-on-error"
                  title="Delete"
                >
                  <Icon name="delete" className="text-sm" />
                </button>
              </div>
            </div>
            <div>
              <p className="text-3xl font-bold">{formatCurrency(inc.amount)}</p>
              <div className="flex items-center gap-2 mt-2 font-bold text-sm">
                <Icon name="calendar_today" className="text-sm" />
                Credits on {formatDay(inc.creditDate)}
              </div>
            </div>
            <div className="mt-auto pt-3 border-t-2 border-on-surface flex items-center gap-2">
              <div
                className={`w-3 h-3 brutal-thin ${
                  inc.taxable ? 'bg-error' : 'bg-brand-yellow'
                }`}
              />
              <span className="font-bold text-xs uppercase text-on-surface-variant">
                {inc.taxable ? 'Taxable' : 'Non-Taxable'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <p className="font-bold text-on-surface-variant mb-8">
          No income sources yet. Click “Add Income” to create one.
        </p>
      )}

      <div className="w-full bg-on-surface text-white py-6 px-6 brutal mb-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-lg font-bold uppercase tracking-wider">
            Total Monthly Income
          </span>
          <span className="text-3xl md:text-4xl font-bold text-brand-yellow">
            {formatCurrency(total)}
          </span>
        </div>
      </div>

      <Modal
        open={open || !!editing}
        onClose={() => {
          setOpen(false)
          setEditing(null)
        }}
        title={editing ? 'Edit Income Source' : 'Add Income Source'}
      >
        <IncomeForm
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
