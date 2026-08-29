import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { transactionService, familyService } from '../services/api'
import { apiClient } from '../services/apiClient'
import { Icon } from '../components/ui/Icon'
import { useAuth } from '../context/AuthContext'

type Tx = { _id: string; type: string; mode: string; amountPaise: number; category?: string; status: string; occurredAt: string; recipient?: { name?: string; upiId?: string }; sender?: { name?: string }; createdBy?: { name: string; email: string } | string; candidateOf?: string; confidence?: number; utr?: string; upiId?: string }

const ALL_CATEGORIES = ['Groceries','Food','Electricity','Rent','Transportation','Shopping','Medical','Education','Entertainment','Bills','Household','Other']
const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-white',
  RECONCILED: 'bg-tertiary-container',
  PENDING_REVIEW: 'bg-brand-yellow',
  VOIDED: 'bg-surface-variant text-on-surface-variant',
}
const TYPE_STYLES: Record<string, string> = {
  EXPENSE: 'bg-error-container text-on-error-container',
  INCOME: 'bg-tertiary-container text-on-tertiary-container',
  INTERNAL_TRANSFER: 'bg-brand-yellow',
  CASH_WITHDRAWAL: 'bg-surface-container-high',
  CASH_EXPENSE: 'bg-error-container text-on-error-container',
}

function money(paise?: number) { return `₹${((paise || 0) / 100).toLocaleString('en-IN')}` }
function fmtDate(iso: string) { try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return iso } }

export function Transactions() {
  const { isAdmin } = useAuth()
  const [familyView, setFamilyView] = useState(false)
  const [items, setItems] = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [form, setForm] = useState({ amount: '', type: 'EXPENSE', mode: 'UPI', category: 'Other', occurredAt: new Date().toISOString().slice(0, 16), recipient: '' })
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [modeFilter, setModeFilter] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [memberFilter, setMemberFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [compareData, setCompareData] = useState<any>(null)
  const [catEditId, setCatEditId] = useState<string | null>(null)
  const [catEditVal, setCatEditVal] = useState('')

  function load() {
    setLoading(true)
    const params: Record<string, string> = { familyView: String(familyView) }
    if (statusFilter) params.status = statusFilter
    if (categoryFilter) params.category = categoryFilter
    if (fromDate) params.from = fromDate
    if (toDate) params.to = toDate
    if (modeFilter) params.mode = modeFilter
    if (vendorFilter.trim()) params.vendor = vendorFilter.trim()
    if (familyView && memberFilter) params.memberId = memberFilter
    transactionService.list(params as any).then((d: any) => { setItems(d.items || d || []); setSummary(d.summary || null) }).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [familyView, statusFilter, categoryFilter, fromDate, toDate, modeFilter, vendorFilter, memberFilter])
  useEffect(() => { apiClient.get('/families/me').then((r) => r.data?.family?._id ? familyService.members(r.data.family._id).then((d: any) => setMembers((d.members || []).map((m: any) => ({ id: m.id, name: m.name })))).catch(() => {}) : null).catch(() => {}) }, [])

  useEffect(() => {
    if (!detailId) { setDetail(null); return }
    transactionService.get(detailId).then((d: any) => setDetail(d)).catch(() => setDetail(null))
  }, [detailId])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const amountPaise = Math.round(Number(form.amount || 0) * 100)
    if (!amountPaise) return
    await transactionService.create({ amountPaise, type: form.type, mode: form.mode, category: form.category, occurredAt: form.occurredAt, recipient: form.recipient ? { name: form.recipient } : undefined, familyTransfer: (form as any).toUserId ? { toUserId: (form as any).toUserId } : undefined } as any)
    setForm({ amount: '', type: 'EXPENSE', mode: 'UPI', category: 'Other', occurredAt: new Date().toISOString().slice(0, 16), recipient: '' })
    load()
  }

  const filtered = useMemo(() => {
    if (!q.trim()) return items
    const needle = q.toLowerCase()
    return items.filter((t) => [t.type, t.category, t.mode, t.status, (t.recipient as any)?.name, typeof t.createdBy === 'object' ? (t.createdBy as any)?.name : ''].join(' ').toLowerCase().includes(needle))
  }, [items, q])

  function toggleSelect(id: string) {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else { if (n.size >= 4) return n; n.add(id) } return n })
  }

  async function doCompare() {
    if (selectedIds.size < 2) return
    const res = await apiClient.get('/transactions/compare', { params: { ids: Array.from(selectedIds).join(',') } })
    setCompareData(res.data)
  }

  async function saveCategory(id: string) {
    await transactionService.update(id, { category: catEditVal } as any)
    setCatEditId(null); load()
    if (detailId === id) { const d: any = await transactionService.get(id); setDetail(d) }
  }

  return (
    <div>
      <PageHeader title="Transactions" subtitle="Manual entry + family ledger. Transfers and withdrawals don't inflate spend." />
      <div className="flex flex-wrap gap-sm mb-md items-center">
        <button onClick={() => setFamilyView(false)} className={`brutal px-md py-xs font-bold uppercase text-sm ${!familyView ? 'bg-brand-yellow' : 'bg-white'}`}>My</button>
        <button onClick={() => setFamilyView(true)} className={`brutal px-md py-xs font-bold uppercase text-sm ${familyView ? 'bg-brand-yellow' : 'bg-white'}`}>Family</button>
        {isAdmin && <span className="text-xs opacity-60">Admin sees full family ledger</span>}
        <div className="ml-auto flex gap-sm items-center">
          <input type="date" value={fromDate} onChange={(e)=> setFromDate(e.target.value)} className="brutal-thin px-sm py-xs text-sm" title="From" />
          <input type="date" value={toDate} onChange={(e)=> setToDate(e.target.value)} className="brutal-thin px-sm py-xs text-sm" title="To" />
          <input value={vendorFilter} onChange={(e)=> setVendorFilter(e.target.value)} placeholder="Vendor" className="brutal-thin px-sm py-xs text-sm w-28" />
          <select value={modeFilter} onChange={(e)=> setModeFilter(e.target.value)} className="brutal-thin px-sm py-xs text-sm"><option value="">All modes</option><option value="UPI">UPI</option><option value="BANK">BANK</option><option value="CASH">CASH</option><option value="CARD">CARD</option><option value="OTHER">OTHER</option></select>
          {familyView && <select value={memberFilter} onChange={(e)=> setMemberFilter(e.target.value)} className="brutal-thin px-sm py-xs text-sm"><option value="">All members</option>{members.map((m:any)=> <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="brutal-thin px-sm py-xs text-sm w-28" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="brutal-thin px-sm py-xs text-sm"><option value="">All statuses</option><option value="PENDING_REVIEW">Pending review</option><option value="ACTIVE">Active</option><option value="RECONCILED">Reconciled</option></select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="brutal-thin px-sm py-xs text-sm"><option value="">All categories</option>{ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-sm mb-md">
          <div className="brutal bg-white p-sm"><div className="text-xs uppercase font-bold tracking-wider">Actual Spend</div><div className="text-xl font-bold">{money(summary.actualExpenditurePaise)}</div><div className="text-xs text-on-surface-variant">EXPENSE + CASH_EXPENSE</div></div>
          <div className="brutal bg-white p-sm"><div className="text-xs uppercase font-bold tracking-wider">Transfers</div><div className="text-xl font-bold">{money(summary.internalTransfersPaise)}</div><div className="text-xs text-on-surface-variant">Not counted in spend</div></div>
          <div className="brutal bg-white p-sm"><div className="text-xs uppercase font-bold tracking-wider">Withdrawals</div><div className="text-xl font-bold">{money(summary.cashWithdrawalsPaise)}</div><div className="text-xs text-on-surface-variant">Cash out</div></div>
          <div className="brutal bg-white p-sm"><div className="text-xs uppercase font-bold tracking-wider">Total Movement</div><div className="text-xl font-bold">{money(summary.totalMovementPaise)}</div></div>
        </div>
      )}

      <form onSubmit={handleCreate} className="brutal bg-white p-md flex flex-wrap gap-sm mb-md items-end">
        <label className="flex flex-col text-xs font-bold uppercase gap-1">Amount ₹<input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="brutal-thin px-sm py-xs" placeholder="500" /></label>
        <label className="flex flex-col text-xs font-bold uppercase gap-1">Type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="brutal-thin px-sm py-xs"><option>EXPENSE</option><option>INCOME</option><option>INTERNAL_TRANSFER</option><option>CASH_WITHDRAWAL</option><option>CASH_EXPENSE</option></select></label>
        <label className="flex flex-col text-xs font-bold uppercase gap-1">Mode<select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className="brutal-thin px-sm py-xs"><option>UPI</option><option>BANK</option><option>CASH</option><option>CARD</option><option>OTHER</option></select></label>
        <label className="flex flex-col text-xs font-bold uppercase gap-1">Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="brutal-thin px-sm py-xs">{ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="flex flex-col text-xs font-bold uppercase gap-1">When<input type="datetime-local" value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} className="brutal-thin px-sm py-xs" /></label>
        <label className="flex flex-col text-xs font-bold uppercase gap-1">Recipient<input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} className="brutal-thin px-sm py-xs" placeholder="Optional" /></label>
        {form.type === 'INTERNAL_TRANSFER' && <label className="flex flex-col text-xs font-bold uppercase gap-1">To member<select value={(form as any).toUserId || ''} onChange={(e) => setForm({ ...form, toUserId: e.target.value } as any)} className="brutal-thin px-sm py-xs"><option value="">Select</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
        <button type="submit" className="brutal bg-brand-yellow px-md py-xs font-bold uppercase">+ Add</button>
      </form>

      {selectedIds.size >= 2 && (
        <div className="brutal bg-brand-yellow p-sm mb-md flex items-center justify-between">
          <span className="text-sm font-bold">{selectedIds.size} selected for compare</span>
          <div className="flex gap-sm"><button onClick={doCompare} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase">Compare</button><button onClick={() => { setSelectedIds(new Set()); setCompareData(null) }} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase">Clear</button></div>
        </div>
      )}

      {compareData && (
        <div className="brutal bg-white p-md mb-md">
          <div className="flex justify-between items-center mb-sm"><h3 className="font-bold uppercase">Compare</h3><button onClick={() => setCompareData(null)} className="brutal-thin px-sm py-xs text-xs font-bold uppercase">Close</button></div>
          <div className="grid md:grid-cols-2 gap-md">
            {(compareData.items || []).map((t: any) => (
              <div key={t._id} className="brutal-thin p-sm bg-surface-container-low">
                <div className="font-bold text-sm">{money(t.amountPaise)} — {t.type}</div>
                <div className="text-xs">Date: {fmtDate(t.occurredAt)} • Mode: {t.mode} • Category: {t.category || '—'} • By: {typeof t.createdBy === 'object' ? t.createdBy?.name : '—'}</div>
                <div className="text-xs">UTR: {t.UTR || t.utu || (compareData.sourcesByTx?.[String(t._id)]?.[0]?.utr) || '—'} • Status: {t.status}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? <div className="text-sm p-md brutal bg-white">Loading…</div> : filtered.length === 0 ? <div className="brutal bg-white p-md text-sm">No transactions yet.</div> : (
        <div className="brutal bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-on-surface text-white"><tr><th className="px-sm py-xs"><Icon name="check_box" className="text-base" /></th><th className="text-left px-sm py-xs">Date</th><th className="text-left px-sm py-xs">Made by</th><th className="text-left px-sm py-xs">Type</th><th className="text-left px-sm py-xs">Amount</th><th className="text-left px-sm py-xs">Mode</th><th className="text-left px-sm py-xs">Category</th><th className="text-left px-sm py-xs">Status</th></tr></thead>
              <tbody>
                {filtered.map((t) => {
                  const madeBy = typeof t.createdBy === 'object' && t.createdBy ? (t.createdBy as any).name : typeof t.createdBy === 'string' ? t.createdBy.slice(0, 8) : '—'
                  return (
                    <tr key={t._id} className="border-t-2 border-on-surface/20 hover:bg-surface-container-low/60 cursor-pointer" onClick={() => setDetailId(t._id)}>
                      <td className="px-sm py-xs" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(t._id)} onChange={() => toggleSelect(t._id)} /></td>
                      <td className="px-sm py-xs whitespace-nowrap">{fmtDate(t.occurredAt)}</td>
                      <td className="px-sm py-xs font-medium">{madeBy}</td>
                      <td className="px-sm py-xs"><span className={`brutal-thin px-xs py-0.5 text-xs font-bold uppercase ${TYPE_STYLES[t.type] || 'bg-white'}`}>{t.type.replace('_', ' ')}</span></td>
                      <td className="px-sm py-xs font-bold whitespace-nowrap">{money(t.amountPaise)}</td>
                      <td className="px-sm py-xs">{t.mode}</td>
                      <td className="px-sm py-xs" onClick={(e) => e.stopPropagation()}>
                        {catEditId === t._id ? (
                          <span className="flex gap-xs items-center">
                            <select value={catEditVal} onChange={(e) => setCatEditVal(e.target.value)} className="brutal-thin px-xs py-0.5 text-xs">{ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                            <button onClick={() => saveCategory(t._id)} className="brutal bg-brand-yellow px-xs py-0.5 text-xs font-bold">Save</button>
                            <button onClick={() => setCatEditId(null)} className="brutal bg-white px-xs py-0.5 text-xs font-bold">Cancel</button>
                          </span>
                        ) : (
                          <button onClick={() => { setCatEditId(t._id); setCatEditVal(t.category || 'Other') }} className="brutal-thin px-xs py-0.5 text-xs bg-white hover:bg-brand-yellow">{t.category || 'Other'}</button>
                        )}
                      </td>
                      <td className="px-sm py-xs" onClick={(e) => e.stopPropagation()}>
                        <span className={`brutal-thin px-xs py-0.5 text-xs font-bold uppercase ${STATUS_STYLES[t.status] || 'bg-white'}`}>{t.status.replace('_', ' ')}</span>
                        {t.status === 'PENDING_REVIEW' && <button onClick={async () => { await transactionService.resolve(t._id, 'keepSeparate'); load() }} className="ml-xs brutal-thin bg-white px-xs py-0.5 text-xs font-bold hover:bg-brand-yellow">Keep separate</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-on-surface/40" onClick={() => setDetailId(null)} />
          <div className="relative w-full max-w-lg bg-white brutal overflow-auto">
            <div className="sticky top-0 bg-white border-b-[3px] border-on-surface p-md flex justify-between items-center">
              <h3 className="font-bold uppercase tracking-tight">Transaction Detail</h3>
              <button onClick={() => setDetailId(null)} className="brutal bg-white w-8 h-8 flex items-center justify-center"><Icon name="close" /></button>
            </div>
            <div className="p-md flex flex-col gap-md text-sm">
              <DetailRow label="Amount" value={money(detail.transaction.amountPaise)} bold />
              <DetailRow label="Type" value={detail.transaction.type} />
              <DetailRow label="Mode" value={detail.transaction.mode} />
              <DetailRow label="Category" value={detail.transaction.category || '—'} />
              <DetailRow label="Date" value={fmtDate(detail.transaction.occurredAt)} />
              <DetailRow label="Made by" value={typeof detail.transaction.createdBy === 'object' ? detail.transaction.createdBy?.name || detail.transaction.createdBy?.email : detail.transaction.createdBy || '—'} />
              <DetailRow label="Recipient" value={detail.transaction.recipient?.name || '—'} />
              <DetailRow label="Sender" value={detail.transaction.sender?.name || '—'} />
              <DetailRow label="UTR / Ref" value={detail.transaction.utr || detail.sources?.[0]?.utr || '—'} />
              <DetailRow label="UPI" value={detail.transaction.upiId || detail.sources?.[0]?.upiId || detail.transaction.recipient?.upiId || '—'} />
              <TeachVendorBox tx={detail.transaction} onDone={async()=>{ const d:any = await transactionService.get(detail.transaction._id); setDetail(d); load()}} />
              <DetailRow label="Status" value={detail.transaction.status} />
              <DetailRow label="Confidence" value={detail.transaction.confidence != null ? `${detail.transaction.confidence}%` : '—'} />
              {detail.transaction.candidateOf && <DetailRow label="Possible duplicate of" value={String(detail.transaction.candidateOf).slice(0, 12)} />}
              {detail.candidateOfTx && <div className="brutal-thin bg-brand-yellow p-sm text-xs">Pending review: possible duplicate of {money(detail.candidateOfTx.amountPaise)} on {fmtDate(detail.candidateOfTx.occurredAt)}</div>}
              <div>
                <div className="font-bold uppercase text-xs mb-xs">Source records ({(detail.sources || []).length})</div>
                <div className="flex flex-col gap-xs">
                  {(detail.sources || []).map((s: any) => (
                    <div key={s._id} className="brutal-thin p-sm bg-surface-container-low text-xs">
                      <div className="font-bold">{s.source} — {new Date(s.createdAt).toLocaleString('en-IN')}</div>
                      {s.utr && <div>UTR: {s.utr}</div>}
                      {s.upiId && <div>UPI: {s.upiId}</div>}
                      {s.transactionIdExt && <div>TxnId: {s.transactionIdExt}</div>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-sm">
                <button onClick={() => { if (detailId) { setSelectedIds((prev) => new Set(prev).add(detailId)); setDetailId(null) } }} className="brutal bg-brand-yellow px-md py-xs font-bold uppercase text-sm">Add to compare</button>
                {detail.transaction.status === 'PENDING_REVIEW' && (
                  <>
                    <button onClick={async () => { await transactionService.resolve(detail.transaction._id, 'merge', detail.transaction.candidateOf); setDetailId(null); load() }} className="brutal bg-white px-md py-xs font-bold uppercase text-sm">Merge duplicate</button>
                    <button onClick={async () => { await transactionService.resolve(detail.transaction._id, 'keepSeparate'); setDetailId(null); load() }} className="brutal bg-white px-md py-xs font-bold uppercase text-sm">Keep separate</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TeachVendorBox({ tx, onDone }: { tx: any; onDone: ()=>void }){
  const [cat,setCat]=useState(tx.category||'Other')
  const [busy,setBusy]=useState(false)
  async function teach(){
    setBusy(true)
    try{
      const r:any = await apiClient.post('/recipients', { label: tx.recipient?.name||tx.upiId||'', category: cat })
      await apiClient.post(`/recipients/${r.recipient._id}/apply`, { overwrite: false }).catch(()=>{})
      onDone()
    } finally { setBusy(false)}
  }
  return <div className="brutal-thin p-sm bg-brand-yellow/30 flex flex-wrap gap-sm items-center"><span className="text-xs font-bold uppercase">Teach vendor</span><select value={cat} onChange={e=> setCat(e.target.value)} className="brutal-thin px-sm py-xs text-xs bg-white">{ALL_CATEGORIES.map((c:string)=> <option key={c} value={c}>{c}</option>)}</select><button onClick={teach} disabled={busy} className="brutal bg-brand-yellow px-sm py-xs text-xs font-bold uppercase">{busy?'Saving…':'Save vendor'}</button></div>
}
function DetailRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div className="flex justify-between gap-md"><span className="text-on-surface-variant uppercase text-xs font-bold tracking-wider">{label}</span><span className={bold ? 'font-bold' : 'font-medium'}>{value}</span></div>
}
