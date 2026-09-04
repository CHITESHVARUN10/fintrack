import * as React from 'react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/ui/Icon'

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
    route: '/family/create-join',
    steps: [
      { title: 'Sign up / Log in', detail: 'Go to /register → enter name/email/password. First user of a new family becomes Super Admin (role: admin). Login at /login creates a httpOnly session cookie fintrack.sid (7-day TTL, stored in MongoDB).' },
      { title: 'Create or Join Family', detail: 'Sidebar → Family Setup (/family/create-join). Create: name your FamilyAccount (e.g., Sharma Family) → you get an inviteCode. Join: paste the inviteCode from your admin → status PENDING until admin accepts in /family → Requests. Without a family you see the yellow banner and cannot Import/Transactions/Budgets.' },
      { title: 'Invite flow', detail: 'Admin: /family → Invite Member → enter email (or share inviteCode). Member: /accept-invite/:token or /family/create-join → Join. Admin approves via PATCH /api/families/:id/requests/:membershipId {action: accept/reject}.' },
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
      { title: 'Sidebar (fixed 240px)', detail: 'All primary modules: Dashboard, Income, Subscriptions, Recurring, Investments, Loans, Insurance, Education, Form 16, Tax, Reports, Family Dashboard, Members, Vendors, Transactions, Import, Budgets, Settings. Active route is highlighted with the yellow indicator.' },
      { title: 'Header', detail: 'Left: page title + member switcher (admin). Right: global search (⌘K / Ctrl+K / “/”) → palette that ranks pages/transactions/vendors/subscriptions/loans; theme toggle (light/dark, persisted in localStorage fintrack-theme); notifications; avatar → /settings.' },
      { title: 'Family banner', detail: 'If !familyAccountId, a yellow brutal banner appears on every page except /family/create-join with a CTA to Create / Join Family.' },
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
      { title: 'Monthly Spend Breakdown (420px card)', detail: 'Bar list per category: bar width = value / maxBurn. Totals at bottom: Actual Spend (Transactions) this month + txn count. Chips: Subscriptions / Recurring / Investments SIP from monthlyBurnBreakdown.' },
      { title: 'Category & Vendor donuts', detail: 'DonutChart (inner 55%, outer 85%, stroke var(--border)). Categories: full distribution — percentages normalized via Hamilton largest-remainder so center Total is always 100% (not 101%). Vendors: top 8 + Other bucket so 98% becomes 100% of total spend. Legend is grid 2-col scrollable, not overlapping outer labels (≥5% threshold).' },
      { title: 'Upcoming Payments (7 days)', detail: 'Horizontal scroll of subscriptions/loans/insurance/SIPs due in next 7 days (nextOccurrence). Button: Pay Now (≤5d) vs Schedule, due badge color-coded.' },
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
      { title: 'Detail drawer', detail: 'Click row → right drawer with Amount/Type/Mode/Category (editable), Subcategory, Product, Visibility toggle, Teach Vendor box (vendorKey + categories + product+amount → priceMap), SubscriptionLinkBox, LoanLinkBox (link as EMI vs Prepayment), Source records, Compare, Merge/Keep separate for PENDING_REVIEW.' },
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
    label: 'Subscriptions & Recurring',
    icon: 'subscriptions',
    summary: 'Auto-pay tracking with transaction linking and suggestions.',
    route: '/subscriptions',
    steps: [
      { title: 'Subscriptions CRUD', detail: 'Fields: name, category, amount, billingDate (1-31), frequency (monthly/yearly), start/end, paymentMethod, autoRenew, status. Filters by frequency. Card shows days until due, amount.' },
      { title: 'Detail (/subscriptions/:id)', detail: 'Header, monthly cost, linked transactions (GET /subscriptions/:id/transactions returns {linked, suggestions, totalPaidPaise}), suggestions via subscriptionLinker fuzzy + amount ±5%/15% + day ±3.' },
      { title: 'Linking', detail: 'Link box: select transaction → PATCH /transactions/:id {subscriptionRef}. Prepayment style: RecordSubscriptionPaymentModal offers manual amount/date/mode vs link existing transaction.' },
      { title: 'Recurring Payments', detail: 'Similar page /recurring with category Household/Utility/Staff etc., dueDate, amount. Suggestions /recurring/suggestions → apply/dismiss.' },
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
      { title: 'Types & fields', detail: 'Investment {investmentType: stock/mf_sip/fd/real_estate, stockName/ticker/buyPrice/quantity/currentPrice, fundName/fundHouse/sipAmount/sipDate/units/nav, bankName/principalAmount/interestRate/tenureMonths, etc.} + totalInvested/currentValue/start/end/status.' },
      { title: 'Summary', detail: 'GET /investments/summary → investedValue/currentValueOf aggregation per member; dashboard Investment Portfolio Value card pulls this.' },
      { title: 'Tax link', detail: 'ELSS auto-flags for 80C in tax.module; SIP amount contributes to monthlyObligations in dashboard.' },
    ],
  },
  {
    id: 'loans',
    label: 'Loans & Prepayments',
    icon: 'real_estate_agent',
    summary: 'EMI schedule, planner, and linking to real bank debits.',
    route: '/loans',
    steps: [
      { title: 'Model', detail: 'EMILoan {loanName, loanType, lender, principal/outstanding/emiAmount, emiDate 1-31, interestRate, tenureMonths, start/end, status}. endDate not auto-computed.' },
      { title: 'Calculator (header)', detail: 'EMI Calculator modal: P,R,N → EMI = r==0?P/n:P*r*(1+r)^n/((1+r)^n-1), totalPayable, totalInterest, amortization & yearlySummary, CSV/PDF export.' },
      { title: 'Detail (/loans/:id)', detail: 'Tabs: schedule (monthly/yearly toggle + CSV/PDF), future payments, linked transactions (explicit loanRef + suggestions via subscriptionLinker), member breakdown.' },
      { title: 'Prepay Check (what-if)', detail: 'PrepaymentPlannerModal: prepayAmount, prepayAtMonth, mode tenure|emi, uses prepaymentImpact (outstandingAfterK, new_out, n′=−log(1−new_out*r/EMI)/log1+r). Shows without vs with: EMI/tenure/totalInterest/saved/monthsSaved/newCloseDate, copyable.' },
      { title: 'Record prepayment (real)', detail: 'RecordPrepaymentModal: manual amount/date/mode or link existing Transaction (pick via amount/date). POST /loans/:id/record-prepayment or link-transaction; sets loanMeta.isLoanPayment/isPrepayment and category Bills.' },
      { title: 'Transaction → loan link', detail: 'Transactions drawer → LoanLinkBox picks loan + Prepayment checkbox → POST /loans/:id/link-transaction. Table shows Loan EMI / ⭐ Prepay badge.' },
    ],
  },
  {
    id: 'tax',
    label: 'Form 16 & Tax',
    icon: 'calculate',
    summary: 'From PDF to regime recommendation — fully typed and cached.',
    route: '/form16',
    steps: [
      { title: 'Form 16 records', detail: 'Model Form16 {userId, financialYear, employeeName/PAN, employerName/TAN, grossSalary, standardDeduction, professionalTax, 80C/80D/80E/80G/80CCD, totalDeductions, taxRegimeUsed, sourceType: PDF|Manual|Duplicate, isEdited, isFinalized}.' },
      { title: 'Upload flow', detail: '1) /form16/upload → Form16Upload (multipart pdf → POST /api/form16/upload → Gemini extraction) 2) /form16/processing (poll) 3) /form16/review/:id (deductions-preview + edit) 4) PATCH /form16/:id {isFinalized:true, finalizedDeductions} 5) /form16/recommendation/loading then /form16/recommendation/:id.' },
      { title: 'AI calls', detail: 'Extraction: gemini-2.5-flash document-understanding, JSON-only, strip ```json fences. Recommendation: send Form16 JSON + aggregated financials (salary, 80C/80D etc from investments/loans/insurance/education) → returns {oldRegimeTax,newRegimeTax,recommendedRegime,savingsAmount,explanation,taxSavingSuggestions,deductionBreakdown, regimes:{old,new} RegimeTrace}. Cached in TaxRecommendation keyed by form16Id.' },
      { title: 'Stale logic', detail: 'Mongoose post-save hooks: Form16 update OR Investment/Insurance/Loan/Education for same userId → TaxRecommendation isStale=true → next GET triggers fresh Gemini call. Duplicate: POST /form16/:id/duplicate copies fields, sourceType Duplicate, no Gemini call.' },
      { title: 'Tax Calculator (/tax)', detail: 'GET /tax/estimate + /tax/tips → builds TaxEstimate with Old/New RegimeResult (grossIncome, deductions, taxableIncome, taxBeforeCess, cess, totalTax, effectiveRate) and tips. Tips panel + regime comparison.' },
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
      { title: 'Palette (GlobalSearch.tsx)', detail: 'Fetches transactions (120), vendors (80), subscriptions (50), loans (50), investments (50), budgets, family members; builds SearchItem {id, group, title, subtitle, icon, to, keywords}.' },
      { title: 'Ranking', detail: 'AND logic: every token must appear in title+subtitle+keywords. Score: title exact 20, prefix 12, includes 8, subtitle 4, keywords 2, word-boundary 3; Pages +1. Sorted desc, then groups capped 5 each, flat 30.' },
      { title: 'UX', detail: 'Grouped by Pages/Transactions/Vendors/Subscriptions/Loans/Investments/Budgets/Family; highlight via <mark>, ↑↓ + Enter, ESC, recent searches in localStorage fintrack-recent-searches (6), Clear. Empty shows Quick links (8) + How search works; no-result shows Search in Transactions fallback. Selecting saves recent and navigates.' },
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
      { title: 'Settings page', detail: 'Account (name/email), Appearance, Notifications toggles (push/email/3-day reminders), Security (new/confirm password with nb-yellow-flash), Danger Zone (delete — not wired to backend yet).' },
    ],
  },
]

export function Docs(): React.ReactElement {
  const [active, setActive] = useState<string>(SECTIONS[0].id)
  const [q, setQ] = useState<string>('')
  const [openMobileNav, setOpenMobileNav] = useState<boolean>(false)

  const filtered = useMemo(() => {
    if (!q.trim()) return SECTIONS
    const needle = q.toLowerCase()
    return SECTIONS.filter((s) => `${s.label} ${s.summary} ${s.steps.map((x) => `${x.title} ${x.detail}`).join(' ')}`.toLowerCase().includes(needle))
  }, [q])

  const current = useMemo(() => filtered.find((s) => s.id === active) ?? filtered[0], [filtered, active])

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      <nav className="w-full border-b-[3px] flex justify-between items-center px-md py-sm sticky top-0 z-40" style={{ background: 'var(--bg-header)', borderColor: 'var(--border)' }}>
        <Link to="/" className="font-bold text-2xl uppercase tracking-tighter" style={{ color: 'var(--text-primary)' }}>
          FinStack
        </Link>
        <div className="hidden md:flex items-center gap-sm text-xs font-bold">
          <span className="opacity-60 hidden lg:inline">Docs</span>
          <div className="flex items-center brutal-thin px-2 py-1 gap-2" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
            <Icon name="search" className="text-sm" style={{ color: 'var(--text-muted)' } as React.CSSProperties} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search docs (e.g., vendor, Form 16, EMI)…"
              className="bg-transparent outline-none placeholder:text-xs min-w-[220px]"
              style={{ color: 'var(--text-primary)' }}
            />
            {q && (
              <button onClick={() => setQ('')} className="text-[10px] brutal-thin px-1" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                Clear
              </button>
            )}
          </div>
          <Link to="/privacy" className="brutal-thin px-sm py-xs uppercase hidden md:inline-flex" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            Privacy
          </Link>
          <Link to="/login" className="brutal bg-brand-yellow px-md py-xs uppercase text-sm" style={{ borderColor: 'var(--border)' }}>
            Log In
          </Link>
        </div>
        <button onClick={() => setOpenMobileNav((v) => !v)} className="md:hidden brutal-thin p-2" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <Icon name={openMobileNav ? 'close' : 'menu'} />
        </button>
      </nav>

      <div className="flex-1 w-full max-w-6xl mx-auto flex flex-col md:flex-row gap-xl p-md md:p-xl">
        {/* Sidebar */}
        <aside className={`${openMobileNav ? 'flex' : 'hidden'} md:flex md:w-[280px] shrink-0 flex-col gap-sm md:sticky md:top-[68px] md:h-fit`}>
          <div className="brutal p-sm" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="font-bold uppercase text-xs tracking-wider mb-sm flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
              <span>Contents</span>
              <span className="brutal-thin px-1 text-[10px]" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                {filtered.length}/{SECTIONS.length}
              </span>
            </div>
            <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setActive(s.id)
                    setOpenMobileNav(false)
                  }}
                  className={`flex items-center gap-2 px-2 py-2 text-left text-xs font-bold border-l-[3px] transition-colors ${active === s.id ? 'bg-brand-yellow text-on-surface' : 'hover:brightness-110'}`}
                  style={
                    active === s.id
                      ? { background: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'var(--border)' }
                      : { color: 'var(--text-secondary)', borderColor: 'transparent', background: 'transparent' }
                  }
                >
                  <Icon name={s.icon} className="text-sm shrink-0" />
                  <span className="flex-1 truncate text-left">{s.label}</span>
                  {s.route && <Icon name="arrow_outward" className="text-xs opacity-60" />}
                </button>
              ))}
              {filtered.length === 0 && <div className="text-xs p-2" style={{ color: 'var(--text-secondary)' }}>No results for “{q}”.</div>}
            </div>
          </div>

          <div className="brutal-thin p-sm text-xs" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <div className="font-bold uppercase mb-1 flex items-center gap-1">
              <Icon name="lightbulb" className="text-sm" /> How to use this
            </div>
            <p style={{ color: 'var(--text-secondary)' }}>
              Click a section → read steps → follow the <span className="font-bold" style={{ color: 'var(--text-primary)' }}>Route</span> in the app (e.g., <span className="brutal-thin px-1" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>/vendors</span>). Use search above to jump. All code paths are typed — hover types in your IDE show `DocSection` & `DocStep`.
            </p>
          </div>
        </aside>

        {/* Content */}
        <article className="flex-1 min-w-0 flex flex-col gap-lg">
          {current ? (
            <div className="brutal p-md md:p-lg" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="flex flex-wrap items-start justify-between gap-sm">
                <div>
                  <div className="inline-flex items-center gap-2 brutal-thin px-2 py-1 text-xs font-bold uppercase mb-sm" style={{ background: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'var(--border)' }}>
                    <Icon name={current.icon} className="text-base" />
                    {current.label}
                  </div>
                  <h1 className="text-2xl md:text-3xl font-bold uppercase tracking-tight leading-none">{current.label}</h1>
                  <p className="mt-xs text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {current.summary}
                  </p>
                </div>
                {current.route && (
                  <Link to={current.route} className="brutal bg-brand-yellow px-md py-xs font-bold uppercase text-xs shrink-0" style={{ borderColor: 'var(--border)' }}>
                    Open {current.label} →
                  </Link>
                )}
              </div>

              <div className="mt-lg flex flex-col gap-md">
                {current.steps.map((st, idx) => (
                  <div key={`${current.id}-${idx}`} className="brutal-thin p-md" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                    <div className="flex items-start gap-sm">
                      <span className="w-7 h-7 shrink-0 flex items-center justify-center border font-bold text-xs" style={{ background: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'var(--border)' }}>
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-sm uppercase tracking-wide">{st.title}</h3>
                        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          {st.detail}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {current.tips && current.tips.length > 0 && (
                <div className="mt-md brutal-thin p-sm" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                  <div className="font-bold text-xs uppercase tracking-wider mb-1">Tips</div>
                  <ul className="list-disc ml-5 space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {current.tips.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-lg flex flex-wrap gap-sm">
                <button
                  onClick={() => {
                    const idx = SECTIONS.findIndex((s) => s.id === current.id)
                    const prev = SECTIONS[Math.max(0, idx - 1)]
                    setActive(prev.id)
                  }}
                  className="brutal bg-white px-md py-xs font-bold uppercase text-xs"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                >
                  ← Prev
                </button>
                <button
                  onClick={() => {
                    const idx = SECTIONS.findIndex((s) => s.id === current.id)
                    const next = SECTIONS[Math.min(SECTIONS.length - 1, idx + 1)]
                    setActive(next.id)
                  }}
                  className="brutal bg-brand-yellow px-md py-xs font-bold uppercase text-xs"
                  style={{ borderColor: 'var(--border)' }}
                >
                  Next →
                </button>
                <Link to="/privacy" className="brutal-thin px-md py-xs font-bold uppercase text-xs ml-auto" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                  Privacy Policy
                </Link>
              </div>
            </div>
          ) : (
            <div className="brutal p-lg text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <Icon name="search_off" className="text-4xl" style={{ color: 'var(--text-muted)' } as React.CSSProperties} />
              <div className="font-bold mt-sm">No docs match.</div>
            </div>
          )}

          {/* Overview grid when on Getting Started */}
          {active === 'start' && (
            <div className="grid md:grid-cols-2 gap-md">
              {SECTIONS.slice(1, 5).map((s) => (
                <button
                  key={`card-${s.id}`}
                  onClick={() => setActive(s.id)}
                  className="brutal p-md text-left hover:brightness-110 flex flex-col gap-sm"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                >
                  <div className="w-10 h-10 flex items-center justify-center border" style={{ background: 'var(--accent)', borderColor: 'var(--border)', color: 'var(--accent-text)' }}>
                    <Icon name={s.icon} />
                  </div>
                  <div className="font-bold uppercase text-sm">{s.label}</div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {s.summary}
                  </div>
                  <span className="text-xs font-bold uppercase underline decoration-[3px] underline-offset-2">Explore →</span>
                </button>
              ))}
            </div>
          )}

          <div className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
            FinStack Docs · Typed with <span className="font-bold" style={{ color: 'var(--text-primary)' }}>DocSection & DocStep</span> · Last updated Aug 30, 2026 · <Link to="/privacy" className="underline">Privacy</Link>
          </div>
        </article>
      </div>
    </div>
  )
}
