import { toApiError } from '../lib/apiError'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiClient } from '../services/apiClient'
import { Icon } from '../components/ui/Icon'
import { formatCurrency, formatDay } from '../lib/format'
import {
  PaymentsEmpty,
  PaymentsLoading,
  PaymentsModal,
  PaymentsNotice,
  PaymentsPage,
} from '../components/payments/PaymentsKit'
import type { RecurringPayment, RecurringCategory } from '../types'

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

function categoryIcon(category: string): string {
  switch (category) {
    case 'Utility':
      return 'electric_bolt'
    case 'Society':
      return 'apartment'
    case 'Staff':
      return 'groups'
    case 'Vehicle':
      return 'directions_car'
    case 'Household':
      return 'home'
    default:
      return 'receipt_long'
  }
}

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

function toDateInput(value: string): string {
  return value ? String(value).slice(0, 10) : ''
}

interface RecurringFormProps {
  formId: string
  initial?: RecurringPayment | null
  onSaved: () => void
  onBusyChange: (busy: boolean) => void
}

function RecurringForm({ formId, initial, onSaved, onBusyChange }: RecurringFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [category, setCategory] = useState<RecurringCategory>(
    initial?.category ?? 'Household',
  )
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [dueDate, setDueDate] = useState(initial ? String(initial.dueDate) : '1')
  const [paymentMethod, setPaymentMethod] = useState(
    initial?.paymentMethod ?? 'Bank Transfer',
  )
  const [startDate, setStartDate] = useState(toDateInput(initial?.startDate ?? ''))
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    onBusyChange(true)
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
      const msg = toApiError(err).response?.data?.error ?? 'Could not save payment.'
      setError(msg)
    } finally {
      onBusyChange(false)
    }
  }

  return (
    <form id={formId} onSubmit={onSubmit} className="pmt-stack">
      {error && <PaymentsNotice tone="error">{error}</PaymentsNotice>}

      <div className="pmt-field">
        <label className="pmt-label" htmlFor="rec-title">Title</label>
        <input
          id="rec-title"
          className="pmt-input"
          placeholder="e.g. City Rentals"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div className="pmt-form-grid">
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="rec-cat">Category</label>
          <select
            id="rec-cat"
            className="pmt-select"
            value={category}
            onChange={(e) => setCategory(e.target.value as RecurringCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="rec-method">Payment method</label>
          <select
            id="rec-method"
            className="pmt-select"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            {PAYMENT_METHODS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="pmt-form-grid">
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="rec-amount">Amount</label>
          <div className="pmt-rupee">
            <span className="pmt-rupee-prefix">₹</span>
            <input
              id="rec-amount"
              type="number"
              min={1}
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="rec-day">Due date (day of month)</label>
          <input
            id="rec-day"
            className="pmt-input pmt-mono"
            type="number"
            min={1}
            max={31}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="pmt-field">
        <label className="pmt-label" htmlFor="rec-start">Start date</label>
        <input
          id="rec-start"
          className="pmt-input pmt-mono"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>

      <div className="pmt-field">
        <label className="pmt-label" htmlFor="rec-notes">Notes</label>
        <textarea
          id="rec-notes"
          className="pmt-textarea"
          placeholder="Additional details…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
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
  const [saving, setSaving] = useState(false)
  const [activeDay, setActiveDay] = useState<number | null>(null)

  const load = useCallback(() => Promise.resolve().then(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/recurring')
      setItems(((res.data ?? []) as Record<string, unknown>[]).map(normalizeRecurring))
      setError(null)
    } catch (err: unknown) {
      const msg = toApiError(err).response?.data?.error ?? 'Could not load payments.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }), [])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (p: RecurringPayment) => {
    if (!window.confirm(`Delete "${p.title}"?`)) return
    try {
      await apiClient.delete(`/recurring/${p.id}`)
      await load()
    } catch (err: unknown) {
      const msg = toApiError(err).response?.data?.error ?? 'Could not delete payment.'
      setError(msg)
    }
  }

  const total = useMemo(() => items.reduce((s, x) => s + x.amount, 0), [items])

  // Due-day buckets power the 31-day obligation strip.
  const byDay = useMemo(() => {
    const map = new Map<number, RecurringPayment[]>()
    items.forEach((item) => {
      const day = Math.min(31, Math.max(1, Math.round(item.dueDate) || 1))
      const bucket = map.get(day)
      if (bucket) bucket.push(item)
      else map.set(day, [item])
    })
    return map
  }, [items])

  const activeDayItems = activeDay !== null ? byDay.get(activeDay) ?? [] : []
  const readout =
    activeDay !== null && activeDayItems.length > 0
      ? `DAY ${formatDay(activeDay).toUpperCase()} · ${activeDayItems
          .map((i) => `${i.title} (${formatCurrency(i.amount)})`)
          .join(' + ')}`
      : `${items.length} obligation${items.length === 1 ? '' : 's'} · ${formatCurrency(total)}/mo`

  const modalOpen = open || !!editing
  const formId = 'pmt-recurring-form'
  const closeModal = () => {
    setOpen(false)
    setEditing(null)
  }

  if (loading) {
    return (
      <div className="pmt-page">
        <PaymentsLoading />
      </div>
    )
  }

  if (error) {
    return (
      <div className="pmt-page">
        <PaymentsNotice tone="error">{error}</PaymentsNotice>
        <button type="button" className="pmt-btn pmt-btn-white pmt-btn-sm" onClick={load}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
      <PaymentsPage
        title="Recurring Payments"
        subtitle="Fixed household & utility obligations."
        action={
          <button type="button" className="pmt-btn" onClick={() => setOpen(true)}>
            <Icon name="add" className="text-lg" />
            Add Payment
          </button>
        }
      >
        {/* 31-day obligation strip — live due dates, no invented data. */}
        <section className="pmt-viz" aria-label="Monthly obligation calendar">
          <div className="pmt-viz-head">
            <span className="pmt-viz-title">Monthly obligation calendar (days 1–31)</span>
            <span className="pmt-readout">{readout}</span>
          </div>
          <div className="pmt-cal">
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
              const due = byDay.get(day)
              const isDue = !!due && due.length > 0
              return isDue ? (
                <button
                  key={day}
                  type="button"
                  className="pmt-day is-due"
                  onMouseEnter={() => setActiveDay(day)}
                  onFocus={() => setActiveDay(day)}
                  onMouseLeave={() => setActiveDay(null)}
                  onBlur={() => setActiveDay(null)}
                  aria-label={`Day ${day}: ${due.map((i) => `${i.title} ${formatCurrency(i.amount)}`).join(', ')}`}
                >
                  <span>{day}</span>
                  <span className="pmt-day-dot" />
                </button>
              ) : (
                <div key={day} className="pmt-day" aria-hidden="true">
                  <span>{day}</span>
                </div>
              )
            })}
          </div>
        </section>

        <div className="pmt-grid-3">
          {items.map((p) => (
            <article key={p.id} className="pmt-item-card">
              <div className="pmt-card-top">
                <div className="pmt-row" style={{ gap: 10, minWidth: 0 }}>
                  <span className="pmt-entity-icon">
                    <Icon name={categoryIcon(p.category)} className="text-base" />
                  </span>
                  <h2 className="pmt-card-title pmt-card-title-sm break-all-safe">{p.title}</h2>
                </div>
                <span className="pmt-tag pmt-tag-yellow">{p.category}</span>
              </div>

              <div className="pmt-amount" style={{ fontSize: 26 }}>
                {formatCurrency(p.amount)}
              </div>

              <div className="pmt-card-meta">
                <Icon name="event" className="text-sm" />
                <span>
                  Due on {formatDay(p.dueDate)}
                  {p.paymentMethod ? ` · ${p.paymentMethod}` : ''}
                </span>
              </div>

              <div className="pmt-card-actions">
                <button
                  type="button"
                  className="pmt-icon-btn"
                  onClick={() => setEditing(p)}
                  title="Edit payment"
                  aria-label={`Edit ${p.title}`}
                >
                  <Icon name="edit" className="text-base" />
                </button>
                <button
                  type="button"
                  className="pmt-icon-btn pmt-icon-btn-danger"
                  onClick={() => handleDelete(p)}
                  title="Delete payment"
                  aria-label={`Delete ${p.title}`}
                >
                  <Icon name="delete" className="text-base" />
                </button>
              </div>
            </article>
          ))}

          {items.length === 0 && (
            <PaymentsEmpty title="No recurring payments yet">
              Add your first fixed obligation to map it onto the monthly calendar.
            </PaymentsEmpty>
          )}
        </div>

        <div className="pmt-summary">
          <span className="pmt-summary-label">Total monthly outflow</span>
          <span className="pmt-summary-value">{formatCurrency(total)}</span>
        </div>
      </PaymentsPage>

      <PaymentsModal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Edit payment' : 'Add payment'}
        footer={
          <>
            <button type="button" className="pmt-btn pmt-btn-white" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" form={formId} className="pmt-btn" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update' : 'Save'}
            </button>
          </>
        }
      >
        <RecurringForm
          key={editing?.id ?? 'new'}
          formId={formId}
          initial={editing}
          onBusyChange={setSaving}
          onSaved={() => {
            closeModal()
            load()
          }}
        />
      </PaymentsModal>
    </>
  )
}
