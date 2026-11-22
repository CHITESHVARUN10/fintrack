import { useConfirmation } from '../hooks/useConfirmation'
import type { Budget } from '../types/api'
import { amountInPaise, formatCurrency } from '../lib/format'
import { toApiError } from '../lib/apiError'
import { useEffect, useState } from 'react'
import { apiClient } from '../services/apiClient'
import { LedgerTableScroll, LedgerEmpty, LedgerNotice, LedgerPage } from '../components/ledger/LedgerShell'

function money(paise?: number) {
  return formatCurrency((paise ?? 0) / 100)
}

export function Budgets() {
  const confirmAction = useConfirmation()
  const [items, setItems] = useState<Budget[]>([])
  const [form, setForm] = useState({ scope:'FAMILY', category:'', period:'MONTHLY', amount:'' })
  const [err, setErr] = useState<string|null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string|null>(null)

  function load(){ apiClient.get('/budgets').then(r=> setItems(r.data.items||r.data||[])).catch(()=>{}) }
  useEffect(()=>{ load() }, [])

  async function submit(e: React.FormEvent){
    e.preventDefault(); setErr(null); setMessage('')
    const amountPaise = amountInPaise(form.amount)
    if (!amountPaise) { setErr('Enter a budget amount greater than ₹0.'); return }
    setBusy(true)
    try {
      await apiClient.post('/budgets', { scope: form.scope, category: form.category || undefined, period: form.period, amountPaise })
      setMessage('Budget saved.')
      load()
      setForm({ scope:'FAMILY', category:'', period:'MONTHLY', amount:'' })
    } catch (caught: unknown) {
      const ex = toApiError(caught)
      setErr(ex.response?.data?.error || ex.message)
    } finally { setBusy(false) }
  }

  async function removeBudget(item: Budget) {
    if (!(await confirmAction(`Delete the ${item.scope.toLowerCase()}${item.category ? ` · ${item.category}` : ''} budget?`, 'Your transactions will stay in the ledger.'))) return
    setErr(null)
    setDeletingId(item._id)
    try {
      await apiClient.delete(`/budgets/${item._id}`)
      setMessage('Budget deleted.')
      load()
    } catch (caught: unknown) {
      const ex = toApiError(caught)
      setErr(ex.response?.data?.error || ex.message || 'Delete failed')
    } finally { setDeletingId(null) }
  }

  const familyBudget = items.find((b) => b.scope === 'FAMILY')
  const totalCapPaise = familyBudget?.amountPaise || 0
  const spentPaise = familyBudget?.spentPaise || 0
  const headroomPaise = totalCapPaise - spentPaise
  const nearLimit = items.filter((b) => (b.amountPaise || 0) > 0 && (b.spentPaise || 0) / b.amountPaise >= 0.7).length

  return (
    <LedgerPage
      title="Budgets"
      subtitle="Family / category / member budgets. Spend is actual expenditure only."
    >
      {message && <LedgerNotice>{message}</LedgerNotice>}
      {err && (
        <LedgerNotice tone="error">
          <span className="led-notice-mark">!</span>
          <span>{err}</span>
        </LedgerNotice>
      )}

      <div className="led-grid-4">
        <div className="led-card-yellow led-kpi">
          <span className="led-label">Total family cap</span>
          <div>
            <div className="led-kpi-val">{money(totalCapPaise)}</div>
            <div className="led-kpi-sub">
              {familyBudget ? `${familyBudget.period.toLowerCase()} family budget` : 'No family budget yet'}
            </div>
          </div>
        </div>
        <div className="led-card-sm led-kpi">
          <span className="led-label" style={{ color: 'var(--text-secondary)' }}>Spent this period</span>
          <div>
            <div className="led-kpi-val">{money(spentPaise)}</div>
            <div className="led-kpi-sub">Actual expenditure only</div>
          </div>
        </div>
        <div className="led-card-sm led-kpi">
          <span className="led-label" style={{ color: 'var(--text-secondary)' }}>{headroomPaise < 0 ? 'Over budget' : 'Remaining headroom'}</span>
          <div className="led-kpi-val" style={{ color: headroomPaise < 0 ? 'rgb(var(--c-error))' : 'var(--nb-teal)' }}>{money(Math.abs(headroomPaise))}</div>
        </div>
        <div className="led-card-sm led-kpi">
          <span className="led-label" style={{ color: 'var(--text-secondary)' }}>Categories near limit</span>
          <div className="led-kpi-val">
            {nearLimit} <span className="led-mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>(≥70%)</span>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="led-card">
        <div className="led-budget-form">
          <label className="led-field">Scope
            <select
              value={form.scope}
              onChange={e => {
                const scope = e.target.value
                setForm(f => ({ ...f, scope, category: scope === 'CATEGORY' ? f.category : '' }))
              }}
              className="led-select led-mono"
            >
              <option>FAMILY</option>
              <option>CATEGORY</option>
              <option>MEMBER</option>
            </select>
          </label>
          <label className="led-field">Category
            <input
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="led-input"
              placeholder={form.scope === 'CATEGORY' ? 'e.g. Groceries, Dining' : 'Only for CATEGORY scope'}
              disabled={form.scope !== 'CATEGORY'}
            />
          </label>
          <label className="led-field">Period
            <select value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} className="led-select led-mono">
              <option>MONTHLY</option>
              <option>WEEKLY</option>
              <option>YEARLY</option>
            </select>
          </label>
          <label className="led-field">Amount ₹
            <input
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="led-input led-mono"
              placeholder="10000"
              type="number"
              min="1"
            />
          </label>
          <button type="submit" disabled={busy} className="led-btn">{busy ? 'Saving…' : 'Save Budget'}</button>
        </div>
      </form>

      {items.length === 0 ? (
        <LedgerEmpty title="No budgets yet">Create a family, category, or member budget above.</LedgerEmpty>
      ) : (
        <div className="led-table-card">
          <LedgerTableScroll label="Budget details">
            <table className="led-table compact">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Category</th>
                  <th>Period</th>
                  <th>Budget</th>
                  <th>Spent</th>
                  <th>Utilization</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => {
                  const pct = (b.amountPaise || 0) > 0 ? Math.round(((b.spentPaise || 0) / b.amountPaise) * 100) : 0
                  const fillClass = pct >= 100 ? ' over' : pct >= 75 ? ' warn' : ''
                  return (
                    <tr key={b._id}>
                      <td className="led-mono led-strong">{b.scope}</td>
                      <td>{b.category || '—'}</td>
                      <td className="led-mono">{b.period}</td>
                      <td className="led-num">{money(b.amountPaise)}</td>
                      <td className="led-mono">{money(b.spentPaise)}</td>
                      <td>
                        <div className="led-budget-bar">
                          <div className="led-budget-track">
                            <div className={`led-budget-fill${fillClass}`} style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          <span className="led-budget-pct">{pct}%</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => removeBudget(b)}
                          disabled={deletingId === b._id}
                          className="led-btn led-btn-danger led-btn-xs"
                        >
                          {deletingId === b._id ? '…' : 'Del'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </LedgerTableScroll>
        </div>
      )}
    </LedgerPage>
  )
}
