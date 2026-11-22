import { useConfirmation } from '../hooks/useConfirmation'
import { FinanceTransactions } from '../components/payments/FinanceTransactions'
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
import type { Income, IncomeCategory } from '../types'

const CATEGORIES: IncomeCategory[] = [
  'Salary',
  'Freelance',
  'Pocket Money',
  'Rental',
  'Business',
  'Other',
]

// Prototype reference palette — flat fill only, no gradients.
const INCOME_COLORS = ['var(--accent)', 'var(--nb-cyan)', 'var(--nb-teal)', 'var(--nb-violet)', 'var(--nb-pink)', 'var(--nb-orange)']

// Backend documents use Mongo `_id`; normalize so the frontend `Income`
// type (and all call sites) stay unchanged.
function normalizeIncome(raw: Record<string, unknown>): Income {
  return {
    id: String(raw._id ?? raw.id),
    memberId: String(raw.memberId ?? ''),
    title: (raw.title as string) ?? '',
    amount: Number(raw.amount ?? 0),
    payPattern: raw.payPattern === 'variable' ? 'variable' : 'regular',
    creditDate: raw.payPattern === 'variable' ? null : Number(raw.creditDate ?? 1),
    category: ((raw.category as IncomeCategory) ?? 'Other'),
    taxable: Boolean(raw.taxable),
    startDate: raw.startDate ? String(raw.startDate) : '',
    endDate: raw.endDate ? String(raw.endDate) : null,
    notes: raw.notes as string | undefined,
  }
}

function toDateInput(value: string): string {
  return value ? String(value).slice(0, 10) : ''
}

interface IncomeFormProps {
  formId: string
  initial?: Income | null
  onSaved: () => void
  onBusyChange: (busy: boolean) => void
}

function IncomeForm({ formId, initial, onSaved, onBusyChange }: IncomeFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [category, setCategory] = useState<IncomeCategory>(
    initial?.category ?? 'Salary',
  )
  const [payPattern, setPayPattern] = useState<Income['payPattern']>(initial?.payPattern ?? 'regular')
  const regular = payPattern === 'regular'
  const [creditDate, setCreditDate] = useState(String(initial?.creditDate ?? 1))
  const [taxable, setTaxable] = useState(initial?.taxable ?? true)
  const [startDate, setStartDate] = useState(toDateInput(initial?.startDate ?? ''))
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    onBusyChange(true)
    const payload = {
      title,
      amount: Number(amount),
      category,
      payPattern,
      creditDate: regular ? Number(creditDate) : null,
      taxable,
      startDate: startDate || undefined,
      notes: notes || undefined,
    }
    try {
      if (initial) {
        await apiClient.put(`/income/${initial.id}`, payload)
      } else {
        await apiClient.post('/income', payload)
      }
      onSaved()
    } catch (err: unknown) {
      const msg = toApiError(err).response?.data?.error ?? 'Could not save income.'
      setError(msg)
    } finally {
      onBusyChange(false)
    }
  }

  return (
    <form id={formId} onSubmit={onSubmit} className="pmt-stack">
      {error && <PaymentsNotice tone="error">{error}</PaymentsNotice>}

      <div className="pmt-field">
        <label className="pmt-label" htmlFor="inc-title">Title</label>
        <input
          id="inc-title"
          className="pmt-input"
          placeholder="e.g. Main Salary"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div className="pmt-field">
        <label className="pmt-label" htmlFor="inc-pattern">Payment pattern</label>
        <select id="inc-pattern" className="pmt-select" value={payPattern}
          onChange={event => setPayPattern(event.target.value as Income['payPattern'])}>
          <option value="regular">Regular monthly</option>
          <option value="variable">Variable or occasional</option>
        </select>
      </div>
      <div className="pmt-form-grid">
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="inc-amount">{regular ? 'Monthly amount' : 'Monthly estimate (optional)'}</label>
          <div className="pmt-rupee">
            <span className="pmt-rupee-prefix">₹</span>
            <input
              id="inc-amount"
              type="number"
              min={regular ? 0.01 : 0}
              step={0.01}
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required={regular}
            />
          </div>
        </div>
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="inc-cat">Category</label>
          <select
            id="inc-cat"
            className="pmt-select"
            value={category}
            onChange={(e) => setCategory(e.target.value as IncomeCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="pmt-form-grid">
        {regular && <div className="pmt-field">
          <label className="pmt-label" htmlFor="inc-day">Credit date (day of month)</label>
          <input
            id="inc-day"
            className="pmt-input pmt-mono"
            type="number"
            min={1}
            max={31}
            value={creditDate}
            onChange={(e) => setCreditDate(e.target.value)}
            required
          />
        </div>}
        <div className="pmt-field">
          <span className="pmt-label">Taxable income?</span>
          <label className="pmt-check">
            <input
              type="checkbox"
              checked={taxable}
              onChange={(e) => setTaxable(e.target.checked)}
            />
            <span>{taxable ? 'Yes' : 'No'}</span>
          </label>
        </div>
      </div>

      <div className="pmt-field">
        <label className="pmt-label" htmlFor="inc-start">Start date</label>
        <input
          id="inc-start"
          className="pmt-input pmt-mono"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>

      <div className="pmt-field">
        <label className="pmt-label" htmlFor="inc-notes">Notes</label>
        <textarea
          id="inc-notes"
          className="pmt-textarea"
          placeholder="Additional details…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </form>
  )
}

export function Income({ initialAddOpen = false }: { initialAddOpen?: boolean }) {
  const confirmAction = useConfirmation()
  const [items, setItems] = useState<Income[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(initialAddOpen)
  const [editing, setEditing] = useState<Income | null>(null)
  const [ledgerItem, setLedgerItem] = useState<Income | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const load = useCallback(() => Promise.resolve().then(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/income')
      setItems(((res.data ?? []) as Record<string, unknown>[]).map(normalizeIncome))
      setError(null)
    } catch (err: unknown) {
      const msg = toApiError(err).response?.data?.error ?? 'Could not load income.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }), [])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (inc: Income) => {
    if (!(await confirmAction(`Delete “${inc.title}”?`, 'This removes the income source from your plan.'))) return
    setDeleteError('')
    try {
      await apiClient.delete(`/income/${inc.id}`)
      setMessage('Income source deleted.')
      await load()
    } catch (err: unknown) {
      const msg = toApiError(err).response?.data?.error ?? 'Could not delete income.'
      setDeleteError(msg)
    }
  }

  const total = useMemo(() => items.reduce((s, i) => s + i.amount, 0), [items])

  const segments = useMemo(
    () =>
      items.map((inc, idx) => {
        const pct = total > 0 ? (inc.amount / total) * 100 : 0
        return {
          key: inc.id,
          label: inc.category,
          value: inc.amount,
          pct,
          color: INCOME_COLORS[idx % INCOME_COLORS.length],
        }
      }),
    [items, total],
  )

  const modalOpen = open || !!editing
  const formId = 'pmt-income-form'
  const hovered = hoveredIdx !== null ? items[hoveredIdx] : null
  const hoveredPct =
    hovered && total > 0 ? ((hovered.amount / total) * 100).toFixed(1) : '0.0'

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
        title="Income Sources"
        subtitle="Regular and variable sources with linked ledger payments."
        action={
          <button type="button" className="pmt-btn" onClick={() => setOpen(true)}>
            <Icon name="add" className="text-lg" />
            Add Income
          </button>
        }
      >
        {message && <PaymentsNotice>{message}</PaymentsNotice>}
        {/* Flat income-mix proportion bar — real data, no dummy control. */}
        <section className="pmt-viz" aria-label="Income mix proportion">
          <div className="pmt-viz-head">
            <span className="pmt-viz-title">Income mix proportion</span>
            <span className="pmt-readout">
              {hovered
                ? `${hovered.title.toUpperCase()} · ${hoveredPct}% (${formatCurrency(hovered.amount)})`
                : `TOTAL · ${formatCurrency(total)}/MO`}
            </span>
          </div>

          {segments.length > 0 && total > 0 ? (
            <>
              <div className="pmt-track" role="presentation">
                {segments.map((seg, idx) => (
                  <div
                    key={seg.key}
                    className="pmt-seg"
                    style={{
                      width: `${seg.pct}%`,
                      background: seg.color,
                      opacity: hoveredIdx === null || hoveredIdx === idx ? 1 : 0.3,
                    }}
                    title={`${seg.label}: ${seg.pct.toFixed(1)}%`}
                  />
                ))}
              </div>
              <div className="pmt-legend">
                {segments.map((seg, idx) => (
                  <span
                    key={seg.key}
                    className={`pmt-legend-item${hoveredIdx === idx ? ' is-active' : ''}`}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    <span className="pmt-swatch" style={{ background: seg.color }} />
                    {seg.label} {seg.pct.toFixed(1)}% ({formatCurrency(seg.value)})
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="pmt-tiny">No monthly income estimates yet.</p>
          )}
        </section>

        {deleteError && <PaymentsNotice tone="error">{deleteError}</PaymentsNotice>}
        <div className="pmt-grid-2">
          {items.map((inc) => (
            <article key={inc.id} className="pmt-item-card">
              <div className="pmt-card-top">
                <div style={{ minWidth: 0 }}>
                  <h2 className="pmt-card-title break-all-safe">{inc.title}</h2>
                  <div style={{ marginTop: 8 }}>
                    <span className="pmt-tag pmt-tag-yellow">{inc.category}</span>
                  </div>
                </div>
                <div className="pmt-row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="pmt-icon-btn"
                    onClick={() => setEditing(inc)}
                    title="Edit"
                    aria-label={`Edit ${inc.title}`}
                  >
                    <Icon name="edit" className="text-base" />
                  </button>
                  <button
                    type="button"
                    className="pmt-icon-btn pmt-icon-btn-danger"
                    onClick={() => handleDelete(inc)}
                    title="Delete"
                    aria-label={`Delete ${inc.title}`}
                  >
                    <Icon name="delete" className="text-base" />
                  </button>
                </div>
              </div>

              <div className="pmt-amount">
                {inc.payPattern === 'variable' && !inc.amount ? 'Varies' : formatCurrency(inc.amount)}
              </div>

              <div className="pmt-card-meta">
                <Icon name="calendar_today" className="text-sm" />
                <span>{inc.payPattern === 'regular' && inc.creditDate
                  ? `Credits on ${formatDay(inc.creditDate)}`
                  : inc.amount ? 'Variable · monthly estimate' : 'Variable · as received'}</span>
              </div>

              <div className="pmt-divider" />

              <div className="pmt-tax">
                <span className={`pmt-tax-sq${inc.taxable ? '' : ' is-exempt'}`} />
                <span>{inc.taxable ? 'Taxable' : 'Tax exempt'}</span>
              </div>
              <button type="button" className="pmt-btn pmt-btn-white pmt-btn-sm" onClick={() => setLedgerItem(inc)}>
                Transactions
              </button>
            </article>
          ))}

          {items.length === 0 && (
            <PaymentsEmpty title="No income sources yet">
              Add your first stream to see the monthly mix and totals.
            </PaymentsEmpty>
          )}
        </div>

        <div className="pmt-summary">
          <span className="pmt-summary-label">Planned monthly income</span>
          <span className="pmt-summary-value">{formatCurrency(total)}</span>
        </div>
      </PaymentsPage>

      {ledgerItem && <FinanceTransactions kind="income" id={ledgerItem.id} name={ledgerItem.title} onClose={() => setLedgerItem(null)} />}
      <PaymentsModal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Edit income source' : 'Add income source'}
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
        <IncomeForm
          key={editing?.id ?? 'new'}
          formId={formId}
          initial={editing}
          onBusyChange={setSaving}
          onSaved={() => {
            setMessage(editing ? 'Income source updated.' : 'Income source saved.')
            closeModal()
            load()
          }}
        />
      </PaymentsModal>
    </>
  )
}
