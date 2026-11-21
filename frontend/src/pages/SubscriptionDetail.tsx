import type { LedgerTransaction } from '../types/api'
import { toApiError } from '../lib/apiError'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Icon } from '../components/ui/Icon'
import { formatCurrency, formatDate, formatDay } from '../lib/format'
import type { Subscription, SubscriptionCategory, SubscriptionFrequency, SubscriptionStatus } from '../types'
import { subscriptionService } from '../services/api'
import { RecordSubscriptionPaymentModal } from '../components/subscriptions/RecordSubscriptionPaymentModal'
import {
  PaymentsLoading,
  PaymentsModal,
  PaymentsNotice,
  PaymentsPage,
} from '../components/payments/PaymentsKit'

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

export function SubscriptionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Linked transactions & suggestions
  const [linkedTxs, setLinkedTxs] = useState<LedgerTransaction[]>([])
  const [suggestions, setSuggestions] = useState<LedgerTransaction[]>([])
  const [totalPaidPaise, setTotalPaidPaise] = useState(0)

  // Modals
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(() => Promise.resolve().then(async () => {
    setLoading(true);

if (!id) return
    try {
      const [subRes, txRes] = await Promise.all([
        subscriptionService.get(id),
        subscriptionService.getTransactions(id).catch(() => ({ linked: [], suggestions: [], totalPaidPaise: 0 })),
      ])
      setSubscription(normalizeSubscription(subRes as unknown as Record<string, unknown>))
      setLinkedTxs(txRes.linked || [])
      setSuggestions(txRes.suggestions || [])
      setTotalPaidPaise(txRes.totalPaidPaise || 0)
      setError(null)
    } catch (caught: unknown) { const err = toApiError(caught);
      setError(err?.response?.data?.error || 'Could not load subscription details.')
    } finally {
      setLoading(false)
    }
  }), [id])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDelete = async () => {
    if (!subscription || !window.confirm(`Delete "${subscription.name}"?`)) return
    try {
      await subscriptionService.delete(subscription.id)
      navigate('/subscriptions')
    } catch (caught: unknown) { const err = toApiError(caught);
      setActionError(err?.response?.data?.error || 'Could not delete subscription.')
    }
  }

  const handleUnlink = async (txId: string) => {
    if (!subscription || !window.confirm('Unlink this transaction from the subscription?')) return
    try {
      await subscriptionService.unlinkTransaction(subscription.id, { transactionId: txId })
      loadData()
    } catch (caught: unknown) { const err = toApiError(caught);
      setActionError(err?.response?.data?.error || 'Could not unlink transaction.')
    }
  }

  const handleLinkSuggestion = async (txId: string) => {
    if (!subscription) return
    try {
      await subscriptionService.linkTransaction(subscription.id, { transactionId: txId })
      loadData()
    } catch (caught: unknown) { const err = toApiError(caught);
      setActionError(err?.response?.data?.error || 'Could not link transaction.')
    }
  }

  const handleToggleStatus = async () => {
    if (!subscription) return
    const nextStatus: SubscriptionStatus = subscription.status === 'Active' ? 'Paused' : 'Active'
    try {
      await subscriptionService.update(subscription.id, { status: nextStatus })
      loadData()
    } catch (caught: unknown) { const err = toApiError(caught);
      setActionError(err?.response?.data?.error || 'Could not update status.')
    }
  }

  if (loading) {
    return (
      <div className="pmt-page">
        <PaymentsLoading />
      </div>
    )
  }

  if (error || !subscription) {
    return (
      <div className="pmt-page">
        <button type="button" className="pmt-back" onClick={() => navigate('/subscriptions')}>
          <Icon name="arrow_back" className="text-sm" />
          Back to subscriptions
        </button>
        <PaymentsNotice tone="error">{error || 'Subscription not found'}</PaymentsNotice>
      </div>
    )
  }

  const cadence = subscription.frequency === 'monthly' ? 'mo' : 'yr'
  const cycleLabel = subscription.frequency === 'monthly' ? 'month' : 'year'

  return (
    <>
      <PaymentsPage
        top={
          <button type="button" className="pmt-back" onClick={() => navigate('/subscriptions')}>
            <Icon name="arrow_back" className="text-sm" />
            Back to subscriptions
          </button>
        }
        title={subscription.name}
        subtitle={`${subscription.category} · ${subscription.frequency === 'monthly' ? 'Monthly' : 'Yearly'} Plan · ${subscription.paymentMethod || 'Direct Payment'}`}
        action={
          <>
            <button
              type="button"
              className="pmt-btn"
              onClick={() => setRecordPaymentOpen(true)}
              title="Link or record a payment"
            >
              <Icon name="credit_card" className="text-base" />
              Record / Link Payment
            </button>
            <button
              type="button"
              className="pmt-btn pmt-btn-white"
              onClick={handleToggleStatus}
              title={subscription.status === 'Active' ? 'Pause subscription' : 'Resume subscription'}
            >
              <Icon name={subscription.status === 'Active' ? 'pause' : 'play_arrow'} className="text-base" />
              {subscription.status === 'Active' ? 'Pause' : 'Resume'}
            </button>
            <button
              type="button"
              className="pmt-icon-btn"
              onClick={() => setEditing(true)}
              title="Edit subscription"
              aria-label="Edit subscription"
            >
              <Icon name="edit" className="text-base" />
            </button>
            <button
              type="button"
              className="pmt-icon-btn pmt-icon-btn-danger"
              onClick={handleDelete}
              title="Delete subscription"
              aria-label="Delete subscription"
            >
              <Icon name="delete" className="text-base" />
            </button>
          </>
        }
      >
        {actionError && <PaymentsNotice tone="error">{actionError}</PaymentsNotice>}

        {/* 4-column KPI row — matches the prototype's cost / spent / status /
            payment-method cards, fed by the live subscription payload. */}
        <div className="pmt-grid-4">
          <div className="pmt-card-yellow pmt-kpi">
            <div className="pmt-card-top">
              <span className="pmt-label">Subscription cost</span>
              <span className="pmt-tag pmt-tag-yellow">{subscription.category}</span>
            </div>
            <div>
              <div className="pmt-kpi-val">
                {formatCurrency(subscription.amount)}
                <span className="pmt-amount-unit">/{cadence}</span>
              </div>
              <div className="pmt-kpi-sub">
                Due on {formatDay(subscription.billingDate)} of each {cycleLabel}
              </div>
            </div>
          </div>

          <div className="pmt-card pmt-kpi">
            <span className="pmt-label" style={{ color: 'var(--text-secondary)' }}>
              Total spent to date
            </span>
            <div>
              <div className="pmt-kpi-val">{formatCurrency(totalPaidPaise / 100)}</div>
              <div className="pmt-kpi-sub">
                Across {linkedTxs.length} linked billing cycle(s)
              </div>
            </div>
          </div>

          <div className="pmt-card pmt-kpi">
            <div className="pmt-card-top">
              <span className="pmt-label" style={{ color: 'var(--text-secondary)' }}>Status</span>
              <span className={statusTagClass(subscription.status)}>{subscription.status}</span>
            </div>
            <div>
              <div className="pmt-kpi-heading">
                Auto-Renew: {subscription.autoRenew ? 'ON' : 'OFF'}
              </div>
              <div className="pmt-kpi-sub">
                Reminder: {subscription.renewalReminderDays} days before due date
              </div>
            </div>
          </div>

          <div className="pmt-card pmt-kpi">
            <span className="pmt-label" style={{ color: 'var(--text-secondary)' }}>
              Payment method
            </span>
            <div>
              <div className="pmt-kpi-heading break-all-safe">
                {subscription.paymentMethod || '—'}
              </div>
              <div className="pmt-kpi-sub">
                Started: {formatDate(subscription.startDate) || '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Linked transactions & payment history */}
        <section className="pmt-table-card">
          <div className="pmt-table-head">
            <div style={{ minWidth: 0 }}>
              <h2 className="pmt-table-title">Linked transactions &amp; payment history</h2>
              <p className="pmt-sub">
                Transactions linked to this subscription ({linkedTxs.length} records · Total Paid:{' '}
                {formatCurrency(totalPaidPaise / 100)})
              </p>
            </div>
            <button
              type="button"
              className="pmt-btn pmt-btn-sm"
              onClick={() => setRecordPaymentOpen(true)}
            >
              + Link / Record Payment
            </button>
          </div>

          {suggestions.length > 0 && (
            <div className="pmt-suggest">
              <div className="pmt-suggest-head">
                <Icon name="lightbulb" className="text-base" />
                Suggested transactions — {suggestions.length} matching payment(s) found in ledger
              </div>
              {suggestions.map((s) => {
                const sAmt = s.amountPaise ? s.amountPaise / 100 : 0
                return (
                  <div key={s._id} className="pmt-suggest-row">
                    <span>
                      {formatDate(s.occurredAt)} · <strong>{formatCurrency(sAmt)}</strong> ·{' '}
                      {s.recipient?.name || s.productName || s.mode}
                    </span>
                    <button
                      type="button"
                      className="pmt-btn pmt-btn-sm"
                      onClick={() => handleLinkSuggestion(s._id)}
                    >
                      Link to {subscription.name}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="pmt-table-scroll">
            <table className="pmt-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount paid</th>
                  <th>Payment mode</th>
                  <th>Recipient / merchant</th>
                  <th>Made by</th>
                  <th>Reference / notes</th>
                  <th className="pmt-cell-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {linkedTxs.length === 0 ? (
                  <tr>
                    <td className="pmt-empty-cell" colSpan={7}>
                      No transactions currently linked. Click “Link / Record Payment” or link
                      transactions from the Transactions page to build billing history here.
                    </td>
                  </tr>
                ) : (
                  linkedTxs.map((t) => {
                    const amt = t.amountPaise ? t.amountPaise / 100 : 0
                    const madeBy =
                      typeof t.createdBy === 'object' && t.createdBy ? t.createdBy.name : '—'
                    return (
                      <tr key={t._id}>
                        <td className="pmt-num">{formatDate(t.occurredAt)}</td>
                        <td className="pmt-num">{formatCurrency(amt)}</td>
                        <td>
                          <span className="pmt-tag pmt-tag-warm">{t.mode}</span>
                        </td>
                        <td>
                          <strong>{t.recipient?.name || t.productName || '—'}</strong>
                        </td>
                        <td>{madeBy}</td>
                        <td className="pmt-muted">{t.notes || t.utr || '—'}</td>
                        <td className="pmt-cell-right">
                          <button
                            type="button"
                            className="pmt-btn pmt-btn-white pmt-btn-sm"
                            onClick={() => handleUnlink(t._id)}
                            title="Unlink transaction from this subscription"
                          >
                            Unlink
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {subscription.notes && (
          <section className="pmt-card pmt-stack">
            <span className="pmt-label" style={{ color: 'var(--text-secondary)' }}>
              Notes &amp; details
            </span>
            <p className="pmt-tiny" style={{ whiteSpace: 'pre-wrap' }}>{subscription.notes}</p>
          </section>
        )}
      </PaymentsPage>

      <RecordSubscriptionPaymentModal
        open={recordPaymentOpen}
        onClose={() => setRecordPaymentOpen(false)}
        subscription={subscription}
        onRecorded={() => loadData()}
      />

      <PaymentsModal
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit subscription"
        footer={
          <>
            <button type="button" className="pmt-btn pmt-btn-white" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              type="submit"
              form="pmt-edit-subscription-form"
              className="pmt-btn"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Update subscription'}
            </button>
          </>
        }
      >
        <EditSubscriptionForm
          formId="pmt-edit-subscription-form"
          subscription={subscription}
          onBusyChange={setSaving}
          onSaved={() => {
            setEditing(false)
            loadData()
          }}
        />
      </PaymentsModal>
    </>
  )
}

function EditSubscriptionForm({
  formId,
  subscription,
  onSaved,
  onBusyChange,
}: {
  formId: string
  subscription: Subscription
  onSaved: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [name, setName] = useState(subscription.name)
  const [category, setCategory] = useState<SubscriptionCategory>(subscription.category)
  const [amount, setAmount] = useState(String(subscription.amount))
  const [billingDate, setBillingDate] = useState(String(subscription.billingDate))
  const [frequency, setFrequency] = useState<SubscriptionFrequency>(subscription.frequency)
  const [startDate, setStartDate] = useState(toDateInput(subscription.startDate ?? ''))
  const [renewalReminderDays, setRenewalReminderDays] = useState(String(subscription.renewalReminderDays || 3))
  const [paymentMethod, setPaymentMethod] = useState(subscription.paymentMethod || 'Credit Card')
  const [autoRenew, setAutoRenew] = useState(subscription.autoRenew)
  const [status, setStatus] = useState<SubscriptionStatus>(subscription.status)
  const [notes, setNotes] = useState(subscription.notes || '')
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
      await subscriptionService.update(subscription.id, payload)
      onSaved()
    } catch (caught: unknown) { const err = toApiError(caught);
      setError(err?.response?.data?.error || 'Could not update subscription.')
    } finally {
      onBusyChange(false)
    }
  }

  return (
    <form id={formId} onSubmit={onSubmit} className="pmt-stack">
      {error && <PaymentsNotice tone="error">{error}</PaymentsNotice>}

      <div className="pmt-field">
        <label className="pmt-label" htmlFor="edit-sub-name">Name</label>
        <input
          id="edit-sub-name"
          className="pmt-input"
          placeholder="e.g. Netflix"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="pmt-form-grid">
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="edit-sub-cat">Category</label>
          <select
            id="edit-sub-cat"
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
          <label className="pmt-label" htmlFor="edit-sub-status">Status</label>
          <select
            id="edit-sub-status"
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
          <label className="pmt-label" htmlFor="edit-sub-amount">Amount</label>
          <div className="pmt-rupee">
            <span className="pmt-rupee-prefix">₹</span>
            <input
              id="edit-sub-amount"
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
          <label className="pmt-label" htmlFor="edit-sub-day">Billing date (day of month)</label>
          <input
            id="edit-sub-day"
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
          <label className="pmt-label" htmlFor="edit-sub-freq">Frequency</label>
          <select
            id="edit-sub-freq"
            className="pmt-select"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as SubscriptionFrequency)}
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="edit-sub-method">Payment method</label>
          <select
            id="edit-sub-method"
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
          <label className="pmt-label" htmlFor="edit-sub-start">Start date</label>
          <input
            id="edit-sub-start"
            className="pmt-input pmt-mono"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="edit-sub-rem">Renewal reminder (days)</label>
          <input
            id="edit-sub-rem"
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
        <label className="pmt-label" htmlFor="edit-sub-notes">Notes</label>
        <textarea
          id="edit-sub-notes"
          className="pmt-textarea"
          placeholder="Additional details…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </form>
  )
}
