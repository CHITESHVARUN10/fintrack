import { useEffect, useState } from 'react'
import { apiClient } from '../services/apiClient'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { formatCurrency, formatDay } from '../lib/format'
import type { RecurringPayment, RecurringCategory } from '../types'

const categoryIcon: Record<string, string> = {
  Household: 'home',
  Utility: 'electric_bolt',
  Staff: 'groups',
  Society: 'apartment',
  Vehicle: 'directions_car',
  Other: 'receipt_long',
}

const CATEGORIES: RecurringCategory[] = [
  'Household',
  'Utility',
  'Staff',
  'Society',
  'Vehicle',
  'Other',
]

const PAYMENT_METHODS = [
  'Bank Transfer',
  'UPI',
  'Credit Card',
  'Debit Card',
  'Cash',
  'Net Banking',
  'Other',
]

// Backend documents use Mongo `_id`; normalize so the frontend
// `RecurringPayment` type (and all call sites) stay unchanged.
function normalizeRecurring(raw: Record<string, unknown>): RecurringPayment {
  return {
    id: String(raw._id ?? raw.id),
    memberId: String(raw.memberId ?? ''),
    title: (raw.title as string) ?? '',
    category: ((raw.category as RecurringCategory) ?? 'Other'),
    amount: Number(raw.amount ?? 0),
    dueDate: Number(raw.dueDate ?? 1),
    paymentMethod: (raw.paymentMethod as string) ?? '',
    startDate: raw.startDate ? String(raw.startDate) : '',
    notes: raw.notes as string | undefined,
  }
}

interface RecurringFormProps {
  initial?: RecurringPayment | null
  onSaved: () => void
  onCancel: () => void
}

function RecurringForm({ initial, onSaved, onCancel }: RecurringFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [category, setCategory] = useState<RecurringCategory>(
    initial?.category ?? 'Household',
  )
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [dueDate, setDueDate] = useState(initial ? String(initial.dueDate) : '1')
  const [paymentMethod, setPaymentMethod] = useState(
    initial?.paymentMethod ?? 'Bank Transfer',
  )
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
      category,
      amount: Number(amount),
      dueDate: Number(dueDate),
      paymentMethod,
      startDate: startDate || undefined,
      notes: notes || undefined,
    }
    try {
      if (initial) {
        await apiClient.put(`/recurring/${initial.id}`, payload)
      } else {
        await apiClient.post('/recurring', payload)
      }
      onSaved()
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not save payment.'
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
          placeholder="e.g. City Rentals"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Category">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as RecurringCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Payment Method">
          <Select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            {PAYMENT_METHODS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
      </div>
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
        <Field label="Due Date (Day of Month)">
          <Input
            type="number"
            min={1}
            max={31}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-24 text-center"
            required
          />
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

export function Recurring() {
  const [items, setItems] = useState<RecurringPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringPayment | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get('/recurring')
      setItems(((res.data ?? []) as Record<string, unknown>[]).map(normalizeRecurring))
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not load payments.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = async (p: RecurringPayment) => {
    if (!window.confirm(`Delete "${p.title}"?`)) return
    try {
      await apiClient.delete(`/recurring/${p.id}`)
      await load()
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not delete payment.'
      setError(msg)
    }
  }

  if (loading) return <LoadingBlock label="Loading payments…" />
  if (error)
    return (
      <div className="border-[3px] border-on-surface bg-red-100 p-md font-bold">
        {error}
      </div>
    )

  const total = items.reduce((s, x) => s + x.amount, 0)

  return (
    <div>
      <PageHeader
        title="Recurring Payments"
        subtitle="Fixed household & utility obligations."
        action={
          <Button variant="yellow" onClick={() => setOpen(true)}>
            <Icon name="add" className="text-xl" />
            Add Payment
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md mb-8">
        {items.map((p) => (
          <div key={p.id} className="bg-white brutal p-md flex flex-col gap-3 nb-card-enter nb-card-hover">
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
              <button
                onClick={() => setEditing(p)}
                className="bg-white p-2 brutal-thin hover:bg-surface-container-high"
                title="Edit"
              >
                <Icon name="edit" className="text-sm" />
              </button>
              <button
                onClick={() => handleDelete(p)}
                className="bg-error-container text-on-error-container p-2 brutal-thin hover:bg-error hover:text-on-error"
                title="Delete"
              >
                <Icon name="delete" className="text-sm" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <p className="font-bold text-on-surface-variant mb-8">
          No recurring payments yet. Click “Add Payment” to create one.
        </p>
      )}

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

      <Modal
        open={open || !!editing}
        onClose={() => {
          setOpen(false)
          setEditing(null)
        }}
        title={editing ? 'Edit Payment' : 'Add Payment'}
      >
        <RecurringForm
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
