import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../ui/Icon'
import { navItems } from './nav'
import { apiClient } from '../../services/apiClient'

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
  } catch {}
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  // escape regex
  const pattern = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  if (!pattern) return text
  const re = new RegExp(`(${pattern})`, 'ig')
  const parts = text.split(re)
  return parts.map((part, i) =>
    re.test(part) ? <mark key={i} className="bg-brand-yellow px-0.5 font-bold">{part}</mark> : <span key={i}>{part}</span>
  )
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

    // bonus if token appears at word boundary
    if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay)) score += 3
  }
  // group boosting: Pages slightly higher for nav queries
  if (item.group === 'Pages') score += 1
  // transactions/vendors with amount match boost
  return score
}

export function GlobalSearch({ open, onClose, initialQuery = '', onQueryChange }: { open: boolean; onClose: () => void; initialQuery?: string; onQueryChange?: (q: string) => void }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState(initialQuery)
  const [activeIdx, setActiveIdx] = useState(0)
  const [recent, setRecent] = useState<string[]>(() => loadRecent())
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<SearchItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (open) setQuery(initialQuery) }, [open, initialQuery])
  // bubble palette edits back to header so the nav input stays in sync
  useEffect(() => { if (open) onQueryChange?.(query) }, [query, open, onQueryChange])
  useEffect(() => { if (open) { setTimeout(() => inputRef.current?.focus(), 50); setActiveIdx(0) } }, [open])
  useEffect(() => {
    if (open) {
      const r = loadRecent()
      setRecent(r)
    }
  }, [open])

  // fetch data once when opened (and cache)
  useEffect(() => {
    if (!open) return
    if (items.length) return // already loaded
    let cancelled = false
    setLoading(true)

    // static pages
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
    // add extra pages not in nav but in titles
    const extraPages: SearchItem[] = [
      { id: 'page-landing', group: 'Pages', title: 'Landing', subtitle: '/', icon: 'home', to: '/', keywords: 'landing home', rawKeywords: ['landing'] },
      { id: 'page-notifications', group: 'Pages', title: 'Notifications', subtitle: '/notifications', icon: 'notifications', to: '/notifications', keywords: 'notifications alerts', rawKeywords: ['notifications'] },
    ]

    const allStatic = [...pageItems, ...extraPages]

    async function fetchAll() {
      const results: SearchItem[] = [...allStatic]
      try {
        const txRes: any = await apiClient.get('/transactions', { params: { familyView: true } }).then(r => r.data).catch(() => ({ items: [] }))
        const txItems: any[] = txRes.items || txRes || []
        // cap to 120 recent for search perf
        txItems.slice(0, 120).forEach((t: any) => {
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
      } catch {}

      try {
        const vRes: any = await apiClient.get('/recipients', { params: { limit: 100 } }).then(r => r.data).catch(() => ({ items: [] }))
        const vItems: any[] = vRes.items || vRes || []
        vItems.slice(0, 80).forEach((v: any) => {
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
      } catch {}

      try {
        const sRes: any = await apiClient.get('/subscriptions').then(r => r.data).catch(() => [])
        const sItems: any[] = Array.isArray(sRes) ? sRes : (sRes.items || [])
        sItems.slice(0, 50).forEach((s: any) => {
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
      } catch {}

      try {
        const lRes: any = await apiClient.get('/loans').then(r => r.data).catch(() => [])
        const lItems: any[] = Array.isArray(lRes) ? lRes : (lRes.items || [])
        lItems.slice(0, 50).forEach((l: any) => {
          results.push({
            id: `loan-${l._id || l.id}`,
            group: 'Loans',
            title: l.loanName || 'Loan',
            subtitle: `${l.lender || ''} · ${l.loanType || ''} · EMI ₹${l.emiAmount}`.trim(),
            icon: 'real_estate_agent',
            to: `/loans/${l._id || l.id}`,
            keywords: `${l.loanName} ${l.lender} ${l.loanType}`.toLowerCase(),
            rawKeywords: [l.loanName, l.lender],
          })
        })
      } catch {}

      try {
        const iRes: any = await apiClient.get('/investments').then(r => r.data).catch(() => [])
        const iItems: any[] = Array.isArray(iRes) ? iRes : (iRes.items || [])
        iItems.slice(0, 50).forEach((inv: any) => {
          results.push({
            id: `inv-${inv._id || inv.id}`,
            group: 'Investments',
            title: inv.name || inv.type || 'Investment',
            subtitle: `${inv.type || ''} · ₹${inv.amount || inv.currentValue || ''}`.trim(),
            icon: 'trending_up',
            to: `/investments`,
            keywords: `${inv.name} ${inv.type}`.toLowerCase(),
            rawKeywords: [inv.name],
          })
        })
      } catch {}

      try {
        const bRes: any = await apiClient.get('/budgets').then(r => r.data).catch(() => [])
        // budgets may be object
        const bItems: any[] = Array.isArray(bRes) ? bRes : (bRes.budgets || bRes.items || [])
        bItems.slice(0, 30).forEach((b: any) => {
          if (!b.category && !b.name) return
          results.push({
            id: `budget-${b._id || b.category}`,
            group: 'Budgets',
            title: b.category || b.name || 'Budget',
            subtitle: b.limit ? `Limit ₹${b.limit}` : '',
            icon: 'savings',
            to: `/budgets`,
            keywords: `${b.category || b.name}`.toLowerCase(),
            rawKeywords: [b.category],
          })
        })
      } catch {}

      // Family members via /families/me + /families/:id/members is handled via members list if available
      try {
        const fam: any = await apiClient.get('/families/me').then(r => r.data).catch(() => null)
        const fid = fam?.family?._id || fam?.familyAccountId || fam?._id
        if (fid) {
          const memRes: any = await apiClient.get(`/families/${fid}/members`).then(r => r.data).catch(() => ({ members: [] }))
          const mems: any[] = memRes.members || memRes || []
          mems.slice(0, 30).forEach((m: any) => {
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
      } catch {}

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
    if (!query.trim()) return []
    return query.trim().toLowerCase().split(/\s+/).filter(Boolean).map(t => t.replace(/[₹,]/g,''))
  }, [query])

  const filtered = useMemo(() => {
    if (!tokens.length) return []
    const scored: Array<SearchItem & { score: number }> = []
    for (const it of items) {
      const s = scoreItem(it, tokens)
      if (s !== null && s > 0) scored.push({ ...it, score: s } as any)
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
    // order groups by priority
    const order = ['Pages', 'Transactions', 'Vendors', 'Subscriptions', 'Loans', 'Investments', 'Budgets', 'Family']
    const sorted = Array.from(map.entries()).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    return sorted
  }, [filtered])

  const flatResults = useMemo(() => filtered.slice(0, 30), [filtered])

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
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx(i => Math.min(i + 1, Math.max(0, flatResults.length - 1)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        if (flatResults[activeIdx]) {
          e.preventDefault()
          handleSelect(flatResults[activeIdx])
        } else if (query.trim() && flatResults.length === 0) {
          // fallback: navigate to transactions search
          saveRecent(query)
          onClose()
          navigate(`/transactions?q=${encodeURIComponent(query.trim())}`)
        }
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, flatResults, activeIdx, handleSelect, query, onClose, navigate])

  useEffect(() => {
    // scroll active into view
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4">
      <div className="absolute inset-0 bg-on-surface/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-[640px] brutal bg-white dark:bg-[#23231a] overflow-hidden flex flex-col max-h-[72vh] shadow-brutal">
        {/* input row */}
        <div className="flex items-center gap-sm p-sm border-b-[3px] border-on-surface dark:border-[#f5f0da] bg-white dark:bg-[#23231a] shrink-0">
          <Icon name="search" className="text-xl text-on-surface-variant" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
            placeholder="Search pages, transactions, vendors, loans…  (try 'emi', 'zomato', '₹500')"
            className="flex-1 bg-transparent outline-none text-sm font-bold placeholder:font-medium placeholder:text-on-surface-variant dark:text-[#f5f0da] dark:placeholder:text-[#9a998d]"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button onClick={() => setQuery('')} className="brutal-thin px-xs py-0.5 bg-white dark:bg-[#2a2a1e] text-xs font-bold hover:bg-brand-yellow dark:text-[#f5f0da]">Clear</button>
          )}
          <span className="hidden md:flex items-center gap-1 brutal-thin bg-surface-container-low dark:bg-[#1e1e16] px-xs py-0.5 text-[10px] font-bold uppercase">ESC</span>
        </div>

        {/* content */}
        <div ref={listRef} className="flex-1 overflow-y-auto custom-scrollbar bg-surface-container-low/30 dark:bg-[#121212] p-sm flex flex-col gap-sm">
          {loading ? (
            <div className="flex flex-col gap-sm">
              {[1,2,3].map(i => <div key={i} className="brutal bg-white dark:bg-[#23231a] p-sm flex gap-sm items-center animate-pulse"><div className="w-8 h-8 bg-surface-container-high dark:bg-[#2f2f22]" /><div className="flex-1 space-y-2"><div className="h-4 bg-surface-container-high dark:bg-[#2f2f22] w-1/2" /><div className="h-3 bg-surface-container-high dark:bg-[#2f2f22] w-1/3" /></div></div>)}
            </div>
          ) : !query.trim() ? (
            <div className="flex flex-col gap-md">
              {recent.length > 0 && (
                <div className="brutal bg-white dark:bg-[#23231a] p-sm">
                  <div className="flex justify-between items-center mb-sm">
                    <span className="text-xs font-bold uppercase tracking-wider">Recent searches</span>
                    <button onClick={() => { localStorage.removeItem(RECENT_KEY); setRecent([]) }} className="text-[11px] underline opacity-60">Clear</button>
                  </div>
                  <div className="flex flex-wrap gap-xs">
                    {recent.map(r => (
                      <button key={r} onClick={() => setQuery(r)} className="brutal-thin bg-surface-container-low dark:bg-[#2a2a1e] px-sm py-xs text-xs font-bold hover:bg-brand-yellow dark:text-[#f5f0da]">
                        <Icon name="history" className="text-sm mr-1 align-middle" />{r}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="brutal bg-white dark:bg-[#23231a] p-sm">
                <div className="text-xs font-bold uppercase tracking-wider mb-sm">Quick links</div>
                <div className="grid grid-cols-2 gap-xs">
                  {navItems.slice(0, 8).map(n => (
                    <button key={n.to} onClick={() => handleSelect({ id: n.to, group: 'Pages', title: n.label, icon: n.icon, to: n.to, keywords: '' } as any)} className="brutal-thin bg-white dark:bg-[#2a2a1e] px-sm py-sm text-xs font-bold flex items-center gap-xs hover:bg-brand-yellow text-left dark:text-[#f5f0da]">
                      <Icon name={n.icon} className="text-base" />{n.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="brutal-thin bg-brand-yellow/30 dark:bg-[#332f00] p-sm text-xs">
                <div className="font-bold uppercase mb-xs flex items-center gap-xs"><Icon name="lightbulb" className="text-base" />How search works</div>
                <ul className="list-disc ml-4 space-y-1 opacity-80">
                  <li>Type any words — all must match (AND). e.g. <span className="font-bold">zomato 500</span> finds ₹500 Zomato spend.</li>
                  <li>Searches pages, transactions, vendors, subscriptions, loans, investments & family.</li>
                  <li>Press <span className="brutal-thin bg-white dark:bg-[#23231a] px-1 text-[10px]">↑ ↓</span> + <span className="brutal-thin bg-white dark:bg-[#23231a] px-1 text-[10px]">Enter</span> to jump. <span className="brutal-thin bg-white dark:bg-[#23231a] px-1 text-[10px]">Ctrl K</span> anytime.</li>
                </ul>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="brutal bg-white dark:bg-[#23231a] p-lg text-center flex flex-col gap-sm items-center">
              <Icon name="search_off" className="text-4xl opacity-30" />
              <div className="font-bold">No results for “{query}”</div>
              <div className="text-xs opacity-60 max-w-[420px]">Try fewer words, check spelling, or search amount like 500. Press Enter to search transactions with this term.</div>
              <button onClick={() => { saveRecent(query); onClose(); navigate(`/transactions?q=${encodeURIComponent(query)}`) }} className="brutal bg-brand-yellow px-md py-xs text-xs font-bold uppercase">Search in Transactions</button>
            </div>
          ) : (
            <div className="flex flex-col gap-md">
              <div className="text-xs font-bold uppercase opacity-60 px-xs">{filtered.length} results — showing top {flatResults.length} grouped</div>
              {grouped.map(([group, arr]) => (
                <div key={group} className="brutal bg-white dark:bg-[#23231a] overflow-hidden">
                  <div className="px-sm py-xs bg-surface-container-low dark:bg-[#1e1e16] border-b-2 border-on-surface/20 dark:border-[#333] flex justify-between items-center">
                    <span className="text-xs font-bold uppercase tracking-wider dark:text-[#f5f0da]">{group}</span>
                    <span className="text-[10px] brutal-thin bg-white dark:bg-[#2a2a1e] px-xs py-0.5 dark:text-[#f5f0da]">{arr.length}</span>
                  </div>
                  <div className="flex flex-col divide-y divide-on-surface/10 dark:divide-[#333]">
                    {arr.map(item => {
                      const flatIdx = flatResults.findIndex(f => f.id === item.id)
                      const isActive = flatIdx === activeIdx
                      return (
                        <button
                          key={item.id}
                          data-idx={flatIdx}
                          onClick={() => handleSelect(item)}
                          onMouseEnter={() => setActiveIdx(flatIdx)}
                          className={`text-left p-sm flex items-center gap-sm w-full transition-colors ${isActive ? 'bg-brand-yellow dark:bg-[#ffdb00] text-on-surface' : 'hover:bg-surface-container-low dark:hover:bg-[#2a2a1e] bg-white dark:bg-[#23231a] dark:text-[#f5f0da]'}`}
                        >
                          <span className={`w-8 h-8 border-2 border-on-surface dark:border-[#f5f0da] flex items-center justify-center shrink-0 ${isActive ? 'bg-white dark:bg-[#121212] text-on-surface dark:text-[#f5f0da]' : 'bg-surface-container-low dark:bg-[#1e1e16]'}`}>
                            <Icon name={item.icon} className="text-base" />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="font-bold text-sm truncate block">{highlight(item.title, query)}</span>
                            {item.subtitle && <span className="text-xs opacity-70 truncate block">{highlight(item.subtitle, query)}</span>}
                          </span>
                          <Icon name="arrow_forward" className={`text-sm opacity-60 ${isActive ? 'opacity-100 translate-x-0' : ''}`} />
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="border-t-[3px] border-on-surface dark:border-[#f5f0da] bg-surface-container-low dark:bg-[#1e1e16] px-sm py-xs flex flex-wrap items-center justify-between gap-sm text-[11px] font-bold uppercase shrink-0 dark:text-[#b8b5a0]">
          <span className="flex items-center gap-sm">
            <span className="hidden md:flex items-center gap-1"><span className="brutal-thin bg-white dark:bg-[#23231a] px-1">↑ ↓</span> Navigate</span>
            <span className="flex items-center gap-1"><span className="brutal-thin bg-white dark:bg-[#23231a] px-1">↵</span> Select</span>
            <span className="hidden md:flex items-center gap-1"><span className="brutal-thin bg-white dark:bg-[#23231a] px-1">ESC</span> Close</span>
          </span>
          <span className="opacity-60 hidden md:block">Global search • transactions, vendors, loans, pages</span>
        </div>
      </div>
    </div>
  )
}
