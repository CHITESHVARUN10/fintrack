import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, Input, Select } from '../ui/Field'
import { Icon } from '../ui/Icon'
import { formatCurrency, formatDate } from '../../lib/format'
import type { Subscription } from '../../types'
import { subscriptionService } from '../../services/api'
import { apiClient } from '../../services/apiClient'

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
  const [transactions, setTransactions] = useState<any[]>([])
  const [loadingTxs, setLoadingTxs] = useState(false)
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setAmount(String(subscription.amount || ''))
    setLoadingTxs(true)
    Promise.all([
      subscriptionService.getTransactions(subscription.id).catch(() => ({ suggestions: [] })),
      apiClient.get('/transactions', { params: { familyView: 'true', type: 'EXPENSE', limit: 40 } }).catch(() => ({ data: { items: [] } })),
    ])
      .then(([subTxData, allTxData]) => {
        const suggs = subTxData.suggestions || []
        const general = allTxData.data?.items || allTxData.data || []
        // merge suggestions and unlinked expenses
        const combined = [...suggs, ...general.filter((g: any) => !suggs.some((s: any) => s._id === g._id) && !g.subscriptionRef)]
        setTransactions(combined.slice(0, 30))
        if (combined.length > 0) {
          // Pre-select matching amount if any
          const match = combined.find((t: any) => Math.abs(t.amountPaise / 100 - subscription.amount) < 1) || combined[0]
          if (match) setSelectedTxId(match._id)
        } else {
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
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to link/record payment.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Record / Link Payment — ${subscription.name}`} width="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-md">
        <div className="brutal bg-brand-yellow p-sm text-xs font-bold flex justify-between items-center">
          <span>
            Link a transaction from your bank statement or record a manual renewal payment for {subscription.name}.
          </span>
          <span className="brutal-thin bg-white px-xs py-0.5 text-xs font-bold whitespace-nowrap">
            {formatCurrency(subscription.amount)} / {subscription.frequency}
          </span>
        </div>

        {error && (
          <div className="brutal bg-red-100 p-sm text-xs font-bold text-error border-2 border-on-surface">
            {error}
          </div>
        )}

        {/* Source Selector */}
        <div className="flex flex-col gap-xs">
          <label className="text-xs uppercase font-bold tracking-wider opacity-70">
            Payment Source
          </label>
          <div className="grid grid-cols-2 gap-sm">
            <button
              type="button"
              onClick={() => setSourceType('link')}
              className={`brutal p-sm text-left flex items-center justify-between transition-all ${
                sourceType === 'link' ? 'bg-brand-yellow ring-2 ring-on-surface' : 'bg-white hover:bg-surface-container-low'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon name="account_balance_wallet" className="text-lg" />
                <span className="font-bold text-xs">Link Bank / Ledger Transaction</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSourceType('manual')}
              className={`brutal p-sm text-left flex items-center justify-between transition-all ${
                sourceType === 'manual' ? 'bg-brand-yellow ring-2 ring-on-surface' : 'bg-white hover:bg-surface-container-low'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon name="edit" className="text-lg" />
                <span className="font-bold text-xs">Manual Entry</span>
              </div>
            </button>
          </div>
        </div>

        {sourceType === 'link' ? (
          <div className="flex flex-col gap-sm">
            <label className="text-xs uppercase font-bold tracking-wider">
              Select Transaction to Link
            </label>
            {loadingTxs ? (
              <div className="text-xs p-md bg-white brutal-thin">Loading candidate transactions…</div>
            ) : transactions.length === 0 ? (
              <div className="brutal-thin bg-surface-container-low p-md text-xs flex flex-col gap-xs">
                <span>No matching unlinked transactions found.</span>
                <button
                  type="button"
                  onClick={() => setSourceType('manual')}
                  className="brutal bg-brand-yellow px-sm py-xs text-xs font-bold uppercase self-start"
                >
                  Switch to Manual Entry
                </button>
              </div>
            ) : (
              <div className="brutal bg-white overflow-auto max-h-60 flex flex-col divide-y divide-on-surface/10">
                {transactions.map((tx: any) => {
                  const isSelected = selectedTxId === tx._id
                  const txAmt = tx.amountPaise ? tx.amountPaise / 100 : 0
                  return (
                    <div
                      key={tx._id}
                      onClick={() => setSelectedTxId(tx._id)}
                      className={`p-sm flex items-center justify-between cursor-pointer transition-all ${
                        isSelected ? 'bg-brand-yellow font-bold ring-2 ring-inset ring-on-surface' : 'hover:bg-surface-container-low'
                      }`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold">
                          {tx.recipient?.name || tx.sender?.name || tx.productName || tx.mode || 'Payment'} — {formatCurrency(txAmt)}
                        </span>
                        <span className="text-[11px] opacity-70">
                          {formatDate(tx.occurredAt)} · {tx.mode} · {tx.category || 'Entertainment'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold">{formatCurrency(txAmt)}</span>
                        <input
                          type="radio"
                          name="subPaymentTx"
                          checked={isSelected}
                          onChange={() => setSelectedTxId(tx._id)}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-md">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <Field label="Amount Paid (₹)">
                <div className="flex">
                  <span className="bg-surface-container-high border-[3px] border-r-0 border-on-surface px-3 flex items-center font-bold">
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

              <Field label="Payment Date">
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <Field label="Payment Mode">
                <Select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="UPI">UPI</option>
                  <option value="CARD">Credit / Debit Card</option>
                  <option value="BANK">Net Banking / Auto Debit</option>
                  <option value="WALLET">Wallet</option>
                  <option value="OTHER">Other</option>
                </Select>
              </Field>

              <Field label="Notes / Reference">
                <Input
                  placeholder="e.g. Monthly auto-debit renewal"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-sm pt-sm border-t-2 border-on-surface">
          <Button variant="white" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="yellow" type="submit" disabled={loading}>
            {loading ? 'Saving…' : sourceType === 'link' ? 'Link Transaction' : 'Record Payment'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
