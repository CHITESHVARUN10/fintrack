import type { LedgerTransaction } from '../../types/api'
import { toApiError } from '../../lib/apiError'
import { useEffect, useState } from 'react'
import { Icon } from '../ui/Icon'
import { formatCurrency, formatDate } from '../../lib/format'
import type { Subscription } from '../../types'
import { subscriptionService } from '../../services/api'
import { apiClient } from '../../services/apiClient'
import { PaymentsModal, PaymentsNotice } from '../payments/PaymentsKit'

interface RecordSubscriptionPaymentModalProps {
  open: boolean
  onClose: () => void
  subscription: Subscription
  onRecorded: () => void
}

export function RecordSubscriptionPaymentModal({
  open,
  onClose,
  subscription,
  onRecorded,
}: RecordSubscriptionPaymentModalProps) {
  const [sourceType, setSourceType] = useState<'link' | 'manual'>('link')
  const [amount, setAmount] = useState(String(subscription.amount || ''))
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [mode, setMode] = useState(subscription.paymentMethod?.toUpperCase() || 'UPI')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Candidate transactions
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([])
  const [loadingTxs, setLoadingTxs] = useState(true)
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    Promise.all([
      subscriptionService.getTransactions(subscription.id).catch(() => ({ suggestions: [] })),
      apiClient.get<{ items: LedgerTransaction[] }>('/transactions', { params: { familyView: 'true', type: 'EXPENSE', limit: 40 } }).catch(() => ({ data: { items: [] } })),
    ])
      .then(([subTxData, allTxData]) => {
        const suggs = subTxData.suggestions || []
        const general = allTxData.data.items || []
        // merge suggestions and unlinked expenses
        const combined = [...suggs, ...general.filter((g) => !suggs.some((s) => s._id === g._id) && !g.subscriptionRef)]
        setTransactions(combined.slice(0, 30))
        if (combined.length > 0) {
          // Pre-select matching amount if any
          const match = combined.find((t) => Math.abs(t.amountPaise / 100 - subscription.amount) < 1) || combined[0]
          if (match) setSelectedTxId(match._id)
        } else {
          setSelectedTxId(null)
          setSourceType('manual')
        }
      })
      .finally(() => setLoadingTxs(false))
  }, [open, subscription.id, subscription.amount])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (sourceType === 'link') {
        if (!selectedTxId) {
          setError('Please select a transaction to link.')
          setLoading(false)
          return
        }
        await subscriptionService.linkTransaction(subscription.id, {
          transactionId: selectedTxId,
        })
      } else {
        const amt = Number(amount)
        if (!amt || amt <= 0) {
          setError('Please enter a valid amount.')
          setLoading(false)
          return
        }
        await subscriptionService.recordPayment(subscription.id, {
          amount: amt,
          date,
          mode,
          notes,
        })
      }

      onRecorded()
      onClose()
    } catch (caught: unknown) { const err = toApiError(caught);
      setError(err?.response?.data?.error || err.message || 'Failed to link/record payment.')
    } finally {
      setLoading(false)
    }
  }

  const rateLabel = `${formatCurrency(subscription.amount)} / ${subscription.frequency}`

  return (
    <PaymentsModal
      open={open}
      onClose={onClose}
      wide
      title={`Record / Link Payment — ${subscription.name}`}
      footer={
        <>
          <button type="button" className="pmt-btn pmt-btn-white" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            type="submit"
            form="pmt-record-payment-form"
            className="pmt-btn"
            disabled={loading}
          >
            {loading ? 'Saving…' : sourceType === 'link' ? 'Link Transaction' : 'Record Payment'}
          </button>
        </>
      }
    >
      <form id="pmt-record-payment-form" onSubmit={handleSubmit} className="pmt-stack">
        <div className="pmt-banner">
          <span className="pmt-banner-text">
            Link a transaction from your bank statement or record a manual renewal payment for{' '}
            {subscription.name}.
          </span>
          <span className="pmt-banner-tag">{rateLabel}</span>
        </div>

        {error && <PaymentsNotice tone="error">{error}</PaymentsNotice>}

        <div className="pmt-field">
          <span className="pmt-label">Payment source</span>
          <div className="pmt-source-tabs">
            <button
              type="button"
              onClick={() => setSourceType('link')}
              className={`pmt-source-tab${sourceType === 'link' ? ' is-active' : ''}`}
              aria-pressed={sourceType === 'link'}
            >
              <Icon name="credit_card" className="text-base" />
              <span className="pmt-source-label">Link bank / ledger transaction</span>
            </button>
            <button
              type="button"
              onClick={() => setSourceType('manual')}
              className={`pmt-source-tab${sourceType === 'manual' ? ' is-active' : ''}`}
              aria-pressed={sourceType === 'manual'}
            >
              <Icon name="edit" className="text-base" />
              <span className="pmt-source-label">Manual entry</span>
            </button>
          </div>
        </div>

        {sourceType === 'link' ? (
          <div className="pmt-field">
            <span className="pmt-label">Select transaction to link</span>
            {loadingTxs ? (
              <div className="pmt-notice">Loading candidate transactions…</div>
            ) : transactions.length === 0 ? (
              <div className="pmt-notice">
                <span>
                  Every recent ledger transaction is already linked. Use Manual Entry to record
                  this renewal instead.
                </span>
              </div>
            ) : (
              <div className="pmt-candidates">
                {transactions.map((tx) => {
                  const isSelected = selectedTxId === tx._id
                  const txAmt = tx.amountPaise ? tx.amountPaise / 100 : 0
                  const merchant =
                    tx.recipient?.name || tx.sender?.name || tx.productName || tx.mode || 'Payment'
                  return (
                    <label
                      key={tx._id}
                      className={`pmt-candidate${isSelected ? ' is-selected' : ''}`}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span className="pmt-candidate-name">
                          {merchant} — {formatCurrency(txAmt)}
                        </span>
                        <span className="pmt-candidate-meta">
                          {formatDate(tx.occurredAt)} · {tx.mode}
                          {tx.category ? ` · ${tx.category}` : ''}
                        </span>
                      </span>
                      <span className="pmt-candidate-right">
                        <span className="pmt-candidate-amount">{formatCurrency(txAmt)}</span>
                        <input
                          type="radio"
                          className="pmt-candidate-radio"
                          name="subPaymentTx"
                          checked={isSelected}
                          onChange={() => setSelectedTxId(tx._id)}
                        />
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="pmt-form-grid">
              <div className="pmt-field">
                <label className="pmt-label" htmlFor="rp-amount">Amount paid</label>
                <div className="pmt-rupee">
                  <span className="pmt-rupee-prefix">₹</span>
                  <input
                    id="rp-amount"
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
                <label className="pmt-label" htmlFor="rp-date">Payment date</label>
                <input
                  id="rp-date"
                  className="pmt-input pmt-mono"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="pmt-form-grid">
              <div className="pmt-field">
                <label className="pmt-label" htmlFor="rp-mode">Payment mode</label>
                <select
                  id="rp-mode"
                  className="pmt-select"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="UPI">UPI</option>
                  <option value="CARD">Credit / Debit Card</option>
                  <option value="BANK">Net Banking / Auto Debit</option>
                  <option value="WALLET">Wallet</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="pmt-field">
                <label className="pmt-label" htmlFor="rp-notes">Notes / reference</label>
                <input
                  id="rp-notes"
                  className="pmt-input"
                  placeholder="e.g. Monthly auto-debit renewal"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </>
        )}
      </form>
    </PaymentsModal>
  )
}
