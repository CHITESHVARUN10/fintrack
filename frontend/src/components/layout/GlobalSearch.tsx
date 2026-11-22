import type { LedgerTransaction, Vendor, RawSubscription, RawInvestment, Budget, ApiMember } from '../../types/api'
import { useEffect, useMemo, useRef, useState, useCallback, useDeferredValue } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../ui/Icon'
import { navItems } from './nav'
import { apiClient } from '../../services/apiClient'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import '../../pages/entry-overview.css'

type SearchItem = {
  id: string
  group: string
  title: string
  subtitle?: string
  icon: string
  to: string
  keywords: string
  rawKeywords: string[]
}

const RECENT_KEY = 'fintrack-recent-searches'
const MAX_RECENT = 6

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.slice(0, MAX_RECENT) : []
  } catch { return [] }
}
function saveRecent(q: string) {
  if (!q.trim() || q.trim().length < 2) return
  try {
    const arr = loadRecent()
    const next = [q.trim(), ...arr.filter(x => x.toLowerCase() !== q.trim().toLowerCase())].slice(0, MAX_RECENT)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch { /* Storage or optional suggestions may be unavailable. */ }
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  const pattern = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  if (!pattern) return text
  const re = new RegExp(`(${pattern})`, 'ig')
  const parts = text.split(re)
  return parts.map((part, i) => {
    re.lastIndex = 0
    return re.test(part) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>
  })
}

function scoreItem(item: SearchItem, tokens: string[]): number | null {
  const hay = (item.title + ' ' + (item.subtitle || '') + ' ' + item.keywords).toLowerCase()
  // AND logic: every token must be present somewhere
  for (const t of tokens) {
    if (!hay.includes(t)) return null
  }
  let score = 0
  const titleLow = item.title.toLowerCase()
  const subLow = (item.subtitle || '').toLowerCase()
  const kwLow = item.keywords.toLowerCase()
  for (const t of tokens) {
    if (titleLow === t) score += 20
    else if (titleLow.startsWith(t)) score += 12
    else if (titleLow.includes(t)) score += 8

    if (subLow.includes(t)) score += 4
    if (kwLow.includes(t)) score += 2

    if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay)) score += 3
  }
  if (item.group === 'Pages') score += 1
  return score
}

export function GlobalSearch({ open, onClose, initialQuery = '', onQueryChange }: { open: boolean; onClose: () => void; initialQuery?: string; onQueryChange: (q: string) => void }) {
  const navigate = useNavigate()
  const query = initialQuery
  const setQuery = onQueryChange
  // Scoring every page/transaction/vendor on each keystroke is expensive;
  // filter against the deferred query so the input stays immediate.
  const deferredQuery = useDeferredValue(query)
  const [activeIdx, setActiveIdx] = useState(0)
  const [recent, setRecent] = useState<string[]>(() => loadRecent())
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<SearchItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const panelRef = useRef<HTMLDivElement>(null)
  useDialogFocus(panelRef, onClose, open, inputRef)

  // fetch data once when opened (and cache)
  useEffect(() => {
    if (!open) return
    if (items.length) return // already loaded
    let cancelled = false

    const pageItems: SearchItem[] = navItems.map(n => ({
      id: `page-${n.to}`,
      group: 'Pages',
      title: n.label,
      subtitle: n.to,
      icon: n.icon,
      to: n.to,
      keywords: `${n.label} ${n.to} navigation page`,
      rawKeywords: [n.label, n.to],
    }))
    const extraPages: SearchItem[] = [
      { id: 'page-landing', group: 'Pages', title: 'Landing', subtitle: '/', icon: 'home', to: '/', keywords: 'landing home', rawKeywords: ['landing'] },
      { id: 'page-notifications', group: 'Pages', title: 'Notifications', subtitle: '/notifications', icon: 'notifications', to: '/notifications', keywords: 'notifications alerts', rawKeywords: ['notifications'] },
    ]

    const allStatic = [...pageItems, ...extraPages]

    async function fetchAll() {
      const results: SearchItem[] = [...allStatic]
      try {
        const txRes = await apiClient.get<{ items: LedgerTransaction[] }>('/transactions', { params: { familyView: true } }).then(r => r.data).catch(() => ({ items: [] }))
        const txItems = txRes.items
        // cap to 120 recent for search perf
        txItems.slice(0, 120).forEach((t) => {
          const name = t.recipient?.name || t.upiId || t.utr || t.type || 'Transaction'
          const amount = t.amountPaise != null ? `₹${(t.amountPaise/100).toLocaleString('en-IN')}` : ''
          const cat = t.category || ''
          const mode = t.mode || ''
          const date = t.occurredAt ? new Date(t.occurredAt).toLocaleDateString('en-IN') : ''
          results.push({
            id: `tx-${t._id}`,
            group: 'Transactions',
            title: `${name} ${amount}`.trim(),
            subtitle: `${cat} · ${mode} · ${date}`.replace(/^ · | · $/g,'').trim() || t.type,
            icon: t.type === 'INCOME' ? 'arrow_upward' : t.type === 'INTERNAL_TRANSFER' ? 'swap_horiz' : 'receipt_long',
            to: `/transactions?highlight=${t._id}&q=${encodeURIComponent(name)}`,
            keywords: `${name} ${cat} ${mode} ${t.type} ${amount} ${t.status || ''} ${t.recipient?.upiId || ''}`.toLowerCase(),
            rawKeywords: [name, cat, mode],
          })
        })
      } catch { /* Storage or optional suggestions may be unavailable. */ }

      try {
        const vRes = await apiClient.get<{ items: Vendor[] }>('/recipients', { params: { limit: 100 } }).then(r => r.data).catch(() => ({ items: [] }))
        const vItems = vRes.items
        vItems.slice(0, 80).forEach((v) => {
          results.push({
            id: `vendor-${v._id}`,
            group: 'Vendors',
            title: v.label || v.vendorKey || 'Vendor',
            subtitle: `${v.primaryCategory || v.category || ''} ${v.upiId || ''}`.trim() || `${v.hits || 0} hits`,
            icon: 'store',
            to: `/vendors/${v._id}`,
            keywords: `${v.label} ${v.vendorKey} ${v.primaryCategory || ''} ${v.upiId || ''} ${v.description || ''}`.toLowerCase(),
            rawKeywords: [v.label, v.vendorKey],
          })
        })
      } catch { /* Storage or optional suggestions may be unavailable. */ }

      try {
        const sRes = await apiClient.get<RawSubscription[]>('/subscriptions').then(r => r.data).catch(() => [])
        const sItems = sRes
        sItems.slice(0, 50).forEach((s) => {
          results.push({
            id: `sub-${s._id || s.id}`,
            group: 'Subscriptions',
            title: s.name || 'Subscription',
            subtitle: `₹${s.amount} · ${s.frequency || ''} · ${s.billingDate || ''}`.trim(),
            icon: 'subscriptions',
            to: `/subscriptions/${s._id || s.id}`,
            keywords: `${s.name} ${s.category || ''} ${s.frequency || ''}`.toLowerCase(),
            rawKeywords: [s.name],
          })
        })
      } catch { /* Storage or optional suggestions may be unavailable. */ }

      try {
        const iRes = await apiClient.get<RawInvestment[]>('/investments').then(r => r.data).catch(() => [])
        const iItems = iRes
        iItems.slice(0, 50).forEach((inv) => {
          results.push({
            id: `inv-${inv._id || inv.id}`,
            group: 'Investments',
            title: inv.name || inv.investmentType || 'Investment',
            subtitle: `${inv.investmentType || ''} · ₹${inv.totalInvested || inv.currentValue || ''}`.trim(),
            icon: 'trending_up',
            to: `/investments`,
            keywords: `${inv.name} ${inv.investmentType}`.toLowerCase(),
            rawKeywords: [inv.name || inv.investmentType],
          })
        })
      } catch { /* Storage or optional suggestions may be unavailable. */ }

      try {
        const bRes = await apiClient.get<{ items: Budget[] }>('/budgets').then(r => r.data).catch(() => ({ items: [] }))
        const bItems = bRes.items
        bItems.slice(0, 30).forEach((b) => {
          if (!b.category && !b.scope) return
          results.push({
            id: `budget-${b._id || b.category}`,
            group: 'Budgets',
            title: b.category || b.scope || 'Budget',
            subtitle: b.amountPaise ? `Limit ₹${b.amountPaise / 100}` : '',
            icon: 'savings',
            to: `/budgets`,
            keywords: `${b.category || b.scope}`.toLowerCase(),
            rawKeywords: [b.category || b.scope],
          })
        })
      } catch { /* Storage or optional suggestions may be unavailable. */ }

      try {
        const fam = await apiClient.get<{ family?: { _id: string } }>('/families/me').then(r => r.data).catch(() => null)
        const fid = fam?.family?._id
        if (fid) {
          const memRes = await apiClient.get<{ members: ApiMember[] }>(`/families/${fid}/members`).then(r => r.data).catch(() => ({ members: [] }))
          const mems = memRes.members || []
          mems.slice(0, 30).forEach((m) => {
            results.push({
              id: `member-${m._id || m.id}`,
              group: 'Family',
              title: m.name || m.email || 'Member',
              subtitle: m.role || m.email || '',
              icon: 'group',
              to: `/family`,
              keywords: `${m.name} ${m.email} ${m.role}`.toLowerCase(),
              rawKeywords: [m.name, m.email],
            })
          })
        }
      } catch { /* Storage or optional suggestions may be unavailable. */ }

      return results
    }

    fetchAll().then(all => {
      if (!cancelled) {
        setItems(all)
        setLoading(false)
      }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, items.length])

  const tokens = useMemo(() => {
    if (!deferredQuery.trim()) return []
    return deferredQuery.trim().toLowerCase().split(/\s+/).filter(Boolean).map(t => t.replace(/[₹,]/g,''))
  }, [deferredQuery])

  const filtered = useMemo(() => {
    if (!tokens.length) return []
    const scored: Array<SearchItem & { score: number }> = []
    for (const it of items) {
      const s = scoreItem(it, tokens)
      if (s !== null && s > 0) scored.push({ ...it, score: s })
    }
    scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    return scored
  }, [items, tokens])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const it of filtered) {
      const arr = map.get(it.group) || []
      if (arr.length < 5) arr.push(it)
      map.set(it.group, arr)
    }
    const order = ['Pages', 'Transactions', 'Vendors', 'Subscriptions', 'Investments', 'Budgets', 'Family']
    return Array.from(map.entries()).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
  }, [filtered])

  const flatResults = useMemo(() => grouped.flatMap(([, rows]) => rows), [grouped])
  const selectedIndex = Math.min(activeIdx, flatResults.length - 1)

  const handleSelect = useCallback((item: SearchItem) => {
    saveRecent(query)
    setRecent(loadRecent())
    onClose()
    navigate(item.to)
  }, [query, onClose, navigate])

  // keyboard navigation
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.target !== inputRef.current || e.defaultPrevented) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx(i => Math.min(i + 1, Math.max(0, flatResults.length - 1)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        if (flatResults[selectedIndex]) {
          e.preventDefault()
          handleSelect(flatResults[selectedIndex])
        } else if (query.trim() && flatResults.length === 0) {
          saveRecent(query)
          onClose()
          navigate(`/transactions?q=${encodeURIComponent(query.trim())}`)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, flatResults, selectedIndex, handleSelect, query, onClose, navigate])

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${selectedIndex}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!open) return null

  const quickPages = items.filter(i => i.group === 'Pages').slice(0, 8)

  return (
    <div className="fse-palette-backdrop" role="dialog" aria-modal="true" aria-label="Global search">
      <div className="fse-palette-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} tabIndex={-1} className="fse-palette">
        <div className="fse-palette-head">
          <Icon name="search" className="text-xl" style={{ color: 'var(--fse-muted)' }} aria-hidden="true" />
          <input
            ref={inputRef}
            className="fin-input fse-palette-input"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
            placeholder="Search pages, transactions, vendors…"
            aria-label="Search pages, transactions, vendors"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={!loading && flatResults.length > 0}
            aria-controls={!loading && flatResults.length ? 'fin-search-results' : undefined}
            aria-activedescendant={!loading && selectedIndex >= 0 ? `fin-search-result-${selectedIndex}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          {query ? (
            <button type="button" className="fse-try-btn" onClick={() => setQuery('')}>
              Clear
            </button>
          ) : (
            <button type="button" className="fse-try-btn fse-hide-sm" onClick={() => setQuery('Netflix')}>
              Try: Netflix
            </button>
          )}
          <button type="button" className="fse-kbd-btn" onClick={onClose} aria-label="Close search">
            Esc
          </button>
        </div>

        <div ref={listRef} className="fse-palette-body">
          {loading ? (
            <div className="fse-skels" aria-busy="true" aria-label="Loading search index">
              {[0, 1, 2].map(i => (
                <div key={i} className="fse-skel-row">
                  <div className="fse-skel-ico nb-skeleton" />
                  <div className="fse-skel-lines">
                    <div className="fse-skel-line nb-skeleton" style={{ width: '55%' }} />
                    <div className="fse-skel-line nb-skeleton" style={{ width: '35%' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : !query.trim() ? (
            <>
              {recent.length > 0 && (
                <div className="fse-quick-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span className="fse-label" style={{ color: 'var(--fse-muted)' }}>Recent searches</span>
                    <button
                      type="button"
                      className="fse-link"
                      style={{ fontSize: 11, fontFamily: 'var(--fse-mono)' }}
                      onClick={() => { try { localStorage.removeItem(RECENT_KEY) } catch { /* ignore */ } setRecent([]) }}
                    >
                      Clear
                    </button>
                  </div>
                  <div className="fse-recents">
                    {recent.map(r => (
                      <button key={r} type="button" className="fse-recent-btn" onClick={() => setQuery(r)}>
                        <Icon name="history" className="text-sm" aria-hidden="true" />
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="fse-quick-card">
                <div className="fse-label" style={{ color: 'var(--fse-muted)' }}>Quick links</div>
                <div className="fse-quick-grid">
                  {quickPages.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className="fse-quick-btn"
                      onClick={() => handleSelect(p)}
                    >
                      <Icon name={p.icon} className="text-base" aria-hidden="true" />
                      <span>{p.title}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="fse-help">
                <h4>How search works</h4>
                <ul>
                  <li>Type any words — all must match (AND). e.g. <strong>zomato 500</strong> finds ₹500 Zomato spend.</li>
                  <li>Searches pages, transactions, vendors, subscriptions, investments &amp; family.</li>
                  <li>Press <span className="fse-kbd">↑ ↓</span> + <span className="fse-kbd">Enter</span> to jump. <span className="fse-kbd">Ctrl K</span> anytime.</li>
                </ul>
              </div>
            </>
          ) : filtered.length === 0 ? (
            <div className="fse-no-results">
              <strong>No results for “{query}”</strong>
              <p>Try fewer words, check spelling, or search an amount like 500.</p>
              <button
                type="button"
                className="fin-button fse-btn is-sm"
                onClick={() => { saveRecent(query); onClose(); navigate(`/transactions?q=${encodeURIComponent(query)}`) }}
              >
                Search in Transactions
              </button>
            </div>
          ) : (
            <>
              <div className="fse-count-line" role="status">
                Showing {flatResults.length} of {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
              </div>
              <div id="fin-search-results" role="listbox" aria-label="Search results">
              {grouped.map(([group, arr]) => (
                <div key={group} className="fse-res-group" role="group" aria-label={group}>
                  <div className="fse-res-head">
                    <span>{group}</span>
                    <span className="fse-kbd">{arr.length}</span>
                  </div>
                  {arr.map(item => {
                    const flatIdx = flatResults.indexOf(item)
                    const isActive = flatIdx === selectedIndex
                    return (
                      <button
                        key={item.id}
                        type="button"
                        id={`fin-search-result-${flatIdx}`}
                        data-idx={flatIdx}
                        role="option"
                        aria-selected={isActive}
                        tabIndex={-1}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setActiveIdx(flatIdx)}
                        className={`fse-res-row${isActive ? ' is-active' : ''}`}
                      >
                        <span className="fse-res-left">
                          <span className="fse-res-ico">
                            <Icon name={item.icon} className="text-base" aria-hidden="true" />
                          </span>
                          <span className="fse-res-body">
                            <span className="fse-res-title">{highlight(item.title, query)}</span>
                            {item.subtitle && <span className="fse-res-sub">{highlight(item.subtitle, query)}</span>}
                          </span>
                        </span>
                        <Icon name="arrow_forward" className="text-sm" aria-hidden="true" />
                      </button>
                    )
                  })}
                </div>
              ))}
              </div>
            </>
          )}
        </div>

        <div className="fse-palette-foot">
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="fse-kbd">↑ ↓</span> Navigate
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="fse-kbd">↵</span> Select
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="fse-kbd">Esc</span> Close
            </span>
          </span>
          <span className="fse-hide-sm">Global search · transactions, vendors, pages</span>
        </div>
      </div>
    </div>
  )
}
