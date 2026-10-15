# Review fixes — 15 October 2026

Implemented the follow-up to CODE_REVIEW.md. These changes are in the working tree; they have not been deployed or committed.

## Access and ownership

- Ledger edits, categorization, linking, duplicate resolution, and merge actions are limited to the transaction creator. Being a family administrator does not override transaction ownership.
- Administrative financial access is scoped to the administrator's own family. Selecting a member for financial lists or reports verifies that person's family first.
- Family administrators retain access to their own family's Form 16 documents. The Form 16 list supports the selected family member. Unrelated administrators are denied.
- Family management uses the actual family administrator identity. Removed memberships and inactive sessions are rejected on subsequent requests; removal also clears the user's current family pointer.
- Older active users without membership rows are upgraded lazily from their existing family assignment. Existing pending, rejected, and removed rows are never promoted by this compatibility path.
- Transaction comparison, linked records, candidate reads, and import batch reads enforce the relevant family/privacy restrictions. Shared vendor backfill respects private transaction visibility. Private ingestion does not teach the shared vendor directory.

## Transactions and financial behavior

- Matching uses type, amount, actual minute, recipient, and external references. Equal amounts in the same minute may automatically reconcile for the same creator, as requested. Different times/recipients/types or conflicting references are not automatically merged. Date-only bank rows do not acquire false minute precision. Ambiguous matches remain separate or require review.
- Reimports preserve new evidence records when matching an earlier upload. Failed/partial imports can be retried. Manual date/time inputs now send a timezone-qualified timestamp.
- Creation retains loan/subscription references, loan metadata, and category splits. Split and line-item totals must match the transaction amount.
- Applying a prepayment uses a conditional atomic balance update and records the transaction used. Reusing the same transaction is idempotent. Negative/nonfinite/over-balance amounts are rejected, and recorded prepayments cannot be casually relinked, unlinked, or merged without reversing their balance effects.
- Weekly/monthly/yearly budgets use bounded intervals. Dashboard obligations include recurring education and exclude paused subscriptions and prepaid loans; annual due entries use actual renewal dates and full amounts due.

## Tax inputs and review

- Investment, insurance, loan, and education forms now include optional **Paid amounts for tax** rows (financial year, section, amount actually paid).
- Supplemental tax deductions use those entered payments for the selected financial year. Lifetime portfolio values, scheduled premiums, estimated loan interest, and scheduled tuition are no longer silently treated as actual paid contributions. Existing tracking values remain saved. To include supplemental payments in a calculation, enter the paid amounts or declare them in Form 16 review.
- Preview uses the backend merge for unsaved Form 16 values. Saving persists the edited Form 16 before finalizing; finalization rebuilds deductions on the server instead of trusting arbitrary browser snapshots. An explicitly empty finalized array stays empty.
- Recommendation storage and the frontend adapter retain suggestion section/action metadata. The UI displays server suggestion values instead of accessing nonexistent frontend tax configuration fields. Recommendation cache versions force older payloads to refresh.
- Deleting a deduction-source document invalidates its recommendation cache. Unsupported tax years return an explicit error instead of silently using another year's configuration. This work does not establish legal correctness of all tax rules; the pre-existing broader tax-rule audit remains relevant.

## Frontend, CSS, and setup

- Fixed failed requests leaving the dashboard/Form 16 list in endless loading states, selected-member dashboard loading, and stale authentication state after family creation.
- Replaced explicit `any` annotations with endpoint/domain contracts or inferred callback types, added a shared error adapter, corrected effect dependencies/request lifecycle updates, and split shared helpers from component modules. ESLint rules were not disabled to make the result pass.
- Corrected directional border widths in dark mode. Shared modals now render through a body portal, have accessible labels, trap focus, handle Escape, restore focus, and lock/restore body scrolling.
- Route imports are deferred until invoked rather than started eagerly at module initialization.
- Commented out the invalid optional Atlas placeholder, aligned the backend Node minimum with Mongoose, updated README instructions, added standard test commands, and made ad hoc integration scripts opt-in with `RUN_LIVE_INTEGRATION_TESTS=true`.

## Verification

- Frontend production build: passed (TypeScript + Vite).
- Frontend lint: zero errors and zero warnings.
- Frontend tests: 6 passed in 2 files.
- Backend `npm test`: 184 passed, zero failures.
- Backend full `node --test` discovery: 187 passed, zero failures; the three additional entries are inactive opt-in integration scripts.
- Regression coverage includes family boundaries, creator-only writes, revoked/inactive sessions, legacy membership compatibility, Form 16 administration, draft/finalized deductions, same-minute matching, negative/repeated prepayments, persisted links/splits, annual tax payment selection, deletion cache invalidation, budget boundaries, dashboard errors/member selection, suggestion metadata, and modal keyboard behavior.

Database-dependent tests stub persistence; the deletion-cache test executes the real Mongoose document middleware with the collection operation stubbed. No live MongoDB, Gemini, SMTP, deployment, or browser screenshot run was performed. Historical records/duplicates were not rewritten. Real concurrent MongoDB execution and the hosted session-cookie flow still need integration verification. Flutter-specific UI changes/testing are outside this patch; API authorization and matching changes apply to that client too.
