import { useEffect, useState } from 'react'
import { apiClient } from '../services/apiClient'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { formatCurrency, formatDay } from '../lib/format'
import type {
  Subscription,
  SubscriptionCategory,
  SubscriptionFrequency,
  SubscriptionStatus,
} from '../types'

type Freq = 'monthly' | 'yearly'

const CATEGORIES: SubscriptionCategory[] = [
  'Entertainment',
  'Productivity',
  'Health',
  'News',
  'Gaming',
  'Cloud Storage',
  'Other',
]

const STATUSES: SubscriptionStatus[] = ['Active', 'Paused', 'Cancelled']

const PAYMENT_METHODS = [
  'Credit Card',
  'Debit Card',
  'UPI',
  'Net Banking',
  'Wallet',
  'Other',
]

// Backend documents use Mongo `_id`; normalize so the frontend `Subscription`
// type (and all call sites) stay unchanged.
function normalizeSubscription(raw: Record<string, unknown>): Subscription {
  return {
    id: String(raw._id ?? raw.id),
    memberId: String(raw.memberId ?? ''),
    name: (raw.name as string) ?? '',
    category: ((raw.category as SubscriptionCategory) ?? 'Other'),
    amount: Number(raw.amount ?? 0),
    billingDate: Number(raw.billingDate ?? 1),
    frequency: ((raw.frequency as SubscriptionFrequency) ?? 'monthly'),
    startDate: raw.startDate ? String(raw.startDate) : '',
    endDate: raw.endDate ? String(raw.endDate) : null,
    renewalReminderDays: Number(raw.renewalReminderDays ?? 3),
    paymentMethod: (raw.paymentMethod as string) ?? '',
    autoRenew: Boolean(raw.autoRenew),
    status: ((raw.status as SubscriptionStatus) ?? 'Active'),
    notes: raw.notes as string | undefined,
  }
}

interface SubscriptionFormProps {
  initial?: Subscription | null
  onSaved: () => void
  onCancel: () => void
}

function SubscriptionForm({ initial, onSaved, onCancel }: SubscriptionFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState<SubscriptionCategory>(
    initial?.category ?? 'Entertainment',
  )
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [billingDate, setBillingDate] = useState(
    initial ? String(initial.billingDate) : '1',
  )
  const [frequency, setFrequency] = useState<SubscriptionFrequency>(
    initial?.frequency ?? 'monthly',
  )
  const [startDate, setStartDate] = useState(initial?.startDate ?? '')
  const [renewalReminderDays, setRenewalReminderDays] = useState(
    initial ? String(initial.renewalReminderDays) : '3',
  )
  const [paymentMethod, setPaymentMethod] = useState(
    initial?.paymentMethod ?? 'Credit Card',
  )
  const [autoRenew, setAutoRenew] = useState(initial?.autoRenew ?? true)
  const [status, setStatus] = useState<SubscriptionStatus>(
    initial?.status ?? 'Active',
  )
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const payload = {
      name,
      category,
      amount: Number(amount),
      billingDate: Number(billingDate),
      frequency,
      startDate: startDate || undefined,
      renewalReminderDays: Number(renewalReminderDays),
      paymentMethod,
      autoRenew,
      status,
      notes: notes || undefined,
    }
    try {
      if (initial) {
        await apiClient.put(`/subscriptions/${initial.id}`, payload)
      } else {
        await apiClient.post('/subscriptions', payload)
      }
      onSaved()
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not save subscription.'
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
      <Field label="Name">
        <Input
          placeholder="e.g. Netflix"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Category">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as SubscriptionCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
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
        <Field label="Billing Date (Day of Month)">
          <Input
            type="number"
            min={1}
            max={31}
            value={billingDate}
            onChange={(e) => setBillingDate(e.target.value)}
            className="w-24 text-center"
            required
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Frequency">
          <Select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as SubscriptionFrequency)}
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg items-end">
        <Field label="Start Date">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field label="Renewal Reminder (Days)">
          <Input
            type="number"
            min={0}
            value={renewalReminderDays}
            onChange={(e) => setRenewalReminderDays(e.target.value)}
            className="w-24 text-center"
          />
        </Field>
      </div>
      <Field label="Auto Renew?">
        <label className="flex items-center gap-sm cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={autoRenew}
            onChange={(e) => setAutoRenew(e.target.checked)}
            className="w-5 h-5 accent-brand-yellow"
          />
          <span className="font-bold">{autoRenew ? 'Yes' : 'No'}</span>
        </label>
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

export function Subscriptions() {
  const [freq, setFreq] = useState<Freq>('monthly')
  const [items, setItems] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Subscription | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get('/subscriptions', {
        params: { frequency: freq },
      })
      setItems(((res.data ?? []) as Record<string, unknown>[]).map(normalizeSubscription))
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not load subscriptions.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freq])

  const handleDelete = async (sub: Subscription) => {
    if (!window.confirm(`Delete "${sub.name}"?`)) return
    try {
      await apiClient.delete(`/subscriptions/${sub.id}`)
      await load()
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not delete subscription.'
      setError(msg)
    }
  }

  if (loading) return <LoadingBlock label="Loading subscriptions…" />
  if (error)
    return (
      <div className="border-[3px] border-on-surface bg-red-100 p-md font-bold">
        {error}
      </div>
    )

  const total = items
    .filter((s) => s.status === 'Active')
    .reduce((s, x) => s + x.amount, 0)
  const cadence = freq === 'monthly' ? 'mo' : 'yr'

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        subtitle="Monthly and yearly subscription services."
        action={
          <Button variant="yellow" onClick={() => setOpen(true)}>
            <Icon name="add" className="text-xl" />
            Add Subscription
          </Button>
        }
      />

      <div className="flex flex-wrap gap-sm mb-lg border-b-[3px] border-on-surface pb-md">
        {(['monthly', 'yearly'] as Freq[]).map((f) => (
          <button
            key={f}
            onClick={() => setFreq(f)}
            className={`brutal-sm px-4 py-2 font-bold uppercase ${
              freq === f
                ? 'bg-brand-yellow text-on-surface'
                : 'bg-white text-on-surface hover:bg-surface-container-high'
            }`}
          >
            {f === 'monthly' ? 'Monthly' : 'Yearly'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md mb-8">
        {items.map((sub: Subscription) => (
          <div key={sub.id} className="bg-white brutal p-md flex flex-col gap-3 nb-card-enter nb-card-hover">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-xs">
                <div className="w-10 h-10 bg-surface-variant brutal-thin flex items-center justify-center">
                  <Icon name="subscriptions" />
                </div>
                <span className="font-bold">{sub.name}</span>
              </div>
              <Badge color={sub.status === 'Active' ? 'cyan' : 'surface'}>
                {sub.status}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-bold text-2xl">
                {formatCurrency(sub.amount)}
                <span className="text-sm font-normal">/{cadence}</span>
              </span>
              <Badge color="yellow">{sub.category}</Badge>
            </div>
            <div className="flex items-center gap-2 font-bold text-xs text-on-surface-variant">
              <Icon name="event_repeat" className="text-sm" />
              Billing on {formatDay(sub.billingDate)} · {sub.paymentMethod}
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setEditing(sub)}
                className="bg-white p-2 brutal-thin hover:bg-surface-container-high"
                title="Edit"
              >
                <Icon name="edit" className="text-sm" />
              </button>
              <button
                onClick={() => handleDelete(sub)}
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
          No {freq} subscriptions yet. Click “Add Subscription” to create one.
        </p>
      )}

      <div className="w-full bg-on-surface text-white py-6 px-6 brutal">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-lg font-bold uppercase tracking-wider">
            Total {freq} Spending
          </span>
          <span className="text-3xl md:text-4xl font-bold text-brand-yellow">
            {formatCurrency(total)}
            <span className="text-base font-normal">/{cadence}</span>
          </span>
        </div>
      </div>

      <Modal
        open={open || !!editing}
        onClose={() => {
          setOpen(false)
          setEditing(null)
        }}
        title={editing ? 'Edit Subscription' : 'Add Subscription'}
      >
        <SubscriptionForm
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
