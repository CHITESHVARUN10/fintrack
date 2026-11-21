import * as React from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/ui/Icon'
import { CodeText } from './docsPages/CodeText'
import { PublicPageHeader } from './docsPages/PublicPageHeader'
import './docsPages/docsPages.css'

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

function SectionHeading({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <h2 className="fpol-h2">
      <Icon name={icon} />
      {children}
    </h2>
  )
}

function Table({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fpol-table-wrap">
      <table className={`fpol-table${wide ? ' fpol-table--wide' : ''}`}>{children}</table>
    </div>
  )
}

export function PrivacyPolicy(): React.ReactElement {
  const [active, setActive] = useState<string>(sections[0].id)

  // Deep links such as /privacy#ai arrive before this lazily loaded chunk
  // mounts, so the browser's own hash scroll has already been missed. Scroll
  // only; the position-based spy below sets the rail from the new offset.
  useEffect(() => {
    const id = window.location.hash.replace('#', '')
    if (!id) return
    document.getElementById(id)?.scrollIntoView()
  }, [])

  // Scroll-spy for the section rail. Position-based rather than
  // IntersectionObserver: the last card is shorter than any observer band, so
  // an observer alone can never mark it current at the bottom of the page.
  useEffect(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.fpol-card[id]'))
    if (cards.length === 0) return

    let frame = 0
    const update = () => {
      frame = 0
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      if (atBottom) {
        setActive(cards[cards.length - 1].id)
        return
      }
      let currentId = cards[0].id
      cards.forEach((card) => {
        if (card.getBoundingClientRect().top <= 160) currentId = card.id
      })
      setActive(currentId)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    update()

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div className="fpol-page">
      <PublicPageHeader active="privacy" />

      <section className="fpol-hero">
        <div className="fpol-hero-inner">
          <div>
            <span className="fdp-badge">
              <Icon name="lock" /> LEGAL · PRIVACY POLICY
            </span>
          </div>
          <h1 className="fpol-h1">Privacy Policy</h1>
          <p className="fpol-sub">
            How FinStack collects, stores, uses, and protects your data — and where our responsibility ends.
          </p>
          <div className="fpol-meta">
            Last updated: <strong>August 30, 2026</strong> · Effective: August 30, 2026 · Version 1.1
          </div>
          <div className="fpol-pills">
            <span className="fdp-pill">Controller: FinStack Inc.</span>
            <span className="fdp-pill">Contact: privacy@fintrack.app</span>
            <span className="fdp-pill">Jurisdiction: India · IT Act, 2000 &amp; DPDP Act, 2023 aware</span>
          </div>
        </div>
      </section>

      <div className="fpol-layout">
        <aside className="fpol-rail" aria-label="Privacy Policy sections">
          <div className="fpol-kicker">On this page</div>
          <nav className="fpol-links">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={() => setActive(section.id)}
                aria-current={active === section.id ? 'location' : undefined}
                className={`fpol-link${active === section.id ? ' fpol-link--active' : ''}`}
              >
                <Icon name={section.icon} />
                <span className="fpol-link-label">{section.title}</span>
              </a>
            ))}
          </nav>

          <div className="fpol-tldr">
            <div className="fpol-tldr-head">
              <Icon name="info" /> TL;DR
            </div>
            <p>
              We store what you give us in MongoDB. We send Form 16 PDFs to Google Gemini only when you ask for
              extraction/recommendation. We never sell data. Financial advice is AI-generated — verify with a
              professional. You can delete/export anytime.
            </p>
          </div>
        </aside>

        <main className="fpol-sections">
          <article className="fpol-card" id="overview">
            <SectionHeading icon="verified_user">1. Overview &amp; Data Controller</SectionHeading>
            <p>
              FinStack (“we”, “us”) is a personal &amp; family finance management platform. This policy explains what
              personal and financial information we collect and store, why, how long, who we share with, and where our
              liability ends.
            </p>
            <ul className="fpol-list">
              <li>
                <strong>Controller:</strong> FinStack Inc., <code>privacy@fintrack.app</code> (responds within 7 days).
              </li>
              <li>
                <strong>Scope:</strong> Web app at <code>fintrack.app</code>, API at <code>/api</code>, and any
                subdomains.
              </li>
              <li>
                <strong>Audience:</strong> Indian residents. If you are outside India, you consent to processing in
                India.
              </li>
              <li>
                <strong>Not covered:</strong> Data you export and store elsewhere; third-party sites you visit via
                links.
              </li>
            </ul>
            <div className="fpol-callout-yellow">
              By creating an account or uploading a file, you confirm you are ≥18 and you agree to this policy + our
              Terms. If you don’t agree, do not use the service.
            </div>
          </article>

          <article className="fpol-card" id="collect">
            <SectionHeading icon="inventory_2">2. What We Collect</SectionHeading>
            <p>
              We use data minimisation — only what you actively provide or what’s needed to run the product.
            </p>

            <h3 className="fpol-h3">A. Account &amp; Identity</h3>
            <Table>
              <thead>
                <tr>
                  <th style={{ width: '34%' }}>Field</th>
                  <th>Purpose</th>
                  <th style={{ width: '18%' }}>Required</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>Name, email</strong>
                  </td>
                  <td>Auth, invites, member display</td>
                  <td>Yes</td>
                </tr>
                <tr>
                  <td>
                    <strong>Password hash (bcrypt)</strong>
                  </td>
                  <td>Login — we never store plain password</td>
                  <td>Yes</td>
                </tr>
                <tr>
                  <td>
                    <strong>FamilyAccount, role</strong>
                  </td>
                  <td>Multi-member scoping: admin vs member</td>
                  <td>Auto</td>
                </tr>
                <tr>
                  <td>
                    <strong>Invite token / expiry</strong>
                  </td>
                  <td>Family join flow</td>
                  <td>If invited</td>
                </tr>
              </tbody>
            </Table>

            <h3 className="fpol-h3">B. Financial Data You Enter or Import</h3>
            <ul className="fpol-list">
              <li>
                <strong>Income, Subscriptions, legacy Recurring Payments, Investments, Loans, Insurance, Education, Ad-hoc Expenses:</strong>{' '}
                amounts, dates, categories, notes you type or that we parse from your bank CSV/XLSX and UPI screenshots.
              </li>
              <li>
                <strong>Transactions &amp; Vendors:</strong> recipient name/UPI, amount, mode, category (including
                learned vendor → category mappings and price maps), status (<code>ACTIVE</code> /{' '}
                <code>PENDING_REVIEW</code> / <code>RECONCILED</code> / <code>VOIDED</code>).
              </li>
              <li>
                <strong>Budgets:</strong> category limits.
              </li>
              <li>
                <strong>Import metadata:</strong> file hash, file name, batch id, period, dedup fingerprint — for
                “already imported” detection.
              </li>
            </ul>

            <h3 className="fpol-h3">C. Form 16 &amp; Tax Data</h3>
            <ul className="fpol-list">
              <li>
                When you <strong>upload</strong> a Form 16 PDF or use <strong>Fill Manually / Duplicate</strong>, we
                store: employer/employee names, PAN/TAN, addresses, salary breakdown, standard deduction, professional
                tax, 80C/80D/80E/80G/80CCD, TDS, regime used, <code>sourceType</code>, <code>isEdited</code>, and{' '}
                <code>TDS</code> fields.
              </li>
              <li>
                Generated <strong>TaxRecommendation:</strong> regime taxes, recommended regime, savings, explanation,{' '}
                <code>taxSavingSuggestions</code>, <code>deductionBreakdown</code>, and debug trace — cached per Form16
                until marked stale.
              </li>
            </ul>

            <h3 className="fpol-h3">D. Automatically Collected</h3>
            <ul className="fpol-list">
              <li>
                <strong>Session cookie</strong> <code>fintrack.sid</code> (httpOnly, 7-day TTL in MongoDB session
                store).
              </li>
              <li>
                <strong>Usage logs:</strong> IP, user-agent, timestamps, error logs — for rate-limiting and debugging.
              </li>
              <li>
                <strong>Notifications:</strong> in-app notifications derived from your due dates.
              </li>
            </ul>
            <p className="fpol-note">
              We do <strong>not</strong> collect biometric, location, contacts, or financial credentials. We do not
              read your bank via Plaid/Setu — you must actively upload files.
            </p>
          </article>

          <article className="fpol-card" id="store">
            <SectionHeading icon="database">3. How We Store Data &amp; Retain</SectionHeading>
            <ul className="fpol-list">
              <li>
                <strong>Where:</strong> MongoDB (Mongoose ODM) — primary DB; session store <code>connect-mongo</code>{' '}
                collection <code>sessions</code> TTL 7 days. Hosted on MongoDB Atlas (configurable{' '}
                <code>MONGODB_URI</code>). PDFs are parsed in memory (Multer <code>memoryStorage</code>) and not
                persisted as files — only extracted JSON is saved.
              </li>
              <li>
                <strong>Encryption at rest/in transit:</strong> TLS for API + DB, bcrypt salt 12 for passwords,{' '}
                <code>httpOnly</code> cookies, <code>sameSite:lax</code>, <code>secure</code> in production.
              </li>
              <li>
                <strong>Indexes:</strong> <code>memberId</code>, <code>familyAccountId</code>, <code>date</code> for
                performance.
              </li>
              <li>
                <strong>Retention:</strong> Account + financial records until you delete them. Sessions auto-expire
                after 7 days inactivity. <code>Notification</code> docs may be pruned. Deleted Form16 also deletes its{' '}
                <code>TaxRecommendation</code>. <code>DELETE /api/form16/:id</code> and{' '}
                <code>DELETE /api/members/:id</code> are soft/logical where noted, but you can request hard deletion via{' '}
                <code>privacy@fintrack.app</code>.
              </li>
              <li>
                <strong>Backups:</strong> Atlas automated daily backups (if enabled) — not a user-export guarantee.
              </li>
            </ul>
            <div className="fpol-callout-warm">
              You are responsible for exporting reports (PDF/Excel) you need — we do not warrant backup restores for
              individual accounts.
            </div>
          </article>

          <article className="fpol-card" id="use">
            <SectionHeading icon="settings">4. How We Use Data</SectionHeading>
            <ul className="fpol-list">
              <li>
                Provide the service: dashboard, charts, upcoming-payment alerts, tax estimate, reports, vendor learning.
              </li>
              <li>Run AI features you trigger: Form 16 extraction and regime recommendation (see §7).</li>
              <li>
                Enforce family scoping: members see only their data; admin sees family aggregate via role checks.
              </li>
              <li>
                Improve categorization: vendor → category and amount → product mappings learn from your corrections
                (stays inside your <code>familyId</code>).
              </li>
              <li>Security: rate-limiting, audit logs, stale-marking for recommendations.</li>
            </ul>
            <p className="fpol-note">
              We do <strong>not</strong> use your financial data for advertising, nor do we sell it.
            </p>
          </article>

          <article className="fpol-card" id="legal">
            <SectionHeading icon="gavel">5. Legal Basis &amp; Consent</SectionHeading>
            <ul className="fpol-list">
              <li>
                <strong>Consent</strong> — you give it by signing up / uploading. Withdraw by deleting account/data.
              </li>
              <li>
                <strong>Contract</strong> — processing is necessary to deliver the finance tools you requested.
              </li>
              <li>
                <strong>Legitimate interest</strong> — security, fraud prevention, product improvement (aggregated,
                not personal).
              </li>
              <li>
                <strong>Legal obligation</strong> — if law requires disclosure (see §6).
              </li>
            </ul>
          </article>

          <article className="fpol-card" id="share">
            <SectionHeading icon="share">6. Sharing &amp; Third-Party Processors</SectionHeading>
            <p>
              <strong>We never sell your data.</strong> We share only with processors needed to run FinStack:
            </p>

            <Table wide>
              <thead>
                <tr>
                  <th style={{ width: '24%' }}>Processor</th>
                  <th style={{ width: '32%' }}>What we send</th>
                  <th style={{ width: '18%' }}>Why</th>
                  <th style={{ width: '26%' }}>Safeguards</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>Google Gemini API</strong>
                    <br />
                    <span className="fpol-mono">googleapis.com</span>
                  </td>
                  <td>
                    Form 16 PDF bytes + financial summary JSON (only when you click Extract / Recommendation)
                  </td>
                  <td>Document AI &amp; tax advice</td>
                  <td>TLS in transit; API data not used for training under Google API terms; you can manually edit before saving</td>
                </tr>
                <tr>
                  <td>
                    <strong>MongoDB Atlas</strong>
                  </td>
                  <td>All stored records</td>
                  <td>Primary DB + session store</td>
                  <td>At-rest &amp; TLS encryption, IP allowlist &amp; network isolation</td>
                </tr>
                <tr>
                  <td>
                    <strong>SMTP / Nodemailer provider</strong>
                  </td>
                  <td>Recipient email, invite token, notification email</td>
                  <td>Invite &amp; alert emails</td>
                  <td>TLS transport; credentials isolated in server env</td>
                </tr>
                <tr>
                  <td>
                    <strong>Hosting</strong>
                    <br />
                    <span className="fpol-mono">Vercel / Render / VPS</span>
                  </td>
                  <td>All API traffic</td>
                  <td>Run the app</td>
                  <td>HTTPS enforced; container &amp; process isolation</td>
                </tr>
                <tr>
                  <td>
                    <strong>Recharts / Tailwind</strong>
                    <br />
                    <span className="fpol-mono">frontend libs</span>
                  </td>
                  <td>Nothing (client-side)</td>
                  <td>Charts &amp; styling</td>
                  <td>No external telemetry; executes locally in your browser</td>
                </tr>
              </tbody>
            </Table>

            <ul className="fpol-list">
              <li>No ad networks, no Plaid/Setu bank linking, no social logins.</li>
              <li>
                We will disclose only if required by Indian law, court order, or to prevent fraud/abuse — and will
                notify you unless prohibited.
              </li>
              <li>Links to external sites (e.g., TRACES) are not covered — check their policies.</li>
            </ul>
          </article>

          <article className="fpol-card" id="ai">
            <SectionHeading icon="smart_toy">7. AI Disclosure — What Goes to Gemini</SectionHeading>
            <ul className="fpol-list">
              <li>
                <strong>Extraction call</strong> (<code>POST /api/form16/upload</code>): the PDF you chose is
                base64-encoded and sent to <code>gemini-2.5-flash</code> with a strict JSON-only prompt. We parse{' '}
                <code>candidates[0].content.parts[0].text</code> and store the JSON as your <code>Form16</code> doc.
              </li>
              <li>
                <strong>Recommendation call</strong> (<code>GET /api/form16/:id/recommendation</code> if{' '}
                <code>isStale</code> or missing): we send the stored <code>Form16</code> JSON plus aggregated
                financials (salary, investments, loans, insurance, education) — never your password or session token —
                to Gemini with a tax-advisor prompt, then cache the JSON as <code>TaxRecommendation</code>.
              </li>
              <li>
                <strong>If <code>GEMINI_API_KEY</code> is missing</strong>, both calls gracefully fall back to{' '}
                <code>mockForm16()</code> / <code>mockRecommendation()</code> so the app still works offline in dev.
              </li>
              <li>
                <strong>Your control:</strong> Don’t upload a PDF? No call. Use “Fill Manually” and no bytes leave your
                device for extraction.
              </li>
              <li>
                <strong>Retention at Google:</strong> Subject to Google’s API data policies — we do not opt your data
                into training. Review Google’s{' '}
                <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">
                  Gemini API Terms
                </a>
                .
              </li>
            </ul>
            <div className="fpol-callout-warm">
              AI output is probabilistic. Always review the extracted Form 16 fields on the Review screen before
              accepting them.
            </div>
          </article>

          <article className="fpol-card" id="cookies">
            <SectionHeading icon="cookie">8. Cookies &amp; Sessions</SectionHeading>
            <ul className="fpol-list">
              <li>
                <strong>Essential only:</strong> <code>fintrack.sid</code> (session id), <code>httpOnly</code>,{' '}
                <code>sameSite:lax</code>, <code>secure</code> in production, <code>maxAge</code> 7 days. No analytics
                or ad cookies.
              </li>
              <li>
                <strong>Local storage:</strong> <code>fintrack-theme</code> (light/dark) stays in your browser.
              </li>
              <li>
                Blocking essential cookies will break login. No consent banner is needed because we don’t use
                non-essential cookies.
              </li>
            </ul>
          </article>

          <article className="fpol-card" id="security">
            <SectionHeading icon="shield">9. Security &amp; Limitations — Please Read</SectionHeading>
            <div className="fpol-callout-yellow">
              Disclaimer: FinStack is not a bank, CA, or SEBI-registered advisor.
            </div>
            <ul className="fpol-list">
              <li>
                <strong>What we do:</strong> bcrypt (12 rounds), <code>express-session</code> +{' '}
                <code>connect-mongo</code> (TTL 7d), rate-limiting on auth, Joi validation, <code>passport-local</code>.
              </li>
              <li>
                <strong>What we cannot guarantee:</strong> No internet transmission is 100% secure. We are not
                responsible for: (a) inaccuracies in AI-extracted Form 16 fields you didn’t review, (b) tax payable
                differences due to stale financial data (we mark <code>isStale=true</code> but you must re-generate),
                (c) losses from acting solely on AI tax advice, (d) file corruption or failed uploads, (e) third-party
                outages (Gemini, MongoDB, SMTP).
              </li>
              <li>
                <strong>No warranty:</strong> Service is provided “AS IS” without warranties of merchantability,
                fitness for a particular purpose, or non-infringement. To the maximum extent permitted by law, our
                liability is limited to the amount you paid (if any) in the last 12 months, or <strong>₹1,000</strong>,
                whichever is less.
              </li>
              <li>
                <strong>Your duties:</strong> Keep password private, review Form 16 before saving, verify regime
                calculation with a qualified professional, and keep your own backups of exported reports.
              </li>
              <li>
                <strong>Breach notice:</strong> If we become aware of unauthorized access to personal data, we will
                notify affected users via email / in-app within 72 hours where feasible.
              </li>
            </ul>
          </article>

          <article className="fpol-card" id="rights">
            <SectionHeading icon="person">10. Your Rights, Retention &amp; Deletion</SectionHeading>
            <ul className="fpol-list">
              <li>
                <strong>Access / Correction:</strong> All financial data is editable in-app (Income, Subscriptions,
                etc.) and via <code>PUT /api/form16/:id</code>.
              </li>
              <li>
                <strong>Export:</strong> Use Reports (<code>/reports</code> → Excel/PDF) or <code>GET /api/form16</code>{' '}
                to dump your records.
              </li>
              <li>
                <strong>Deletion:</strong> <code>DELETE /api/form16/:id</code> deletes Form 16 + its recommendation;{' '}
                <code>DELETE /api/members/:id</code> deactivates a member (data retained, <code>isActive=false</code>{' '}
                for audit). For hard deletion of account + all data, email <code>privacy@fintrack.app</code> — we
                complete within 30 days.
              </li>
              <li>
                <strong>Restriction / Objection:</strong> You can stop AI calls by not uploading PDFs; you can opt out
                of notification emails via Settings.
              </li>
              <li>
                <strong>Retention:</strong> Until deletion request or account closure, except sessions (7 days) and
                logs (up to 90 days).
              </li>
            </ul>
          </article>

          <article className="fpol-card" id="children">
            <SectionHeading icon="family_restroom">11. Children &amp; International Transfers</SectionHeading>
            <ul className="fpol-list">
              <li>
                <strong>Children:</strong> Service is for ≥18. We do not knowingly collect from children. If you are a
                guardian, you may create Education payments <code>forMember</code> as a label (e.g., child name) — that
                is not a separate account.
              </li>
              <li>
                <strong>International transfers:</strong> If you access from outside India, your data is processed in
                India (or where our Atlas cluster lives) with TLS. By using the service, you consent to this.
              </li>
              <li>
                <strong>Third-party links:</strong> Our docs may link to TRACES, NSDL, or tax slabs. Their privacy
                policies govern them.
              </li>
            </ul>
          </article>

          <article className="fpol-card" id="changes">
            <SectionHeading icon="update">12. Changes &amp; Contact</SectionHeading>
            <p>
              We may update this policy when we add features (e.g., budget alerts) or when law changes. We will bump
              the “Last updated” date and, for material changes, show an in-app notice. Continued use after the
              effective date is acceptance.
            </p>

            <div className="fpol-contact-grid">
              <div className="fpol-contact">
                <h4>DATA PROTECTION OFFICER</h4>
                <div>
                  <strong>FinStack Inc.</strong>
                </div>
                <div className="fpol-mono">privacy@fintrack.app</div>
                <div className="fpol-mono">dpo@fintrack.app</div>
              </div>
              <div className="fpol-contact">
                <h4>GRIEVANCE (INDIA)</h4>
                <div>As per IT Rules, 2021 —</div>
                <div className="fpol-mono">grievance@fintrack.app</div>
                <div className="fpol-note">Address: To be published upon company registration</div>
              </div>
            </div>

            <p className="fpol-note">
              <CodeText text="This document was drafted with reference to the PRD v1.0 (July 16, 2026) and the actual codebase routes (`/api/auth`, `/api/form16`, `/api/dashboard`, etc.). It is not legal advice — have counsel review before public launch." />
            </p>

            <div className="fpol-actions">
              <Link to="/docs" className="fdp-btn fdp-btn-white">
                READ DOCS →
              </Link>
              <Link to="/" className="fdp-btn">
                BACK TO HOME
              </Link>
            </div>
          </article>
        </main>
      </div>

      <footer className="fdp-footer">
        © 2026 FinStack Inc. · All rights reserved. · <Link to="/docs">Docs</Link> ·{' '}
        <Link to="/privacy">Privacy</Link>
      </footer>
    </div>
  )
}
