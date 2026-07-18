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
import type { AdHocExpense, ExpenseCategory } from '../types'

const CATEGORIES: ExpenseCategory[] = [
  'Fuel',
  'Travel',
  'Maintenance',
  'Medical',
  'Shopping',
  'Food',
  'Other',
]

const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Net Banking']

// Backend documents use Mongo `_id`; normalize so the frontend
// `AdHocExpense` type (and all call sites) stay unchanged.
function normalizeExpense(raw: Record<string, unknown>): AdHocExpense {
  return {
    id: String(raw._id ?? raw.id),
    memberId: String(raw.memberId ?? ''),
    title: (raw.title as string) ?? '',
    category: ((raw.category as ExpenseCategory) ?? 'Other'),
    amount: Number(raw.amount ?? 0),
    date: raw.date ? String(raw.date) : '',
    recurrenceHint: raw.recurrenceHint as string | undefined,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : undefined,
    paymentMode: raw.paymentMode as string | undefined,
    notes: raw.notes as string | undefined,
  }
}

interface ExpenseFormProps {
  initial?: AdHocExpense | null
  onSaved: () => void
  onCancel: () => void
}

function ExpenseForm({ initial, onSaved, onCancel }: ExpenseFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [category, setCategory] = useState<ExpenseCategory>(
    initial?.category ?? 'Food',
  )
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [date, setDate] = useState(initial?.date ? initial.date.slice(0, 10) : '')
  const [paymentMode, setPaymentMode] = useState(initial?.paymentMode ?? '')
  const [recurrenceHint, setRecurrenceHint] = useState(initial?.recurrenceHint ?? '')
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
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
      date: date || undefined,
      paymentMode: paymentMode || undefined,
      recurrenceHint: recurrenceHint || undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      notes: notes || undefined,
    }
    try {
      if (initial) {
        await apiClient.put(`/expenses/${initial.id}`, payload)
      } else {
        await apiClient.post('/expenses', payload)
      }
      onSaved()
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not save expense.'
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
          placeholder="e.g. Grocery run"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Category">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Payment Mode">
          <Select
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value)}
          >
            <option value="">Select</option>
            {PAYMENT_MODES.map((p) => (
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
        <Field label="Date">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </Field>
      </div>
      <Field label="Tags (comma separated)">
        <Input
          placeholder="e.g. essentials, monthly"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </Field>
      <Field label="Recurrence Hint">
        <Input
          placeholder="e.g. Monthly, Weekly"
          value={recurrenceHint}
          onChange={(e) => setRecurrenceHint(e.target.value)}
        />
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

export function Expenses() {
  const [items, setItems] = useState<AdHocExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AdHocExpense | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get('/expenses')
      setItems(((res.data ?? []) as Record<string, unknown>[]).map(normalizeExpense))
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not load expenses.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = async (exp: AdHocExpense) => {
    if (!window.confirm(`Delete "${exp.title}"?`)) return
    try {
      await apiClient.delete(`/expenses/${exp.id}`)
      await load()
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not delete expense.'
      setError(msg)
    }
  }

  if (loading) return <LoadingBlock label="Loading expenses…" />
  if (error)
    return (
      <div className="border-[3px] border-on-surface bg-red-100 p-md font-bold">
        {error}
      </div>
    )

  const total = items.reduce((s, e) => s + e.amount, 0)

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Ad-hoc, variable and daily spending."
        action={
          <Button variant="yellow" onClick={() => setOpen(true)}>
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
          {
            key: 'actions',
            header: '',
            align: 'center',
            render: (e) => (
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setEditing(e)}
                  className="bg-white p-2 brutal-thin hover:bg-surface-container-high"
                  title="Edit"
                >
                  <Icon name="edit" className="text-sm" />
                </button>
                <button
                  onClick={() => handleDelete(e)}
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
          No expenses yet. Click “Quick Add” to log one.
        </p>
      )}

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

      <Modal
        open={open || !!editing}
        onClose={() => {
          setOpen(false)
          setEditing(null)
        }}
        title={editing ? 'Edit Expense' : 'Add Expense'}
      >
        <ExpenseForm
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
