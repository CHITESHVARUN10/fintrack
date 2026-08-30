import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, Input, Select } from '../ui/Field'
import { Icon } from '../ui/Icon'
import { formatCurrency, formatDate } from '../../lib/format'
import type { EMILoan } from '../../types'
import { loanService } from '../../services/api'
import { apiClient } from '../../services/apiClient'

interface RecordPrepaymentModalProps {
  open: boolean
  onClose: () => void
  loan: EMILoan
  initialAmount?: number
  onPrepaymentRecorded: () => void
}

export function RecordPrepaymentModal({
  open,
  onClose,
  loan,
  initialAmount,
  onPrepaymentRecorded,
}: RecordPrepaymentModalProps) {
  const [sourceType, setSourceType] = useState<'link' | 'manual'>('link')
  const [amount, setAmount] = useState(initialAmount ? String(initialAmount) : '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [mode, setMode] = useState('BANK')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Link transaction candidates
  const [transactions, setTransactions] = useState<any[]>([])
  const [loadingTxs, setLoadingTxs] = useState(false)
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null)

  useEffect(() => {
    if (initialAmount) {
      setAmount(String(initialAmount))
    }
  }, [initialAmount])

  useEffect(() => {
    if (!open) return
    setLoadingTxs(true)
    // Fetch both suggestions and recent expense transactions in family
    Promise.all([
      loanService.getTransactions(loan.id).catch(() => ({ suggestions: [] })),
      apiClient.get('/transactions', { params: { familyView: 'true', type: 'EXPENSE', limit: 40 } }).catch(() => ({ data: { items: [] } })),
    ])
      .then(([loanTxData, allTxData]) => {
        const suggs = loanTxData.suggestions || []
        const general = allTxData.data?.items || allTxData.data || []
        // merge and deduplicate by _id, preferring unlinked ones
        const combined = [...suggs, ...general.filter((g: any) => !suggs.some((s: any) => s._id === g._id) && !g.loanRef)]
        setTransactions(combined.slice(0, 30))
        if (combined.length > 0) {
          // If any candidate matches initialAmount, pre-select it
          const match = initialAmount
            ? combined.find((t: any) => Math.abs(t.amountPaise / 100 - initialAmount) < 1)
            : combined[0]
          if (match) setSelectedTxId(match._id)
        } else {
          setSourceType('manual')
        }
      })
      .finally(() => setLoadingTxs(false))
  }, [open, loan.id, initialAmount])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (sourceType === 'link') {
        if (!selectedTxId) {
          setError('Please select a transaction to link as prepayment.')
          setLoading(false)
          return
        }
        const tx = transactions.find((t) => t._id === selectedTxId)
        const amt = tx ? tx.amountPaise / 100 : Number(amount)
        await loanService.recordPrepayment(loan.id, {
          transactionId: selectedTxId,
          amount: amt,
          notes: notes || 'Linked prepayment from statement/ledger',
        })
      } else {
        const amt = Number(amount)
        if (!amt || amt <= 0) {
          setError('Please enter a valid prepayment amount.')
          setLoading(false)
          return
        }
        await loanService.recordPrepayment(loan.id, {
          amount: amt,
          date,
          mode,
          notes,
        })
      }

      onPrepaymentRecorded()
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to record prepayment.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Record Prepayment — ${loan.loanName}`} width="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-md">
        <div className="brutal bg-brand-yellow p-sm text-xs font-bold flex justify-between items-center">
          <span>
            Recording a prepayment reduces the loan's outstanding amount by the paid value and logs an audit transaction.
          </span>
          <span className="brutal-thin bg-white px-xs py-0.5 text-xs font-bold whitespace-nowrap">
            Current Outstanding: {formatCurrency(loan.outstandingAmount)}
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
            Prepayment Source
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
              <div className="text-xs p-md bg-white brutal-thin">Loading bank / family transactions…</div>
            ) : transactions.length === 0 ? (
              <div className="brutal-thin bg-surface-container-low p-md text-xs flex flex-col gap-xs">
                <span>No matching unlinked expense transactions found.</span>
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
                          {tx.recipient?.name || tx.sender?.name || tx.mode || 'Payment'} — {formatCurrency(txAmt)}
                        </span>
                        <span className="text-[11px] opacity-70">
                          {formatDate(tx.occurredAt)} · {tx.mode} · {tx.category || 'Bills'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold">{formatCurrency(txAmt)}</span>
                        <input
                          type="radio"
                          name="prepayTx"
                          checked={isSelected}
                          onChange={() => setSelectedTxId(tx._id)}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <Field label="Notes / Memo (Optional)">
              <Input
                placeholder="e.g. Part prepayment from bonus"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>
        ) : (
          <div className="flex flex-col gap-md">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <Field label="Prepayment Amount (₹)">
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
                  <option value="BANK">Net Banking / NEFT / RTGS</option>
                  <option value="UPI">UPI</option>
                  <option value="CARD">Debit / Credit Card</option>
                  <option value="CASH">Cash / Cheque</option>
                  <option value="OTHER">Other</option>
                </Select>
              </Field>

              <Field label="Notes / Reference">
                <Input
                  placeholder="e.g. UTR #123456 / Annual bonus prepayment"
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
            {loading ? 'Recording…' : 'Confirm & Record Prepayment'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
