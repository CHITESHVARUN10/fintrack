import type { CategorizeResult, CompareData, DuplicateGroup, LedgerSummary, LedgerTransaction, MergeResult, TransactionDetail, Vendor, VendorProduct } from '../types/api'
import { amountInPaise, datetimeInput, formatCurrency } from '../lib/format'
import { useConfirmation } from '../hooks/useConfirmation'
import { TransactionCorrection } from '../components/ledger/TransactionCorrection'
import { toApiError } from '../lib/apiError'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { transactionService } from '../services/api'
import { apiClient } from '../services/apiClient'
import { Icon } from '../components/ui/Icon'
import { useAuth } from '../context/AuthContext'
import { LedgerTableScroll, LedgerEmpty, LedgerLoading, LedgerNotice, LedgerOverlay, LedgerPage } from '../components/ledger/LedgerShell'

type Tx = LedgerTransaction

// Request sequence for the ledger query: only the newest response may commit.
// Module-scoped because the page is a single instance and the counter must not
// participate in rendering.
let ledgerLoadSeq = 0

const DEFAULT_CATEGORIES = ['Groceries','Food','Electricity','Rent','Transportation','Shopping','Medical','Education','Entertainment','Bills','Household','Proxy','Family','Internal Transfer','Investment','Income','Other']
const STATUS_CLASSES: Record<string, string> = {
  ACTIVE: 'led-tag',
  RECONCILED: 'led-tag led-tag-green',
  PENDING_REVIEW: 'led-tag led-tag-yellow',
  VOIDED: 'led-tag led-tag-muted',
}
const SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Manual entry',
  QR_SCAN: 'QR scan',
  BANK_STATEMENT: 'Bank statement',
  SCREENSHOT: 'Screenshot',
  SHARE: 'Share',
  TELEGRAM: 'Telegram',
  WHATSAPP: 'WhatsApp',
}
const TYPE_CLASSES: Record<string, string> = {
  EXPENSE: 'led-tag led-tag-red',
  INCOME: 'led-tag led-tag-cyan',
  INTERNAL_TRANSFER: 'led-tag led-tag-yellow',
  CASH_WITHDRAWAL: 'led-tag led-tag-warm',
  CASH_EXPENSE: 'led-tag led-tag-red',
}

function localDateTime() { return datetimeInput(new Date().toISOString()) }

function money(paise?: number) { return formatCurrency((paise ?? 0) / 100) }
function fmtDate(iso: string) { try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return iso } }
function fmtDay(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function monthBounds(y: number, m: number) { return { first: fmtDay(new Date(y, m, 1)), last: fmtDay(new Date(y, m + 1, 0)) } }
function parseMonthBase(fromDate: string): { y: number; m: number } {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(fromDate)
  if (m) {
    const y = Number(m[1]); const mo = Number(m[2]) - 1
    if (y >= 2000 && y <= 2100 && mo >= 0 && mo < 12) return { y, m: mo }
  }
  const now = new Date()
  return { y: now.getFullYear(), m: now.getMonth() }
}
function monthLabel(fromDate: string) {
  const { y, m } = parseMonthBase(fromDate)
  return new Date(y, m, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' })
}

export function Transactions() {
  const { user, members: authMembers } = useAuth()
  const confirmAction = useConfirmation()
  const familyId = user?.familyAccountId
  const ownsTransaction = (tx: LedgerTransaction) => String(typeof tx.createdBy === 'object' ? tx.createdBy._id : tx.createdBy) === user?.id
  const [searchParams, setSearchParams] = useSearchParams()
  const [familyView, setFamilyView] = useState(false)
  const [items, setItems] = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionStatus, setActionStatus] = useState('')
  const [actionError, setActionError] = useState('')
  const [formStatus, setFormStatus] = useState('')
  const [formError, setFormError] = useState('')
  const [creating, setCreating] = useState(false)
  const createPending = useRef(false)
  const submission = useRef<{ signature: string; id?: string } | null>(null)
  const amountField = useRef<HTMLInputElement>(null)
  const whenField = useRef<HTMLInputElement>(null)
  const comparePanel = useRef<HTMLElement>(null)
  // Member list comes from AuthContext instead of a second /families/me →
  // /families/:id/members round-trip on every visit.
  const members = useMemo(() => authMembers.map((m) => ({ id: m.id, name: m.name })), [authMembers])
  const [summary, setSummary] = useState<LedgerSummary | null>(null)
  const [form, setForm] = useState({ amount: '', type: 'EXPENSE', mode: 'UPI', category: 'Other', occurredAt: localDateTime(), recipient: '', toUserId: '', visibility: 'FAMILY' })
  const [q, setQ] = useState(() => searchParams.get('q') || '')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [fromDate, setFromDate] = useState(() => searchParams.get('from') || '')
  const [toDate, setToDate] = useState(() => searchParams.get('to') || '')
  const invalidRange = Boolean(fromDate && toDate && fromDate > toDate)
  const [modeFilter, setModeFilter] = useState('')
  const [vendorFilter, setVendorFilter] = useState(() => searchParams.get('vendor') || searchParams.get('q') || '')
  const [memberFilter, setMemberFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(() => searchParams.get('highlight'))
  const [detail, setDetail] = useState<TransactionDetail | null>(null)
  const [compareData, setCompareData] = useState<CompareData | null>(null)
  const [comparing, setComparing] = useState(false)
  const [offsetBusy, setOffsetBusy] = useState(false)
  const [offsetError, setOffsetError] = useState('')
  const [offsetPurpose, setOffsetPurpose] = useState('')
  const [offsetKind, setOffsetKind] = useState('general')
  const [catEditId, setCatEditId] = useState<string | null>(null)
  const [catEditVal, setCatEditVal] = useState('')
  const [vendorSuggest, setVendorSuggest] = useState<Vendor[]>([])
  const [showVendorSuggest, setShowVendorSuggest] = useState(false)
  const vendorSuggestRef = useRef(0)
  const chosenVendor = useRef('')
  const [activeVendor, setActiveVendor] = useState(-1)
  const vendorOpen = showVendorSuggest && form.recipient.trim().length >= 2 && vendorSuggest.length > 0
  const [dynamicCats, setDynamicCats] = useState<string[]>(DEFAULT_CATEGORIES)

  useEffect(() => {
    const controller = new AbortController()
    apiClient.get('/recipients/categories', { signal: controller.signal }).then(({ data }) => {
      if (Array.isArray(data?.categories)) {
        const names = data.categories.filter((name: unknown) => typeof name === 'string')
        setDynamicCats([...new Set<string>([...DEFAULT_CATEGORIES, ...names])])
      }
    }).catch(() => {})
    return () => controller.abort()
  }, [user?.id])

  // Sequence guard: filter changes can fire overlapping requests, and an older
  // response must never overwrite a newer one.
  const load = useCallback(() => {
    const params: Record<string, string> = { familyView: String(familyView) }
    if (statusFilter) params.status = statusFilter
    if (categoryFilter) params.category = categoryFilter
    if (fromDate) params.from = fromDate
    if (toDate) params.to = toDate
    if (modeFilter) params.mode = modeFilter
    if (vendorFilter.trim()) params.vendor = vendorFilter.trim()
    if (familyView && memberFilter) params.memberId = memberFilter
    return Promise.resolve().then(() => {
      const seq = ++ledgerLoadSeq
      setLoadError('')
      if (!familyId || invalidRange) {
        setLoading(false)
        return
      }
      setLoading(true)
      return transactionService.list(params)
        .then((d) => {
          if (seq !== ledgerLoadSeq) return
          setItems(d.items || d || [])
          setSummary(d.summary || null)
        })
        .catch(() => {
          if (seq === ledgerLoadSeq) setLoadError('Could not load transactions. Any entries below are from the last successful load.')
        })
        .finally(() => { if (seq === ledgerLoadSeq) setLoading(false) })
    })
  }, [familyId, invalidRange, familyView, statusFilter, categoryFilter, fromDate, toDate, modeFilter, vendorFilter, memberFilter])
  useEffect(() => { load() }, [load])
  // External navigation synchronizes local filters before rendering the next frame.
  const [previousSearch, setPreviousSearch] = useState(searchParams.toString())
  if (previousSearch !== searchParams.toString()) {
    setPreviousSearch(searchParams.toString())
    const urlQ = searchParams.get('q')
    const highlight = searchParams.get('highlight')
    if (urlQ !== null && urlQ !== q) setQ(urlQ)
    if (urlQ && urlQ !== vendorFilter) setVendorFilter(urlQ)
    const importedFrom = searchParams.get('from')
    const importedTo = searchParams.get('to')
    if (importedFrom && importedFrom !== fromDate) setFromDate(importedFrom)
    if (importedTo && importedTo !== toDate) setToDate(importedTo)
    if (highlight !== detailId) setDetailId(highlight)
  }

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

  useEffect(() => {
    if (!detailId) return
    let cancelled = false
    transactionService.get(detailId)
      .then((result) => { if (!cancelled) setDetail(result) })
      .catch(() => { if (!cancelled) setDetail(null) })
    return () => { cancelled = true }
  }, [detailId])

  // autocomplete vendor for recipient field
  useEffect(()=>{
    const q = form.recipient.trim()
    const seq = ++vendorSuggestRef.current
    if (q.length < 2 || q === chosenVendor.current) return
    const controller = new AbortController()
    const t = window.setTimeout(() => {
      apiClient.get('/recipients', { params: { q, limit: 5 }, signal: controller.signal }).then(({ data }) => {
        if (seq !== vendorSuggestRef.current || document.activeElement?.id !== 'transaction-recipient') return
        const results = data?.items || []
        setVendorSuggest(results)
        setActiveVendor(-1)
        setShowVendorSuggest(results.length > 0)
      }).catch(() => {})
    }, 300)
    return () => {
      window.clearTimeout(t)
      controller.abort()
    }
  }, [form.recipient])

  function chooseVendor(vendor: Vendor) {
    chosenVendor.current = vendor.label.trim()
    setForm(previous => ({
      ...previous,
      recipient: vendor.label,
      category: previous.category === 'Other' ? vendor.primaryCategory || previous.category : previous.category,
    }))
    setShowVendorSuggest(false)
    setActiveVendor(-1)
    document.getElementById('transaction-recipient')?.focus()
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (createPending.current || !familyId) return
    setFormStatus('')
    setFormError('')
    const amountPaise = amountInPaise(form.amount)
    if (amountPaise === null) {
      setFormError('Enter an amount greater than ₹0 with up to two decimal places.')
      amountField.current?.focus()
      return
    }
    const date = new Date(form.occurredAt)
    if (!Number.isFinite(date.valueOf())) {
      setFormError('Choose a valid transaction date and time.')
      whenField.current?.focus()
      return
    }
    const payload = {
      amountPaise, type: form.type, mode: form.mode, category: form.category,
      occurredAt: date.toISOString(), recipient: form.recipient.trim() ? { name: form.recipient.trim() } : undefined,
      visibility: form.visibility,
      familyTransfer: form.type === 'INTERNAL_TRANSFER' && form.toUserId ? { toUserId: form.toUserId } : undefined,
    }
    const signature = JSON.stringify(payload)
    if (submission.current?.signature !== signature) {
      submission.current = { signature, id: globalThis.crypto?.randomUUID?.() }
    }
    createPending.current = true
    setCreating(true)
    try {
      const result = await transactionService.create({ ...payload, submissionId: submission.current.id })
      submission.current = null
      setForm({ amount: '', type: 'EXPENSE', mode: 'UPI', category: 'Other', occurredAt: localDateTime(), recipient: '', toUserId: '', visibility: 'FAMILY' })
      setFormStatus(result.transaction?.status === 'PENDING_REVIEW'
        ? 'Transaction saved for duplicate review.' : 'Transaction saved.')
      void load()
    } catch (caught) {
      const error = toApiError(caught)
      setFormError(error.response?.data.error ?? 'Could not save the transaction. Try again.')
    } finally {
      createPending.current = false
      setCreating(false)
    }
  }

  // Keep the search box responsive: the table re-renders against the deferred
  // query, so typing never blocks on filtering a large ledger.
  const deferredQ = useDeferredValue(q)
  const filtered = useMemo(() => {
    if (!deferredQ.trim()) return items
    const needle = deferredQ.toLowerCase()
    return items.filter((t) => [t.type, t.category, t.mode, t.status, (t.recipient)?.name, typeof t.createdBy === 'object' ? (t.createdBy)?.name : ''].join(' ').toLowerCase().includes(needle))
  }, [items, deferredQ])

  function toggleSelect(id: string) {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else { if (n.size >= 4) return n; n.add(id) } return n })
  }

  // Duplicate-review selection mode (separate from compare selection, no 4-limit)
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewSearchMode, setReviewSearchMode] = useState<'manual' | 'auto'>('manual')
  const [dupSelected, setDupSelected] = useState<Set<string>>(new Set())
  const [dupMergeLoading, setDupMergeLoading] = useState(false)
  const [dupMergeResult, setDupMergeResult] = useState<MergeResult | null>(null)
  const [autoGroups, setAutoGroups] = useState<DuplicateGroup[]>([])
  const [autoLoading, setAutoLoading] = useState(false)
  const [autoError, setAutoError] = useState<string | null>(null)

  function toggleDupSelect(id: string) {
    setDupSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const dupGroups = useMemo(() => {
    if (dupSelected.size === 0) return []
    const byId = new Map(items.map((t) => [t._id, t]))
    const groups = new Map<string, { type: string; amountPaise: number; count: number }>()
    for (const id of dupSelected) {
      const t = byId.get(id)
      if (!t) continue
      const key = `${t.type}:${t.amountPaise}`
      const g = groups.get(key) || { type: t.type, amountPaise: t.amountPaise, count: 0 }
      g.count += 1
      groups.set(key, g)
    }
    return Array.from(groups.values()).sort((a, b) => b.count - a.count)
  }, [dupSelected, items])

  async function mergeDupSelected() {
    if (dupSelected.size < 2 || dupMergeLoading) return
    setDupMergeLoading(true)
    setDupMergeResult(null)
    try {
      const res = await transactionService.bulkMergeDuplicates(Array.from(dupSelected))
      setDupMergeResult(res)
      setDupSelected(new Set())
      load()
    } catch (caught: unknown) { const e = toApiError(caught);
      setDupMergeResult({ error: e?.response?.data?.error || e.message || 'Bulk merge failed' })
    } finally { setDupMergeLoading(false) }
  }

  const findAutoGroups = useCallback(() => Promise.resolve().then(async () => {
    setAutoLoading(true); setAutoError(null);
    try {
      const params: Record<string, string> = { familyView: String(familyView) }
      if (fromDate) params.from = fromDate
      if (toDate) params.to = toDate
      const res = await transactionService.duplicateGroups(params)
      setAutoGroups(res.groups || [])
    } catch (caught: unknown) { const e = toApiError(caught);
      setAutoError(e?.response?.data?.error || e.message || 'Auto search failed')
    } finally {
      setAutoLoading(false)
    }
  }), [fromDate, toDate, familyView])

  function toggleAutoGroup(group: DuplicateGroup) {
    const ids = (group.items || []).map((i) => String(i._id))
    setDupSelected((prev) => {
      const n = new Set(prev)
      const allIn = ids.every((id: string) => n.has(id))
      if (allIn) ids.forEach((id: string) => n.delete(id))
      else ids.forEach((id: string) => n.add(id))
      return n
    })
  }

  // Auto-find scans the current month scope independently of the list's
  // status filter, so entering review never blanks the table.
  useEffect(() => {
    if (!reviewMode || reviewSearchMode !== 'auto') return
    findAutoGroups()
  }, [reviewMode, reviewSearchMode, findAutoGroups])

  useEffect(() => {
    if (!compareData) return
    comparePanel.current?.focus()
    comparePanel.current?.scrollIntoView({ block: 'nearest' })
  }, [compareData])

  async function doCompare() {
    if (selectedIds.size < 2 || comparing) return
    setActionError('')
    setOffsetError('')
    setComparing(true)
    try {
      const { data } = await apiClient.get<CompareData>('/transactions/compare', { params: { ids: [...selectedIds].join(',') } })
      setCompareData(data)
    } catch {
      setActionError('Could not compare these transactions. Try again.')
    } finally {
      setComparing(false)
    }
  }

  const compareItems = compareData?.items ?? []
  const incoming = compareItems.filter(tx => tx.type === 'INCOME').reduce((sum, tx) => sum + tx.amountPaise, 0)
  const outgoing = compareItems.filter(tx => ['EXPENSE', 'CASH_EXPENSE'].includes(tx.type)).reduce((sum, tx) => sum + tx.amountPaise, 0)
  const eligibleOffset = incoming > 0 && incoming === outgoing
    && compareItems.every(tx => ownsTransaction(tx) && !items.some(item => item._id === tx._id && item.isOffset) && ['ACTIVE', 'RECONCILED'].includes(tx.status)
      && ['INCOME', 'EXPENSE', 'CASH_EXPENSE'].includes(tx.type))
    && new Set(compareItems.map(tx => tx.currency || 'INR')).size === 1

  async function saveOffset() {
    const [anchor, ...rest] = compareItems
    if (!eligibleOffset || offsetBusy || !offsetPurpose.trim()) return
    setOffsetError('')
    setOffsetBusy(true)
    try {
      await apiClient.put(`/transactions/${anchor._id}/offset`, {
        transactionIds: rest.map(tx => tx._id), purpose: offsetPurpose.trim(), kind: offsetKind,
      })
      setCompareData(null)
      setSelectedIds(new Set())
      setOffsetPurpose('')
      setOffsetKind('general')
      setActionStatus('Offset group saved.')
      void load()
    } catch (caught) {
      setOffsetError(toApiError(caught).response?.data.error ?? 'Could not save the offset group. Try again.')
    } finally {
      setOffsetBusy(false)
    }
  }

  async function saveCategory(id: string) {
    try {
      await transactionService.update(id, { category: catEditVal })
      setCatEditId(null)
      setActionError('')
      setActionStatus('Category saved.')
      void load()
      if (detailId === id) setDetail(await transactionService.get(id))
    } catch (err: unknown) {
      setActionError(toApiError(err).response?.data?.error ?? 'Could not save the category.')
    }
  }

  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResult, setBulkResult] = useState<CategorizeResult | null>(null)
  const [bulkResolveLoading, setBulkResolveLoading] = useState(false)
  const otherCount = useMemo(() => items.filter((t) => !t.category || t.category === 'Other').length, [items])
  const pendingCount = useMemo(() => items.filter((t) => t.status === 'PENDING_REVIEW').length, [items])
  async function bulkCategorize() {
    if (otherCount === 0) return
    setBulkLoading(true)
    setBulkResult(null)
    try {
      const res = await apiClient.post('/transactions/bulk-categorize', { familyView, confidenceThreshold: 30, limit: 200 })
      setBulkResult(res.data)
      load()
    } catch (caught: unknown) { const e = toApiError(caught);
      setBulkResult({ error: e?.response?.data?.error || e.message || 'Bulk categorize failed' })
    } finally { setBulkLoading(false) }
  }

  function selectAllVisiblePending() {
    setSelectedIds(new Set(filtered.filter((t) => t.status === 'PENDING_REVIEW').map((t) => t._id)))
  }

  async function bulkKeepSeparate() {
    if (selectedIds.size === 0 || bulkResolveLoading) return
    setBulkResolveLoading(true)
    try {
      for (const id of Array.from(selectedIds)) {
        try { await transactionService.resolve(id, 'keepSeparate') } catch { /* skip non-pending */ }
      }
      setSelectedIds(new Set())
      setCompareData(null)
      load()
    } finally {
      setBulkResolveLoading(false)
    }
  }

  async function quickMerge(id: string) {
    try {
      await transactionService.resolve(id, 'merge')
      load()
    } catch {
      // No candidate or already resolved — open detail so user can decide
      setDetailId(id)
    }
  }

  async function quickKeepSeparate(id: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    try { await transactionService.resolve(id, 'keepSeparate'); load() } catch { setDetailId(id) }
  }

  if (!familyId) return (
    <LedgerPage title="Transactions">
      <LedgerEmpty title="Set up your family to use the ledger">
        <Link className="led-btn led-btn-sm" to="/settings#family">Create or join a family</Link>
      </LedgerEmpty>
    </LedgerPage>
  )

  const filtersActive = Boolean(fromDate || toDate || modeFilter || categoryFilter || statusFilter || memberFilter || vendorFilter || q)

  return (
    <LedgerPage
      title="Transactions"
      action={<button type="button" className="led-btn" onClick={() => {
        amountField.current?.scrollIntoView({ block: 'center' })
        amountField.current?.focus({ preventScroll: true })
      }}>Add transaction</button>}
      subtitle="Manual entry + family ledger. Transfers and withdrawals don’t inflate spend."
    >
      {actionStatus && <LedgerNotice>{actionStatus}</LedgerNotice>}
      {actionError && !detailId && <LedgerNotice tone="error">{actionError}</LedgerNotice>}
      {loadError && <LedgerNotice tone="error">
        {loadError} <button className="led-btn led-btn-white led-btn-sm" onClick={load}>Retry</button>
      </LedgerNotice>}
      {invalidRange && <LedgerNotice tone="error">The end date must be on or after the start date.</LedgerNotice>}
      <div className="led-scope-row">
        <button onClick={() => setFamilyView(false)} className={`led-btn led-btn-sm${!familyView ? '' : ' led-btn-white'}`}>My</button>
        <button onClick={() => setFamilyView(true)} className={`led-btn led-btn-sm${familyView ? '' : ' led-btn-white'}`}>Family</button>
        {familyView && <Link className="led-btn led-btn-white led-btn-sm" to="/settings#sharing">Manage month sharing</Link>}
        <button
          type="button"
          onClick={() => {
            if (reviewMode) {
              setReviewMode(false)
              setDupSelected(new Set())
              setDupMergeResult(null)
              setAutoGroups([])
              setAutoError(null)
            } else {
              setReviewMode(true)
              setDupSelected(new Set())
              setDupMergeResult(null)
              // Keep the month's rows visible for manual select — do NOT force
              // status=PENDING_REVIEW here (that emptied Sept when nothing was
              // pending in that month). Auto-find scans independently.
              setStatusFilter('')
            }
          }}
          title="Review flagged duplicates or find similar transactions"
          disabled={!reviewMode && (loading || !!loadError || !items.length || invalidRange)}
          className={`led-btn led-btn-sm${reviewMode ? '' : ' led-btn-white'}`}
        >
          {reviewMode ? 'Exit duplicate review' : pendingCount > 0 ? `Review duplicates (${pendingCount})` : 'Find duplicates'}
        </button>
      </div>

      <div className="led-filter-row">
        <div className="led-stepper" role="group" aria-label="Month navigation">
          <button
            type="button"
            onClick={() => { const b = parseMonthBase(fromDate); const d = new Date(b.y, b.m - 1, 1); const r = monthBounds(d.getFullYear(), d.getMonth()); setFromDate(r.first); setToDate(r.last) }}
            title="Previous month"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span title="Currently viewed month">{monthLabel(fromDate)}</span>
          <button
            type="button"
            onClick={() => { const b = parseMonthBase(fromDate); const d = new Date(b.y, b.m + 1, 1); const r = monthBounds(d.getFullYear(), d.getMonth()); setFromDate(r.first); setToDate(r.last) }}
            title="Next month"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
        <input type="date" value={fromDate} onChange={(e)=> setFromDate(e.target.value)} className="led-input led-mono led-w-142" title="From" aria-label="From date" />
        <input type="date" value={toDate} onChange={(e)=> setToDate(e.target.value)} className="led-input led-mono led-w-142" title="To" aria-label="To date" />
        <button
          type="button"
          onClick={() => {
            const now = new Date()
            const r = monthBounds(now.getFullYear(), now.getMonth())
            setFromDate(r.first)
            setToDate(r.last)
          }}
          title="Set date range to current month (1st to last day)"
          className="led-btn led-btn-white led-btn-sm"
        >
          This Month
        </button>
        {(fromDate || toDate) && (
          <button
            type="button"
            onClick={() => { setFromDate(''); setToDate('') }}
            title="Clear date range"
            className="led-btn led-btn-white led-btn-sm"
          >
            ✕
          </button>
        )}
        <input value={vendorFilter} onChange={(e)=> setVendorFilter(e.target.value)} placeholder="Vendor" className="led-input led-w-130" aria-label="Vendor filter" />
        <select value={modeFilter} onChange={(e)=> setModeFilter(e.target.value)} className="led-select led-w-120" aria-label="Mode filter">
          <option value="">All modes</option>
          <option value="UPI">UPI</option>
          <option value="BANK">BANK</option>
          <option value="CASH">CASH</option>
          <option value="CARD">CARD</option>
          <option value="OTHER">OTHER</option>
        </select>
        {familyView && (
          <select value={memberFilter} onChange={(e)=> setMemberFilter(e.target.value)} className="led-select led-w-150" aria-label="Member filter">
            <option value="">All members</option>
            {members.map((m)=> <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="led-input led-w-145" aria-label="Search transactions" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="led-select led-w-150" aria-label="Status filter">
          <option value="">All statuses</option>
          <option value="PENDING_REVIEW">Pending review</option>
          <option value="ACTIVE">Active</option>
          <option value="RECONCILED">Reconciled</option>
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="led-select led-w-155" aria-label="Category filter">
          <option value="">All categories</option>
          {dynamicCats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {summary && !invalidRange && (
        <div className="led-grid-4">
          <div className="led-card-sm led-kpi">
            <span className="led-label" style={{ color: 'var(--text-secondary)' }}>Actual spend</span>
            <div>
              <div className="led-kpi-val">{money(summary.actualExpenditurePaise)}</div>
              <div className="led-kpi-sub">EXPENSE + CASH_EXPENSE</div>
            </div>
          </div>
          <div className="led-card-sm led-kpi">
            <span className="led-label" style={{ color: 'var(--text-secondary)' }}>Transfers</span>
            <div>
              <div className="led-kpi-val">{money(summary.internalTransfersPaise)}</div>
              <div className="led-kpi-sub">Not counted in spend</div>
            </div>
          </div>
          <div className="led-card-sm led-kpi">
            <span className="led-label" style={{ color: 'var(--text-secondary)' }}>Withdrawals</span>
            <div>
              <div className="led-kpi-val">{money(summary.cashWithdrawalsPaise)}</div>
              <div className="led-kpi-sub">Cash out</div>
            </div>
          </div>
          <div className="led-card-sm led-kpi">
            <span className="led-label" style={{ color: 'var(--text-secondary)' }}>Total movement</span>
            <div className="led-kpi-val">{money(summary.totalMovementPaise)}</div>
          </div>
        </div>
      )}

      {(otherCount > 0 || bulkResult) && !invalidRange && (
        <div className="led-banner">
          <div style={{ minWidth: 0 }}>
            <div className="led-banner-title">
              {otherCount} transaction(s) with “Other” category — auto-categorize using vendor, UPI handle &amp; past spend (BHIM-like)
            </div>
            <div className="led-banner-text">
              Uses your vendor directory, UPI handle map and keyword rules. Low confidence stays as Other.
            </div>
          </div>
          <button onClick={bulkCategorize} disabled={bulkLoading || otherCount === 0} className="led-btn led-btn-white led-btn-sm">
            {bulkLoading ? 'Categorizing…' : 'Categorize Others'}
          </button>
          {bulkResult && (
            <div className="led-card-sm" role={bulkResult.error ? 'alert' : 'status'} style={{ flexBasis: '100%', boxShadow: 'none' }}>
              {bulkResult.error ? (
                <span className="led-strong" style={{ color: 'rgb(var(--c-on-error-container))' }}>{bulkResult.error}</span>
              ) : (
                <>
                  <span className="led-strong">{bulkResult.updated ? `Updated ${bulkResult.updated} ${bulkResult.updated === 1 ? 'transaction' : 'transactions'}.` : 'No matching categories found.'}</span>
                  {bulkResult.details && bulkResult.details.length > 0 && (
                    <div className="led-stack" style={{ gap: 4, marginTop: 6, maxHeight: 128, overflow: 'auto' }}>
                      {bulkResult.details.slice(0, 10).map((d) => (
                        <div key={d.id} className="led-row-between" style={{ gap: 8, fontSize: 11 }}>
                          <span>{(d.amount / 100).toFixed(2)} {d.oldCategory} → {d.newCategory}</span>
                          <span className="led-muted">{d.confidence}% {d.rule}</span>
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

      {reviewMode ? (
        <div className="led-dup-panel">
          <div className="led-row-between">
            <strong style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>
              Review duplicates{dupSelected.size > 0 ? ` — ${dupSelected.size} selected` : ''}
            </strong>
            <div className="led-row">
              <label className="led-label" htmlFor="dup-search-mode">Search</label>
              <select
                id="dup-search-mode"
                value={reviewSearchMode}
                onChange={(e) => setReviewSearchMode(e.target.value as 'manual' | 'auto')}
                className="led-select led-mono led-w-155"
              >
                <option value="manual">Manual select</option>
                <option value="auto">Auto find</option>
              </select>
              {reviewSearchMode === 'manual' ? (
                <>
                  <button onClick={() => setDupSelected(new Set(filtered.map((t) => t._id)))} className="led-btn led-btn-white led-btn-sm">Select all visible</button>
                  <button onClick={() => setDupSelected(new Set())} disabled={dupSelected.size === 0} className="led-btn led-btn-white led-btn-sm">Clear</button>
                </>
              ) : (
                <button onClick={findAutoGroups} disabled={autoLoading} className="led-btn led-btn-white led-btn-sm">
                  {autoLoading ? 'Searching…' : 'Find duplicates'}
                </button>
              )}
              <button onClick={mergeDupSelected} disabled={dupSelected.size < 2 || dupMergeLoading} className="led-btn led-btn-dark led-btn-sm">
                {dupMergeLoading ? 'Merging…' : `Merge selected (${dupSelected.size})`}
              </button>
              <button onClick={() => { setReviewMode(false); setDupSelected(new Set()); setDupMergeResult(null); setAutoGroups([]); setAutoError(null) }} className="led-btn led-btn-white led-btn-sm">Exit review</button>
            </div>
          </div>
          <div className="led-dup-helper">
            {reviewSearchMode === 'manual'
              ? 'Tap rows to select (no detail popup). Same type + same amount collapse into one (keeps earliest). E.g. 5× ₹500 + 5× ₹20 → one ₹500 and one ₹20.'
              : 'Auto groups same type + amount within a 2-day window (same logic as import). Tick groups to select, then Merge.'}
          </div>
          {dupGroups.length > 0 && (
            <div className="led-chips">
              {dupGroups.map((g) => (
                <span key={`${g.type}:${g.amountPaise}`} className="led-tag led-tag-warm">
                  {money(g.amountPaise)} ×{g.count} → keep 1{g.count > 1 ? '' : ' (single)'}
                </span>
              ))}
            </div>
          )}
          {reviewSearchMode === 'auto' && (
            <div className="led-stack" style={{ gap: 8 }}>
              {autoError && <div className="led-card-sm" style={{ boxShadow: 'none', color: 'rgb(var(--c-on-error-container))', fontWeight: 700 }}>{autoError}</div>}
              {!autoError && autoGroups.length === 0 && !autoLoading && (
                <div className="led-dup-helper">No duplicate groups in this month scope — try another month or Manual select.</div>
              )}
              {autoGroups.map((g) => {
                const ids = (g.items || []).map((i) => String(i._id))
                const allIn = ids.length > 0 && ids.every((id: string) => dupSelected.has(id))
                return (
                  <div key={g.key + String(g.items?.[0]?._id)} className="led-dup-group">
                    <div style={{ minWidth: 0 }}>
                      <div className="led-dup-meta">
                        {money(g.amountPaise)} · {g.type} ×{g.items.length}
                        <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--text-secondary)' }}>
                          {g.reason === 'CANDIDATE_LINK' ? 'ENGINE-LINKED' : 'SAME AMOUNT ±2D'}
                        </span>
                      </div>
                      <div className="led-dup-sub">
                        {(g.items || []).slice(0, 6).map((i) => `${fmtDate(i.occurredAt)} ${i.status}`).join(' · ')}
                        {(g.items || []).length > 6 ? ` +${(g.items || []).length - 6} more` : ''}
                      </div>
                    </div>
                    <button onClick={() => toggleAutoGroup(g)} className={`led-btn led-btn-sm${allIn ? '' : ' led-btn-white'}`}>
                      {allIn ? '✓ Selected' : 'Select group'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          {dupMergeResult && (
            <div className="led-card-sm" style={{ boxShadow: 'none' }}>
              {dupMergeResult.error ? (
                <span className="led-strong" style={{ color: 'rgb(var(--c-on-error-container))' }}>{dupMergeResult.error}</span>
              ) : (
                <span className="led-strong">
                  Merged into {dupMergeResult.kept} group(s), voided {dupMergeResult.voided}
                  {(dupMergeResult.groups || []).slice(0, 5).map((g) => ` · ${((g.amountPaise || 0) / 100).toLocaleString('en-IN')} ×${g.count}`).join('')}
                </span>
              )}
            </div>
          )}
        </div>
      ) : statusFilter === 'PENDING_REVIEW' && (
        <div className="led-card-sm led-row-between">
          <span className="led-strong">
            {pendingCount > 0 ? `${pendingCount} possible duplicate(s) need review` : 'No pending duplicates in this view'}
            {selectedIds.size > 0 ? ` — ${selectedIds.size} selected` : ''}
          </span>
          <div className="led-row">
            <button onClick={selectAllVisiblePending} className="led-btn led-btn-white led-btn-sm">Select all visible</button>
            <button onClick={bulkKeepSeparate} disabled={selectedIds.size === 0 || bulkResolveLoading} className="led-btn led-btn-sm">
              {bulkResolveLoading ? 'Resolving…' : `Keep separate${selectedIds.size ? ` (${selectedIds.size})` : ''}`}
            </button>
            <button onClick={() => { setSelectedIds(new Set()); setStatusFilter('') }} className="led-btn led-btn-white led-btn-sm">Clear</button>
          </div>
        </div>
      )}

      <form onSubmit={handleCreate} className="led-card" aria-busy={creating}>
        {formError && <LedgerNotice tone="error">{formError}</LedgerNotice>}
        {formStatus && <LedgerNotice>{formStatus}</LedgerNotice>}
        <div className="led-quick-grid">
          <label className="led-field">Amount ₹
            <input ref={amountField} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="led-input led-mono" placeholder="500" />
          </label>
          <label className="led-field">Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="led-select led-mono">
              <option>EXPENSE</option>
              <option>INCOME</option>
              <option>INTERNAL_TRANSFER</option>
              <option>CASH_WITHDRAWAL</option>
              <option>CASH_EXPENSE</option>
            </select>
          </label>
          <label className="led-field">Mode
            <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className="led-select led-mono">
              <option>UPI</option>
              <option>BANK</option>
              <option>CASH</option>
              <option>CARD</option>
              <option>OTHER</option>
            </select>
          </label>
          <label className="led-field">Category
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="led-select">
              {dynamicCats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="led-field">When
            <input ref={whenField} type="datetime-local" value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} className="led-input led-mono" />
          </label>
        </div>
        <div className="led-quick-row2">
          <label className="led-field led-w-240" style={{ position: 'relative' }}>Recipient
            <input
              id="transaction-recipient"
              value={form.recipient}
              onChange={event => {
                chosenVendor.current = ''
                setForm({ ...form, recipient: event.target.value })
                setShowVendorSuggest(false)
                setVendorSuggest([])
                setActiveVendor(-1)
              }}
              onFocus={() => { if (vendorSuggest.length) setShowVendorSuggest(true) }}
              onBlur={() => setShowVendorSuggest(false)}
              onKeyDown={event => {
                if (event.key === 'Escape' && vendorOpen) {
                  event.preventDefault()
                  setShowVendorSuggest(false)
                  return
                }
                if (!vendorOpen) return
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  setActiveVendor(index => event.key === 'ArrowDown'
                    ? Math.min(index + 1, vendorSuggest.length - 1)
                    : Math.max(index - 1, 0))
                } else if (event.key === 'Enter' && vendorSuggest[activeVendor]) {
                  event.preventDefault()
                  chooseVendor(vendorSuggest[activeVendor])
                }
              }}
              className="led-input"
              placeholder="Vendor — type to search"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={vendorOpen}
              aria-controls={vendorOpen ? 'recipient-suggestions' : undefined}
              aria-activedescendant={vendorOpen && activeVendor >= 0 ? `recipient-suggestion-${activeVendor}` : undefined}
            />
            {vendorOpen && (
              <div className="led-suggest">
                <div id="recipient-suggestions" role="listbox" aria-label="Vendors">
                  {vendorSuggest.map((vendor, index) => (
                    <button
                      key={vendor._id}
                      type="button"
                      id={`recipient-suggestion-${index}`}
                      role="option"
                      aria-selected={index === activeVendor}
                      tabIndex={-1}
                      onPointerDown={event => event.preventDefault()}
                      onClick={() => chooseVendor(vendor)}
                    >
                      <span className="led-strong">{vendor.label}</span>
                      <span className="led-muted">{vendor.primaryCategory} · {vendor.vendorKey}</span>
                    </button>
                  ))}
                </div>
                <div className="led-suggest-note">Select to auto-fill category from vendor</div>
              </div>
            )}
          </label>
          <label className="led-field led-w-150">Visibility
            <select value={form.visibility} onChange={(e)=> setForm({...form, visibility:e.target.value})} className="led-select">
              <option value="FAMILY">Family</option>
              <option value="PRIVATE">Private (hidden)</option>
            </select>
          </label>
          {form.type === 'INTERNAL_TRANSFER' && (
            <label className="led-field led-w-150">To member
              <select value={form.toUserId || ''} onChange={(e) => setForm({ ...form, toUserId: e.target.value })} className="led-select">
                <option value="">Select</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
          )}
          <button type="submit" className="led-btn" disabled={creating}>{creating ? 'Saving…' : '+ Add'}</button>
        </div>
      </form>

      {selectedIds.size >= 2 && (
        <div className="led-banner">
          <span className="led-banner-title">{selectedIds.size} selected for compare</span>
          <div className="led-row">
            <button onClick={doCompare} disabled={comparing} className="led-btn led-btn-white led-btn-sm">{comparing ? 'Comparing…' : 'Compare'}</button>
            <button onClick={() => { setSelectedIds(new Set()); setCompareData(null) }} className="led-btn led-btn-white led-btn-sm">Clear</button>
          </div>
        </div>
      )}

      {compareData && (
        <section className="led-card led-stack" ref={comparePanel} tabIndex={-1} aria-label="Compare transactions">
          <div className="led-row-between">
            <h3 className="led-h2">Compare</h3>
            <button onClick={() => setCompareData(null)} className="led-btn led-btn-white led-btn-sm">Close</button>
          </div>
          <div className="led-compare-grid" style={{ marginTop: 12 }}>
            {(compareData.items || []).map((t) => (
              <div key={t._id} className="led-compare-card">
                <div className="led-strong">{money(t.amountPaise)} — {t.type}</div>
                <div className="led-tiny">Date: {fmtDate(t.occurredAt)} • Mode: {t.mode} • Category: {t.category || '—'} • By: {typeof t.createdBy === 'object' ? t.createdBy?.name : '—'}</div>
                <div className="led-tiny">UTR: {t.UTR || t.utu || (compareData.sourcesByTx?.[String(t._id)]?.[0]?.utr) || '—'} • Status: {t.status}</div>
              </div>
            ))}
          </div>
          {offsetError && <LedgerNotice tone="error">{offsetError}</LedgerNotice>}
          {eligibleOffset ? (
            <form className="led-row" onSubmit={event => { event.preventDefault(); void saveOffset() }}>
              <label className="led-field">Purpose
                <input className="led-input" value={offsetPurpose} maxLength={120} required
                  onChange={event => setOffsetPurpose(event.target.value)} placeholder="e.g. Repaid shared purchase" />
              </label>
              <label className="led-field">Offset type
                <select className="led-select" value={offsetKind} onChange={event => setOffsetKind(event.target.value)}>
                  <option value="general">Other reimbursement</option>
                  <option value="purchase_on_behalf">Purchase on behalf of someone</option>
                  <option value="loan_repayment">Loan and repayment</option>
                </select>
              </label>
              <button className="led-btn led-btn-sm" disabled={offsetBusy || !offsetPurpose.trim()}>
                {offsetBusy ? 'Saving…' : 'Create offset group'}
              </button>
            </form>
          ) : <p className="led-tiny">To create an offset, select your settled income and expense entries with matching totals in the same currency.</p>}
        </section>
      )}

      {invalidRange ? null : loading ? <LedgerLoading rows={4} /> : filtered.length === 0 ? (
        loadError ? null : <LedgerEmpty title={filtersActive ? 'No transactions match these filters' : 'No transactions yet'}>
          {familyView ? <>You’ll only see other members’ entries for months they choose to share. <Link to="/settings#sharing">Manage sharing</Link>.</>
            : filtersActive ? 'Clear filters or pick another month.' : 'Add a manual entry above or import a statement.'}
        </LedgerEmpty>
      ) : (
        <div className="led-table-card">
          <LedgerTableScroll label="Transactions table">
            <table className="led-table wide">
              <thead>
                <tr>
                  <th aria-label="Selection"><Icon name="check_box" className="text-base" /></th>
                  <th>Date</th>
                  <th>Made by</th>
                  <th>Recipient</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Mode</th>
                  <th>Category</th>
                  <th>Subscription</th>
                  <th>Visibility</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const madeBy = typeof t.createdBy === 'object' && t.createdBy ? (t.createdBy).name : typeof t.createdBy === 'string' ? t.createdBy.slice(0, 8) : '—'
                  const isActive = detailId===t._id
                  const isDupSelected = dupSelected.has(t._id)
                  return (
                    <tr
                      key={t._id}
                      className={`led-row-clickable${isDupSelected || isActive ? ' led-row-selected' : ''}`}
                      onClick={() => { if (reviewMode) toggleDupSelect(t._id); else setDetailId(t._id) }}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        {reviewMode ? (
                          <input type="checkbox" checked={isDupSelected} onChange={() => toggleDupSelect(t._id)} onClick={(e) => e.stopPropagation()} aria-label="Select as duplicate" />
                        ) : (
                          <input type="checkbox" checked={selectedIds.has(t._id)} onChange={() => toggleSelect(t._id)} onClick={(e) => e.stopPropagation()} aria-label="Select for compare" />
                        )}
                      </td>
                      <td className="led-mono led-nowrap" style={{ fontSize: 11.5 }}>{fmtDate(t.occurredAt)}</td>
                      <td className="led-nowrap">{madeBy}</td>
                      <td className="led-strong" style={{ minWidth: 140 }}>
                        {reviewMode ? <span className="led-recipient-label" title={t.counterpartyName || t.recipient?.name}>{t.counterpartyName || t.recipient?.name || '—'}</span> : (
                          <button
                            type="button"
                            className="led-transaction-link"
                            aria-label={`View transaction details for ${t.recipient?.name || 'unknown recipient'}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              setDetailId(t._id)
                            }}
                          >
                            <span className="led-recipient-label" title={t.counterpartyName || t.recipient?.name}>{t.counterpartyName || t.recipient?.name || '—'}</span>
                          </button>
                        )}
                      </td>
                      <td><span className={TYPE_CLASSES[t.type] || 'led-tag'}>{t.type.replace('_', ' ')}</span></td>
                      <td className="led-num">{money(t.amountPaise)}</td>
                      <td className="led-mono">{t.mode}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {catEditId === t._id ? (
                          <span className="led-row" style={{ gap: 4 }}>
                            <select value={catEditVal} onChange={(e) => setCatEditVal(e.target.value)} onClick={(e) => e.stopPropagation()} className="led-input-xs">
                              {[...new Set([...dynamicCats, catEditVal])].map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <button onClick={(e) => { e.stopPropagation(); saveCategory(t._id) }} className="led-btn led-btn-xs">Save</button>
                            <button onClick={(e) => { e.stopPropagation(); setCatEditId(null) }} className="led-btn led-btn-white led-btn-xs">Cancel</button>
                          </span>
                        ) : (
                          <button
                            disabled={!ownsTransaction(t) || !!t.financeLink}
                            onClick={(e) => { e.stopPropagation(); setCatEditId(t._id); setCatEditVal(t.category || 'Other') }}
                            className="led-tag led-tag-cased"
                            title="Edit category"
                          >
                            {t.category || 'Other'}
                            {(t.category === 'Investment' || t.category === 'Income') && t.subcategory ? ` / ${t.subcategory}` : ''}
                            {t.productName ? ` · ${t.productName}` : ''}
                          </button>
                        )}
                      </td>
                      <td>
                        {t.subscriptionRef ? (
                          <span className="led-tag led-tag-yellow led-tag-cased" style={{ maxWidth: 120, overflow: 'hidden', display: 'inline-block', textOverflow: 'ellipsis' }}>
                            {typeof t.subscriptionRef==='object' ? (t.subscriptionRef.name||'Sub') : 'Sub'}
                          </span>
                        ) : (
                          <span className="led-muted">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`led-tag${t.visibility==='PRIVATE'?' led-tag-inverse':''}`}>{t.visibility||'FAMILY'}</span>
                      </td>
                      <td>
                        <span className={STATUS_CLASSES[t.status] || 'led-tag'}>{t.status.replace('_', ' ')}</span>
                        {reviewMode ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDetailId(t._id) }}
                            title="Open detail without leaving review"
                            className="led-btn led-btn-white led-btn-xs"
                            style={{ marginLeft: 6 }}
                          >
                            View
                          </button>
                        ) : t.status === 'PENDING_REVIEW' && (
                          <span className="led-row" style={{ gap: 4, marginLeft: 6, display: 'inline-flex' }} onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => quickMerge(t._id)} title="Merge into its duplicate candidate" className="led-btn led-btn-xs">Merge</button>
                            <button onClick={(e) => quickKeepSeparate(t._id, e)} title="Keep as separate transaction" className="led-btn led-btn-white led-btn-xs">Keep separate</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </LedgerTableScroll>
          <div className="led-table-foot">
            <span className="led-filter-meta">Showing {filtered.length} of {items.length} transactions</span>
            <span className="led-filter-meta">Click any row to inspect &amp; teach vendor</span>
          </div>
        </div>
      )}

      {detailId && detail?.transaction._id === detailId && (()=>{ const idx=filtered.findIndex((x)=> x._id===detailId); const prevId= idx>0? filtered[idx-1]._id: null; const nextId= idx>=0 && idx<filtered.length-1? filtered[idx+1]._id: null; return (
        <LedgerOverlay onClose={() => setDetailId(null)} align="right" label="Transaction detail">
          <div className="led-drawer">
            <div className="led-drawer-head">
              <div className="led-row-between">
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: 17, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Transaction Detail</strong>
                <button onClick={() => setDetailId(null)} className="led-close-btn" aria-label="Close detail">×</button>
              </div>
              <div className="led-row-between">
                <span className="led-mono led-tiny">{idx>=0? `${idx+1} / ${filtered.length}`: ''}</span>
                <div className="led-row">
                  <button disabled={!prevId} onClick={()=> prevId && setDetailId(prevId)} className="led-btn led-btn-white led-btn-sm">‹ Prev</button>
                  <button disabled={!nextId} onClick={()=> nextId && setDetailId(nextId)} className="led-btn led-btn-sm">Next ›</button>
                </div>
              </div>
            </div>
            <div className="led-drawer-body">
              {actionError && <LedgerNotice tone="error">{actionError}</LedgerNotice>}
              {actionStatus && <LedgerNotice>{actionStatus}</LedgerNotice>}
              <div>
                <DetailRow label="Amount" value={money(detail.transaction.amountPaise)} bold />
                <DetailRow label="Type" value={detail.transaction.type} />
                <DetailRow label="Mode" value={detail.transaction.mode} />
                <div className="led-kv">
                  <span className="led-kv-label">Category</span>
                  <span className="led-row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    {catEditId===detail.transaction._id ? (
                      <>
                        <select value={catEditVal} onChange={e=> setCatEditVal(e.target.value)} className="led-input-xs">
                          {[...new Set([...dynamicCats, catEditVal])].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button onClick={()=> saveCategory(detail.transaction._id)} className="led-btn led-btn-xs">Save</button>
                        <button onClick={()=> setCatEditId(null)} className="led-btn led-btn-white led-btn-xs">Cancel</button>
                      </>
                    ) : (
                      <>
                        <span>{detail.transaction.category || '—'}</span>
                        <button disabled={!ownsTransaction(detail.transaction) || !!detail.transaction.financeLink} onClick={()=> { setCatEditId(detail.transaction._id); setCatEditVal(detail.transaction.category||'Other')}} className="led-btn led-btn-xs">Edit</button>
                      </>
                    )}
                  </span>
                </div>
                {detail.transaction.subcategory && <DetailRow label="Subcategory" value={detail.transaction.subcategory} />}
                {detail.transaction.financeLink && (
                  <DetailRow label="Managed by" value={detail.transaction.financeLink.resource === 'income' ? 'Linked income source' : 'Linked investment'} />
                )}
                {detail.transaction.productName && <DetailRow label="Product" value={detail.transaction.productName} />}
              </div>

              {detail.transaction.categorySplit && detail.transaction.categorySplit.length>0 && (
                <div className="led-source-card">
                  Split: {detail.transaction.categorySplit.map((s)=> `${s.category} ${(s.amountPaise/100).toLocaleString('en-IN')}`).join(' + ')}
                </div>
              )}
              {detail.transaction.lineItems && detail.transaction.lineItems.length>0 && (
                <div className="led-source-card">
                  Items: {detail.transaction.lineItems.map((li)=> `${li.productName||''} ${li.category||''} ${(li.amountPaise/100).toLocaleString('en-IN')}`).join(' · ')}
                </div>
              )}
              {vendorInfoCategoryChip(detail)}

              <div>
                <DetailRow label="Date" value={fmtDate(detail.transaction.occurredAt)} />
                <DetailRow label="Made by" value={typeof detail.transaction.createdBy === 'object' ? detail.transaction.createdBy?.name || detail.transaction.createdBy?.email || '—' : detail.transaction.createdBy || '—'} />
                <DetailRow label="Recipient" value={detail.transaction.recipient?.name || '—'} />
                <DetailRow label="Sender" value={detail.transaction.sender?.name || '—'} />
                <DetailRow label="UTR / Ref" value={detail.transaction.utr || detail.sources?.[0]?.utr || '—'} />
                <DetailRow label="UPI" value={detail.transaction.upiId || detail.sources?.[0]?.upiId || detail.transaction.recipient?.upiId || '—'} />
              </div>

              <div>
                <div className="led-kv">
                  <span className="led-kv-label">Visibility</span>
                  <span className="led-row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    <span className={`led-tag${detail.transaction.visibility==='PRIVATE'?' led-tag-inverse':''}`}>{detail.transaction.visibility||'FAMILY'}</span>
                    <button disabled={!ownsTransaction(detail.transaction)} onClick={async()=>{ await transactionService.update(detail.transaction._id, { visibility: detail.transaction.visibility==='PRIVATE'?'FAMILY':'PRIVATE' }); const d=await transactionService.get(detail.transaction._id); setDetail(d); load(); }} className="led-btn led-btn-white led-btn-xs">
                      {detail.transaction.visibility==='PRIVATE'?'Make Family':'Make Private (hide)'}
                    </button>
                  </span>
                </div>
                <p className="led-tiny" style={{ marginTop: 4 }}>Private is invisible to other family members even in dashboard/budgets/reports.</p>
              </div>

              {ownsTransaction(detail.transaction) && !detail.transaction.financeLink && <TeachVendorBox key={detail.transaction._id} tx={detail.transaction} categories={dynamicCats} onDone={async()=>{ const d = await transactionService.get(detail.transaction._id); setDetail(d); load()}} />}
              {ownsTransaction(detail.transaction) && <SubscriptionLinkBox tx={detail.transaction} onDone={async()=>{ const d = await transactionService.get(detail.transaction._id); setDetail(d); load()}} />}

              <div>
                <DetailRow label="Status" value={detail.transaction.status} />
                <DetailRow label="Confidence" value={detail.transaction.confidence != null ? `${detail.transaction.confidence}%` : '—'} />
                {detail.transaction.candidateOf && <DetailRow label="Possible duplicate of" value={String(detail.transaction.candidateOf).slice(0, 12)} />}
              </div>
              {detail.candidateOfTx && (
                <div className="led-notice led-notice-yellow">
                  Pending review: possible duplicate of {money(detail.candidateOfTx.amountPaise)} on {fmtDate(detail.candidateOfTx.occurredAt)}
                </div>
              )}

              <div>
                <div className="led-label" style={{ marginBottom: 6 }}>Source records ({(detail.sources || []).length})</div>
                <div className="led-stack" style={{ gap: 6 }}>
                  {(detail.sources || []).map((s) => (
                    <div key={s._id} className="led-source-card">
                      <div className="led-strong">{SOURCE_LABELS[s.source] ?? s.source} — {new Date(s.createdAt || '').toLocaleString('en-IN')}</div>
                      {s.utr && <div>UTR: {s.utr}</div>}
                      {s.upiId && <div>UPI: {s.upiId}</div>}
                      {s.transactionIdExt && <div>TxnId: {s.transactionIdExt}</div>}
                    </div>
                  ))}
                </div>
              </div>

              {ownsTransaction(detail.transaction) && detail.offset && (
                <div className="led-source-card led-stack">
                  <strong>Offset group · {detail.offset.purpose}</strong>
                  <span className="led-tiny">Excluded from spend and income totals.</span>
                  <button className="led-btn led-btn-white led-btn-sm" disabled={offsetBusy} onClick={async () => {
                    if (!(await confirmAction('Remove this offset group?', 'Its transactions will count toward income and spend again.', 'Remove offset'))) return
                    setOffsetBusy(true)
                    try {
                      await apiClient.delete(`/transactions/${detail.transaction._id}/offset`)
                      setDetail(await transactionService.get(detail.transaction._id))
                      setActionStatus('Offset group removed.')
                      void load()
                    } catch (caught) {
                      setActionError(toApiError(caught).response?.data.error ?? 'Could not remove the offset group.')
                    } finally {
                      setOffsetBusy(false)
                    }
                  }}>Remove offset</button>
                </div>
              )}
              {ownsTransaction(detail.transaction) && <TransactionCorrection
                key={`${detail.transaction._id}:${detail.transaction.updatedAt}`}
                tx={detail.transaction}
                onChanged={(message, close) => {
                  setActionStatus(message)
                  if (close) setDetailId(null)
                  else void transactionService.get(detail.transaction._id).then(setDetail).catch(() => setActionError('Could not refresh the transaction details.'))
                  void load()
                }}
              />}
              <div className="led-drawer-actions">
                <button onClick={() => { if (detailId) { setSelectedIds((prev) => new Set(prev).add(detailId)); setDetailId(null) } }} className="led-btn led-btn-sm">Add to compare</button>
                {ownsTransaction(detail.transaction) && detail.transaction.status === 'PENDING_REVIEW' && (
                  <>
                    <button onClick={async () => { await transactionService.resolve(detail.transaction._id, 'merge', detail.transaction.candidateOf); setDetailId(null); load() }} className="led-btn led-btn-white led-btn-sm">Merge duplicate</button>
                    <button onClick={async () => { await transactionService.resolve(detail.transaction._id, 'keepSeparate'); setDetailId(null); load() }} className="led-btn led-btn-white led-btn-sm">Keep separate</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </LedgerOverlay>
      )})()}
    </LedgerPage>
  )
}

function TeachVendorBox({ tx, categories, onDone }: { tx: LedgerTransaction; categories: string[]; onDone: ()=>void }){
  const reqSeqRef = useRef(0)
  const [busy,setBusy]=useState(false)
  const [toast,setToast]=useState<string|null>(null)
  const [offerings, setOfferings] = useState<string[]>([])
  const [vendorInfo, setVendorInfo] = useState<Vendor | null>(null)
  const [customCat, setCustomCat] = useState('')
  const [productName, setProductName] = useState('')
  const [suggestion, setSuggestion] = useState<VendorProduct | null>(null)
  const vendorKey = (()=>{
    const raw = String(tx.recipient?.name||tx.upiId||'')
    const low = raw.toLowerCase()
    const m = low.match(/^upi\/([^/]+)\//)
    let s = m ? m[1] : low
    s = s.replace(/[@/]/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim().slice(0,80)
    return s
  })()
  const txKey = String(tx._id)
  useEffect(()=>{
    const reqId = ++reqSeqRef.current;
    apiClient.get<{ vendor: Vendor }>('/recipients/by-key', { params:{ vendorKey, upiId: tx.upiId || tx.recipient?.upiId || '', label: tx.recipient?.name||'' }}).then((r)=>{
      if(reqId !== reqSeqRef.current) return;
      const v=r.data?.vendor;
      if(v){
        setVendorInfo(v);
        const cats=(v.offerings||[]).map((o)=> o.category);
        if(cats.length) setOfferings(cats);
        // fetch amount suggestion if vendor has products
        if(v._id && tx.amountPaise){
          apiClient.get(`/recipients/${v._id}/suggest`, { params:{ amountPaise: tx.amountPaise }}).then((s)=>{
            if(reqId!==reqSeqRef.current) return
            if(s.data?.suggestion) setSuggestion(s.data.suggestion)
          }).catch(()=>{})
        }
      }
    }).catch(()=>{})
  }, [txKey, vendorKey, tx.amountPaise, tx.recipient?.name, tx.recipient?.upiId, tx.upiId])
  function toggle(cat:string){ setOfferings(p=> p.includes(cat)? p.filter(c=> c!==cat): [...p, cat]) }
  function addCustom(){
    const c = customCat.trim()
    if(!c) return
    const normalized = c[0].toUpperCase()+c.slice(1).toLowerCase()
    if(!offerings.includes(normalized)) setOfferings(p=> [...p, normalized])
    setCustomCat('')
  }
  async function teach(){
    if(!offerings.length){ setToast('Pick at least one category'); setTimeout(()=> setToast(null), 2000); return }
    setBusy(true)
    setToast(null)
    try{
      const resp = await apiClient.post('/recipients', { label: tx.recipient?.name||tx.upiId||'', vendorKey, upiId: tx.upiId||tx.recipient?.upiId||undefined, categories: offerings })
      const rec = resp.data.recipient || resp.data
      const vendorId: string | undefined = rec?._id
      if(!vendorId) throw new Error(resp.data.error || resp.data.message || 'No vendor id returned')
      // if productName supplied, add product with this amount
      if(productName.trim()){
        await apiClient.post(`/recipients/${vendorId}/products`, {
          name: productName.trim(),
          category: offerings[0],
          typicalAmountPaise: tx.amountPaise,
        }).catch(()=>{})
        // also patch transaction with productName so history reflects and link vendor
        await apiClient.patch(`/transactions/${tx._id}`, { productName: productName.trim(), category: offerings[0], recipientVendorRef: vendorId }).catch(()=>{})
      } else {
        await apiClient.post(`/recipients/${vendorId}/apply`, { overwrite: false }).catch(()=>{})
        // link transaction to vendor even when only category taught
        await apiClient.patch(`/transactions/${tx._id}`, { recipientVendorRef: vendorId, category: offerings[0] }).catch(()=>{})
      }
      setVendorInfo(rec)
      setToast(`Vendor saved — future payments suggest ${offerings.join(', ')}${productName? ` · ${productName.trim()} ₹${(tx.amountPaise/100).toFixed(0)}`:''}`)
      setTimeout(()=> setToast(null), 2800)
      onDone()
    } catch (caught: unknown) { const e = toApiError(caught);
      const status = e?.response?.status
      const data = e?.response?.data
      if(status===409){
        // idempotent duplicate – backend already updated vendor, refetch and treat as success
        try{
          const refetch = await apiClient.get<{ vendor: Vendor }>('/recipients/by-key', { params:{ vendorKey, upiId: tx.upiId||tx.recipient?.upiId||'', label: tx.recipient?.name||'' }})
          const v = refetch.data?.vendor
          if(v){
            setVendorInfo(v)
            if(productName.trim()){
              await apiClient.post(`/recipients/${v._id}/products`, { name: productName.trim(), category: offerings[0], typicalAmountPaise: tx.amountPaise }).catch(()=>{})
              await apiClient.patch(`/transactions/${tx._id}`, { productName: productName.trim(), category: offerings[0], recipientVendorRef: v._id }).catch(()=>{})
            } else {
              await apiClient.post(`/recipients/${v._id}/apply`, { overwrite:false }).catch(()=>{})
              await apiClient.patch(`/transactions/${tx._id}`, { recipientVendorRef: v._id, category: offerings[0] }).catch(()=>{})
            }
            setToast(`Vendor updated — future payments suggest ${offerings.join(', ')}${productName? ` · ${productName.trim()}`:''}`)
            setTimeout(()=> setToast(null),2800)
            onDone()
            return
          }
        }catch { /* A failed optional vendor refresh leaves the save error visible. */ }
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
  return (
    <div className="led-stack">
      {vendorInfo && (
        <div className="led-tiny">
          <span className="led-label">Vendor</span>{' '}
          <span className="led-tag led-tag-yellow">{vendorInfo.label}</span>{' '}
          {primaryCategory && <span className="led-tag">default {primaryCategory}</span>}{' '}
          {(vendorInfo.offerings||[]).length>0 && <span>{vendorInfo.offerings.map((o)=> `${o.category}×${o.hits}`).join(' · ')}</span>}
        </div>
      )}
      {vendorInfo && (vendorInfo.products||[]).length>0 && (
        <div className="led-tiny">
          Known products: {(vendorInfo.products||[]).map((p)=> `${p.name} ₹${p.typicalAmountPaise? (p.typicalAmountPaise/100).toFixed(0):'?'} ×${p.hits}`).join(' · ')}
        </div>
      )}
      {suggestion && (
        <div className="led-card-warm led-stack" style={{ gap: 6 }}>
          <span className="led-tiny">
            Amount hint: ₹{(tx.amountPaise/100).toFixed(0)} → <span className="led-tag led-tag-yellow">{suggestion.name || suggestion.productName||'?'}</span>{' '}
            {suggestion.category? `(${suggestion.category})`:''} — {suggestion.subcategory || ''}
          </span>
          <span className="led-tiny">We learned this from past bills at this price. Tap to use.</span>
          <button onClick={applySuggestion} className="led-btn led-btn-white led-btn-sm" style={{ alignSelf: 'flex-start' }}>Use {suggestion.name}</button>
        </div>
      )}
      <div className="led-teach">
        <strong className="led-label">Who is this? Teach what they offer</strong>
        <span className="led-tiny">e.g. dairy guy offers Food + Groceries — check all that apply. Add product for this amount if you remember.</span>
        <div className="led-chips">
          {[...new Set([...categories, ...offerings])].filter(c => c !== 'Other').map(c => (
            <button
              type="button"
              key={c}
              onClick={()=> toggle(c)}
              className={`led-chip${offerings.includes(c)? ' is-on':''}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="led-filter-row">
          <input value={customCat} onChange={e=> setCustomCat(e.target.value)} onKeyDown={e=> e.key==='Enter' && addCustom()} placeholder="Add custom (e.g. Stationery)" className="led-input led-grow" />
          <button type="button" onClick={addCustom} className="led-btn led-btn-white led-btn-sm">+ Add</button>
        </div>
        <label className="led-field">What did you buy for {money(tx.amountPaise)}? (product — free form, optional)
          <input value={productName} onChange={e=> setProductName(e.target.value)} placeholder="e.g. paneer, milk, stationery" className="led-input" />
        </label>
        {productName.trim() && <span className="led-tiny">Save “{productName.trim()}” to suggest it for future {money(tx.amountPaise)} payments to this vendor.</span>}
        <div>
          <button onClick={teach} disabled={busy} className="led-btn led-btn-sm">{busy?'Saving…':'Save vendor'}</button>
        </div>
        {toast && (
          <LedgerNotice>
            <span className="led-notice-mark">✓</span>
            <span>{toast}</span>
          </LedgerNotice>
        )}
      </div>
    </div>
  )
}

function SubscriptionLinkBox({ tx, onDone }: { tx: LedgerTransaction; onDone: ()=>void }){
  const [subs, setSubs] = useState<{ id: string; name: string; amount: number; billingDate: number }[]>([])
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string|null>(null)
  useEffect(()=>{
    apiClient.get<import('../types/api').RawSubscription[]>('/subscriptions').then((r)=>{
      const arr = r.data
      const list = arr.map((s)=> ({ id: s._id||s.id, name: s.name, amount: s.amount, billingDate: s.billingDate }))
      setSubs(list)
      if(tx.subscriptionRef){
        const sid = typeof tx.subscriptionRef==='object' ? (tx.subscriptionRef._id||tx.subscriptionRef.id) : tx.subscriptionRef
        if(sid) setSelected(String(sid))
      }
    }).catch(()=>{})
  }, [tx._id, tx.subscriptionRef])
  const linked = tx.subscriptionRef
  const linkedName = linked ? (typeof linked === 'object' ? (linked.name||'Subscription') : subs.find(s=> String(s.id)===String(linked))?.name || 'Linked') : null
  async function link(){
    if(!selected) { setToast('Pick a subscription'); setTimeout(()=>setToast(null),2000); return }
    setBusy(true)
    try{
      await apiClient.patch(`/transactions/${tx._id}`, { subscriptionRef: selected })
      setToast('Linked — future payments to this vendor will be known as subscription')
      setTimeout(()=>setToast(null),2500)
      onDone()
    }catch (caught: unknown) { const e = toApiError(caught);  setToast(e?.response?.data?.error||'Link failed'); setTimeout(()=>setToast(null),2500) } finally{ setBusy(false) }
  }
  async function unlink(){
    setBusy(true)
    try{
      await apiClient.patch(`/transactions/${tx._id}`, { subscriptionRef: null })
      setToast('Unlinked'); setTimeout(()=>setToast(null),2000)
      onDone()
    }catch { setToast('Unlink failed'); setTimeout(()=>setToast(null),2000) } finally{ setBusy(false) }
  }
  return (
    <div className="led-card-sm led-stack" style={{ boxShadow: 'none' }}>
      <span className="led-label">Link to subscription (auto-pay)</span>
      <span className="led-tiny">If this transaction is for an auto-pay (Netflix, electricity, SIP), link it. We’ll know this vendor has that subscription for future insights.</span>
      {linked ? (
        <div className="led-row">
          <span className="led-tag led-tag-yellow led-tag-cased">Linked: {linkedName}</span>
          <button onClick={unlink} disabled={busy} className="led-btn led-btn-white led-btn-sm">Unlink</button>
        </div>
      ) : (
        <div className="led-filter-row">
          <select value={selected} onChange={e=> setSelected(e.target.value)} className="led-select led-grow">
            <option value="">Select subscription…</option>
            {subs.map((s)=> <option key={s.id} value={s.id}>{s.name} — ₹{s.amount} on {s.billingDate}</option>)}
          </select>
          <button onClick={link} disabled={busy||!selected} className="led-btn led-btn-sm">Link</button>
        </div>
      )}
      {subs.length===0 && <div className="led-tiny">No subscriptions yet — create one in Subscriptions page.</div>}
      {toast && <LedgerNotice>{toast}</LedgerNotice>}
    </div>
  )
}

function vendorInfoCategoryChip(detail: TransactionDetail & { vendorInfo?: Vendor }){
  const v=detail.vendorInfo || detail.transaction?.recipientVendorRef
  if(!v || typeof v === 'string') return null
  const cats=(v.offerings||[]).map((o)=>o.category).join(', ')
  if(!cats) return null
  return (
    <div className="led-card-sm" style={{ fontSize: 12, boxShadow: 'none' }}>
      Vendor offers: <span className="led-strong">{cats}</span> · default <span className="led-strong">{v.primaryCategory||v.category}</span>
      {(v.products||[]).length? <> · sells <span className="led-strong">{v.products.map((p)=> p.name).join(', ')}</span></> : null}
    </div>
  )
}

function DetailRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="led-kv">
      <span className="led-kv-label">{label}</span>
      <span className="led-kv-val" style={{ fontWeight: bold ? 800 : 700 }}>{value}</span>
    </div>
  )
}
