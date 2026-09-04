import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader'
import { transactionService, familyService, loanService } from '../services/api'
import { apiClient } from '../services/apiClient'
import { Icon } from '../components/ui/Icon'
import { useAuth } from '../context/AuthContext'

type Tx = { _id: string; type: string; mode: string; amountPaise: number; category?: string; subcategory?: string; productName?: string; status: string; occurredAt: string; recipient?: { name?: string; upiId?: string }; sender?: { name?: string }; createdBy?: { name: string; email: string } | string; candidateOf?: string; confidence?: number; utr?: string; upiId?: string; visibility?: string }

const DEFAULT_CATEGORIES = ['Groceries','Food','Electricity','Rent','Transportation','Shopping','Medical','Education','Entertainment','Bills','Household','Proxy','Family','Internal Transfer','Other']
let ALL_CATEGORIES: string[] = [...DEFAULT_CATEGORIES]
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [familyView, setFamilyView] = useState(false)
  const [items, setItems] = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [form, setForm] = useState({ amount: '', type: 'EXPENSE', mode: 'UPI', category: 'Other', occurredAt: new Date().toISOString().slice(0, 16), recipient: '', visibility: 'FAMILY' })
  const [q, setQ] = useState(() => searchParams.get('q') || '')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [modeFilter, setModeFilter] = useState('')
  const [vendorFilter, setVendorFilter] = useState(() => searchParams.get('vendor') || searchParams.get('q') || '')
  const [memberFilter, setMemberFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [compareData, setCompareData] = useState<any>(null)
  const [catEditId, setCatEditId] = useState<string | null>(null)
  const [catEditVal, setCatEditVal] = useState('')
  const [vendorSuggest, setVendorSuggest] = useState<any[]>([])
  const [showVendorSuggest, setShowVendorSuggest] = useState(false)
  const vendorSuggestRef = useRef(0)
  const [dynamicCats, setDynamicCats] = useState<string[]>(DEFAULT_CATEGORIES)

  useEffect(()=>{
    apiClient.get('/recipients/categories').then((r:any)=>{
      const cats = r.data?.categories || r.data?.items || []
      if(Array.isArray(cats) && cats.length){
        const merged = Array.from(new Set([...cats, ...DEFAULT_CATEGORIES]))
        ALL_CATEGORIES = merged as string[]
        setDynamicCats(merged as string[])
      }
    }).catch(()=>{})
    // also collect categories from existing transactions for free-form support
    apiClient.get('/transactions', { params:{ limit: 1 } }).catch(()=>{})
  }, [])

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
  // keep q/vendor in sync with URL ?q= and ?highlight=
  useEffect(() => {
    const urlQ = searchParams.get('q')
    const highlight = searchParams.get('highlight')
    if (urlQ !== null && urlQ !== q) setQ(urlQ)
    if (urlQ && urlQ !== vendorFilter) setVendorFilter(urlQ)
    if (highlight && highlight !== detailId) setDetailId(highlight)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // reflect detail drawer in URL so back button works
  useEffect(() => {
    const current = searchParams.get('highlight') || ''
    const next = detailId || ''
    if (current === next) return
    const p = new URLSearchParams(searchParams)
    if (next) p.set('highlight', next)
    else p.delete('highlight')
    setSearchParams(p, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId])
  useEffect(() => { apiClient.get('/families/me').then((r) => r.data?.family?._id ? familyService.members(r.data.family._id).then((d: any) => setMembers((d.members || []).map((m: any) => ({ id: m.id, name: m.name })))).catch(() => {}) : null).catch(() => {}) }, [])

  useEffect(() => {
    if (!detailId) { setDetail(null); return }
    transactionService.get(detailId).then((d: any) => setDetail(d)).catch(() => setDetail(null))
  }, [detailId])

  // autocomplete vendor for recipient field
  useEffect(()=>{
    const q = form.recipient.trim()
    if(q.length < 2){ setVendorSuggest([]); setShowVendorSuggest(false); return }
    const seq = ++vendorSuggestRef.current
    const t = setTimeout(()=>{
      apiClient.get('/recipients', { params:{ q, limit:5 }}).then((r:any)=>{
        if(seq!==vendorSuggestRef.current) return
        const arr = r.data?.items||[]
        setVendorSuggest(arr)
        setShowVendorSuggest(arr.length>0)
      }).catch(()=>{})
    }, 300)
    return ()=> clearTimeout(t)
  }, [form.recipient])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const amountPaise = Math.round(Number(form.amount || 0) * 100)
    if (!amountPaise) return
    await transactionService.create({ amountPaise, type: form.type, mode: form.mode, category: form.category, occurredAt: form.occurredAt, recipient: form.recipient ? { name: form.recipient } : undefined, visibility: form.visibility, familyTransfer: (form as any).toUserId ? { toUserId: (form as any).toUserId } : undefined } as any)
    setForm({ amount: '', type: 'EXPENSE', mode: 'UPI', category: 'Other', occurredAt: new Date().toISOString().slice(0, 16), recipient: '', visibility: 'FAMILY' })
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

  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResult, setBulkResult] = useState<any>(null)
  const otherCount = useMemo(() => items.filter((t) => !t.category || t.category === 'Other').length, [items])
  async function bulkCategorize() {
    if (otherCount === 0) return
    setBulkLoading(true)
    setBulkResult(null)
    try {
      const res: any = await apiClient.post('/transactions/bulk-categorize', { familyView, confidenceThreshold: 30, limit: 200 })
      setBulkResult(res.data)
      load()
    } catch (e: any) {
      setBulkResult({ error: e?.response?.data?.error || e.message || 'Bulk categorize failed' })
    } finally { setBulkLoading(false) }
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
          <button
            type="button"
            onClick={() => {
              const now = new Date()
              const y = now.getFullYear()
              const m = now.getMonth()
              const first = new Date(y, m, 1)
              const last = new Date(y, m + 1, 0)
              const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
              setFromDate(fmt(first))
              setToDate(fmt(last))
            }}
            title="Set date range to current month (1st to 28/29/30/31st)"
            className="brutal-thin px-sm py-xs text-xs font-bold uppercase bg-white hover:bg-brand-yellow whitespace-nowrap"
          >
            This Month
          </button>
          {(fromDate || toDate) && (
            <button
              type="button"
              onClick={() => { setFromDate(''); setToDate('') }}
              title="Clear date range"
              className="brutal-thin px-xs py-xs text-xs font-bold uppercase bg-white hover:bg-surface-container-high"
            >
              ✕
            </button>
          )}
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

      {otherCount > 0 && (
        <div className="brutal bg-brand-yellow p-sm mb-md flex flex-col gap-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">{otherCount} transaction(s) with "Other" category — auto-categorize using vendor, UPI handle &amp; past spend (BHIM-like)</span>
            <button onClick={bulkCategorize} disabled={bulkLoading} className="brutal bg-white px-md py-xs font-bold uppercase text-sm disabled:opacity-50">
              {bulkLoading ? 'Categorizing…' : 'Categorize Others'}
            </button>
          </div>
          <div className="text-xs opacity-80">Uses your vendor directory, UPI handle map and keyword rules. Low confidence stays as Other.</div>
          {bulkResult && (
            <div className="brutal-thin bg-white p-sm text-xs">
              {bulkResult.error ? (
                <span className="font-bold text-red-600">{bulkResult.error}</span>
              ) : (
                <>
                  <span className="font-bold">Scanned {bulkResult.scanned}, updated {bulkResult.updated}, still Other {bulkResult.stillOther}</span>
                  {bulkResult.details && bulkResult.details.length > 0 && (
                    <div className="mt-xs flex flex-col gap-xs max-h-32 overflow-auto">
                      {bulkResult.details.slice(0, 10).map((d: any) => (
                        <div key={d.id} className="flex justify-between">
                          <span>{(d.amount / 100).toFixed(2)} {d.oldCategory} → {d.newCategory}</span>
                          <span className="opacity-60">{d.confidence}% {d.rule}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleCreate} className="brutal bg-white p-md flex flex-wrap gap-sm mb-md items-end">
        <label className="flex flex-col text-xs font-bold uppercase gap-1">Amount ₹<input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="brutal-thin px-sm py-xs" placeholder="500" /></label>
        <label className="flex flex-col text-xs font-bold uppercase gap-1">Type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="brutal-thin px-sm py-xs"><option>EXPENSE</option><option>INCOME</option><option>INTERNAL_TRANSFER</option><option>CASH_WITHDRAWAL</option><option>CASH_EXPENSE</option></select></label>
        <label className="flex flex-col text-xs font-bold uppercase gap-1">Mode<select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className="brutal-thin px-sm py-xs"><option>UPI</option><option>BANK</option><option>CASH</option><option>CARD</option><option>OTHER</option></select></label>
        <label className="flex flex-col text-xs font-bold uppercase gap-1">Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="brutal-thin px-sm py-xs">{ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="flex flex-col text-xs font-bold uppercase gap-1">When<input type="datetime-local" value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} className="brutal-thin px-sm py-xs" /></label>
        <label className="flex flex-col text-xs font-bold uppercase gap-1 relative">Recipient<input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} onFocus={()=> vendorSuggest.length && setShowVendorSuggest(true)} onBlur={()=> setTimeout(()=> setShowVendorSuggest(false),200)} className="brutal-thin px-sm py-xs" placeholder="Vendor — type to search" autoComplete="off" />
          {showVendorSuggest && vendorSuggest.length>0 && (
            <div className="absolute top-full left-0 right-0 mt-1 brutal bg-white z-20 max-h-40 overflow-auto flex flex-col">
              {vendorSuggest.map((v:any)=> (
                <button key={v._id} type="button" onMouseDown={(e)=>{ e.preventDefault(); setForm({ ...form, recipient: v.label }); setShowVendorSuggest(false); if(v.primaryCategory && v.primaryCategory!=='Other' && form.category==='Other') setForm(f=> ({ ...f, recipient: v.label, category: v.primaryCategory })) }} className="text-left px-sm py-xs text-xs hover:bg-brand-yellow flex justify-between">
                  <span className="font-bold">{v.label}</span><span className="opacity-60">{v.primaryCategory} · {v.vendorKey}</span>
                </button>
              ))}
              <div className="text-[10px] opacity-60 px-sm py-xs border-t">Select to auto-fill category from vendor</div>
            </div>
          )}
        </label>
        {form.type === 'INTERNAL_TRANSFER' && <label className="flex flex-col text-xs font-bold uppercase gap-1">To member<select value={(form as any).toUserId || ''} onChange={(e) => setForm({ ...form, toUserId: e.target.value } as any)} className="brutal-thin px-sm py-xs"><option value="">Select</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
        <label className="flex flex-col text-xs font-bold uppercase gap-1">Visibility<select value={form.visibility} onChange={(e)=> setForm({...form, visibility:e.target.value})} className="brutal-thin px-sm py-xs"><option value="FAMILY">Family</option><option value="PRIVATE">Private (hidden)</option></select></label>
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
              <thead className="bg-on-surface text-white"><tr><th className="px-sm py-xs"><Icon name="check_box" className="text-base" /></th><th className="text-left px-sm py-xs">Date</th><th className="text-left px-sm py-xs">Made by</th><th className="text-left px-sm py-xs">Type</th><th className="text-left px-sm py-xs">Amount</th><th className="text-left px-sm py-xs">Mode</th><th className="text-left px-sm py-xs">Category</th><th className="text-left px-sm py-xs">Sub / Loan</th><th className="text-left px-sm py-xs">Visibility</th><th className="text-left px-sm py-xs">Status</th></tr></thead>
              <tbody>
                {filtered.map((t) => {
                  const madeBy = typeof t.createdBy === 'object' && t.createdBy ? (t.createdBy as any).name : typeof t.createdBy === 'string' ? t.createdBy.slice(0, 8) : '—'
                  const isActive = detailId===t._id
                  return (
                    <tr key={t._id} className={`border-t-2 border-on-surface/20 cursor-pointer ${isActive? 'bg-brand-yellow hover:bg-brand-yellow ring-2 ring-on-surface ring-inset': 'hover:bg-surface-container-low/60'}`} onClick={() => setDetailId(t._id)}>
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
                          <button onClick={() => { setCatEditId(t._id); setCatEditVal(t.category || 'Other') }} className="brutal-thin px-xs py-0.5 text-xs bg-white hover:bg-brand-yellow">{t.category || 'Other'}{t.productName? ` · ${t.productName}`:''}</button>
                        )}
                      </td>
                      <td className="px-sm py-xs text-xs" onClick={(e)=> e.stopPropagation()}>
                        {(t as any).loanRef ? (
                          <span className="brutal-thin bg-brand-yellow px-xs py-0.5 text-xs font-bold truncate max-w-[120px] inline-block" title={typeof (t as any).loanRef==='object'? (t as any).loanRef.loanName: 'Loan'}>
                            {(t as any).loanMeta?.isPrepayment ? '⭐ Prepay' : 'Loan EMI'}: {typeof (t as any).loanRef==='object' ? ((t as any).loanRef.loanName||'Loan') : 'Linked'}
                          </span>
                        ) : (t as any).subscriptionRef ? (
                          <span className="brutal-thin bg-brand-yellow px-xs py-0.5 text-xs font-bold truncate max-w-[120px] inline-block">
                            {typeof (t as any).subscriptionRef==='object' ? ((t as any).subscriptionRef.name||'Sub') : 'Sub'}
                          </span>
                        ) : (
                          <span className="opacity-30">—</span>
                        )}
                      </td>
                      <td className="px-sm py-xs text-xs" onClick={(e)=> e.stopPropagation()}>
                        <span className={`brutal-thin px-xs py-0.5 text-xs font-bold uppercase ${t.visibility==='PRIVATE'?'bg-on-surface text-white':'bg-white'}`}>{t.visibility||'FAMILY'}</span>
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

      {detail && (()=>{ const idx=filtered.findIndex((x:any)=> x._id===detailId); const prevId= idx>0? filtered[idx-1]._id: null; const nextId= idx>=0 && idx<filtered.length-1? filtered[idx+1]._id: null; return (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-on-surface/40" onClick={() => setDetailId(null)} />
          <div className="relative w-full max-w-lg bg-white brutal overflow-auto">
            <div className="sticky top-0 bg-white border-b-[3px] border-on-surface p-md flex flex-col gap-sm">
              <div className="flex justify-between items-center">
                <h3 className="font-bold uppercase tracking-tight">Transaction Detail</h3>
                <button onClick={() => setDetailId(null)} className="brutal bg-white w-8 h-8 flex items-center justify-center"><Icon name="close" /></button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase opacity-60">{idx>=0? `${idx+1} / ${filtered.length}`: ''}</span>
                <div className="flex gap-sm">
                  <button disabled={!prevId} onClick={()=> prevId && setDetailId(prevId)} className={`brutal px-sm py-xs text-xs font-bold uppercase ${prevId? 'bg-white hover:bg-brand-yellow':'bg-surface-variant opacity-50 pointer-events-none'}`}>‹ Prev</button>
                  <button disabled={!nextId} onClick={()=> nextId && setDetailId(nextId)} className={`brutal px-sm py-xs text-xs font-bold uppercase ${nextId? 'bg-brand-yellow hover:bg-white':'bg-surface-variant opacity-50 pointer-events-none'}`}>Next ›</button>
                </div>
              </div>
            </div>
            <div className="p-md flex flex-col gap-md text-sm">
              <DetailRow label="Amount" value={money(detail.transaction.amountPaise)} bold />
              <DetailRow label="Type" value={detail.transaction.type} />
              <DetailRow label="Mode" value={detail.transaction.mode} />
              <div className="flex justify-between items-center gap-sm">
                <span className="text-on-surface-variant uppercase text-xs font-bold tracking-wider">Category</span>
                {catEditId===detail.transaction._id ? (
                  <span className="flex gap-xs items-center">
                    <select value={catEditVal} onChange={e=> setCatEditVal(e.target.value)} className="brutal-thin px-xs py-0.5 text-xs bg-white">{dynamicCats.map(c=> <option key={c} value={c}>{c}</option>)}</select>
                    <button onClick={()=> saveCategory(detail.transaction._id)} className="brutal bg-brand-yellow px-xs py-0.5 text-xs font-bold">Save</button>
                    <button onClick={()=> setCatEditId(null)} className="brutal bg-white px-xs py-0.5 text-xs font-bold">Cancel</button>
                  </span>
                ) : (
                  <span className="flex items-center gap-sm">
                    <span className="font-medium">{detail.transaction.category || '—'}</span>
                    <button onClick={()=> { setCatEditId(detail.transaction._id); setCatEditVal(detail.transaction.category||'Other')}} className="brutal bg-brand-yellow px-xs py-0.5 text-xs font-bold uppercase">Edit</button>
                  </span>
                )}
              </div>
              {detail.transaction.subcategory && <DetailRow label="Subcategory" value={detail.transaction.subcategory} />}
              {detail.transaction.productName && <DetailRow label="Product" value={detail.transaction.productName} />}
              {detail.transaction.categorySplit && detail.transaction.categorySplit.length>0 && <div className="brutal-thin bg-surface-container-low p-xs text-xs">Split: {detail.transaction.categorySplit.map((s:any)=> `${s.category} ${(s.amountPaise/100).toLocaleString('en-IN')}`).join(' + ')}</div>}
              {detail.transaction.lineItems && detail.transaction.lineItems.length>0 && <div className="brutal-thin bg-surface-container-low p-xs text-xs">Items: {detail.transaction.lineItems.map((li:any)=> `${li.productName||''} ${li.category||''} ${(li.amountPaise/100).toLocaleString('en-IN')}`).join(' · ')}</div>}
              {vendorInfoCategoryChip(detail)}
              <DetailRow label="Date" value={fmtDate(detail.transaction.occurredAt)} />
              <DetailRow label="Made by" value={typeof detail.transaction.createdBy === 'object' ? detail.transaction.createdBy?.name || detail.transaction.createdBy?.email : detail.transaction.createdBy || '—'} />
              <DetailRow label="Recipient" value={detail.transaction.recipient?.name || '—'} />
              <DetailRow label="Sender" value={detail.transaction.sender?.name || '—'} />
              <DetailRow label="UTR / Ref" value={detail.transaction.utr || detail.sources?.[0]?.utr || '—'} />
              <DetailRow label="UPI" value={detail.transaction.upiId || detail.sources?.[0]?.upiId || detail.transaction.recipient?.upiId || '—'} />
              <div className="flex justify-between items-center gap-sm">
                <span className="text-on-surface-variant uppercase text-xs font-bold tracking-wider">Visibility</span>
                <span className={`brutal-thin px-xs py-0.5 text-xs font-bold uppercase ${detail.transaction.visibility==='PRIVATE'?'bg-on-surface text-white':'bg-white'}`}>{detail.transaction.visibility||'FAMILY'}</span>
                <button onClick={async()=>{ await transactionService.update(detail.transaction._id, { visibility: detail.transaction.visibility==='PRIVATE'?'FAMILY':'PRIVATE' } as any); const d:any=await transactionService.get(detail.transaction._id); setDetail(d); load(); }} className="brutal bg-white px-xs py-0.5 text-xs font-bold uppercase">{detail.transaction.visibility==='PRIVATE'?'Make Family':'Make Private (hide)'}</button>
              </div>
              <div className="text-[11px] opacity-60">Private is invisible to other family members even in dashboard/budgets/reports.</div>
              <TeachVendorBox key={detail.transaction._id} tx={detail.transaction} onDone={async()=>{ const d:any = await transactionService.get(detail.transaction._id); setDetail(d); load()}} />
              <SubscriptionLinkBox tx={detail.transaction} onDone={async()=>{ const d:any = await transactionService.get(detail.transaction._id); setDetail(d); load()}} />
              <LoanLinkBox tx={detail.transaction} onDone={async()=>{ const d:any = await transactionService.get(detail.transaction._id); setDetail(d); load()}} />
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
      )})()}
    </div>
  )
}

function TeachVendorBox({ tx, onDone }: { tx: any; onDone: ()=>void }){
  const reqSeqRef = useRef(0)
  const [busy,setBusy]=useState(false)
  const [toast,setToast]=useState<string|null>(null)
  const [offerings, setOfferings] = useState<string[]>([])
  const [vendorInfo, setVendorInfo] = useState<any>(null)
  const [customCat, setCustomCat] = useState('')
  const [productName, setProductName] = useState('')
  const [suggestion, setSuggestion] = useState<any>(null)
  const vendorKey = (()=>{
    const raw = String(tx.recipient?.name||tx.upiId||'')
    const low = raw.toLowerCase()
    const m = low.match(/^upi\/([^\/]+)\//)
    let s = m ? m[1] : low
    s = s.replace(/[@\/]/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim().slice(0,80)
    return s
  })()
  const txKey = String(tx._id)
  useEffect(()=>{
    setVendorInfo(null); setOfferings([]); setToast(null); setSuggestion(null); setProductName('');
    const reqId = ++reqSeqRef.current;
    apiClient.get('/recipients/by-key', { params:{ vendorKey, upiId: tx.upiId || tx.recipient?.upiId || '', label: tx.recipient?.name||'' }}).then((r:any)=>{
      if(reqId !== reqSeqRef.current) return;
      const v=r.data?.vendor;
      if(v){
        setVendorInfo(v);
        const cats=(v.offerings||[]).map((o:any)=> o.category);
        if(cats.length) setOfferings(cats);
        // fetch amount suggestion if vendor has products
        if(v._id && tx.amountPaise){
          apiClient.get(`/recipients/${v._id}/suggest`, { params:{ amountPaise: tx.amountPaise }}).then((s:any)=>{
            if(reqId!==reqSeqRef.current) return
            if(s.data?.suggestion) setSuggestion(s.data.suggestion)
          }).catch(()=>{})
        }
      }
    }).catch(()=>{})
  }, [txKey, vendorKey])
  function toggle(cat:string){ setOfferings(p=> p.includes(cat)? p.filter(c=> c!==cat): [...p, cat]) }
  function addCustom(){
    const c = customCat.trim()
    if(!c) return
    const normalized = c[0].toUpperCase()+c.slice(1).toLowerCase()
    if(!offerings.includes(normalized)) setOfferings(p=> [...p, normalized])
    if(!ALL_CATEGORIES.includes(normalized as any)) (ALL_CATEGORIES as string[]).push(normalized)
    setCustomCat('')
  }
  async function teach(){
    if(!offerings.length){ setToast('Pick at least one category'); setTimeout(()=> setToast(null), 2000); return }
    setBusy(true)
    setToast(null)
    try{
      const resp:any = await apiClient.post('/recipients', { label: tx.recipient?.name||tx.upiId||'', vendorKey, upiId: tx.upiId||tx.recipient?.upiId||undefined, categories: offerings })
      const rec = resp?.data?.recipient || resp?.recipient || resp?.data
      const vendorId: string | undefined = rec?._id
      if(!vendorId) throw new Error(resp?.data?.error || resp?.data?.message || resp?.error || resp?.message || 'No vendor id returned')
      // if productName supplied, add product with this amount
      if(productName.trim()){
        await apiClient.post(`/recipients/${vendorId}/products`, {
          name: productName.trim(),
          category: offerings[0],
          typicalAmountPaise: tx.amountPaise,
        }).catch(()=>{})
        // also patch transaction with productName so history reflects and link vendor
        await apiClient.patch(`/transactions/${tx._id}`, { productName: productName.trim(), category: offerings[0], recipientVendorRef: vendorId } as any).catch(()=>{})
      } else {
        await apiClient.post(`/recipients/${vendorId}/apply`, { overwrite: false }).catch(()=>{})
        // link transaction to vendor even when only category taught
        await apiClient.patch(`/transactions/${tx._id}`, { recipientVendorRef: vendorId, category: offerings[0] } as any).catch(()=>{})
        if(suggestion && suggestion.name){
          // suggest chip already shows; user can type productName next time
        }
      }
      setVendorInfo(rec)
      setToast(`Vendor saved — future payments suggest ${offerings.join(', ')}${productName? ` · ${productName.trim()} ₹${(tx.amountPaise/100).toFixed(0)}`:''}`)
      setTimeout(()=> setToast(null), 2800)
      onDone()
    } catch(e:any){
      const status = e?.response?.status
      const data = e?.response?.data
      if(status===409){
        // idempotent duplicate – backend already updated vendor, refetch and treat as success
        try{
          const refetch:any = await apiClient.get('/recipients/by-key', { params:{ vendorKey, upiId: tx.upiId||tx.recipient?.upiId||'', label: tx.recipient?.name||'' }})
          const v = refetch.data?.vendor
          if(v){
            setVendorInfo(v)
            if(productName.trim()){
              await apiClient.post(`/recipients/${v._id}/products`, { name: productName.trim(), category: offerings[0], typicalAmountPaise: tx.amountPaise }).catch(()=>{})
              await apiClient.patch(`/transactions/${tx._id}`, { productName: productName.trim(), category: offerings[0], recipientVendorRef: v._id } as any).catch(()=>{})
            } else {
              await apiClient.post(`/recipients/${v._id}/apply`, { overwrite:false }).catch(()=>{})
              await apiClient.patch(`/transactions/${tx._id}`, { recipientVendorRef: v._id, category: offerings[0] } as any).catch(()=>{})
            }
            setToast(`Vendor updated — future payments suggest ${offerings.join(', ')}${productName? ` · ${productName.trim()}`:''}`)
            setTimeout(()=> setToast(null),2800)
            onDone()
            return
          }
        }catch{}
      }
      setToast(data?.error || data?.message || e?.message || 'Save failed'); setTimeout(()=> setToast(null), 3200)
    } finally { setBusy(false)}
  }
  async function applySuggestion(){
    if(!suggestion) return
    const name = suggestion.name || suggestion.productName || suggestion.product?.name
    if(!name) return
    setProductName(name)
    setToast(`Suggested ${name} ₹${(tx.amountPaise/100).toFixed(0)} — edit and Save vendor to confirm`)
    setTimeout(()=> setToast(null), 2500)
  }
  const primaryCategory = vendorInfo?.primaryCategory || vendorInfo?.category || ''
  return <div className="flex flex-col gap-sm">
    {vendorInfo && <div className="text-xs"><span className="font-bold uppercase tracking-wider">Vendor</span> <span className="brutal-thin px-xs py-0.5 bg-brand-yellow font-bold">{vendorInfo.label}</span> {primaryCategory && <span className="ml-xs brutal-thin px-xs py-0.5 bg-white text-xs">default {primaryCategory}</span>} {(vendorInfo.offerings||[]).length>0 && <span className="ml-xs text-on-surface-variant">{vendorInfo.offerings.map((o:any)=> `${o.category}×${o.hits}`).join(' · ')}</span>}</div>}
    {vendorInfo && (vendorInfo.products||[]).length>0 && <div className="text-xs">Known products: {(vendorInfo.products||[]).map((p:any)=> `${p.name} ₹${p.typicalAmountPaise? (p.typicalAmountPaise/100).toFixed(0):'?'} ×${p.hits}`).join(' · ')}</div>}
    {suggestion && (
      <div className="brutal-thin bg-white p-sm flex flex-col gap-xs">
        <span className="text-xs font-bold">💡 Amount hint: ₹{(tx.amountPaise/100).toFixed(0)} → <span className="bg-brand-yellow px-xs">{suggestion.name || suggestion.productName||'?'}</span> {suggestion.category? `(${suggestion.category})`:''} — {suggestion.subcategory || ''}</span>
        <span className="text-[11px] opacity-60">We learned this from past bills at this price. Tap to use.</span>
        <button onClick={applySuggestion} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase self-start">Use {suggestion.name}</button>
      </div>
    )}
    <div className="brutal-thin p-sm bg-brand-yellow/30 flex flex-col gap-sm">
      <span className="text-xs font-bold uppercase">Who is this? Teach what they offer</span>
      <span className="text-xs text-on-surface-variant">e.g. dairy guy offers Food + Groceries — check all that apply. Add product for this amount if you remember.</span>
      <div className="flex flex-wrap gap-xs">{ALL_CATEGORIES.filter((c:string)=> c!=='Other').map((c:string)=> <button key={c} onClick={()=> toggle(c)} className={`brutal-thin px-xs py-xs text-xs font-bold uppercase ${offerings.includes(c)? 'bg-brand-yellow':'bg-white'}`}>{c}</button>)}</div>
      <div className="flex gap-xs items-center">
        <input value={customCat} onChange={e=> setCustomCat(e.target.value)} onKeyDown={e=> e.key==='Enter' && addCustom()} placeholder="Add custom (e.g. Stationery)" className="brutal-thin px-sm py-xs text-xs flex-1 bg-white" />
        <button onClick={addCustom} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase">+ Add</button>
      </div>
      <label className="flex flex-col text-xs font-bold uppercase gap-1">What did you buy for {money(tx.amountPaise)}? (product — free form, optional)
        <input value={productName} onChange={e=> setProductName(e.target.value)} placeholder="e.g. paneer, milk, stationery" className="brutal-thin px-sm py-xs text-sm bg-white" />
      </label>
      <span className="text-[11px] opacity-60">Next time you pay {money(tx.amountPaise)} to this vendor we'll suggest “{productName||'paneer'}” — just confirm.</span>
      <button onClick={teach} disabled={busy} className="brutal bg-brand-yellow px-sm py-xs text-xs font-bold uppercase self-start">{busy?'Saving…':'Save vendor'}</button>
      {toast && <div className="brutal-thin bg-white p-xs text-xs font-bold flex items-center gap-xs"><span className="w-5 h-5 flex items-center justify-center bg-brand-yellow border border-on-surface text-xs">✓</span>{toast}</div>}
    </div>
  </div>
}
function SubscriptionLinkBox({ tx, onDone }: { tx: any; onDone: ()=>void }){
  const [subs, setSubs] = useState<any[]>([])
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string|null>(null)
  useEffect(()=>{
    apiClient.get('/subscriptions').then((r:any)=>{
      const arr = Array.isArray(r.data) ? r.data : (r.data?.items||[])
      const list = arr.map((s:any)=> ({ id: s._id||s.id, name: s.name, amount: s.amount, billingDate: s.billingDate }))
      setSubs(list)
      if(tx.subscriptionRef){
        const sid = typeof tx.subscriptionRef==='object' ? (tx.subscriptionRef._id||tx.subscriptionRef.id) : tx.subscriptionRef
        if(sid) setSelected(String(sid))
      }
    }).catch(()=>{})
  }, [tx._id, tx.subscriptionRef])
  const linked = tx.subscriptionRef
  const linkedName = linked ? (typeof linked==='object' ? (linked.name||linked.title||'Subscription') : subs.find(s=> String(s.id)===String(linked))?.name || 'Linked') : null
  async function link(){
    if(!selected) { setToast('Pick a subscription'); setTimeout(()=>setToast(null),2000); return }
    setBusy(true)
    try{
      await apiClient.patch(`/transactions/${tx._id}`, { subscriptionRef: selected } as any)
      setToast('Linked — future payments to this vendor will be known as subscription')
      setTimeout(()=>setToast(null),2500)
      onDone()
    }catch(e:any){ setToast(e?.response?.data?.error||'Link failed'); setTimeout(()=>setToast(null),2500) } finally{ setBusy(false) }
  }
  async function unlink(){
    setBusy(true)
    try{
      await apiClient.patch(`/transactions/${tx._id}`, { subscriptionRef: null } as any)
      setToast('Unlinked'); setTimeout(()=>setToast(null),2000)
      onDone()
    }catch(e:any){ setToast('Unlink failed'); setTimeout(()=>setToast(null),2000) } finally{ setBusy(false) }
  }
  return <div className="brutal-thin p-sm bg-white flex flex-col gap-sm">
    <span className="text-xs font-bold uppercase">Link to Subscription (auto-pay)</span>
    <span className="text-xs opacity-60">If this transaction is for an auto-pay (Netflix, electricity, SIP), link it. We’ll know this vendor has that subscription for future insights.</span>
    {linked ? (
      <div className="flex items-center gap-sm text-xs">
        <span className="brutal-thin bg-brand-yellow px-xs py-0.5 font-bold">Linked: {linkedName}</span>
        <button onClick={unlink} disabled={busy} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase">Unlink</button>
      </div>
    ) : (
      <div className="flex gap-xs">
        <select value={selected} onChange={e=> setSelected(e.target.value)} className="brutal-thin px-sm py-xs text-xs flex-1 bg-white">
          <option value="">Select subscription…</option>
          {subs.map((s:any)=> <option key={s.id} value={s.id}>{s.name} — ₹{s.amount} on {s.billingDate}</option>)}
        </select>
        <button onClick={link} disabled={busy||!selected} className="brutal bg-brand-yellow px-sm py-xs text-xs font-bold uppercase">Link</button>
      </div>
    )}
    {subs.length===0 && <div className="text-[11px] opacity-60">No subscriptions yet — create one in Subscriptions page.</div>}
    {toast && <div className="brutal-thin bg-white p-xs text-xs font-bold">{toast}</div>}
  </div>
}

function LoanLinkBox({ tx, onDone }: { tx: any; onDone: () => void }) {
  const [loans, setLoans] = useState<any[]>([])
  const [selectedLoan, setSelectedLoan] = useState('')
  const [isPrepay, setIsPrepay] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    loanService.list().then((arr: any) => {
      const list = (Array.isArray(arr) ? arr : arr?.items || []).map((l: any) => ({
        id: l._id || l.id,
        name: l.loanName,
        lender: l.lender,
        type: l.loanType,
        emi: l.emiAmount,
        outstanding: l.outstandingAmount,
      }))
      setLoans(list)
      if (tx.loanRef) {
        const lid = typeof tx.loanRef === 'object' ? (tx.loanRef._id || tx.loanRef.id) : tx.loanRef
        if (lid) setSelectedLoan(String(lid))
      }
      if (tx.loanMeta?.isPrepayment) setIsPrepay(true)
    }).catch(() => {})
  }, [tx._id, tx.loanRef, tx.loanMeta])

  const linked = tx.loanRef
  const linkedName = linked
    ? (typeof linked === 'object' ? (linked.loanName || linked.name) : loans.find((l) => String(l.id) === String(linked))?.name || 'Loan')
    : null
  const isPrepayment = tx.loanMeta?.isPrepayment

  async function link() {
    if (!selectedLoan) {
      setToast('Select a loan')
      setTimeout(() => setToast(null), 2000)
      return
    }
    setBusy(true)
    try {
      await loanService.linkTransaction(selectedLoan, {
        transactionId: tx._id,
        isPrepayment: isPrepay,
      })
      setToast(`Linked as ${isPrepay ? 'Prepayment' : 'Regular EMI'}`)
      setTimeout(() => setToast(null), 2500)
      onDone()
    } catch (e: any) {
      setToast(e?.response?.data?.error || 'Link failed')
      setTimeout(() => setToast(null), 2500)
    } finally {
      setBusy(false)
    }
  }

  async function unlink() {
    const loanId = typeof linked === 'object' ? (linked._id || linked.id) : linked
    if (!loanId) return
    setBusy(true)
    try {
      await loanService.unlinkTransaction(loanId, { transactionId: tx._id })
      setToast('Unlinked from loan')
      setTimeout(() => setToast(null), 2000)
      onDone()
    } catch (e: any) {
      setToast(e?.response?.data?.error || 'Unlink failed')
      setTimeout(() => setToast(null), 2000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="brutal-thin p-sm bg-white flex flex-col gap-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase">Link to EMI Loan / Prepayment</span>
        {linked && (
          <span className="brutal-thin bg-tertiary-container px-xs py-0.5 text-[10px] font-bold uppercase">
            {isPrepayment ? '⭐ Prepayment' : 'Regular EMI'}
          </span>
        )}
      </div>
      <span className="text-xs opacity-60">
        Attach this transaction as an EMI payment or part-prepayment to track debt payoff progress.
      </span>

      {linked ? (
        <div className="flex items-center justify-between gap-sm text-xs">
          <span className="brutal-thin bg-brand-yellow px-xs py-0.5 font-bold">
            Linked: {linkedName} {isPrepayment ? '(Prepayment)' : '(EMI)'}
          </span>
          <button
            type="button"
            onClick={unlink}
            disabled={busy}
            className="brutal bg-white px-sm py-xs text-xs font-bold uppercase hover:bg-error-container"
          >
            Unlink
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-xs">
          <div className="flex gap-xs">
            <select
              value={selectedLoan}
              onChange={(e) => setSelectedLoan(e.target.value)}
              className="brutal-thin px-sm py-xs text-xs flex-1 bg-white"
            >
              <option value="">Select loan…</option>
              {loans.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.lender || l.type}) — EMI ₹{l.emi}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={link}
              disabled={busy || !selectedLoan}
              className="brutal bg-brand-yellow px-sm py-xs text-xs font-bold uppercase"
            >
              Link
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold cursor-pointer mt-1">
            <input
              type="checkbox"
              checked={isPrepay}
              onChange={(e) => setIsPrepay(e.target.checked)}
            />
            <span>Mark as Prepayment (Extra principal reduction)</span>
          </label>
        </div>
      )}

      {loans.length === 0 && (
        <div className="text-[11px] opacity-60">No active loans found — create one in Loans page.</div>
      )}
      {toast && <div className="brutal-thin bg-white p-xs text-xs font-bold">{toast}</div>}
    </div>
  )
}

function vendorInfoCategoryChip(detail:any){ const v=detail.vendorInfo || detail.transaction?.recipientVendorRef; if(!v) return null; const cats=(v.offerings||[]).map((o:any)=>o.category).join(', '); if(!cats) return null; return <div className="brutal-thin bg-white p-xs text-xs">Vendor offers: <span className="font-bold">{cats}</span> · default <span className="font-bold">{v.primaryCategory||v.category}</span>{(v.products||[]).length? <> · sells <span className="font-bold">{v.products.map((p:any)=> p.name).join(', ')}</span></> : null}</div> }
function DetailRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div className="flex justify-between gap-md"><span className="text-on-surface-variant uppercase text-xs font-bold tracking-wider">{label}</span><span className={bold ? 'font-bold' : 'font-medium'}>{value}</span></div>
}

