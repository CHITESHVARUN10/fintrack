# FinStack user-workflow QA

**Reviewed:** 21 November 2026 · commit `33d0c84`

DeepSeek V4.1 Flash Fast tested FinStack in Chromium at desktop and phone widths using a disposable local database. The run covered first-time accounts, populated accounts, family members, keyboard navigation, and attempts to submit, interrupt, repeat, or recover from common actions. Command Code Question Bridge rejected the `max` reasoning option for this model, so the run used the bridge’s supported settings.

The audit produced **40 findings**: 3 high priority (P1), 14 medium (P2), and 23 low (P3). The list includes usability observations, feature gaps, and development findings. The three P1s were reproduced independently. Original steps, screenshots, artifacts, successful workflows, and the coverage matrix are in the [full test log](/private/tmp/finstack-user-qa-deepseek.md).

## Web remediation

- **Money and exports.** Investment rows and summaries use the same valuation rules. Pending duplicates stay out of settled totals, family exports respect the selected period, and personal expense reports use the settled ledger when present. PDFs use INR alongside readable, wrapped values. Home shows explicitly identified bank refunds separately from income.
- **Ledger and imports.** Identical date-only rows in one statement go to duplicate review. Existing entries can be corrected or voided with their source records retained. The web ledger also exposes offset groups and month sharing. Manual entry now validates inputs and gives save and retry feedback. Import results retain the filename and provide a readable reason when processing fails.
- **Web interactions.** Search and vendor suggestions support keyboard selection, the Add shortcut focuses the amount field on narrow screens, and horizontally scrollable tables show a cue. Confirmation dialogs, subscription payment notes and price history, budget overage, deduction labels, and the dashboard member picker were also updated.
- **Existing data.** The importer flags duplicates in new uploads. To fix a duplicate that is already settled, open the duplicate entry and use **Void transaction**. Unlink a payment or remove its offset group before correcting a linked entry.

## Fix first

### QA-01 · Portfolio gains omit real-estate purchase cost

1. Sign in as the seeded family admin and open **Investments**.
2. Read the **Flat — Andheri West** card and the portfolio summary at the bottom.
3. Compare the displayed amounts with the same account's investment data.

The flat has a **₹85 lakh purchase value** and a **₹1.05 crore current value**. Its card shows **₹0 invested** and **+0.0%**. The browser showed portfolio invested **₹16.90 lakh** and gain **+₹1.07 crore**. The API summary returned **₹1.018 crore invested** and **₹22.38 lakh gain**. The omitted purchase cost contributes exactly ₹85 lakh to the browser’s gain error.

The API summary also returned zero for the seeded audit’s newly added stock with saved invested/current values of ₹10,000 and ₹12,000 and no share-level prices or quantities. That second mismatch accounts for the remaining ₹2,000 difference between the browser and API gains. Reuse one valuation policy for cards and totals. Cover real estate, saved legacy totals, and stock positions with share-level prices before treating either total as authoritative. [Screenshot](/private/tmp/finstack-qa-20261121-212338/evidence/screenshots/issue-investment-gain.png) · [Web normalization](/Users/chiteshvarun/D-drive/fintrack/fintrack/frontend/src/pages/Investments.tsx:62) · [API valuation](/Users/chiteshvarun/D-drive/fintrack/fintrack/backend/server/routes/investments/investments.routes.js:16)

### QA-02 · Add transaction fails silently

1. Open **Transactions** and scroll to the quick-add form.
2. Submit an empty amount, then `0`, then `-250`.
3. Try a valid amount in an account that has yet to create or join a family.

Empty and zero amounts return in the client. A negative amount reaches the API and returns HTTP 400. The form provides no visible error for these cases and retains focus on **Add**. The original audit also reproduced a silent HTTP 400 with a valid amount on the family-less account. Show an inline amount error, focus the invalid field, and keep entered values when a request fails. Give family-less users a specific next step. Show pending and saved states and block repeated submission while the first request is in flight (QA-04). [Screenshot](/private/tmp/finstack-qa-20261121-212338/evidence/screenshots/issue-silent-add.png) · [Submit handler](/Users/chiteshvarun/D-drive/fintrack/fintrack/frontend/src/pages/Transactions.tsx:180)

### QA-05 · Identical statement rows are counted twice

1. Make a CSV with headers `Transaction Date,Description,Amount,Dr / Cr` and two identical rows: `18/11/2026,QA PARENT REVIEW STORE,311.42,Dr`.
2. Upload it through **Import → Bank Statement**.
3. Inspect the import summary and the corresponding November ledger rows.

The UI reported **2 new, 0 pending, 0 deduped**. Both ₹311.42 charges became **ACTIVE**, recording ₹622.84 of spend with no review prompt. Day-only records can reflect two real purchases, so send indistinguishable later rows to review and allow **Keep separate**. Count only settled rows in the **Actual Spend** KPI while review is pending (QA-03). Give users a way to correct a previously accepted accidental duplicate (QA-06). [Reproduction CSV](/private/tmp/finstack-qa-20261121-212338/fixtures/parent-review-duplicate.csv) · [Original import screenshot](/private/tmp/finstack-qa-20261121-212338/evidence/screenshots/28-import-uploaded.png) · [Import processing](/Users/chiteshvarun/D-drive/fintrack/fintrack/backend/server/routes/imports/imports.routes.js:50) · [Ledger totals](/Users/chiteshvarun/D-drive/fintrack/fintrack/backend/server/services/transactionEngine.service.js:214)

## Follow-up findings

The priorities below retain the original audit ratings. For QA-04 and QA-27, the independent replay narrows the original claim.

| ID | Priority | Finding and suggested change |
|---|---|---|
| QA-03 | P2 | **Transactions.** Pending duplicates inflate Actual Spend while Home uses settled entries. Exclude pending amounts from settled totals and label any separate review amount. |
| QA-04 | P2 | **Transactions.** Double-clicking Add sent two successful POSTs. The audit saw two Active rows. My replay ended with one Reconciled row, so the resulting duplicate depends on timing. Prevent double submission in the UI and make retries idempotent per submission. [Evidence](/private/tmp/finstack-qa-20261121-212338/evidence/screenshots/74-correct-transactions.png) |
| QA-06 | P2 | **Transactions.** The drawer edits category but offers no way to correct amount/date or void a mistaken row. Provide an auditable correction flow that accounts for links and import provenance. |
| QA-07 | P2 | **Member view.** Select Priya on Dashboard, then navigate to Investments, Income, or Subscriptions. The header still says **View: Priya** while the page shows Rohan's data. Limit the picker and label to routes that honor them. [Evidence](/private/tmp/finstack-qa-20261121-212338/evidence/screenshots/issue-member-view-investments.png) |
| QA-08 | P2 | **Import.** An invalid CSV shows an internal JSON dump and `File: —`. Retain the chosen filename and present the parser's reason with a clear retry action. |
| QA-09 | P2 | **Reports.** Clearing both dates still downloads a file with a blank range and sends `year=NaN`. Require and validate both dates before generating. |
| QA-10 | P2 | **Family PDF.** A report for an empty month prints a transaction count from outside that month. Use the same range and visibility rules for the count and the report totals. |
| QA-11 | P2 | **Family PDF.** The rupee glyph renders incorrectly and long member values overlap their label. Embed an appropriate font and wrap text in a separate value column. [Rendered PDF](/private/tmp/finstack-qa-20261121-212338/evidence/downloads/family-report-2026-04-01-to-2026-04-30.pdf.png) |
| QA-12 | P2 | **Budgets.** At 134% utilization the overview shows ₹0 headroom. Show the amount over the budget as well as utilization. |
| QA-13 | P2 | **Transactions.** An API failure displays “No transactions yet.” Show a recoverable load error with Retry and preserve the last successful view where possible. [Evidence](/private/tmp/finstack-qa-20261121-212338/evidence/screenshots/66-api-fail-transactions.png) |
| QA-14 | P2 | **Subscriptions.** A manually entered payment note disappears after a successful save. Persist and display the note consistently with the form. |
| QA-15 | P2 | **Transactions.** Vendor autocomplete only accepts mouse selection. Add keyboard selection, Escape, focus management, and combobox semantics. |
| QA-16 | P2 | **Family sharing.** Web users have no control to share a month despite the API and Flutter control. Without any shared months configured, the family ledger is empty. Explain why and give users an entry point that preserves private-by-default behavior. |
| QA-17 | P2 | **Compare / offsets.** Compare opens below the viewport and has no offset action. Bring the panel into view and expose the existing offset workflow for an eligible group. |
| QA-18 | P3 | **Dashboard.** The count under Actual Spend includes income. Label it as all transactions or count expense rows only. |
| QA-19 | P3 | **Family Dashboard.** A family-less user sees a generic load failure. Offer the create or join flow. |
| QA-20 | P3 | **Subscriptions.** Two monthly figures use different bases. Distinguish monthly renewals from a monthly equivalent that includes yearly plans. |
| QA-21 | P3 | **Vendor detail.** Product history displays a raw member identifier. Use a resolved name when available. |
| QA-22 | P3 | **Currency.** Money rows alternate between rounded rupees and inconsistent decimal precision. Use one convention for ledger values and compact summaries. |
| QA-23 | P3 | **Transactions.** An inverted date range leads to a misleading empty ledger. Validate the range and distinguish zero matches from zero records. |
| QA-24 | P3 | **Copy.** Singular labels include “1 txns,” “1 records,” and “Imported 1 rows.” Apply singular/plural formatting. |
| QA-25 | P3 | **Tables.** The final columns scroll horizontally but are easy to miss. Give an edge hint or a visible scroll affordance on desktop and mobile. |
| QA-26 | P3 | **Transactions.** Review Duplicates stays enabled at zero and appears inert. Give the zero state a clear count and disable the action. |
| QA-27 | P3 | **Global search.** ArrowDown works, but it follows a differently ordered array that includes hidden results. Searching `QA` in the audit data showed 10 rows while announcing 20, and pressing Down could leave no visible row active. Drive navigation, counts, and screen-reader selection from the actual rendered result list. [Source](/Users/chiteshvarun/D-drive/fintrack/fintrack/frontend/src/components/layout/GlobalSearch.tsx:261) |
| QA-28 | P3 | **Settings.** Account forms describe missing endpoints in user-facing copy. Explain what users can do using product language. |
| QA-29 | P3 | **Reports.** The default range is fixed to April 2026. Default to a relevant period relative to the current date. |
| QA-30 | P3 | **Transaction drawer.** The teaching card suggests “paneer” before a product exists. Show a prompt or the product that was actually saved. |
| QA-31 | P3 | **Home.** A statement refund shows as received income. Define how refunds affect the income and spend cards, and handle that separately from net cash flow. |
| QA-32 | P3 | **Tax.** Taxable income reflects the standard deduction but the page's deduction row reads ₹0. Show the standard deduction so users can reconcile the figures. |
| QA-33 | P3 | **Cards and tables.** Long vendor names balloon rows and charts. Constrain the visual label and retain the full text on demand. |
| QA-34 | P3 | **Transactions.** Categorize Others returns success with zero changes and gives no feedback. Report the number changed or that no suggestions matched. |
| QA-35 | P3 | **Destructive actions.** Some flows use browser confirms while others use application dialogs. Standardize the confirmation and return focus after close. |
| QA-36 | P3 · dev | **Local API.** The API listened on all interfaces during QA. Support a loopback bind for local test instances. |
| QA-37 | P3 · dev | **Models.** The API logs duplicate index declarations on startup. Keep one declaration with the intended index options. |
| QA-38 | P3 · gap | **Subscriptions.** Web has no display for the price timeline returned by the API. Expose the effective date and payment-derived/manual source. |
| QA-39 | P3 · dev | **Seed.** Legacy expense records do not populate Activity. Seed real ledger records so current-month cash-flow checks start with representative data. |
| QA-40 | P3 | **Mobile web.** The primary add control was about 1,759 px down at a 390 px viewport. Put a shortcut near the page heading that moves focus to the form. [Evidence](/private/tmp/finstack-qa-20261121-212338/evidence/screenshots/82-correct-mobile-form.png) |

## Coverage and remaining checks

- **Hands-on passes** included sign-in and route protection, valid transaction creation, expense/transfer/withdrawal classification, merge of a pending duplicate, CSV and Excel import, repeat-file detection, income create/delete, subscription payment and linking, stock creation, budget creation, family PDF and Excel downloads, dark theme, and basic keyboard focus. The original dark-mode failure was a test-server setup artifact.
- **Coverage limits.** Desktop and phone-width tests were in Chromium. Native iOS was blocked by the project's 27.0 deployment target and the installed 26.1/26.2 simulator runtimes. Android, browser Safari/Firefox, real transfer approval, UPI QR/app handoff, and external email delivery were outside verified coverage. The audit did exercise the screenshot-import UI's missing-configuration error.
- **Automated baseline.** The same commit passed 93 backend tests, three web tests, and 60 Flutter tests. Web lint and production build passed. The audited production code was left unchanged. The isolated QA services were stopped after verification.
