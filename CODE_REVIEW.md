# FinTrack code review — 15 October 2026

Original review of the Node/MongoDB API and React application, before remediation. See FIXES.md for the subsequent changes and verification. At the time of this review no application source had been changed. This report records defects, suggested fixes, and verification limits; it is not a certification that every path is bug-free.

## Project understanding

FinTrack (branded FinStack in the UI) is a personal and household finance manager. The original PRD organizes income, recurring commitments, investments, loans, insurance, education, reports, and Indian tax comparisons. The family feature document extends this with a canonical transaction ledger, bank CSV/XLSX imports, screenshot extraction, duplicate reconciliation, vendor learning, cash movement, budgets, and family analytics. The intended financial distinction is that expenses, internal transfers, and cash withdrawals must not all count as spending.

The web frontend uses React 19, TypeScript, Vite, React Router, Tailwind CSS, Framer Motion, Recharts, and Axios. It authenticates through cookie sessions and sends API requests through `src/services/apiClient.ts`. Backend services use CommonJS Node.js, Express 5, Mongoose/MongoDB, Passport Local, bcrypt, express-session, and connect-mongo. Other integrations include Gemini through HTTP calls, Multer, ExcelJS/XLSX, PDFKit, Nodemailer, Joi, and node-cron. Render and Vercel deployment configuration is present. A separate Flutter/Dart mobile client uses Riverpod, GoRouter, Dio, cookie management, and charting; it was inventoried but not audited or executed in depth.

The principal flows are Express routes → Mongoose documents/services → MongoDB; imports → parsing/OCR → reconciliation → Transaction + SourceRecord; Form 16 → extraction/normalization → deduction review/finalization → calculation → cached recommendation.

Read the root README, PRD, family feature specification, existing tax audit, client READMEs, package/configuration files, and relevant implementation paths. Frontend/mobile READMEs are largely scaffold documentation. The root README is stale: it describes a `USE_MOCK` flag that is absent from the current web API service, and omits several newer modules. The empty files found outside dependencies/build outputs were generated Gradle/log artifacts, not application logic. Environment templates were inspected without reproducing credentials.

## Findings

P1 = fix before trusting shared-user access or financial results. P2 = functional/UI/developer workflow defect. “Reproduced” below means a direct check of real functions/route handlers with storage calls stubbed, not a request against a running deployment.

### 1. [P1] Transaction resolution has no ownership or family authorization

**Location:** `backend/server/routes/transactions/transactions.routes.js:440`.

After authentication, `/:id/resolve` loads any transaction by ID. Neither `keepSeparate` nor `merge` verifies its owner/family. The merge target is also loaded by ID without a family check. A signed-in user who obtains transaction IDs can activate another family's review item, void it, or move its evidence into an unrelated transaction. **Reproduced:** a member of family A changed a family B item from PENDING_REVIEW to ACTIVE.

**Fix:** authorize both documents using family, ownership, and privacy rules before changing either; restrict merge targets to compatible same-family transactions and update both records and evidence atomically.

### 2. [P1] A family administrator is treated as a global administrator

**Locations:** `backend/server/routes/families/families.routes.js:117`, `:134`, `:151`, `:183`, `:204`; `backend/server/routes/transactions/transactions.routes.js:311`.

Family routes bypass ownership whenever `req.user.role === 'admin'`, regardless of which family that user administers. Any user can create a family and become admin. Such an admin can target another family's members, pending requests, removal endpoint, and invite-code rotation. Transaction PATCH similarly allows any admin to edit any transaction, without checking `tx.familyId`. **Reproduced:** a family A admin successfully changed a family B transaction category.

**Fix:** scope administrative privileges to the target family, verify its actual admin or active ADMIN membership, and always constrain transaction lookup by the requester's family.

### 3. [P1] Shared list filtering leaks unrelated members' financial records

**Location:** `backend/server/utils/scope.js:7`; consumers include income, loans, investments, insurance, education, subscriptions, recurring payments, and individual report routes.

An admin's `?memberId=...` becomes `{ memberId: suppliedId }` with no family restriction or membership verification. Knowing another user's ID is sufficient to request their records/reports. **Reproduced:** the helper accepted an unrelated member ID verbatim.

**Fix:** include family constraints and verify the selected member is an authorized member of that family before querying or exporting.

### 4. [P1] Regular members can edit/delete other members' finance records

**Location:** `backend/server/utils/scope.js:14`.

`canModify()` returns true for anyone sharing the document's family, without checking role. CRUD routes use this to authorize updates and deletions. A regular member can therefore delete another member's income, loan, investment, or insurance entry if they obtain its ID. This exceeds the original PRD's member permissions; the later shared transaction visibility requirement does not establish permission to delete these records. **Reproduced:** a non-owner member was authorized for a same-family document.

**Fix:** permit owners and explicitly authorized administrators; define read and write permissions separately.

### 5. [P1] Form 16 ownership bypass exposes unrelated users' tax documents

**Location:** `backend/server/routes/form16/form16.routes.js:27`.

`ownsForm16()` permits every admin, with no relationship to the document owner. This controls preview, recommendation, get, update, finalization, duplication, and deletion paths. Tax documents include salary and personal identifiers. **Reproduced:** an unrelated admin read finalized deductions through the preview handler.

**Fix:** resolve the document owner's family and verify administration of that family, or keep Form 16 owner-only if that is the intended privacy policy.

### 6. [P1] Removing/deactivating users does not reliably revoke access

**Locations:** `backend/server/routes/families/families.routes.js:175`; `backend/server/routes/members/members.routes.js:24`; `backend/server/config/passport.config.js:28`.

The family removal endpoint changes membership to REMOVED and updates the family's member array, but leaves `User.familyAccountId` intact. Most finance endpoints authorize from that user field and never check ACTIVE membership, so the removed user retains family access. The separate `/members/:id` endpoint sets `isActive=false`, but Passport deserialization does not check `isActive`; existing authenticated sessions remain usable until expiry/logout.

**Fix:** make family removal and account deactivation distinct, consistent operations. Clear/update current family context on removal, require active membership for family access, and reject inactive users during session deserialization or revoke their sessions.

### 7. [P1] Alternate transaction reads bypass PRIVATE visibility

**Locations:** `backend/server/routes/transactions/transactions.routes.js:77`; `backend/server/routes/loans/loans.routes.js:131`.

The main transaction list hides other members' PRIVATE entries, but `/transactions/compare` only checks family and returns both transactions and raw source records. Loan-linked transaction reads also lack the visibility filter. These paths expose records hidden in the normal ledger. Transaction detail additionally gives admins a private-read exception absent from the normal list.

**Fix:** apply a single explicit visibility policy to lists, details, comparisons, linked records, suggestions, merge actions, and source evidence.

### 8. [P1] Import batch detail is accessible across families

**Location:** `backend/server/routes/imports/imports.routes.js:111` (`GET /batches/:id`).

The lookup uses only `batchId`, without family or owner constraints. Any authenticated user with a batch identifier can read another family's file name, import dates, counts, and uploader information.

**Fix:** require family membership and query `{ batchId, familyId: req.user.familyAccountId }`.

### 9. [P1] Deduplication silently collapses distinct financial events

**Locations:** `backend/server/services/reconciliation.service.js:4`; `backend/server/services/transactionEngine.service.js:20`, `:35`, `:48`.

The fingerprint includes amount, UTC calendar day, and optional external IDs. With no external IDs, it ignores type, recipient, time, and member/account identity. Different same-day payments of the same amount collide; income and expense can collide too. The engine treats a matching fingerprint as an exact duplicate within/across imports. The subsequent reconciliation candidate search also omits transaction type. **Reproduced:** a morning income and afternoon expense with different recipients produced identical fingerprints.

**Fix:** reserve automatic deduplication for strong identity evidence; retain row occurrence multiplicity and account/type context. Treat ambiguous equal-amount/day matches as review candidates. Preserve a new SourceRecord for each imported piece of evidence rather than returning an old source and discarding the new one.

### 10. [P1] Transaction creation discards accepted links and category splits

**Locations:** `backend/server/services/transactionEngine.service.js:85`, `:146`; accepted input contract in `backend/server/routes/transactions/transactions.routes.js:193`.

The manual API accepts `subscriptionRef`, `loanRef`, `loanMeta`, and `categorySplit`, but both creation branches omit these fields from `Transaction.create`. The request succeeds while links/splits vanish from the canonical ledger. Vendor learning still uses the split, which can conceal the data loss. **Reproduced:** the real ingest function passed none of these values to storage.

**Fix:** map and validate the complete accepted contract consistently across creation/review/reconciliation branches. Verify referenced resources belong to the authorized family.

### 11. [P1] Reusing one prepayment transaction reduces principal repeatedly

**Location:** `backend/server/routes/loans/loans.routes.js:192`–`:243`.

Each request links the supplied transaction and subtracts its amount from outstanding principal, even when it is already recorded as a prepayment. A retry or repeated click can repeatedly reduce principal without another payment. **Reproduced:** submitting the same ₹1,000 transaction twice changed ₹10,000 outstanding to ₹8,000. Updates are not atomic. Manual amounts also lack finite/positive validation; negative amounts can create negative transactions and increase outstanding principal because the schema supplies no minimum.

**Fix:** persist one uniquely identified prepayment application per transaction/loan, make retries idempotent, reject nonpositive/nonfinite amounts and incompatible transactions, and commit payment application with the balance update atomically.

### 12. [P2] Weekly/yearly budgets calculate monthly spending

**Location:** `backend/server/routes/budgets/budgets.routes.js:18`.

Every budget uses the first of the current month as its start, irrespective of WEEKLY/YEARLY/MONTHLY, and lacks an upper date bound. Future-dated entries count as spent. Stored `periodKey` is ignored when loading budgets. A yearly budget excludes earlier months; a weekly budget includes earlier weeks.

**Fix:** derive a bounded interval from the budget period and intended period key, and query `$gte`/`$lt` consistently.

### 13. [P2] Dashboard cash-flow totals omit education and include inactive commitments

**Location:** `backend/server/services/dashboard.service.js:49`–`:109`.

`monthlyObligations` omits education although the burn breakdown and `buildMemberSummary` include it. A ₹10,000 monthly tuition payment leaves dashboard net flow overstated by ₹10,000. Subscription selection includes Paused entries; loan selection excludes Closed but includes Prepaid. Fully prepaid loans can continue contributing EMIs and upcoming-payment entries.

**Fix:** share a consistent obligation calculation and include only records effective for the relevant period/status. Use actual renewal/due dates for annual subscriptions and insurance; the current upcoming helper reduces them to a day-of-month and presents normalized monthly amounts as amounts due.

### 14. [P2] Creating a family leaves frontend authentication state stale

**Locations:** `frontend/src/pages/FamilyCreateJoin.tsx:19`; `frontend/src/context/AuthContext.tsx:82`; `frontend/src/pages/Family.tsx:36`.

Creating a family changes the backend user's family and role, then performs SPA navigation without refreshing AuthContext. The Family page still checks the old `user.familyAccountId`, so a user who just created a family can continue seeing the no-family setup screen and missing admin controls until reloading/logging in again.

**Fix:** expose a session/membership refresh operation and await it after family creation and relevant membership changes.

### 15. [P2] Dashboard errors render an endless loading state

**Location:** `frontend/src/pages/Dashboard.tsx:61`.

`if (loading || !data)` returns the loading block before checking `error`. When the request fails, data is absent, so the error display is unreachable and the page keeps saying “Loading dashboard…”.

**Fix:** check loading, then error, then the empty-data state, and provide a retry action.

### 16. [P2] Family member dashboard selection does not affect the dashboard

**Locations:** `frontend/src/pages/Family.tsx:151`; `frontend/src/pages/Dashboard.tsx:61`; `frontend/src/services/api.ts:34`.

The member “Dashboard” action only sets `activeMemberId`; it does not navigate. Dashboard never reads that ID, fetches only `/dashboard`, and uses an empty dependency list. Selecting another member therefore neither opens nor loads that person's dashboard, despite backend endpoints existing for it.

**Fix:** navigate to the dashboard, send the selected authorized member ID to the member dashboard endpoint, and refetch when selection changes.

### 17. [P2] Deleting deduction records does not invalidate tax recommendations

**Locations:** `backend/server/utils/taxStale.js:27`; `backend/server/routes/investments/investments.routes.js:113` (same pattern for other deduction sources).

Deduction-source hooks invalidate on save/findOneAndUpdate only. CRUD deletion calls `item.deleteOne()`, which does not trigger either hook. An unfinalized Form 16 recommendation calculated from that record can remain cached with `isStale=false` after deletion. Finalized snapshots have separate intended semantics and should be handled explicitly.

**Fix:** invalidate on the supported deletion operations or do so in the service coordinating the mutation; document how locked finalized calculations are versioned.

### 18. [P1] Supplemental tax inputs mix historical holdings with current-year contributions

**Location:** `backend/server/services/tax.service.js:383`; callers in `backend/server/routes/form16/form16.routes.js:67`.

Aggregation queries all investments, insurance, and loans for a user, without selected financial year, active dates, or status. It uses lifetime `investedValue` for ELSS/PPF/NPS and estimates home-loan interest from original principal. Thus an older holding or closed loan can supply deductions for a new Form 16 calculation even without a payment in that year. This is a data-period bug independently of legal rule correctness.

**Fix:** aggregate evidenced contributions/payments for the requested FY, retain source record IDs, and distinguish holdings from deductible contributions. Legal tax-rule validation was outside this review; no new legal conclusions are asserted here.

### 19. [P1] Following the environment template selects an invalid Atlas URI

**Locations:** `backend/.env.example:11`; `backend/server/db.js:7`.

The example sets a nonempty `MONGODB_ATLAS_URI` containing `<user>`, `<pass>`, and `<cluster>` alongside valid local defaults. Database resolution prioritizes that placeholder over `MONGODB_URI`. Copying the example and configuring only local MongoDB, as a developer reasonably might, selects the invalid placeholder and prevents startup.

**Fix:** comment out optional Atlas examples or reject unresolved placeholders and fall back to a valid local URI. Document the actual precedence. Also align the documented Node minimum with installed dependency engine requirements: Mongoose requires Node >=20.19.0 while the backend advertises >=18.

### 20. [P2] Dark mode changes one-sided borders into four-sided borders

**Location:** `frontend/src/index.css:389`–`:395`; example consumer `frontend/src/components/ui/Modal.tsx:41`.

The grouped override for `border-b-[3px]`, `border-t-[3px]`, `border-r-[3px]`, and `border-l-[3px]` sets the shorthand `border-width: 3px !important`. That sets every side, defeating Tailwind's directional utility. Switching to dark mode adds extra borders and changes spacing on modal headers, sidebar edges, and other one-sided separators.

**Fix:** override only the corresponding side's width, or preserve the existing width and override color alone. This finding comes from the CSS rules; no browser screenshot comparison was available.

## Additional UI and maintenance observations

- `frontend/src/components/ui/Modal.tsx` declares a modal dialog but does not move/trap/restore focus or close on Escape. Keyboard focus can reach controls behind it. It also does not use the separate overlay lifecycle helper. Consolidate modal behavior and add an accessible label association.
- `frontend/src/App.tsx:13` accepts already-created dynamic import promises. Calling `load(import(...))` for every page starts loading them at module evaluation; the idle timeout only attaches catch handlers later. This defeats the intended deferred route fetch and delays rejection handling. Accept an import function and invoke it when required/prefetched.
- The old tax audit is historical evidence, not a current checklist. For example, current supplemental aggregation no longer folds education in before the separate tuition input, Form 16 upload uses findOneAndUpdate, and the schema now includes section24. Those older findings were not repeated as current defects here.
- Missing HTTP/API authorization and transaction integration coverage is a material gap: arithmetic tests passed while the isolated checks reproduced authorization and ingestion defects.

## Verification

| Check | Result |
| --- | --- |
| Frontend `npm run build` | Passed: TypeScript check and Vite production build |
| Frontend `npm run lint` | Failed: 337 errors, 15 warnings; includes explicit-any, unused bindings, effect state updates, and hook dependency issues |
| Frontend `./node_modules/.bin/vitest run` | Passed: 1 file, 2 tests |
| Backend targeted Node tests: taxEngine, tax.service, loanCalc | Passed: 128 tests |
| Backend `node --test` discovery | Failed: 134 tests/file entries, 131 passed, 3 failed |
| Isolated regression probes using real helpers/handlers and stubbed persistence | Reproduced eight defects: unrestricted member filter, same-family non-owner write access, foreign-family admin PATCH, foreign transaction resolution, foreign Form 16 preview, fingerprint collision, repeated prepayment, omitted transaction fields |

Full backend discovery fails on `deduction-filtering.test.js` (`describe` missing), `ocr-ingestion.test.js` (`jest` missing), and `exclusion-formatting.test.js` (outdated API expectations, including treating a context object as an array). Some discovered ad hoc scripts attempt Gemini calls; those failed on restricted network/DNS and can still appear as passing file entries because they catch errors. They should be excluded from unit discovery or made explicit opt-in integration tests with meaningful exit statuses. There is no backend package test script.

No live database/server session, browser visual run, deployment, outbound email, or in-depth Flutter test was performed. The broad backend discovery attempted external calls in existing scripts; no successful live integration was established. Build output and test results cannot establish production cookie behavior or MongoDB concurrency correctness. No dependency vulnerability audit or legal tax-rule verification was performed.

Recommended implementation order: fix family/owner/privacy enforcement and revocation; fix reconciliation identity and prepayment idempotency; repair API field persistence; then address period calculations, UI state/error handling, CSS, environment setup, and test discovery. Add focused regression coverage around these behaviors when implementing fixes.
