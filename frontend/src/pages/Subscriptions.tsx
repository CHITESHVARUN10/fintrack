import { useConfirmation } from '../hooks/useConfirmation'
import type { PaymentSuggestion } from '../types/api'
import { toApiError } from '../lib/apiError'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

function toDateInput(value: string): string {
  return value ? String(value).slice(0, 10) : ''
}

function statusTagClass(status: SubscriptionStatus): string {
  if (status === 'Active') return 'pmt-tag pmt-tag-cyan'
  if (status === 'Paused') return 'pmt-tag pmt-tag-warm'
  return 'pmt-tag pmt-tag-red'
}

interface SubscriptionFormProps {
  formId: string
  initial?: Subscription | null
  defaultFrequency: Freq
  onSaved: (savedFrequency: SubscriptionFrequency) => void
  onBusyChange: (busy: boolean) => void
}

function SubscriptionForm({
  formId,
  initial,
  defaultFrequency,
  onSaved,
  onBusyChange,
}: SubscriptionFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState<SubscriptionCategory>(
    initial?.category ?? 'Entertainment',
  )
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [billingDate, setBillingDate] = useState(
    initial ? String(initial.billingDate) : '1',
  )
  const [frequency, setFrequency] = useState<SubscriptionFrequency>(
    initial?.frequency ?? defaultFrequency,
  )
  const [startDate, setStartDate] = useState(toDateInput(initial?.startDate ?? ''))
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
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    onBusyChange(true)
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
      onSaved(frequency)
    } catch (err: unknown) {
      const msg = toApiError(err).response?.data?.error ?? 'Could not save subscription.'
      setError(msg)
    } finally {
      onBusyChange(false)
    }
  }

  return (
    <form id={formId} onSubmit={onSubmit} className="pmt-stack">
      {error && <PaymentsNotice tone="error">{error}</PaymentsNotice>}

      <div className="pmt-field">
        <label className="pmt-label" htmlFor="sub-name">Name</label>
        <input
          id="sub-name"
          className="pmt-input"
          placeholder="e.g. Netflix"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="pmt-form-grid">
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="sub-cat">Category</label>
          <select
            id="sub-cat"
            className="pmt-select"
            value={category}
            onChange={(e) => setCategory(e.target.value as SubscriptionCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="sub-status">Status</label>
          <select
            id="sub-status"
            className="pmt-select"
            value={status}
            onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="pmt-form-grid">
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="sub-amount">Amount</label>
          <div className="pmt-rupee">
            <span className="pmt-rupee-prefix">₹</span>
            <input
              id="sub-amount"
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
          <label className="pmt-label" htmlFor="sub-day">Billing date (day of month)</label>
          <input
            id="sub-day"
            className="pmt-input pmt-mono"
            type="number"
            min={1}
            max={31}
            value={billingDate}
            onChange={(e) => setBillingDate(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="pmt-form-grid">
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="sub-freq">Frequency</label>
          <select
            id="sub-freq"
            className="pmt-select"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as SubscriptionFrequency)}
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="sub-method">Payment method</label>
          <select
            id="sub-method"
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
          <label className="pmt-label" htmlFor="sub-start">Start date</label>
          <input
            id="sub-start"
            className="pmt-input pmt-mono"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="sub-rem">Renewal reminder (days)</label>
          <input
            id="sub-rem"
            className="pmt-input pmt-mono"
            type="number"
            min={0}
            value={renewalReminderDays}
            onChange={(e) => setRenewalReminderDays(e.target.value)}
          />
        </div>
      </div>

      <div className="pmt-field">
        <span className="pmt-label">Auto renew?</span>
        <label className="pmt-check">
          <input
            type="checkbox"
            checked={autoRenew}
            onChange={(e) => setAutoRenew(e.target.checked)}
          />
          <span>{autoRenew ? 'Yes' : 'No'}</span>
        </label>
      </div>

      <div className="pmt-field">
        <label className="pmt-label" htmlFor="sub-notes">Notes</label>
        <textarea
          id="sub-notes"
          className="pmt-textarea"
          placeholder="Additional details…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </form>
  )
}

export function Subscriptions() {
  const confirmAction = useConfirmation()
  const navigate = useNavigate()
  const [freq, setFreq] = useState<Freq>('monthly')
  const [items, setItems] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Subscription | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null)
  const [suggestions, setSuggestions] = useState<PaymentSuggestion[]>([])

  const load = useCallback(() => Promise.resolve().then(async () => {
    setLoading(true);
    try {
      // Fetch every subscription so both tab counts and the tab total are
      // real, instead of counting only the currently selected cadence.
      const res = await apiClient.get('/subscriptions')
      setError(null)
      setItems(((res.data ?? []) as Record<string, unknown>[]).map(normalizeSubscription))
    } catch (err: unknown) {
      const msg = toApiError(err).response?.data?.error ?? 'Could not load subscriptions.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }), [])

  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('fintrack_dismissed_subs') || '[]')
    } catch {
      return []
    }
  })

  // Fetch suggestions once. Dismissals are applied at render time, so the
  // list is never re-fetched just because the dismissed set changed.
  const loadSuggestions = useCallback(() => {
    apiClient
      .get<{ suggestions: PaymentSuggestion[] }>('/subscriptions/suggestions')
      .then((r) => {
        setSuggestions(r.data?.suggestions || [])
      })
      .catch(() => {})
  }, [])

  const visibleSuggestions = useMemo(
    () => suggestions.filter((s) => !dismissedIds.includes(s.id)),
    [suggestions, dismissedIds],
  )

  useEffect(() => {
    load()
    loadSuggestions()
  }, [load, loadSuggestions])

  const handleAcceptSuggestion = async (s: PaymentSuggestion) => {
    try {
      await apiClient.post(`/subscriptions/${s.id}/apply-suggestion`, {
        acceptAmount: s.suggested?.amount ?? s.current?.amount,
        acceptDate: s.suggested?.billingDate ?? s.current?.billingDate,
        matchedTxIds: s.matchedTxIds,
      })
      setSuggestions((prev) => prev.filter((x) => x.id !== s.id))
      setFeedback({ text: 'Subscription updated from the matched payments.' })
      load()
    } catch (caught: unknown) { const err = toApiError(caught);
      setFeedback({ text: err.response?.data.error ?? 'Could not apply this suggestion.', error: true })
    }
  }

  const handleDismissSuggestion = async (s: PaymentSuggestion) => {
    const nextDismissed = [...dismissedIds, s.id]
    setDismissedIds(nextDismissed)
    try {
      localStorage.setItem('fintrack_dismissed_subs', JSON.stringify(nextDismissed))
    } catch { /* Storage or optional suggestions may be unavailable. */ }
    setSuggestions((prev) => prev.filter((x) => x.id !== s.id))
    try {
      await apiClient.post(`/subscriptions/${s.id}/dismiss-suggestion`)
    } catch { /* Storage or optional suggestions may be unavailable. */ }
  }

  const handleDelete = async (sub: Subscription) => {
    if (!(await confirmAction(`Delete “${sub.name}”?`, 'This removes the subscription from your list.'))) return
    try {
      await apiClient.delete(`/subscriptions/${sub.id}`)
      setFeedback({ text: 'Subscription deleted.' })
      await load()
    } catch (err: unknown) {
      const msg = toApiError(err).response?.data?.error ?? 'Could not delete subscription.'
      setError(msg)
    }
  }

  const monthly = useMemo(() => items.filter((s) => s.frequency === 'monthly'), [items])
  const yearly = useMemo(() => items.filter((s) => s.frequency === 'yearly'), [items])
  const visible = freq === 'monthly' ? monthly : yearly
  const suffix = freq === 'monthly' ? '/mo' : '/yr'
  const activeTotal = visible
    .filter((s) => s.status === 'Active')
    .reduce((sum, s) => sum + s.amount, 0)

  const modalOpen = open || !!editing
  const formId = 'pmt-subscription-form'
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
        title="Subscriptions"
        subtitle="Monthly and yearly subscription services & billing records."
        action={
          <button type="button" className="pmt-btn" onClick={() => setOpen(true)}>
            <Icon name="add" className="text-lg" />
            Add Subscription
          </button>
        }
      >
        {feedback && <PaymentsNotice tone={feedback.error ? 'error' : 'info'}>{feedback.text}</PaymentsNotice>}
        <div className="pmt-tabs" role="tablist" aria-label="Billing frequency">
          <button
            type="button"
            role="tab"
            aria-selected={freq === 'monthly'}
            className={`pmt-tab${freq === 'monthly' ? ' is-active' : ''}`}
            onClick={() => setFreq('monthly')}
          >
            Monthly
            <span className="pmt-tab-count">{monthly.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={freq === 'yearly'}
            className={`pmt-tab${freq === 'yearly' ? ' is-active' : ''}`}
            onClick={() => setFreq('yearly')}
          >
            Yearly
            <span className="pmt-tab-count">{yearly.length}</span>
          </button>
        </div>

        {visibleSuggestions.length > 0 && (
          <section className="pmt-suggest" aria-label="Suggested subscription matches">
            <div className="pmt-suggest-head">
              <Icon name="lightbulb" className="text-base" />
              Ledger link — suggestions from transactions
            </div>
            <p className="pmt-tiny">
              We detected payments matching your subscriptions. Accept to update the billing
              schedule and link the matching ledger transactions.
            </p>
            {visibleSuggestions.map((s) => (
              <div key={s.id} className="pmt-suggest-row">
                <span>
                  <strong>{s.name}</strong>
                  {' · '}
                  {formatCurrency(s.current.amount)} on day {s.current.billingDate}
                  {s.suggested
                    ? ` → ${formatCurrency(s.suggested.amount)} on day ${s.suggested.billingDate}`
                    : ' → link matching payments'}
                  {s.matchedCount > 0 ? ` · ${s.matchedCount} matched` : ''}
                </span>
                <span className="pmt-row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="pmt-btn pmt-btn-sm"
                    onClick={() => handleAcceptSuggestion(s)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="pmt-btn pmt-btn-white pmt-btn-sm"
                    onClick={() => handleDismissSuggestion(s)}
                  >
                    Dismiss
                  </button>
                </span>
              </div>
            ))}
          </section>
        )}

        <div className="pmt-grid-3">
          {visible.map((sub) => (
            <article key={sub.id} className="pmt-item-card">
              <div className="pmt-card-top">
                <div className="pmt-row" style={{ gap: 10, minWidth: 0 }}>
                  <span className="pmt-entity-icon">
                    <Icon name="subscriptions" className="text-base" />
                  </span>
                  <button
                    type="button"
                    className="pmt-name-link break-all-safe"
                    onClick={() => navigate(`/subscriptions/${sub.id}`)}
                  >
                    {sub.name}
                  </button>
                </div>
                <span className={statusTagClass(sub.status)}>{sub.status}</span>
              </div>

              <div className="pmt-row-between">
                <div className="pmt-mono" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>
                  {formatCurrency(sub.amount)}
                  <span className="pmt-amount-unit">{suffix}</span>
                </div>
                <span className="pmt-tag pmt-tag-yellow">{sub.category}</span>
              </div>

              <div className="pmt-card-meta">
                <Icon name="event_repeat" className="text-sm" />
                <span>
                  Billing on {formatDay(sub.billingDate)}
                  {sub.paymentMethod ? ` · ${sub.paymentMethod}` : ''}
                </span>
              </div>

              <div className="pmt-card-actions">
                <button
                  type="button"
                  className="pmt-btn pmt-btn-sm pmt-btn-grow"
                  onClick={() => navigate(`/subscriptions/${sub.id}`)}
                >
                  <Icon name="visibility" className="text-sm" />
                  History &amp; Detail
                </button>
                <button
                  type="button"
                  className="pmt-icon-btn"
                  onClick={() => setEditing(sub)}
                  title="Edit subscription"
                  aria-label={`Edit ${sub.name}`}
                >
                  <Icon name="edit" className="text-base" />
                </button>
                <button
                  type="button"
                  className="pmt-icon-btn pmt-icon-btn-danger"
                  onClick={() => handleDelete(sub)}
                  title="Delete subscription"
                  aria-label={`Delete ${sub.name}`}
                >
                  <Icon name="delete" className="text-base" />
                </button>
              </div>
            </article>
          ))}

          {visible.length === 0 && (
            <PaymentsEmpty title={`No ${freq} subscriptions yet`}>
              Add one to start tracking its billing schedule and payment history.
            </PaymentsEmpty>
          )}
        </div>

        <div className="pmt-summary">
          <span className="pmt-summary-label">
            {freq === 'monthly' ? 'Active monthly renewals' : 'Active yearly renewals'}
          </span>
          <span className="pmt-summary-value">
            {formatCurrency(activeTotal)}
            {suffix}
          </span>
        </div>
      </PaymentsPage>

      <PaymentsModal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Edit subscription' : 'Add subscription'}
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
        <SubscriptionForm
          key={editing?.id ?? 'new'}
          formId={formId}
          initial={editing}
          defaultFrequency={freq}
          onBusyChange={setSaving}
          onSaved={(savedFrequency) => {
            setFeedback({ text: editing ? 'Subscription updated.' : 'Subscription saved.' })
            closeModal()
            setFreq(savedFrequency === 'yearly' ? 'yearly' : 'monthly')
            load()
          }}
        />
      </PaymentsModal>
    </>
  )
}
