import type { ImportResult } from '../types/api'
import { formatCurrency, indiaDateKey } from '../lib/format'
import { toApiError } from '../lib/apiError'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { importService } from '../services/api'
import { apiClient } from '../services/apiClient'
import { Icon } from '../components/ui/Icon'
import { useAuth } from '../context/AuthContext'
import { LedgerTableScroll, LedgerEmpty, LedgerNotice, LedgerOverlay, LedgerPage } from '../components/ledger/LedgerShell'

type HistoryItem = { batchId: string; fileName?: string; source: string; total: number; created: number; reconciled: number; pendingReview: number; deduped: number; failed: number; status: string; createdAt: string; createdBy?: { name: string; email: string } }

function SuccessOverlay({ show, summary, partial, onClose, onView }: { show: boolean; summary?: string; partial?: boolean; onClose: () => void; onView: () => void }) {
  if (!show) return null
  return (
    <LedgerOverlay onClose={onClose} label={partial ? 'Import partially complete' : 'Import successful'}>
      <div className="led-modal led-modal-sm">
        <div className="led-modal-body" style={{ alignItems: 'center', padding: '32px 26px 28px', gap: 14 }}>
          <div className="led-success-circle">
            <Icon name="check" className="text-4xl" />
          </div>
          <h2 className="led-success-title">{partial ? 'Import partially complete' : 'Import successful'}</h2>
          {summary && <p className="led-success-summary">{summary}</p>}
          <div className="led-row" style={{ gap: 10, marginTop: 8, width: '100%', justifyContent: 'center' }}>
            <button onClick={onView} className="led-btn">View Transactions</button>
            <button onClick={onClose} className="led-btn led-btn-white">Close</button>
          </div>
        </div>
      </div>
    </LedgerOverlay>
  )
}

function statusClass(status: string) {
  if (status === 'success') return 'led-tag led-tag-green'
  if (status === 'partial') return 'led-tag led-tag-yellow'
  return 'led-tag led-tag-red'
}

export function ImportPage() {
  const nav = useNavigate()
  const { user } = useAuth()
  const hasNoFamily = !user?.familyAccountId
  const [bankResult, setBankResult] = useState<ImportResult | null>(null)
  const [shotResult, setShotResult] = useState<ImportResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [busy, setBusy] = useState<'bank' | 'shot' | null>(null)
  const [success, setSuccess] = useState<{ msg: string; from?: string; to?: string; partial?: boolean } | null>(null)

  function loadHistory() {
    apiClient.get('/imports/history').then((r) => setHistory(r.data.batches || [])).catch(() => {})
  }
  useEffect(() => { loadHistory() }, [])

  async function onBank(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setErr(null); setBankResult(null); setBusy('bank')
    try {
      const r = { ...await importService.bank(f), fileName: f.name }
      setBankResult(r)
      loadHistory()
      if (r.status === 'duplicate_file') { setErr(r.message || `Already imported — ${r.batch?.total||''} rows on ${r.batch?.createdAt||''}`); setBankResult(r); return }
      if (r.status === 'failed') { setErr(`${f.name}: ${r.message || 'No transactions could be imported. Check the statement format and choose the file again.'}`); return }
      if (r.total > 0 && (r.status === 'success' || r.status === 'partial')) {
        const s = r.summary || { created: 0, reconciled: 0, pendingReview: 0, deduped: 0, failed: 0 }
        const msg = `Imported ${r.total} ${r.total === 1 ? 'row' : 'rows'} • ${s.created} new • ${s.reconciled} reconciled • ${s.deduped} deduped${s.pendingReview ? ` • ${s.pendingReview} pending review` : ''}`
        setSuccess({ msg: s.failed ? `${msg} • ${s.failed} failed` : msg, from: r.periodFrom ? indiaDateKey(new Date(r.periodFrom)) : undefined, to: r.periodTo ? indiaDateKey(new Date(r.periodTo)) : undefined, partial: r.status === 'partial' })
      }
    } catch (caught: unknown) { const ex = toApiError(caught); setErr(ex.response?.data?.error || ex.response?.data?.message || ex.message) }
    finally { setBusy(null); (e.target as HTMLInputElement).value = '' }
  }

  async function onShot(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setErr(null); setShotResult(null); setBusy('shot')
    try {
      const r = { ...await importService.screenshot(f), fileName: f.name }
      setShotResult(r)
      loadHistory()
      if (r.status === 'duplicate_file') { setErr(r.message || 'Already imported'); setShotResult(r); return }
      if (r.status === 'success') setSuccess({ msg: 'Screenshot processed.' })
      else setErr(`${f.name}: ${r.message || 'Could not read this screenshot. Choose another image and try again.'}`)
    } catch (caught: unknown) { const ex = toApiError(caught); setErr(ex.response?.data?.error || ex.message) }
    finally { setBusy(null); (e.target as HTMLInputElement).value = '' }
  }

  return (
    <LedgerPage
      title="Import"
      subtitle="Upload bank statements (CSV/XLSX) or UPI screenshots. Re-uploads are deduplicated."
    >
      {hasNoFamily && (
        <div className="led-banner">
          <div className="led-row" style={{ minWidth: 0 }}>
            <Icon name="group_add" />
            <span className="led-banner-title">You need a family to import. Create a new family or join one, then try again.</span>
          </div>
          <Link to="/settings#family" className="led-btn led-btn-white led-btn-sm">Create / Join Family</Link>
        </div>
      )}
      {err && (
        <LedgerNotice tone="error">
          <span className="led-notice-mark">!</span>
          <span>{err}</span>
        </LedgerNotice>
      )}

      <div className="led-grid-2">
        <div className="led-card led-upload-card">
          <div>
            <div className="led-upload-title"><Icon name="description" /> Bank Statement</div>
            <p className="led-page-sub" style={{ marginTop: 8 }}>
              CSV or Excel (.xlsx). Header row must contain date, description, amount (Kotak-style: “Transaction Date”, “Description”, “Amount”, “Dr / Cr”).
            </p>
          </div>
          <div>
            <label className={`led-file-btn${busy === 'bank' || hasNoFamily ? ' led-file-btn-disabled' : ''}`}>
              {hasNoFamily ? 'Create a family first' : busy === 'bank' ? 'Importing…' : 'Choose File'}
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={onBank}
                className="sr-only"
                disabled={busy !== null || hasNoFamily}
              />
            </label>
            {bankResult && (
              <div>
                <div className="led-result-head">
                  File: {bankResult.fileName || '—'} <span className={statusClass(bankResult.status)}>{bankResult.status.replace('_', ' ')}</span>
                </div>
                {bankResult.summary && (
                  <div className="led-tiny" style={{ marginBottom: 4 }}>
                    new {bankResult.summary.created} • reconciled {bankResult.summary.reconciled} • pending {bankResult.summary.pendingReview} • deduped {bankResult.summary.deduped} • failed {bankResult.summary.failed}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="led-card led-upload-card">
          <div>
            <div className="led-upload-title"><Icon name="image" /> UPI Screenshot</div>
            <p className="led-page-sub" style={{ marginTop: 8 }}>
              Upload a payment screenshot; Gemini extracts amount/date/UPI.
            </p>
          </div>
          <div>
            <label className={`led-file-btn led-file-btn-white${busy === 'shot' || hasNoFamily ? ' led-file-btn-disabled' : ''}`}>
              {hasNoFamily ? 'Create a family first' : busy === 'shot' ? 'Extracting…' : 'Choose Image'}
              <input
                type="file"
                accept="image/*"
                onChange={onShot}
                className="sr-only"
                disabled={busy !== null || hasNoFamily}
              />
            </label>
            {shotResult && (
              <div>
                <div className="led-result-head">
                  {shotResult.fileName || 'Screenshot'} <span className={statusClass(shotResult.status)}>{shotResult.status.replace('_', ' ')}</span>
                </div>
                {shotResult.parsed && <p>{formatCurrency(shotResult.parsed.amountPaise / 100)}{shotResult.parsed.recipient?.name ? ` · ${shotResult.parsed.recipient.name}` : ''}</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="led-stack">
        <h2 className="led-h3"><Icon name="history" /> Import History</h2>
        {history.length === 0 ? (
          <LedgerEmpty title="No imports yet">Upload a statement above to see the history here.</LedgerEmpty>
        ) : (
          <div className="led-table-card">
            <LedgerTableScroll label="Import history">
              <table className="led-table compact">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>File</th>
                    <th>Source</th>
                    <th>Rows</th>
                    <th>Result</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.batchId}>
                      <td className="led-mono led-nowrap" style={{ fontSize: 12 }}>{new Date(h.createdAt).toLocaleString('en-IN')}</td>
                      <td className="led-mono led-strong" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.fileName || h.batchId.slice(0, 8)}</td>
                      <td>{h.source === 'BANK_STATEMENT' ? 'Bank' : 'Screenshot'}</td>
                      <td className="led-num">{h.total}</td>
                      <td>
                        <span className={statusClass(h.status)}>{h.status}</span>
                        <span className="led-mono" style={{ marginLeft: 6, fontSize: 11.5, color: 'var(--text-secondary)' }}>+{h.created} new • {h.deduped} dup</span>
                      </td>
                      <td style={{ fontSize: 12 }}>{h.createdBy?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </LedgerTableScroll>
          </div>
        )}
      </div>

      <SuccessOverlay
        show={!!success}
        summary={success?.msg}
        partial={success?.partial}
        onClose={() => setSuccess(null)}
        onView={() => {
          const params = new URLSearchParams()
          if (success?.from) params.set('from', success.from)
          if (success?.to) params.set('to', success.to)
          nav(params.size ? `/transactions?${params}` : '/transactions')
          setSuccess(null)
        }}
      />
    </LedgerPage>
  )
}
