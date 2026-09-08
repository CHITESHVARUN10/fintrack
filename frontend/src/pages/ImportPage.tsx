import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader'
import { importService } from '../services/api'
import { apiClient } from '../services/apiClient'
import { Icon } from '../components/ui/Icon'
import { useAuth } from '../context/AuthContext'

type HistoryItem = { batchId: string; fileName?: string; source: string; total: number; created: number; reconciled: number; pendingReview: number; deduped: number; failed: number; status: string; createdAt: string; createdBy?: { name: string; email: string } }

function SuccessOverlay({ show, summary, onClose }: { show: boolean; summary?: string; onClose: () => void }) {
  if (!show) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-on-surface/70 p-md">
      <div className="bg-white brutal max-w-md max-w-[calc(100vw-2rem)] w-full max-h-[90vh] overflow-y-auto p-lg sm:p-xl flex flex-col items-center gap-md animate-[scaleIn_0.35s_ease] min-w-0">
        <div className="w-20 h-20 rounded-full bg-brand-yellow border-[3px] border-on-surface flex items-center justify-center animate-[pop_0.45s_cubic-bezier(0.34,1.56,0.64,1)]">
          <Icon name="check" className="text-4xl" />
        </div>
        <h2 className="text-xl font-bold uppercase tracking-tight">Import Successful</h2>
        {summary && <p className="text-sm text-center text-on-surface-variant">{summary}</p>}
        <button onClick={onClose} className="brutal bg-brand-yellow px-xl py-sm font-bold uppercase">View Transactions</button>
      </div>
      <style>{`@keyframes pop{0%{transform:scale(0)}60%{transform:scale(1.15)}100%{transform:scale(1)}}@keyframes scaleIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  )
}

export function ImportPage() {
  const nav = useNavigate()
  const { user } = useAuth()
  const hasNoFamily = !user?.familyAccountId
  const [bankResult, setBankResult] = useState<any>(null)
  const [shotResult, setShotResult] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [busy, setBusy] = useState<'bank' | 'shot' | null>(null)
  const [success, setSuccess] = useState<{ msg: string } | null>(null)

  function loadHistory() {
    apiClient.get('/imports/history').then((r) => setHistory(r.data.batches || [])).catch(() => {})
  }
  useEffect(() => { loadHistory() }, [])

  async function onBank(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setErr(null); setBankResult(null); setBusy('bank')
    try {
      const r = await importService.bank(f)
      setBankResult(r)
      loadHistory()
      if (r.status === 'duplicate_file') { setErr(r.message || `Already imported — ${r.batch?.total||''} rows on ${r.batch?.createdAt||''}`); setBankResult(r); return }
      if (r.total > 0 && (r.status === 'success' || r.status === 'partial')) {
        const s = r.summary
        const msg = `Imported ${r.total} rows • ${s.created} new • ${s.reconciled} reconciled • ${s.deduped} deduped${s.pendingReview ? ` • ${s.pendingReview} pending review` : ''}`
        setSuccess({ msg })
      }
    } catch (ex: any) { setErr(ex.response?.data?.error || ex.response?.data?.message || ex.message) }
    finally { setBusy(null); (e.target as HTMLInputElement).value = '' }
  }

  async function onShot(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setErr(null); setShotResult(null); setBusy('shot')
    try {
      const r = await importService.screenshot(f)
      setShotResult(r)
      loadHistory()
      if (r.status === 'duplicate_file') { setErr(r.message || 'Already imported'); setShotResult(r); return }
      if (r.status === 'success') setSuccess({ msg: 'Screenshot extracted and reconciled.' })
    } catch (ex: any) { setErr(ex.response?.data?.error || ex.message) }
    finally { setBusy(null); (e.target as HTMLInputElement).value = '' }
  }

  return (
    <div className="min-w-0">
      <PageHeader title="Import" subtitle="Upload bank statements (CSV/XLSX) or UPI screenshots. Re-uploads are deduplicated." />
      {hasNoFamily && (
        <div className="brutal bg-brand-yellow p-md mb-md flex flex-wrap items-center justify-between gap-sm min-w-0">
          <div className="flex items-center gap-sm">
            <Icon name="group_add" />
            <span className="font-bold text-sm break-words min-w-0">You need a family to import. Create a new family or join one, then try again.</span>
          </div>
          <Link to="/family/create-join" className="brutal bg-white px-md py-xs font-bold uppercase text-sm">
            Create / Join Family
          </Link>
        </div>
      )}
      {err && <div className="brutal-thin bg-error-container text-on-error-container p-sm mb-md text-sm">{err}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md min-w-0">
        <div className="brutal bg-white p-md flex flex-col gap-sm min-w-0 max-w-full">
          <h3 className="font-bold uppercase flex items-center gap-sm"><Icon name="description" /> Bank Statement</h3>
          <p className="text-sm text-on-surface-variant">CSV or Excel (.xlsx). Header row must contain date, description, amount (Kotak-style: “Transaction Date”, “Description”, “Amount”, “Dr / Cr”).</p>
          <label className={`brutal-thin bg-brand-yellow px-md py-sm font-bold uppercase text-sm text-center cursor-pointer ${busy === 'bank' || hasNoFamily ? 'opacity-60 pointer-events-none' : ''}`}>
            {hasNoFamily ? 'Create a family first' : busy === 'bank' ? 'Importing…' : 'Choose File'}
            <input type="file" accept=".csv,.xlsx,.xls" onChange={onBank} className="hidden" disabled={busy !== null || hasNoFamily} />
          </label>
          {bankResult && (
            <div className="brutal-thin bg-surface-container-low p-sm text-xs overflow-auto max-h-64 min-w-0 break-words">
              <div className="font-bold mb-xs">File: {bankResult.fileName || '—'} — {bankResult.status}</div>
              {bankResult.summary && <div className="mb-xs text-on-surface-variant">new {bankResult.summary.created} • reconciled {bankResult.summary.reconciled} • pending {bankResult.summary.pendingReview} • deduped {bankResult.summary.deduped} • failed {bankResult.summary.failed}</div>}
              <pre className="whitespace-pre-wrap">{JSON.stringify(bankResult, null, 2)}</pre>
            </div>
          )}
        </div>
        <div className="brutal bg-white p-md flex flex-col gap-sm min-w-0 max-w-full">
          <h3 className="font-bold uppercase flex items-center gap-sm"><Icon name="image" /> UPI Screenshot</h3>
          <p className="text-sm text-on-surface-variant">Upload a payment screenshot; Gemini extracts amount/date/UPI.</p>
          <label className={`brutal-thin bg-white border-on-surface px-md py-sm font-bold uppercase text-sm text-center cursor-pointer ${busy === 'shot' || hasNoFamily ? 'opacity-60 pointer-events-none' : ''}`}>
            {hasNoFamily ? 'Create a family first' : busy === 'shot' ? 'Extracting…' : 'Choose Image'}
            <input type="file" accept="image/*" onChange={onShot} className="hidden" disabled={busy !== null || hasNoFamily} />
          </label>
          {shotResult && <pre className="brutal-thin bg-surface-container-low p-sm text-xs overflow-auto max-h-64 min-w-0 max-w-full break-words whitespace-pre-wrap">{JSON.stringify(shotResult, null, 2)}</pre>}
        </div>
      </div>

      <div className="mt-xl">
        <h3 className="font-bold uppercase tracking-tight mb-sm flex items-center gap-sm"><Icon name="history" /> Import History</h3>
        {history.length === 0 ? (
          <div className="brutal bg-white p-md text-sm text-on-surface-variant">No imports yet. Upload a statement above.</div>
        ) : (
          <div className="brutal bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-on-surface text-white">
                  <tr><th className="text-left px-sm py-xs whitespace-nowrap">Date</th><th className="text-left px-sm py-xs whitespace-nowrap">File</th><th className="text-left px-sm py-xs whitespace-nowrap">Source</th><th className="text-right px-sm py-xs whitespace-nowrap">Rows</th><th className="text-left px-sm py-xs whitespace-nowrap">Result</th><th className="text-left px-sm py-xs whitespace-nowrap">By</th></tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.batchId} className="border-t-2 border-on-surface/20">
                      <td className="px-sm py-xs whitespace-nowrap">{new Date(h.createdAt).toLocaleString('en-IN')}</td>
                      <td className="px-sm py-xs truncate max-w-[220px] whitespace-nowrap">{h.fileName || h.batchId.slice(0, 8)}</td>
                      <td className="px-sm py-xs whitespace-nowrap">{h.source === 'BANK_STATEMENT' ? 'Bank' : 'Screenshot'}</td>
                      <td className="text-right px-sm py-xs whitespace-nowrap">{h.total}</td>
                      <td className="px-sm py-xs">
                        <span className={`brutal-thin px-xs py-0.5 text-xs font-bold uppercase ${h.status === 'success' ? 'bg-brand-yellow' : h.status === 'partial' ? 'bg-surface-container-low' : 'bg-error-container text-on-error-container'}`}>{h.status}</span>
                        <span className="ml-xs text-xs text-on-surface-variant">+{h.created} new • {h.deduped} dup</span>
                      </td>
                      <td className="px-sm py-xs text-xs whitespace-nowrap">{h.createdBy?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <SuccessOverlay show={!!success} summary={success?.msg} onClose={() => { setSuccess(null); nav('/transactions') }} />
    </div>
  )
}
