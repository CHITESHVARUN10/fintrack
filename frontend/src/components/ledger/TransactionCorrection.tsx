import { useState } from 'react'
import type { LedgerTransaction } from '../../types/api'
import { apiClient } from '../../services/apiClient'
import { amountInPaise, datetimeInput } from '../../lib/format'
import { toApiError } from '../../lib/apiError'
import { useConfirmation } from '../../hooks/useConfirmation'
import { LedgerNotice } from './LedgerShell'

export function TransactionCorrection({ tx, onChanged }: {
  tx: LedgerTransaction
  onChanged: (message: string, close?: boolean) => void
}) {
  const ask = useConfirmation()
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(String(tx.amountPaise / 100))
  const [date, setDate] = useState(() => datetimeInput(tx.occurredAt))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const split = !!(tx.categorySplit?.length || tx.lineItems?.length)
  const linked = !!(tx.financeLink || tx.subscriptionRef)
  const settled = tx.status === 'ACTIVE' || tx.status === 'RECONCILED'

  async function save(payload: Record<string, unknown>, voiding = false) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await apiClient.patch(`/transactions/${tx._id}/correction`, payload)
      setEditing(false)
      onChanged(voiding ? 'Transaction voided.' : 'Transaction corrected.', voiding)
    } catch (caught) {
      setError(toApiError(caught).response?.data.error ?? 'Could not update this transaction. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!settled || tx.isOffset || linked) return null

  return (
    <section className="led-source-card led-stack" aria-label="Correct transaction">
      {error && <LedgerNotice tone="error">{error}</LedgerNotice>}
      {editing ? (
        <form className="led-stack" onSubmit={event => {
          event.preventDefault()
          const amountPaise = amountInPaise(amount)
          const occurredAt = new Date(date)
          if (!amountPaise || !Number.isFinite(occurredAt.valueOf())) {
            setError('Enter a positive amount and a valid date.')
            return
          }
          if (amountPaise === tx.amountPaise && date === datetimeInput(tx.occurredAt)) {
            setEditing(false)
            return
          }
          void save({
            ...(amountPaise !== tx.amountPaise ? { amountPaise } : {}),
            ...(date !== datetimeInput(tx.occurredAt) ? { occurredAt: occurredAt.toISOString() } : {}),
          })
        }}>
          <label className="led-field">Amount ₹
            <input className="led-input" inputMode="decimal" value={amount} readOnly={split} onChange={event => setAmount(event.target.value)} />
          </label>
          {split && <p className="led-tiny">This amount is split across items or categories.</p>}
          <label className="led-field">Date and time
            <input className="led-input" type="datetime-local" value={date} onChange={event => setDate(event.target.value)} />
          </label>
          <div className="led-row">
            <button className="led-btn led-btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save correction'}</button>
            <button className="led-btn led-btn-white led-btn-sm" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="led-row">
          <button className="led-btn led-btn-white led-btn-sm" disabled={busy} onClick={() => setEditing(true)}>Correct amount or date</button>
          <button className="led-btn led-btn-danger led-btn-sm" disabled={busy} onClick={async () => {
            if (await ask('Void this transaction?', 'This removes it from totals. Its original source records will be kept.', 'Void transaction')) {
              await save({ void: true }, true)
            }
          }}>{busy ? 'Voiding…' : 'Void transaction'}</button>
        </div>
      )}
    </section>
  )
}
