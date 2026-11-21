import * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/ui/Icon'
import { CodeText } from './docsPages/CodeText'
import { PublicPageHeader } from './docsPages/PublicPageHeader'
import './docsPages/docsPages.css'

type DocStep = { title: string; detail: string }
type DocSection = {
  id: string
  label: string
  icon: string
  summary: string
  steps: DocStep[]
  tips?: string[]
  route?: string
}

const SECTIONS: DocSection[] = [
  {
    id: 'start',
    label: 'Getting Started',
    icon: 'rocket_launch',
    summary: 'Create account → create or join a family → unlock the full app.',
    route: '/settings#family',
    steps: [
      { title: 'Sign up / Log in', detail: 'Go to /register → enter name/email/password. First user of a new family becomes Super Admin (role: admin). Login at /login creates a httpOnly session cookie fintrack.sid (7-day TTL, stored in MongoDB).' },
      { title: 'Create or Join Family', detail: 'Settings → Family. Create: name your FamilyAccount (e.g., Sharma Family) → you get an inviteCode. Join: paste the inviteCode from your admin → status PENDING until admin accepts in /family → Requests. Without a family you see the yellow banner and cannot Import/Transactions/Budgets.' },
      { title: 'Invite flow', detail: 'Admin: /family → Invite Member → enter email (or share inviteCode). Member: /accept-invite/:token or Settings → Family → Join. Admin approves via PATCH /api/families/:id/requests/:membershipId {action: accept/reject}.' },
      { title: 'Switch member view (admin)', detail: 'Top bar “View: Rohan ▾” — admin can toggle activeMemberId to see any member’s dashboard. Non-admins see only their own data; admin sees family aggregate.' },
    ],
    tips: ['Keep your inviteCode private — rotate it in /family if leaked.', 'Sessions are httpOnly; clearing fintrack-theme in localStorage only resets theme.'],
  },
  {
    id: 'nav',
    label: 'Navigation Shell',
    icon: 'dashboard',
    summary: 'Sidebar, header search, theme, and global navigation.',
    steps: [
      { title: 'Sidebar (fixed 240px)', detail: 'All primary modules: Dashboard, Income, Subscriptions, Investments, Tax Calculator, Reports, Family Dashboard, Members, Vendors, Transactions, Import, Budgets, Settings. Active route is highlighted with the yellow indicator.' },
      { title: 'Header', detail: 'Left: page title + member switcher (admin). Right: global search (⌘K / Ctrl+K / “/”) → palette that ranks pages/transactions/vendors/subscriptions/investments; theme toggle (light/dark, persisted in localStorage fintrack-theme); notifications; avatar → /settings.' },
      { title: 'Family banner', detail: 'If !familyAccountId, a yellow brutal banner appears on every page with a CTA to Settings → Family.' },
      { title: 'Footer', detail: 'Links to Privacy Policy (/privacy) and Docs (/docs). Always visible inside the app shell.' },
    ],
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'monitoring',
    summary: 'Your single pane of glass — real-time financial health.',
    route: '/dashboard',
    steps: [
      { title: 'Stat cards', detail: 'Monthly Income (yellow), Monthly Outflow (white), Investments Worth (cyan), Net Monthly Savings (white) — values are via GET /api/dashboard. Net = Income − Obligations.' },
      { title: 'Monthly Spend Breakdown (420px card)', detail: 'Bar list per category: bar width = value / maxBurn. Totals at bottom: Actual Spend (Transactions) this month + txn count. Chips: Subscriptions / Investment SIPs from monthlyBurnBreakdown.' },
      { title: 'Category & Vendor donuts', detail: 'DonutChart (inner 55%, outer 85%, stroke var(--border)). Categories: full distribution — percentages normalized via Hamilton largest-remainder so center Total is always 100% (not 101%). Vendors: top 8 + Other bucket so 98% becomes 100% of total spend. Legend is grid 2-col scrollable, not overlapping outer labels (≥5% threshold).' },
      { title: 'Upcoming Payments (7 days)', detail: 'Horizontal scroll of subscriptions and SIPs due in next 7 days (nextOccurrence). Button: Pay Now (≤5d) vs Schedule, due badge color-coded.' },
      { title: 'Dark mode contrast', detail: 'Axis/grid use var(--chart-axis-text) #d8d8d0 (13:1) and var(--chart-grid) 10% white, not muted gray. Borders use var(--border) #f5f5f0 + yellow shadow var(--shadow).' },
    ],
  },
  {
    id: 'family-dashboard',
    label: 'Family Dashboard',
    icon: 'group',
    summary: 'Power-BI style analytics over the whole household — filtered by time, members, mode.',
    route: '/family/dashboard',
    steps: [
      { title: 'Filters', detail: 'From / To (max 365 days) + Members (multi-toggle, yellow = active) + Mode (UPI/BANK/CASH/CARD/OTHER) → Apply calls GET /api/analytics/family?from=&to=&members=&modes=. Clear resets.' },
      { title: 'KPI row', detail: 'Actual Spend, Avg / day, Transfers, Highest Day — from summary.actualExpenditurePaise etc. and timeSeries.' },
      { title: 'Share pies (100%)', detail: 'Member / Category / Vendor share pies — sharePct = spendPaise / totalExpensePaise *100. Labels only for ≥5% to avoid collision (pieLabelThreshold). Uses CAT_COLORS boosted for dark.' },
      { title: 'Time & breakdowns', detail: 'Monthly Area (income vs expense), Spend Over Time, By Category (vertical Bar), By Member, Top Vendors, By Mode, Member×Vendor matrix, and daily Heatmap (quantile palette, 0 → white, max → black/yellow, with scale).' },
      { title: 'Member filter bug fixed', detail: 'Previously m.id was undefined (backend sent _id). Now familyService.members normalizes via normalizeMember (api.ts:193) → id is stable, single-select no longer selects both.' },
    ],
  },
  {
    id: 'transactions',
    label: 'Transactions',
    icon: 'receipt_long',
    summary: 'The ledger — manual entry + family ledger, with smart categorization.',
    route: '/transactions',
    steps: [
      { title: 'Views', detail: 'My vs Family toggle (familyView). Admin sees full ledger; members see own + FAMILY visibility. PRIVATE is invisible to others even in aggregates.' },
      { title: 'Filters', detail: 'Date From/To, Vendor (substring on recipient.name/upiId/utr), Mode, Member (familyView), Search q (type/category/mode/status/recipient), Status (PENDING_REVIEW/ACTIVE/RECONCILED), Category (ALL_CATEGORIES). Server params + client q filter.' },
      { title: 'Summary', detail: 'Actual Spend (EXPENSE+CASH_EXPENSE), Transfers, Withdrawals, Total Movement — from computeLedgerSummary.' },
      { title: 'Other → auto-categorize', detail: 'Bulk “Categorize Others” POST /api/transactions/bulk-categorize {familyView, confidenceThreshold:30, limit:200} uses vendor primary → amount → UPI handle → keyword scoring.' },
      { title: 'Add transaction', detail: 'Amount, Type (EXPENSE/INCOME/INTERNAL_TRANSFER/CASH_*), Mode, Category, When, Recipient (autocomplete /recipients?q), To member (for INTERNAL_TRANSFER), Visibility (FAMILY/PRIVATE).' },
      { title: 'Detail drawer', detail: 'Click row → right drawer with Amount/Type/Mode/Category (editable), Subcategory, Product, Visibility toggle, Teach Vendor box (vendorKey + categories + product+amount → priceMap), SubscriptionLinkBox, Source records, Compare, Merge/Keep separate for PENDING_REVIEW.' },
      { title: 'Global search deep-link', detail: 'Palette result → /transactions?highlight=<id>&q=<name> opens drawer and sets filters.' },
    ],
  },
  {
    id: 'vendors',
    label: 'Vendors & Teach',
    icon: 'store',
    summary: 'Shared family vendor pool — teach once, whole family benefits.',
    route: '/vendors',
    steps: [
      { title: 'Directory (family-scoped)', detail: 'Model RecipientDirectory {familyId, vendorKey, upiId, label, primaryCategory, offerings[{category,hits}], products[{name,typicalAmountPaise}], priceMap[{amountPaise,productRef}], hits}. Unique on {familyId,vendorKey} + partial {familyId,upiId}.' },
      { title: 'List & search', detail: 'GET /recipients?q=&category=&limit=200, sorted by hits. Filters: All categories + search. Actions: Edit, Apply to Other, Merge, Archive, View → /vendors/:id.' },
      { title: 'Create (+ New Vendor)', detail: 'Label*, UPI or Mode*, Categories* (multi), Products (free-form name + ₹ typical). POST /recipients validates via normalizeVendorKey (lowercase, strip UPI prefix, alphanum).' },
      { title: 'Teaching flows', detail: 'A) Transaction drawer → TeachVendorBox: pick categories + optional product for this amount → POST /recipients then priceMap. B) VendorDetail → add product. C) Backfill: POST /recipients/backfill scans all family transactions and upserts vendors.' },
      { title: 'Amount → product', detail: 'resolveProduct tolerance max(100, amount*5%). Next payment same amount suggests paneer ₹40. Stored in priceMap and products. Family-shared: any member’s teaching helps all members’ predictCategory (categoryEngine 85/75 for family_amount_product).' },
      { title: 'Vendor Detail page', detail: '/vendors/:id shows offerings, products, priceMap, transactions linked via recipientVendorRef, merge/apply flows.' },
    ],
  },
  {
    id: 'import',
    label: 'Import (Bank & Screenshots)',
    icon: 'upload_file',
    summary: 'Bank CSV/XLSX parsed locally; screenshots OCR’d via Gemini.',
    route: '/import',
    steps: [
      { title: 'Bank statement', detail: 'POST /api/imports/bank multipart file (15MB). Chooses parseCSV vs parseXLSX by extension. parseCSV: header detection (transaction date/value date + amount/debit/credit/withdrawal/deposit + description/narration), Withdrawal/Deposit split, Dr/Cr handling, parseBankDate/parseAmountStr, upiFromDesc regex. parseXLSX: try ExcelJS wb.xlsx.load, fallback xlsx.read (BIFF .xls) with cellDates:true. Returns candidates {occurredAt, amountPaise, type, mode:BANK, recipient, utr, upiId}.' },
      { title: 'Screenshot', detail: 'POST /api/imports/screenshot → ocr.service.js extractScreenshot: POST gemini-2.5-flash generateContent with inline_data base64 + prompt for amount/date/time/recipient/upiId/transactionId/utr → JSON. Requires GEMINI_API_KEY.' },
      { title: 'Dedup & reconcile', detail: 'hashFile SHA256 duplicate_file check; rowHash of sorted fingerprints; ingest() fingerprintCandidate → 2-day window recent txs, scoreCandidate confidence, classifyConfidence: ≥85 AUTO (RECONCILED), ≥60 REVIEW (PENDING_REVIEW), else ACTIVE. Batch record ImportBatch with created/reconciled/pendingReview/deduped/failed.' },
      { title: 'Batch UI', detail: 'History GET /api/imports/history, batch detail GET /api/imports/batches/:id. Shows Already imported message with date/rows.' },
    ],
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    icon: 'subscriptions',
    summary: 'Auto-pay tracking with transaction linking and suggestions.',
    route: '/subscriptions',
    steps: [
      { title: 'Subscriptions CRUD', detail: 'Fields: name, category, amount, billingDate (1-31), frequency (monthly/yearly), start/end, paymentMethod, autoRenew, status. Filters by frequency. Card shows days until due, amount.' },
      { title: 'Detail (/subscriptions/:id)', detail: 'Header, monthly cost, linked transactions (GET /subscriptions/:id/transactions returns {linked, suggestions, totalPaidPaise}), suggestions via subscriptionLinker fuzzy + amount ±5%/15% + day ±3.' },
      { title: 'Linking', detail: 'Link box: select transaction → PATCH /transactions/:id {subscriptionRef}. Prepayment style: RecordSubscriptionPaymentModal offers manual amount/date/mode vs link existing transaction.' },
      { title: 'CategoryEngine boost', detail: 'Family sub match 90 (exact name+amount) / 80 (name) → auto-categorizes as subscription category.' },
    ],
  },
  {
    id: 'investments',
    label: 'Investments',
    icon: 'trending_up',
    summary: 'Stocks, MF/SIP, FD, Real Estate — valuation & SIP schedule.',
    route: '/investments',
    steps: [
      { title: 'Fixed deposit terms', detail: 'Enter the opening date, principal, annual interest rate, and term. Set the bank’s maturity date or let FinStack calculate it. Record the payout or renewal instruction and confirm the deposit status with your bank at maturity.' },
      { title: 'Linked transactions', detail: 'Open Transactions on a fixed deposit to link funding or a maturity payout. On a stock, link purchases and dividends. FinStack assigns Investment / Fixed Deposit or Investment / Stocks in the ledger.' },
      { title: 'Summary', detail: 'GET /investments/summary → investedValue/currentValueOf aggregation per member; dashboard Investment Portfolio Value card pulls this.' },
      { title: 'Tax link', detail: 'ELSS auto-flags for 80C in tax.module; SIP amount contributes to monthlyObligations in dashboard.' },
    ],
  },
  {
    id: 'tax',
    label: 'Tax Calculator',
    icon: 'calculate',
    summary: 'Old vs New regime estimate from your income and recorded deductions.',
    route: '/tax',
    steps: [
      { title: 'Estimate', detail: 'GET /tax/estimate aggregates annual income and deductions, then returns the Old and New regime traces with taxable income, tax before cess, cess, total tax and effective rate.' },
      { title: 'Tips', detail: 'GET /tax/tips returns plain-English suggestions generated from the same deduction data.' },
      { title: 'Deduction sources', detail: 'Deductions come from the tax payments recorded against investments (80C, 80CCD, 80D, 80E, 80G, 24b); nothing is inferred from scheduled payments.' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports & Analytics',
    icon: 'bar_chart',
    summary: 'Exports and family analytics — all from the Transaction ledger.',
    route: '/reports',
    steps: [
      { title: 'Reports page', detail: 'Kinds: monthly/annual/category/tax/family × format pdf|excel. GET /api/reports/:kind?format= stream blob. Family report is unified on Transaction ledger (source of truth).' },
      { title: 'Family Dashboard vs Reports', detail: 'Family Dashboard is Power-BI style analytics (byMember, byCategory, topVendors, byMode, heatmap, member×vendor). Reports is export-oriented (PDF/Excel via pdfkit/exceljs on backend).' },
    ],
  },
  {
    id: 'budgets',
    label: 'Budgets',
    icon: 'savings',
    summary: 'Category limits — PRIVATE excluded.',
    route: '/budgets',
    steps: [
      { title: 'Model', detail: 'Budget {familyId, memberId, category, limit} — visibility PRIVATE excluded from aggregates.' },
      { title: 'UI', detail: 'Set per-category monthly limit; dashboard & reports respect it; overspend triggers in-app notification.' },
    ],
  },
  {
    id: 'search',
    label: 'Search',
    icon: 'search',
    summary: 'Global palette that actually works — ranked, grouped, keyboard-nav.',
    steps: [
      { title: 'Header input', detail: 'Hidden md:flex brutal-thin input (260-360px) + mobile icon. Typing opens palette; query synced both ways via initialQuery + onQueryChange. Shortcuts: ⌘K / Ctrl+K and “/” when not in input.' },
      { title: 'Palette (GlobalSearch.tsx)', detail: 'Fetches transactions (120), vendors (80), subscriptions (50), investments (50), budgets, family members; builds SearchItem {id, group, title, subtitle, icon, to, keywords}.' },
      { title: 'Ranking', detail: 'AND logic: every token must appear in title+subtitle+keywords. Score: title exact 20, prefix 12, includes 8, subtitle 4, keywords 2, word-boundary 3; Pages +1. Sorted desc, then groups capped 5 each, flat 30.' },
      { title: 'UX', detail: 'Grouped by Pages/Transactions/Vendors/Subscriptions/Investments/Budgets/Family; highlight via <mark>, ↑↓ + Enter, ESC, recent searches in localStorage fintrack-recent-searches (6), Clear. Empty shows Quick links (8) + How search works; no-result shows Search in Transactions fallback. Selecting saves recent and navigates.' },
      { title: 'Deep links', detail: 'Transaction → /transactions?highlight=id&q=name opens drawer; vendor → /vendors/:id; subscription → /subscriptions/:id.' },
    ],
  },
  {
    id: 'appearance',
    label: 'Appearance & Settings',
    icon: 'palette',
    summary: 'Theme, account, notifications, security.',
    route: '/settings',
    steps: [
      { title: 'Theme', detail: 'Context ThemeContext: localStorage fintrack-theme, prefers-color-scheme fallback, class dark + data-theme + colorScheme. Toggle in header and sidebar/footer, also in Settings → Appearance (Light/Dark buttons). Early script in index.html prevents FOUC. Tokens: --bg-page:#0D0D0D, --bg-sidebar:#1F1F19, --bg-card:#24231C, --bg-input:#1B1B16, --text-primary:#F2F0DF, --border:rgba(216,213,189,0.13) etc.' },
      { title: 'Settings page', detail: 'Account (name/email), Family (create/join, members), Appearance, Notifications toggles (push/email/3-day reminders), Security (new/confirm password with nb-yellow-flash), Danger Zone (delete — not wired to backend yet).' },
    ],
  },
]

// Prototype's Getting Started quick-explore tiles, mapped onto real sections.
const EXPLORE: { id: string; icon: string; title: string }[] = [
  { id: 'nav', icon: 'dashboard', title: 'NAVIGATION SHELL' },
  { id: 'dashboard', icon: 'monitoring', title: 'DASHBOARD' },
  { id: 'family-dashboard', icon: 'group', title: 'FAMILY DASHBOARD' },
  { id: 'transactions', icon: 'receipt_long', title: 'TRANSACTIONS' },
]

function matches(section: DocSection, query: string): boolean {
  if (!query.trim()) return true
  const hay = `${section.label} ${section.summary} ${section.route ?? ''} ${section.steps
    .map((step) => `${step.title} ${step.detail}`)
    .join(' ')}`.toLowerCase()
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return tokens.every((token) => hay.includes(token))
}

export function Docs(): React.ReactElement {
  const [active, setActive] = useState<string>(SECTIONS[0].id)
  const [q, setQ] = useState<string>('')
  const [contentsOpen, setContentsOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => SECTIONS.filter((section) => matches(section, q)), [q])

  const currentId = filtered.some((section) => section.id === active) ? active : filtered[0]?.id
  const currentIndex = SECTIONS.findIndex((section) => section.id === currentId)
  const current = currentIndex >= 0 ? SECTIONS[currentIndex] : undefined

  // While searching, Prev/Next walk the visible results so the pager cannot
  // land on a section the filtered contents list is hiding.
  const pagerList = filtered.some((section) => section.id === currentId) ? filtered : SECTIONS
  const pagerIndex = pagerList.findIndex((section) => section.id === currentId)
  const prev = pagerIndex > 0 ? pagerList[pagerIndex - 1] : undefined
  const next = pagerIndex >= 0 && pagerIndex < pagerList.length - 1 ? pagerList[pagerIndex + 1] : undefined

  // Track the displayed section so quick repeated Prev/Next clicks move one
  // section per click instead of all reading the same stale render.
  const shownRef = useRef<string | undefined>(currentId)
  useEffect(() => {
    shownRef.current = currentId
  }, [currentId])

  const select = (id: string) => {
    shownRef.current = id
    setActive(id)
    setContentsOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const step = (offset: number) => {
    const base = pagerList.findIndex((section) => section.id === (shownRef.current ?? currentId))
    const target = base >= 0 ? pagerList[base + offset] : undefined
    if (target) select(target.id)
  }

  // "/" focuses the docs search unless a form control already has focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const el = document.activeElement
      const typing = el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (typing) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="fdocs-page">
      <PublicPageHeader active="docs">
        <div className="fdp-search">
          <Icon name="search" className="fdp-search-icon" />
          <input
            ref={searchRef}
            value={q}
            onChange={(event) => {
              setQ(event.target.value)
              setContentsOpen(event.target.value.trim().length > 0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setQ('')
                event.currentTarget.blur()
              }
            }}
            placeholder="Search docs (e.g., vendor, budget, reports)…"
            aria-label="Search documentation"
            className="fdp-search-input"
          />
          {q ? (
            <button type="button" className="fdp-search-clear" onClick={() => setQ('')} aria-label="Clear search">
              ×
            </button>
          ) : (
            <span className="fdp-kbd" aria-hidden="true">
              /
            </span>
          )}
        </div>
      </PublicPageHeader>

      <div className="fdocs-layout">
        <aside className="fdocs-sidebar" aria-label="Documentation contents">
          <div className="fdocs-toc" data-mobile-open={contentsOpen}>
            <button
              type="button"
              className="fdocs-toc-toggle"
              aria-expanded={contentsOpen}
              aria-controls="fdocs-contents"
              onClick={() => setContentsOpen((open) => !open)}
            >
              <span className="fdocs-kicker">Contents</span>
              <Icon name={contentsOpen ? 'expand_less' : 'expand_more'} />
            </button>
            <div className="fdocs-toc-head">
              <span className="fdocs-kicker">Contents</span>
              <span className="fdocs-toc-count">
                {filtered.length}/{SECTIONS.length}
              </span>
            </div>
            <nav id="fdocs-contents" className="fdocs-toc-list custom-scrollbar">
              {filtered.length === 0 && (
                <div className="fdocs-toc-empty">
                  No matching docs.
                  <button type="button" className="fdp-btn fdp-btn-white fdp-btn-sm" onClick={() => setQ('')}>
                    RESET SEARCH
                  </button>
                </div>
              )}
              {filtered.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => select(section.id)}
                  aria-current={currentId === section.id ? 'true' : undefined}
                  className={`fdocs-toc-item${currentId === section.id ? ' fdocs-toc-item--active' : ''}`}
                >
                  <span className="fdocs-toc-left">
                    <Icon name={section.icon} />
                    <span className="fdocs-toc-label">{section.label}</span>
                  </span>
                  {section.route && (
                    <span className="fdocs-toc-arrow" aria-hidden="true">
                      ↗
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          <div className="fdocs-howto">
            <div className="fdocs-howto-head">
              <Icon name="lightbulb" /> HOW TO USE THIS
            </div>
            <p className="fdocs-howto-body">
              Click a section → read steps → follow the <strong>Route</strong> in the app (e.g., <code>/vendors</code>).
              Use search above to jump. All code paths are typed — hover types in your IDE show <code>DocSection</code> &amp;{' '}
              <code>DocStep</code>.
            </p>
          </div>
        </aside>

        <main className="fdocs-main">
          {current ? (
            <>
              <article className="fdocs-article">
                <div className="fdocs-top">
                  <span className="fdp-badge">
                    <Icon name={current.icon} /> {current.label}
                  </span>
                  {current.route && (
                    <Link to={current.route} className="fdp-btn fdp-btn-sm">
                      OPEN {current.label.toUpperCase()} →
                    </Link>
                  )}
                </div>

                <div>
                  <h1 className="fdocs-h1">{current.label}</h1>
                  <p className="fdocs-subtitle">{current.summary}</p>
                </div>

                <div className="fdocs-steps">
                  {current.steps.map((step, index) => (
                    <section key={`${current.id}-${index}`} className="fdocs-step">
                      <div className="fdocs-step-num" aria-hidden="true">
                        {index + 1}
                      </div>
                      <div className="fdocs-step-content">
                        <h2 className="fdocs-step-title">{step.title}</h2>
                        <p className="fdocs-step-desc">
                          <CodeText text={step.detail} />
                        </p>
                      </div>
                    </section>
                  ))}
                </div>

                {current.tips && current.tips.length > 0 && (
                  <div className="fdocs-tips">
                    <h3>TIPS</h3>
                    <ul>
                      {current.tips.map((tip) => (
                        <li key={tip}>
                          <CodeText text={tip} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="fdocs-bottom">
                  <div className="fdocs-pager">
                    <button
                      type="button"
                      className="fdp-btn fdp-btn-white fdp-btn-sm"
                      disabled={!prev}
                      onClick={() => step(-1)}
                    >
                      ← PREV
                    </button>
                    <button type="button" className="fdp-btn fdp-btn-sm" disabled={!next} onClick={() => step(1)}>
                      NEXT →
                    </button>
                  </div>
                  <Link to="/privacy" className="fdp-btn fdp-btn-white fdp-btn-sm">
                    PRIVACY POLICY
                  </Link>
                </div>
              </article>

              {current.id === SECTIONS[0].id && (
                <div className="fdocs-explore">
                  {EXPLORE.map((tile) => {
                    const target = SECTIONS.find((section) => section.id === tile.id)
                    if (!target) return null
                    return (
                      <button key={tile.id} type="button" className="fdocs-explore-card" onClick={() => select(tile.id)}>
                        <span className="fdocs-explore-icon">
                          <Icon name={tile.icon} />
                        </span>
                        <span className="fdocs-explore-title">{tile.title}</span>
                        <p className="fdocs-explore-desc">{target.summary}</p>
                        <span className="fdocs-explore-cta">EXPLORE →</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <article className="fdocs-article fdocs-empty">
              <span className="fdp-badge">0 MATCHES</span>
              <h1 className="fdocs-h1">No sections match “{q.trim()}”</h1>
              <p className="fdocs-subtitle">
                Try searching for <code>vendor</code>, <code>budget</code>, <code>tax</code>, <code>gemini</code>, or{' '}
                <code>fintrack.sid</code>.
              </p>
              <button type="button" className="fdp-btn" onClick={() => setQ('')}>
                CLEAR SEARCH
              </button>
            </article>
          )}
        </main>
      </div>

      <footer className="fdp-footer">
        FinStack Docs · Typed with <strong>DocSection</strong> &amp; <strong>DocStep</strong> · Last updated Aug 30, 2026 ·{' '}
        <Link to="/privacy">Privacy</Link>
      </footer>
    </div>
  )
}
