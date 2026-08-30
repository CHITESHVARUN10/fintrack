import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { formatCurrency, formatDate, formatDay } from '../lib/format'
import type { Subscription, SubscriptionCategory, SubscriptionFrequency, SubscriptionStatus } from '../types'
import { subscriptionService } from '../services/api'
import { RecordSubscriptionPaymentModal } from '../components/subscriptions/RecordSubscriptionPaymentModal'

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

export function SubscriptionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Linked transactions & suggestions
  const [linkedTxs, setLinkedTxs] = useState<any[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [totalPaidPaise, setTotalPaidPaise] = useState(0)

  // Modals
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  const loadData = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [subRes, txRes] = await Promise.all([
        subscriptionService.get(id),
        subscriptionService.getTransactions(id).catch(() => ({ linked: [], suggestions: [], totalPaidPaise: 0 })),
      ])
      setSubscription(normalizeSubscription(subRes as any))
      setLinkedTxs(txRes.linked || [])
      setSuggestions(txRes.suggestions || [])
      setTotalPaidPaise(txRes.totalPaidPaise || 0)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not load subscription details.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [id])

  const handleDelete = async () => {
    if (!subscription || !window.confirm(`Delete "${subscription.name}"?`)) return
    try {
      await subscriptionService.delete(subscription.id)
      navigate('/subscriptions')
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not delete subscription.')
    }
  }

  const handleUnlink = async (txId: string) => {
    if (!subscription || !window.confirm('Unlink this transaction from the subscription?')) return
    try {
      await subscriptionService.unlinkTransaction(subscription.id, { transactionId: txId })
      loadData()
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not unlink transaction.')
    }
  }

  const handleLinkSuggestion = async (txId: string) => {
    if (!subscription) return
    try {
      await subscriptionService.linkTransaction(subscription.id, { transactionId: txId })
      loadData()
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not link transaction.')
    }
  }

  const handleToggleStatus = async () => {
    if (!subscription) return
    const nextStatus: SubscriptionStatus = subscription.status === 'Active' ? 'Paused' : 'Active'
    try {
      await subscriptionService.update(subscription.id, { status: nextStatus })
      loadData()
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not update status.')
    }
  }

  if (loading) return <LoadingBlock label="Loading subscription details…" />
  if (error || !subscription) {
    return (
      <div className="flex flex-col gap-md">
        <Button variant="white" onClick={() => navigate('/subscriptions')} className="self-start">
          ← Back to Subscriptions
        </Button>
        <div className="border-[3px] border-on-surface bg-red-100 p-md font-bold text-error">
          {error || 'Subscription not found'}
        </div>
      </div>
    )
  }

  const cadence = subscription.frequency === 'monthly' ? 'mo' : 'yr'

  return (
    <div className="flex flex-col gap-lg pb-xl">
      {/* Header & Back Navigation */}
      <div>
        <button
          onClick={() => navigate('/subscriptions')}
          className="text-xs font-bold uppercase tracking-wider mb-sm flex items-center gap-1 hover:underline"
        >
          <Icon name="arrow_back" className="text-sm" /> Back to Subscriptions
        </button>
        <PageHeader
          title={subscription.name}
          subtitle={`${subscription.category} · ${subscription.frequency === 'monthly' ? 'Monthly' : 'Yearly'} Plan · ${subscription.paymentMethod || 'Direct Payment'}`}
          action={
            <div className="flex flex-wrap gap-sm">
              <Button
                variant="yellow"
                onClick={() => setRecordPaymentOpen(true)}
                title="Link or record a payment"
              >
                <Icon name="add_card" className="text-xl" />
                Record / Link Payment
              </Button>
              <Button
                variant="white"
                onClick={handleToggleStatus}
                title={subscription.status === 'Active' ? 'Pause subscription' : 'Resume subscription'}
              >
                <Icon name={subscription.status === 'Active' ? 'pause' : 'play_arrow'} className="text-base" />
                {subscription.status === 'Active' ? 'Pause' : 'Resume'}
              </Button>
              <Button variant="white" onClick={() => setEditing(true)} title="Edit subscription">
                <Icon name="edit" className="text-base" />
              </Button>
              <button
                onClick={handleDelete}
                className="bg-error-container text-on-error-container p-2 brutal-thin hover:bg-error hover:text-on-error"
                title="Delete subscription"
              >
                <Icon name="delete" className="text-base" />
              </button>
            </div>
          }
        />
      </div>

      {/* Hero Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-md">
        {/* Cost */}
        <div className="brutal bg-brand-yellow p-md flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                Subscription Cost
              </span>
              <Badge color="yellow">{subscription.category}</Badge>
            </div>
            <p className="text-3xl font-bold text-on-surface mt-2">
              {formatCurrency(subscription.amount)}
              <span className="text-sm font-normal">/{cadence}</span>
            </p>
          </div>
          <div className="text-xs font-bold text-on-surface-variant mt-3 flex items-center gap-1">
            <Icon name="event_repeat" className="text-sm" /> Due on {formatDay(subscription.billingDate)} of each {cadence === 'mo' ? 'month' : 'year'}
          </div>
        </div>

        {/* Total Spent */}
        <div className="brutal bg-white p-md flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Total Spent to Date
            </span>
            <p className="text-3xl font-bold text-on-surface mt-2">
              {formatCurrency(totalPaidPaise / 100)}
            </p>
          </div>
          <div className="text-xs text-on-surface-variant mt-3">
            Across {linkedTxs.length} linked billing cycle(s)
          </div>
        </div>

        {/* Status & Auto-Renew */}
        <div className="brutal bg-white p-md flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                Status
              </span>
              <Badge color={subscription.status === 'Active' ? 'cyan' : 'surface'}>
                {subscription.status}
              </Badge>
            </div>
            <p className="text-2xl font-bold text-on-surface mt-2">
              Auto-Renew: {subscription.autoRenew ? 'ON' : 'OFF'}
            </p>
          </div>
          <div className="text-xs text-on-surface-variant mt-3">
            Reminder: {subscription.renewalReminderDays} days before due date
          </div>
        </div>

        {/* Payment Details */}
        <div className="brutal bg-white p-md flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Payment Method
            </span>
            <p className="text-2xl font-bold text-on-surface mt-2 truncate">
              {subscription.paymentMethod || '—'}
            </p>
          </div>
          <div className="text-xs text-on-surface-variant mt-3">
            Started: {formatDate(subscription.startDate) || '—'}
          </div>
        </div>
      </div>

      {/* Linked Transactions Section */}
      <div className="brutal bg-white p-md flex flex-col gap-md">
        <div className="flex flex-wrap items-center justify-between gap-sm border-b-2 border-on-surface pb-sm">
          <div>
            <h3 className="font-bold uppercase tracking-tight text-lg">
              Linked Transactions &amp; Payment History
            </h3>
            <span className="text-xs text-on-surface-variant">
              Transactions linked to this subscription ({linkedTxs.length} records · Total Paid:{' '}
              {formatCurrency(totalPaidPaise / 100)})
            </span>
          </div>
          <Button
            variant="yellow"
            onClick={() => setRecordPaymentOpen(true)}
            className="text-xs"
          >
            + Link / Record Payment
          </Button>
        </div>

        {/* Unlinked Candidate Suggestions */}
        {suggestions.length > 0 && (
          <div className="brutal bg-brand-yellow p-sm flex flex-col gap-xs">
            <span className="text-xs font-bold uppercase">
              💡 Suggested Transactions ({suggestions.length} matching payments found in ledger)
            </span>
            <div className="flex flex-col gap-xs max-h-36 overflow-auto">
              {suggestions.map((s: any) => {
                const sAmt = s.amountPaise ? s.amountPaise / 100 : 0
                return (
                  <div
                    key={s._id}
                    className="brutal-thin bg-white p-xs flex items-center justify-between text-xs"
                  >
                    <span>
                      {formatDate(s.occurredAt)} · <strong>{formatCurrency(sAmt)}</strong> ·{' '}
                      {s.recipient?.name || s.productName || s.mode}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleLinkSuggestion(s._id)}
                      className="brutal bg-brand-yellow px-sm py-0.5 text-[10px] font-bold uppercase hover:bg-white"
                    >
                      Link to {subscription.name}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Transactions Table */}
        {linkedTxs.length === 0 ? (
          <div className="p-md text-xs font-bold text-on-surface-variant bg-surface-container-low brutal-thin">
            No transactions currently linked to this subscription. Click “Link / Record Payment” or link transactions from the Transactions page to view billing history here.
          </div>
        ) : (
          <div className="overflow-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="bg-surface-container-high border-b border-on-surface/20">
                <tr>
                  <th className="px-sm py-xs text-left">Date</th>
                  <th className="px-sm py-xs text-right">Amount Paid</th>
                  <th className="px-sm py-xs text-left">Payment Mode</th>
                  <th className="px-sm py-xs text-left">Recipient / Merchant</th>
                  <th className="px-sm py-xs text-left">Made by</th>
                  <th className="px-sm py-xs text-left">Reference / Notes</th>
                  <th className="px-sm py-xs text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-on-surface/10">
                {linkedTxs.map((t: any) => {
                  const amt = t.amountPaise ? t.amountPaise / 100 : 0
                  const madeBy = typeof t.createdBy === 'object' && t.createdBy ? t.createdBy.name : '—'
                  return (
                    <tr key={t._id} className="hover:bg-surface-container-low/60">
                      <td className="px-sm py-xs whitespace-nowrap font-medium">{formatDate(t.occurredAt)}</td>
                      <td className="px-sm py-xs text-right font-bold text-on-surface">
                        {formatCurrency(amt)}
                      </td>
                      <td className="px-sm py-xs">{t.mode}</td>
                      <td className="px-sm py-xs opacity-80">{t.recipient?.name || t.productName || '—'}</td>
                      <td className="px-sm py-xs opacity-80">{madeBy}</td>
                      <td className="px-sm py-xs opacity-70 truncate max-w-xs">{t.notes || t.utr || '—'}</td>
                      <td className="px-sm py-xs text-center">
                        <button
                          type="button"
                          onClick={() => handleUnlink(t._id)}
                          className="brutal-thin bg-white px-xs py-0.5 text-[10px] font-bold uppercase hover:bg-error-container hover:text-on-error-container"
                          title="Unlink transaction from this subscription"
                        >
                          Unlink
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notes Section */}
      {subscription.notes && (
        <div className="brutal bg-white p-md flex flex-col gap-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            Notes &amp; Details
          </span>
          <p className="text-xs whitespace-pre-wrap bg-surface-container-low p-sm brutal-thin">
            {subscription.notes}
          </p>
        </div>
      )}

      {/* Record Payment Modal */}
      {subscription && (
        <RecordSubscriptionPaymentModal
          open={recordPaymentOpen}
          onClose={() => setRecordPaymentOpen(false)}
          subscription={subscription}
          onRecorded={() => loadData()}
        />
      )}

      {/* Edit Modal */}
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit Subscription">
        <EditSubscriptionForm
          subscription={subscription}
          onSaved={() => {
            setEditing(false)
            loadData()
          }}
          onCancel={() => setEditing(false)}
        />
      </Modal>
    </div>
  )
}

function EditSubscriptionForm({
  subscription,
  onSaved,
  onCancel,
}: {
  subscription: Subscription
  onSaved: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(subscription.name)
  const [category, setCategory] = useState<SubscriptionCategory>(subscription.category)
  const [amount, setAmount] = useState(String(subscription.amount))
  const [billingDate, setBillingDate] = useState(String(subscription.billingDate))
  const [frequency, setFrequency] = useState<SubscriptionFrequency>(subscription.frequency)
  const [startDate, setStartDate] = useState(subscription.startDate ? String(subscription.startDate).slice(0, 10) : '')
  const [renewalReminderDays, setRenewalReminderDays] = useState(String(subscription.renewalReminderDays || 3))
  const [paymentMethod, setPaymentMethod] = useState(subscription.paymentMethod || 'Credit Card')
  const [autoRenew, setAutoRenew] = useState(subscription.autoRenew)
  const [status, setStatus] = useState<SubscriptionStatus>(subscription.status)
  const [notes, setNotes] = useState(subscription.notes || '')
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
      await subscriptionService.update(subscription.id, payload)
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not update subscription.')
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
          {loading ? 'Saving…' : 'Update Subscription'}
        </Button>
      </div>
    </form>
  )
}
