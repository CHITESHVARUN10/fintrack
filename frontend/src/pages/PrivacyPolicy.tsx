import * as React from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/ui/Icon'

type Section = {
  id: string
  title: string
  icon: string
}

const sections: Section[] = [
  { id: 'overview', title: 'Overview & Controller', icon: 'verified_user' },
  { id: 'collect', title: 'What We Collect', icon: 'inventory_2' },
  { id: 'store', title: 'How We Store Data', icon: 'database' },
  { id: 'use', title: 'How We Use Data', icon: 'settings' },
  { id: 'legal', title: 'Legal Basis', icon: 'gavel' },
  { id: 'share', title: 'Sharing & Third Parties', icon: 'share' },
  { id: 'ai', title: 'AI & Gemini Disclosure', icon: 'smart_toy' },
  { id: 'cookies', title: 'Cookies & Sessions', icon: 'cookie' },
  { id: 'security', title: 'Security & Disclaimer', icon: 'shield' },
  { id: 'rights', title: 'Your Rights & Retention', icon: 'person' },
  { id: 'children', title: 'Children & Transfers', icon: 'family_restroom' },
  { id: 'changes', title: 'Changes & Contact', icon: 'update' },
]

export function PrivacyPolicy(): React.ReactElement {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* Top nav */}
      <nav className="w-full border-b-[3px] flex justify-between items-center px-md py-sm sticky top-0 z-40" style={{ background: 'var(--bg-header)', borderColor: 'var(--border)' }}>
        <Link to="/" className="font-bold text-2xl uppercase tracking-tighter" style={{ color: 'var(--text-primary)' }}>FinStack</Link>
        <div className="flex gap-sm">
          <Link to="/docs" className="brutal-thin px-sm py-xs text-xs font-bold uppercase hidden md:inline-flex items-center gap-1" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <Icon name="menu_book" className="text-base" /> Docs
          </Link>
          <Link to="/login" className="brutal bg-brand-yellow px-md py-xs font-bold uppercase text-sm" style={{ borderColor: 'var(--border)' }}>Log In</Link>
        </div>
      </nav>

      {/* Hero */}
      <header className="border-b-[3px] p-md md:p-xl" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 brutal-thin px-sm py-xs text-xs font-bold uppercase mb-md" style={{ background: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'var(--border)' }}>
            <Icon name="lock" className="text-base" /> Legal · Privacy Policy
          </div>
          <h1 className="text-4xl md:text-5xl font-bold uppercase tracking-tight leading-none">Privacy Policy</h1>
          <p className="mt-sm text-sm font-medium max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
            How FinStack collects, stores, uses, and protects your data — and where our responsibility ends. Last updated: <span className="font-bold" style={{ color: 'var(--text-primary)' }}>August 30, 2026</span> · Effective: August 30, 2026 · Version 1.1
          </p>
          <div className="mt-md flex flex-wrap gap-xs text-xs font-bold">
            <span className="brutal-thin px-2 py-1" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>Controller: FinStack Inc.</span>
            <span className="brutal-thin px-2 py-1" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>Contact: privacy@fintrack.app</span>
            <span className="brutal-thin px-2 py-1" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>Jurisdiction: India · IT Act, 2000 & DPDP Act, 2023 aware</span>
          </div>
        </div>
      </header>

      <div className="flex-1 w-full max-w-5xl mx-auto flex flex-col md:flex-row gap-xl p-md md:p-xl">
        {/* TOC */}
        <aside className="md:w-[240px] shrink-0 md:sticky md:top-[68px] md:h-fit">
          <div className="brutal p-sm" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="font-bold uppercase text-xs tracking-wider mb-sm" style={{ color: 'var(--text-secondary)' }}>On this page</div>
            <nav className="flex flex-col gap-1">
              {sections.map((s) => (
                <a key={s.id} href={`#${s.id}`} className="flex items-center gap-2 px-2 py-1.5 text-xs font-bold hover:brightness-110 border-l-[3px] border-transparent hover:border-on-surface" style={{ color: 'var(--text-secondary)' }}>
                  <Icon name={s.icon} className="text-sm shrink-0" />
                  <span className="truncate">{s.title}</span>
                </a>
              ))}
            </nav>
            <div className="mt-md brutal-thin p-sm text-xs" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
              <div className="font-bold uppercase mb-1 flex items-center gap-1"><Icon name="info" className="text-sm" /> TL;DR</div>
              <p style={{ color: 'var(--text-secondary)' }}>We store what you give us in MongoDB. We send Form 16 PDFs to Google Gemini only when you ask for extraction/recommendation. We never sell data. Financial advice is AI-generated — verify with a professional. You can delete/export anytime.</p>
            </div>
          </div>
        </aside>

        {/* Content */}
        <article className="flex-1 min-w-0 flex flex-col gap-xl text-sm leading-relaxed">
          <section id="overview" className="brutal p-md md:p-lg" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2"><Icon name="verified_user" /> 1. Overview & Data Controller</h2>
            <p className="mt-sm" style={{ color: 'var(--text-secondary)' }}>
              FinStack (“we”, “us”) is a personal & family finance management platform. This policy explains what personal and financial information we <em>shoot</em> (collect/store), why, how long, who we share with, and where our liability ends.
            </p>
            <ul className="mt-sm list-disc ml-5 space-y-1 marker:font-bold">
              <li><span className="font-bold">Controller:</span> FinStack Inc., privacy@fintrack.app (responds within 7 days).</li>
              <li><span className="font-bold">Scope:</span> Web app at fintrack.app, API at /api, and any subdomains.</li>
              <li><span className="font-bold">Audience:</span> Indian residents. If you are outside India, you consent to processing in India.</li>
              <li><span className="font-bold">Not covered:</span> Data you export and store elsewhere; third-party sites you visit via links.</li>
            </ul>
            <div className="mt-sm brutal-thin p-sm text-xs" style={{ background: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'var(--border)' }}>
              By creating an account or uploading a file, you confirm you are ≥18 and you agree to this policy + our Terms. If you don’t agree, do not use the service.
            </div>
          </section>

          <section id="collect" className="brutal p-md md:p-lg" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2"><Icon name="inventory_2" /> 2. What We Collect (What We “Shoot”)</h2>
            <p className="mt-sm" style={{ color: 'var(--text-secondary)' }}>We use data minimisation — only what you actively provide or what’s needed to run the product.</p>

            <h3 className="font-bold uppercase mt-md text-xs tracking-wider" style={{ color: 'var(--text-secondary)' }}>A. Account & Identity</h3>
            <div className="mt-xs overflow-x-auto">
              <table className="w-full text-xs border brutal-thin" style={{ borderColor: 'var(--border)' }}>
                <thead style={{ background: 'var(--bg-elevated)' }}><tr className="text-left"><th className="px-2 py-1.5">Field</th><th className="px-2 py-1.5">Purpose</th><th className="px-2 py-1.5">Required</th></tr></thead>
                <tbody>
                  <tr className="border-t" style={{ borderColor: 'var(--border)' }}><td className="px-2 py-1 font-bold">Name, email</td><td className="px-2 py-1">Auth, invites, member display</td><td className="px-2 py-1">Yes</td></tr>
                  <tr className="border-t" style={{ borderColor: 'var(--border)' }}><td className="px-2 py-1 font-bold">Password hash (bcrypt)</td><td className="px-2 py-1">Login — we never store plain password</td><td className="px-2 py-1">Yes</td></tr>
                  <tr className="border-t" style={{ borderColor: 'var(--border)' }}><td className="px-2 py-1 font-bold">FamilyAccount, role</td><td className="px-2 py-1">Multi-member scoping: admin vs member</td><td className="px-2 py-1">Auto</td></tr>
                  <tr className="border-t" style={{ borderColor: 'var(--border)' }}><td className="px-2 py-1 font-bold">Invite token / expiry</td><td className="px-2 py-1">Family join flow</td><td className="px-2 py-1">If invited</td></tr>
                </tbody>
              </table>
            </div>

            <h3 className="font-bold uppercase mt-md text-xs tracking-wider" style={{ color: 'var(--text-secondary)' }}>B. Financial Data You Enter or Import</h3>
            <ul className="mt-xs list-disc ml-5 space-y-1">
              <li><span className="font-bold">Income, Subscriptions, Recurring, Investments, Loans, Insurance, Education, Ad-hoc Expenses:</span> amounts, dates, categories, notes you type or that we parse from your bank CSV/XLSX and UPI screenshots.</li>
              <li><span className="font-bold">Transactions & Vendors:</span> recipient name/UPI, amount, mode, category (including learned vendor → category mappings and price maps), status (ACTIVE/PENDING_REVIEW/RECONCILED/VOIDED).</li>
              <li><span className="font-bold">Budgets:</span> category limits.</li>
              <li><span className="font-bold">Import metadata:</span> file hash, file name, batch id, period, dedup fingerprint — for “already imported” detection.</li>
            </ul>

            <h3 className="font-bold uppercase mt-md text-xs tracking-wider" style={{ color: 'var(--text-secondary)' }}>C. Form 16 & Tax Data</h3>
            <ul className="mt-xs list-disc ml-5 space-y-1">
              <li>When you <span className="font-bold">upload</span> a Form 16 PDF or use <span className="font-bold">Fill Manually / Duplicate</span>, we store: employer/employee names, PAN/TAN, addresses, salary breakdown, standard deduction, professional tax, 80C/80D/80E/80G/80CCD, TDS, regime used, `sourceType`, `isEdited`, and `TDS` fields.</li>
              <li>Generated <span className="font-bold">TaxRecommendation</span>: regime taxes, recommended regime, savings, explanation, `taxSavingSuggestions`, `deductionBreakdown`, and debug trace — cached per Form16 until marked stale.</li>
            </ul>

            <h3 className="font-bold uppercase mt-md text-xs tracking-wider" style={{ color: 'var(--text-secondary)' }}>D. Automatically Collected</h3>
            <ul className="mt-xs list-disc ml-5 space-y-1">
              <li><span className="font-bold">Session cookie</span> `fintrack.sid` (httpOnly, 7-day TTL in MongoDB session store).</li>
              <li><span className="font-bold">Usage logs:</span> IP, user-agent, timestamps, error logs — for rate-limiting and debugging.</li>
              <li><span className="font-bold">Notifications:</span> in-app notifications derived from your due dates.</li>
            </ul>
            <p className="mt-sm text-xs" style={{ color: 'var(--text-secondary)' }}>We do <span className="font-bold" style={{ color: 'var(--text-primary)' }}>not</span> collect biometric, location, contacts, or financial credentials. We do not read your bank via Plaid/Setu — you must actively upload files.</p>
          </section>

          <section id="store" className="brutal p-md md:p-lg" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2"><Icon name="database" /> 3. How We Store (“Shoot”) & Retain</h2>
            <ul className="mt-sm list-disc ml-5 space-y-1">
              <li><span className="font-bold">Where:</span> MongoDB (Mongoose ODM) — primary DB; session store `connect-mongo` collection `sessions` TTL 7 days. Hosted on MongoDB Atlas (configurable `MONGODB_URI`). PDFs are parsed in memory (Multer `memoryStorage`) and not persisted as files — only extracted JSON is saved.</li>
              <li><span className="font-bold">Encryption at rest/in transit:</span> TLS for API + DB, bcrypt salt 12 for passwords, `httpOnly` cookies, `sameSite:lax`, `secure` in production.</li>
              <li><span className="font-bold">Indexes:</span> `memberId`, `familyAccountId`, `date` for performance.</li>
              <li><span className="font-bold">Retention:</span> Account + financial records until you delete them. Sessions auto-expire after 7 days inactivity. `Notification` docs may be pruned. Deleted Form16 also deletes its `TaxRecommendation`. `DELETE /api/form16/:id` and `DELETE /api/members/:id` are soft/logical where noted, but you can request hard deletion via privacy@fintrack.app.</li>
              <li><span className="font-bold">Backups:</span> Atlas automated daily backups (if enabled) — not a user-export guarantee.</li>
            </ul>
            <div className="mt-sm brutal-thin p-sm text-xs" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
              You are responsible for exporting reports (PDF/Excel) you need — we do not warrant backup restores for individual accounts.
            </div>
          </section>

          <section id="use" className="brutal p-md md:p-lg" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2"><Icon name="settings" /> 4. How We Use Data</h2>
            <ul className="mt-sm list-disc ml-5 space-y-1">
              <li>Provide the service: dashboard, charts, upcoming-payment alerts, tax estimate, reports, vendor learning.</li>
              <li>Run AI features you trigger: Form 16 extraction and regime recommendation (see §7).</li>
              <li>Enforce family scoping: members see only their data; admin sees family aggregate via role checks.</li>
              <li>Improve categorization: vendor → category and amount → product mappings learn from your corrections (stays inside your `familyId`).</li>
              <li>Security: rate-limiting, audit logs, stale-marking for recommendations.</li>
            </ul>
            <p className="mt-sm text-xs" style={{ color: 'var(--text-secondary)' }}>We do <span className="font-bold" style={{ color: 'var(--text-primary)' }}>not</span> use your financial data for advertising, nor do we sell it.</p>
          </section>

          <section id="legal" className="brutal p-md md:p-lg" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2"><Icon name="gavel" /> 5. Legal Basis & Consent</h2>
            <ul className="mt-sm list-disc ml-5 space-y-1">
              <li><span className="font-bold">Consent</span> — you give it by signing up / uploading. Withdraw by deleting account/data.</li>
              <li><span className="font-bold">Contract</span> — processing is necessary to deliver the finance tools you requested.</li>
              <li><span className="font-bold">Legitimate interest</span> — security, fraud prevention, product improvement (aggregated, not personal).</li>
              <li><span className="font-bold">Legal obligation</span> — if law requires disclosure (see §6).</li>
            </ul>
          </section>

          <section id="share" className="brutal p-md md:p-lg" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2"><Icon name="share" /> 6. Sharing & Third-Party Processors</h2>
            <p className="mt-sm font-bold">We never sell your data. We share only with processors needed to run FinStack:</p>
            <div className="mt-sm overflow-x-auto">
              <table className="w-full text-xs border" style={{ borderColor: 'var(--border)' }}>
                <thead style={{ background: 'var(--bg-elevated)' }}><tr className="text-left"><th className="px-2 py-1.5">Processor</th><th className="px-2 py-1.5">What we send</th><th className="px-2 py-1.5">Why</th><th className="px-2 py-1.5">Safeguards</th></tr></thead>
                <tbody>
                  <tr className="border-t" style={{ borderColor: 'var(--border)' }}><td className="px-2 py-1.5 font-bold">Google Gemini API (googleapis.com)</td><td className="px-2 py-1.5">Form 16 PDF bytes + financial summary JSON (only when you click Extract / Recommendation)</td><td className="px-2 py-1.5">Document AI & tax advice</td><td className="px-2 py-1.5">TLS, data not used for ads per Google; we strip markdown fences before parsing</td></tr>
                  <tr className="border-t" style={{ borderColor: 'var(--border)' }}><td className="px-2 py-1.5 font-bold">MongoDB Atlas</td><td className="px-2 py-1.5">All stored records</td><td className="px-2 py-1.5">Primary DB + session store</td><td className="px-2 py-1.5">At-rest encryption, network isolation</td></tr>
                  <tr className="border-t" style={{ borderColor: 'var(--border)' }}><td className="px-2 py-1.5 font-bold">SMTP / Nodemailer provider</td><td className="px-2 py-1.5">Recipient email, invite token, notification email</td><td className="px-2 py-1.5">Invite & alert emails</td><td className="px-2 py-1.5">TLS, credentials in env</td></tr>
                  <tr className="border-t" style={{ borderColor: 'var(--border)' }}><td className="px-2 py-1.5 font-bold">Hosting (Vercel/Render/your VPS)</td><td className="px-2 py-1.5">All API traffic</td><td className="px-2 py-1.5">Run the app</td><td className="px-2 py-1.5">HTTPS, env isolation</td></tr>
                  <tr className="border-t" style={{ borderColor: 'var(--border)' }}><td className="px-2 py-1.5 font-bold">Recharts / Tailwind (frontend libs)</td><td className="px-2 py-1.5">Nothing (client-side)</td><td className="px-2 py-1.5">Charts & styling</td><td className="px-2 py-1.5">No data leaves browser</td></tr>
                </tbody>
              </table>
            </div>
            <ul className="mt-sm list-disc ml-5 space-y-1 text-xs">
              <li>No ad networks, no Plaid/Setu bank linking, no social logins.</li>
              <li>We will disclose only if required by Indian law, court order, or to prevent fraud/abuse — and will notify you unless prohibited.</li>
              <li>Links to external sites (e.g., TRACES) are not covered — check their policies.</li>
            </ul>
          </section>

          <section id="ai" className="brutal p-md md:p-lg" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2"><Icon name="smart_toy" /> 7. AI Disclosure — What Goes to Gemini</h2>
            <ul className="mt-sm list-disc ml-5 space-y-1">
              <li><span className="font-bold">Extraction call</span> (`POST /api/form16/upload`): the PDF you chose is base64-encoded and sent to `gemini-2.5-flash` with a strict JSON-only prompt. We parse `candidates[0].content.parts[0].text` and store the JSON as your `Form16` doc.</li>
              <li><span className="font-bold">Recommendation call</span> (`GET /api/form16/:id/recommendation` if `isStale` or missing): we send the stored `Form16` JSON plus aggregated financials (salary, investments, loans, insurance, education) — never your password or session token — to Gemini with a tax-advisor prompt, then cache the JSON as `TaxRecommendation`.</li>
              <li><span className="font-bold">If `GEMINI_API_KEY` is missing</span>, both calls gracefully fall back to `mockForm16()` / `mockRecommendation()` so the app still works offline in dev.</li>
              <li><span className="font-bold">Your control:</span> Don’t upload a PDF? No call. Use “Fill Manually” and no bytes leave your device for extraction.</li>
              <li><span className="font-bold">Retention at Google:</span> Subject to Google’s API data policies — we do not opt your data into training. Review <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer" className="underline decoration-[3px] underline-offset-2">Gemini API Terms</a>.</li>
            </ul>
            <div className="mt-sm brutal-thin p-sm text-xs" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
              AI output is probabilistic. Always review the extracted Form 16 fields on the Review screen before accepting them.
            </div>
          </section>

          <section id="cookies" className="brutal p-md md:p-lg" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2"><Icon name="cookie" /> 8. Cookies & Sessions</h2>
            <ul className="mt-sm list-disc ml-5 space-y-1">
              <li><span className="font-bold">Essential only:</span> `fintrack.sid` (session id), `httpOnly`, `sameSite:lax`, `secure` in production, `maxAge` 7 days. No analytics or ad cookies.</li>
              <li><span className="font-bold">Local storage:</span> `fintrack-theme` (light/dark) stays in your browser.</li>
              <li>Blocking essential cookies will break login. No consent banner is needed because we don’t use non-essential cookies.</li>
            </ul>
          </section>

          <section id="security" className="brutal p-md md:p-lg" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2"><Icon name="shield" /> 9. Security & Limitations — Please Read</h2>
            <div className="brutal-thin p-sm text-xs" style={{ background: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'var(--border)' }}>
              <span className="font-bold">Disclaimer: FinStack is not a bank, CA, or SEBI-registered advisor.</span>
            </div>
            <ul className="mt-sm list-disc ml-5 space-y-1">
              <li><span className="font-bold">What we do:</span> bcrypt (12 rounds), `express-session` + `connect-mongo` (TTL 7d), rate-limiting on auth, Joi validation, `passport-local`.</li>
              <li><span className="font-bold">What we cannot guarantee:</span> No internet transmission is 100% secure. We are not responsible for: (a) inaccuracies in AI-extracted Form 16 fields you didn’t review, (b) tax payable differences due to stale financial data (we mark `isStale=true` but you must re-generate), (c) losses from acting solely on AI tax advice, (d) file corruption or failed uploads, (e) third-party outages (Gemini, MongoDB, SMTP).</li>
              <li><span className="font-bold">No warranty:</span> Service is provided “AS IS” without warranties of merchantability, fitness for a particular purpose, or non-infringement. To the maximum extent permitted by law, our liability is limited to the amount you paid (if any) in the last 12 months, or ₹1,000, whichever is less.</li>
              <li><span className="font-bold">Your duties:</span> Keep password private, review Form 16 before saving, verify regime calculation with a qualified professional, and keep your own backups of exported reports.</li>
              <li><span className="font-bold">Breach notice:</span> If we become aware of unauthorized access to personal data, we will notify affected users via email / in-app within 72 hours where feasible.</li>
            </ul>
          </section>

          <section id="rights" className="brutal p-md md:p-lg" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2"><Icon name="person" /> 10. Your Rights, Retention & Deletion</h2>
            <ul className="mt-sm list-disc ml-5 space-y-1">
              <li><span className="font-bold">Access / Correction:</span> All financial data is editable in-app (Income, Subscriptions, etc.) and via `PUT /api/form16/:id`.</li>
              <li><span className="font-bold">Export:</span> Use Reports (`/reports` → Excel/PDF) or `GET /api/form16` to dump your records.</li>
              <li><span className="font-bold">Deletion:</span> `DELETE /api/form16/:id` deletes Form 16 + its recommendation; `DELETE /api/members/:id` deactivates a member (data retained, `isActive=false` for audit). For hard deletion of account + all data, email privacy@fintrack.app — we complete within 30 days.</li>
              <li><span className="font-bold">Restriction / Objection:</span> You can stop AI calls by not uploading PDFs; you can opt out of notification emails via Settings.</li>
              <li><span className="font-bold">Retention:</span> Until deletion request or account closure, except sessions (7 days) and logs (up to 90 days).</li>
            </ul>
          </section>

          <section id="children" className="brutal p-md md:p-lg" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2"><Icon name="family_restroom" /> 11. Children & International Transfers</h2>
            <ul className="mt-sm list-disc ml-5 space-y-1">
              <li><span className="font-bold">Children:</span> Service is for ≥18. We do not knowingly collect from children. If you are a guardian, you may create Education payments “forMember” as a label (e.g., child name) — that is not a separate account.</li>
              <li><span className="font-bold">International transfers:</span> If you access from outside India, your data is processed in India (or where our Atlas cluster lives) with TLS. By using the service, you consent to this.</li>
              <li><span className="font-bold">Third-party links:</span> Our docs may link to TRACES, NSDL, or tax slabs. Their privacy policies govern them.</li>
            </ul>
          </section>

          <section id="changes" className="brutal p-md md:p-lg" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2"><Icon name="update" /> 12. Changes & Contact</h2>
            <p className="mt-sm" style={{ color: 'var(--text-secondary)' }}>
              We may update this policy when we add features (e.g., budget alerts) or when law changes. We will bump the “Last updated” date and, for material changes, show an in-app notice. Continued use after the effective date is acceptance.
            </p>
            <div className="mt-sm grid md:grid-cols-2 gap-sm text-xs">
              <div className="brutal-thin p-sm" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                <div className="font-bold uppercase">Data Protection Officer</div>
                <div>FinStack Inc.</div>
                <div>privacy@fintrack.app</div>
                <div>dpo@fintrack.app</div>
              </div>
              <div className="brutal-thin p-sm" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                <div className="font-bold uppercase">Grievance (India)</div>
                <div>As per IT Rules, 2021 — grievance@fintrack.app</div>
                <div>Address: To be published upon company registration</div>
              </div>
            </div>
            <p className="mt-sm text-xs" style={{ color: 'var(--text-secondary)' }}>
              This document was drafted with reference to the PRD v1.0 (July 16, 2026) and the actual codebase routes (`/api/auth`, `/api/form16`, `/api/dashboard`, etc.). It is not legal advice — have counsel review before public launch.
            </p>
            <div className="mt-md flex gap-sm">
              <Link to="/docs" className="brutal bg-white px-md py-xs font-bold uppercase text-xs" style={{ borderColor: 'var(--border)' }}>Read Docs →</Link>
              <Link to="/" className="brutal bg-brand-yellow px-md py-xs font-bold uppercase text-xs" style={{ borderColor: 'var(--border)' }}>Back to Home</Link>
            </div>
          </section>

          <div className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>© 2026 FinStack Inc. · All rights reserved. · <Link to="/docs" className="underline">Docs</Link> · <Link to="/privacy" className="underline">Privacy</Link></div>
        </article>
      </div>
    </div>
  )
}
