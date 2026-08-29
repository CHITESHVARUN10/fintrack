# Family Financial Tracking & Reconciliation Feature

## Purpose

This document defines a new **family financial tracking and transaction reconciliation feature** that must be integrated into the existing finance-tracking system.

This is **not a standalone application** and the existing application architecture, features, conventions, authentication, navigation, data models, UI system, backend patterns, and infrastructure must be preserved wherever possible.

The AI agent receiving this document must first inspect the existing codebase and plan how this feature integrates with what already exists. **Do not blindly rebuild existing functionality.**

The goal is to add a robust family/shared-finance layer that can collect transactions from multiple sources, distinguish actual expenditure from simple money movement, reconcile duplicate representations of the same transaction, and provide family-level and individual-level financial insights.

---

# 1. Core Product Goal

Build a shared family financial tracking system for a household where multiple people have their own accounts and financial activity but want a common view of household finances.

The system must answer questions such as:

- How much did the family actually spend?
- Where did the money go?
- How much did each member spend?
- How much did the family spend in each category?
- How much money was transferred between family members?
- How much cash was withdrawn?
- How much cash was actually spent?
- How much cash remains?
- Which day/week/month had the highest expenditure?
- Are budgets being exceeded?
- Are spending patterns changing?
- Are imported transactions duplicates of transactions already recorded?
- Can a manually recorded transaction later be reconciled with a bank statement or screenshot?

The central financial principle is:

> **Money movement is not the same as expenditure.**

An internal transfer is not a family expense.
A bank-to-cash withdrawal is not an expense.
Only actual consumption/spending should count as expenditure.

---

# 2. Integration Requirement

This feature is being added to an **existing finance-tracking system**.

Before implementation, inspect the existing repository thoroughly:

1. Existing frontend/application structure
2. Existing Flutter screens/navigation
3. Existing backend architecture
4. Existing authentication/login system
5. Existing user/profile model
6. Existing database schema/models
7. Existing finance/transaction models
8. Existing APIs
9. Existing state management
10. Existing UI/design system
11. Existing file/storage handling
12. Existing notification infrastructure
13. Existing reporting/chart infrastructure
14. Existing testing strategy
15. Existing deployment/environment configuration

Then produce an integration plan.

Do not introduce a second authentication system if one already exists.
Do not create duplicate user models if an existing user model can be extended.
Do not create a parallel transaction architecture if the existing finance system can support the new transaction model cleanly.

Prefer extending and refactoring existing abstractions over creating competing ones.

---

# 3. User & Family Architecture

Each person has an independent account.

Example:

```text
User A
User B
User C
```

Users can belong to a family/group.

Conceptually:

```text
User
  |
  +-- Family Membership
          |
          +-- Family
```

A family should have:

- Unique family ID
- Family name
- Creator/admin
- Invitation/join code
- Members
- Member roles
- Membership status
- Created/updated timestamps

The person who creates the family becomes the initial administrator.

---

# 4. Family Creation Flow

After login/account creation, a user should be able to create a family.

Example flow:

```text
Login
  ↓
Create / Join Family
  ↓
Create Family
  ↓
Enter Family Name
  ↓
Family Created
  ↓
Invitation Code Generated
```

Example:

```text
Family: Varun Family
Invite Code: VF7K92
Role: ADMIN
```

The creator can share the invitation code with other family members.

---

# 5. Family Join Flow

A user can choose:

> Join Family

They enter the invitation code.

Example:

```text
VF7K92
```

The backend creates a join request.

The family administrator sees:

```text
User B wants to join Varun Family

[Accept] [Reject]
```

Only after acceptance does the user become an active family member.

Membership should have explicit states, for example:

```text
PENDING
ACTIVE
REJECTED
REMOVED
```

Do not assume that knowing an invitation code automatically grants membership.

---

# 6. Roles

At minimum:

```text
ADMIN
MEMBER
```

The creator is ADMIN.

The administrator can:

- Accept join requests
- Reject join requests
- Manage family membership
- Potentially remove members later
- Manage family-level settings

The architecture should allow more roles later without requiring a schema rewrite.

---

# 7. Personal + Family Tracking

Transactions are associated with the user who created/owns the financial activity and can also be associated with a family.

Conceptually:

```text
Transaction
 ├── createdBy → User A
 ├── familyId → Family X
 └── visibility → FAMILY
```

This supports:

### Individual view

> My Transactions

### Family view

> Family Transactions

The initial product is intended to make family transactions visible to other active family members.

However, the data model should be designed so that future privacy controls can be added, such as:

```text
FAMILY
PRIVATE
```

Do not make future privacy requirements impossible by hard-coding assumptions throughout the application.

---

# 8. Core Financial Model

Do NOT model every financial event as simply:

```text
EXPENSE
```

The system needs a broader concept:

> **Transaction / Financial Event**

At minimum, support these transaction types:

```text
EXPENSE
INCOME
INTERNAL_TRANSFER
CASH_WITHDRAWAL
CASH_EXPENSE
```

The exact naming should follow existing project conventions if equivalent concepts already exist.

---

# 9. Transaction Types

## 9.1 Expense

Actual consumption/spending.

Example:

```text
₹1,000 → Grocery Shop
```

This counts toward expenditure.

---

## 9.2 Income

Money received from outside the family.

Example:

```text
Salary → User A
₹50,000
```

This increases available money but is not expenditure.

---

## 9.3 Internal Transfer

Money transferred between family members.

Example:

```text
User A
  |
  | ₹5,000
  ↓
User B
```

This must NOT count as family expenditure.

It is money moving inside the family.

---

## 9.4 Cash Withdrawal

Money moved from a bank/account into physical cash.

Example:

```text
Bank
  |
  | ₹2,000
  ↓
Cash
```

This must NOT count as expenditure.

The money still belongs to the user; it has simply changed form/location.

---

## 9.5 Cash Expense

Actual spending from physical cash.

Example:

```text
Cash
  |
  | ₹1,000
  ↓
Shop
```

This counts as actual expenditure.

---

# 10. Critical Financial Example

Consider three family members.

### Step 1: User 1 sends User 2 ₹5,000

```text
INTERNAL_TRANSFER
₹5,000
User 1 → User 2
```

Family expenditure:

```text
₹0
```

---

### Step 2: User 2 withdraws ₹2,000 from ATM

```text
CASH_WITHDRAWAL
₹2,000
Bank → Cash
```

Family expenditure:

```text
₹0
```

---

### Step 3: User 2 spends ₹1,000 in cash

```text
CASH_EXPENSE
₹1,000
Cash → Shop
```

Family expenditure:

```text
₹1,000
```

The dashboard should NOT say:

```text
Family spent ₹8,000
```

It should distinguish:

```text
Actual spending:          ₹1,000
Internal transfers:       ₹5,000
Cash withdrawals:         ₹2,000
Total money movement:     ₹8,000
```

This distinction is fundamental to the product.

---

# 11. Cash Wallet / Cash Balance

Physical cash should conceptually behave like another money location.

Example:

```text
Bank
  |
  | ₹5,000
  ↓
Cash
  |
  | ₹1,000
  ↓
Shop
```

The system should be able to calculate:

```text
Cash withdrawn/received: ₹5,000
Cash spent:              ₹1,000
Cash remaining:          ₹4,000
```

Eventually this should work per user.

ATM withdrawals should increase available cash balance.
Cash expenses should decrease available cash balance.

A cash withdrawal itself should not inflate expense reports.

---

# 12. Transaction Input Sources

Transactions can enter the system through multiple sources.

All sources must eventually feed the same canonical transaction-processing pipeline.

Initial/future sources:

```text
MANUAL
BANK_STATEMENT
SCREENSHOT
SHARE_TO_APP
TELEGRAM
WHATSAPP
```

The architecture must avoid creating separate business logic for each source.

Conceptually:

```text
Manual Entry ───────┐
Bank Import ────────┤
Screenshot ─────────┤
Share-to-App ───────┤
Telegram ───────────┤
WhatsApp ───────────┘
          ↓
Transaction Processing Engine
          ↓
Canonical Transaction
```

---

# 13. Manual Transaction Entry

The user presses:

> + Add Transaction

The form should collect relevant information.

Potential fields:

```text
Amount
Transaction Type
Mode
Date
Time
Recipient / Sender
Category
Screenshot
Notes
```

Example:

```text
Amount:
₹10,000

Type:
Expense

Mode:
UPI

Date:
15 September

Time:
8:15 PM

Category:
Shopping

Paid to:
Optional
```

The form should dynamically adapt based on transaction type.

For example:

- Internal transfer should allow selecting another family member.
- Cash withdrawal should represent Bank → Cash.
- Cash expense should represent Cash → merchant/person.
- Expense should allow category and recipient.
- Income should allow source/sender.

Do not show irrelevant fields unnecessarily.

---

# 14. Approximate Time for Manual Entries

Manual transaction time is important for reconciliation.

Example:

```text
Manual entry:
₹10,000
15 September
8:15 PM
```

Later, the bank statement may contain:

```text
₹10,000
15 September
8:14 PM
UPI/ABC/938475...
```

Even if the manual entry does not contain:

- UPI ID
- Transaction ID
- UTR

the approximate time helps identify a likely match.

Therefore the manual entry flow should collect time.

The UI can communicate that exact precision is not necessarily required if the product chooses to support approximate time.

---

# 15. Transaction Mode

The system should record the mode/channel where relevant.

Potential values:

```text
UPI
BANK
CASH
CARD
OTHER
```

These should be extended/reused from existing project concepts if they already exist.

---

# 16. Bank Statement Import

Users should be able to download transaction statements from their bank and upload them.

Initial useful format:

```text
Excel
CSV
```

PDF can be added as a subsequent capability if needed.

Example:

```text
User downloads Kotak statement
        ↓
Uploads Excel/CSV
        ↓
Parser extracts transactions
        ↓
Transactions normalized
        ↓
Existing transactions checked
        ↓
Duplicate/reconciliation engine
        ↓
Canonical transactions updated/created
```

The application should not blindly insert every imported row.

---

# 17. Repeated Bank Statement Imports

This is a mandatory use case.

Example:

On September 15:

```text
Upload:
September 1 → September 15
```

Later:

```text
Upload:
September 1 → September 30
```

The second file contains all transactions from September 1–15 again.

The system must recognize that those transactions already exist.

The user must not end up with double-counted expenses.

---

# 18. Screenshot Transaction Entry

Users should be able to upload a screenshot of a successful UPI payment.

The screenshot may contain:

- Amount
- Date
- Time
- Recipient
- UPI ID
- Transaction ID
- UTR/reference number

The pipeline should be:

```text
Screenshot
    ↓
OCR / image extraction
    ↓
Extract transaction fields
    ↓
Transaction candidate
    ↓
Deduplication/reconciliation
    ↓
Existing transaction?
   /          \
 YES           NO
  ↓             ↓
Update/attach   Create
```

The exact OCR technology can be selected during implementation based on the existing system and requirements.

---

# 19. Share-to-App

The application should eventually support receiving a screenshot/image through the operating system share mechanism.

Example:

```text
GPay
  ↓
Share
  ↓
Expense Application
  ↓
Receive Screenshot
  ↓
OCR
  ↓
Transaction Extraction
  ↓
Deduplication
```

This avoids forcing the user to manually open the app and fill every field after making a UPI payment.

The implementation should use Flutter/platform capabilities appropriate for the target platforms.

---

# 20. UPI Recipient Recognition

The system should remember recurring UPI IDs/recipients.

Example:

First time:

```text
9847XXXXXX@upi
```

The app asks:

> Who is this?

User answers:

```text
Vegetable Vendor
```

and assigns:

```text
Category: Groceries
```

The system remembers:

```text
9847XXXXXX@upi
        ↓
Vegetable Vendor
        ↓
Groceries
```

Future transactions from that UPI ID can be automatically recognized or suggested.

This creates a family-specific merchant/recipient directory.

The user must retain the ability to correct mappings.

---

# 21. Intelligent Categorization

Categories can include:

```text
Groceries
Food
Electricity
Rent
Transportation
Shopping
Medical
Education
Entertainment
Bills
Household
Other
```

The exact categories should remain configurable/extensible.

The system can learn from historical mappings.

For recurring recipients:

```text
Recipient → Category
```

can become a strong categorization signal.

AI/ML should not be required for the initial implementation if deterministic rules provide reliable results.

---

# 22. Deduplication & Reconciliation

This is one of the most important backend components.

The application must distinguish:

> Multiple representations/sources of the same real-world transaction

from:

> Two genuinely different transactions with similar attributes.

A transaction may appear through:

- Manual entry
- Bank statement
- Screenshot
- Share-to-app
- Future bot

These should potentially resolve to one canonical transaction.

---

# 23. Matching Hierarchy

Use increasingly weaker matching signals.

## Level 1 — Transaction ID

If transaction IDs match:

```text
transactionId A == transactionId A
```

This is an extremely strong match.

---

## Level 2 — UTR / Bank Reference

Matching UTR/reference numbers are also very strong evidence.

---

## Level 3 — Amount + UPI ID + Date/Time

Example:

```text
₹10,000
ABC@upi
15 September
20:14
```

versus:

```text
₹10,000
ABC@upi
15 September
20:15
```

This is likely the same transaction.

---

## Level 4 — Amount + Date + Approximate Time

Especially useful for manually entered transactions.

Example:

```text
Manual:
₹10,000
15 Sep
20:15
```

Bank statement:

```text
₹10,000
15 Sep
20:14
```

This can become a possible duplicate.

---

## Weak matches

Amount alone, or very weak combinations, should not automatically merge.

The system must prioritize avoiding false merges over aggressively reducing duplicate counts.

---

# 24. Confidence-Based Matching

Instead of simply:

```text
duplicate = true/false
```

the reconciliation engine should calculate confidence.

Example conceptual levels:

```text
Transaction ID match
→ ~100% confidence
→ Automatic reconciliation

UTR match
→ Very high confidence
→ Automatic reconciliation

UPI + amount + date + time
→ High confidence
→ Usually automatic reconciliation

Amount + date + approximate time
→ Medium confidence
→ Ask user / mark possible duplicate

Amount only
→ Low confidence
→ Keep separate
```

Exact thresholds must be determined during implementation and tested against real statement data.

Do not hard-code the above percentages as financial truth; they are design guidance.

---

# 25. Never Silently Delete Duplicate Evidence

When two sources refer to the same transaction, do not simply delete one source.

Instead, maintain one canonical transaction and associate multiple source records/evidence.

Example:

```text
Canonical Transaction

Amount: ₹10,000
Date: 15 Sep
Time: 20:14
UPI: xyz@upi
UTR: ABC123

Sources:
 ├── Manual Entry
 └── Bank Statement
```

If a screenshot is later added:

```text
Sources:
 ├── Manual Entry
 ├── Bank Statement
 └── Screenshot
```

This provides traceability.

The user should be able to understand where the transaction information came from.

---

# 26. Manual + Bank Import Example

Suppose the user manually records:

```text
₹10,000
15 September
20:15
Category: Shopping
```

Later the bank statement contains:

```text
15 September
20:14
₹10,000
UPI/ABC/938475...
```

The system should search for a candidate match.

If sufficiently confident:

```text
Canonical transaction
₹10,000
15 Sep
20:14
UPI/ABC/938475...
```

with the manual entry retained as a source/evidence.

If uncertain, ask the user instead of silently merging.

---

# 27. Family Internal Transfers

The system should recognize transfers between members of the same family where sufficient evidence exists.

Example:

```text
User A → User B
₹5,000
```

If both are family members, this should normally be classified as:

```text
INTERNAL_TRANSFER
```

and should not inflate family expenditure.

The implementation must account for the fact that the bank statement of User A and User B may contain opposite sides of the same transfer.

This can eventually support cross-user reconciliation.

---

# 28. Cross-User Transaction Reconciliation

A future/advanced case:

User A's statement:

```text
₹5,000 sent to User B
```

User B's statement:

```text
₹5,000 received from User A
```

The family ledger should ideally recognize this as:

```text
ONE INTERNAL TRANSFER
```

rather than:

```text
₹5,000 expense
+
₹5,000 income
```

The underlying system should support linking the debit and credit sides of the same internal transfer.

This is particularly important for accurate family reporting.

---

# 29. Reports

The reporting system should operate on the semantic transaction types, not raw transaction volume.

Useful reports include:

### Family actual expenditure

```text
₹27,500
```

### Internal transfers

```text
₹12,000
```

### Cash withdrawals

```text
₹8,000
```

### Income

```text
₹75,000
```

### Total money movement

A separate metric that may include movements that are not expenses.

---

# 30. Category Reports

Example:

```text
Groceries       ₹8,200
Food            ₹4,500
Electricity     ₹3,200
Transport       ₹2,800
Shopping        ₹6,400
Other           ₹2,400
```

The application should support time filtering such as:

- Today
- This week
- This month
- Custom date range

Reuse existing reporting/filter infrastructure if available.

---

# 31. Individual Reports

Although the initial focus is not individual competition, the family system should still support individual analysis.

Example:

```text
User A → ₹10,200
User B → ₹8,400
User C → ₹8,900
```

Category breakdown can also be shown:

```text
User A
Groceries     ₹4,000
Food          ₹2,000
Transport     ₹1,200
Other         ₹3,000
```

The individual totals should be derived from canonical transactions and appropriate transaction types.

---

# 32. Highest-Spending Day

The system should be able to identify:

> Which day had the highest actual expenditure?

Example:

```text
15 September
₹6,850
```

The user should be able to inspect the transactions contributing to that amount.

Do not include internal transfers or cash withdrawals in actual-expenditure calculations unless the user explicitly requests a broader money-movement metric.

---

# 33. Budgeting

Support budgets at family/category level.

Example:

```text
Monthly Grocery Budget
₹10,000

Spent
₹8,200

Remaining
₹1,800
```

Potential budgeting scopes:

```text
Family
Category
Member
Time period
```

The exact scope should be determined during integration with existing finance features.

---

# 34. Alerts

Potential alerts include:

```text
Grocery spending has exceeded 90% of the monthly budget.

Family spending this month is 25% higher than last month.

Unusually high spending detected.
```

Alerts should be meaningful rather than noisy.

The existing notification infrastructure should be reused if available.

---

# 35. Telegram / WhatsApp Integration

Bots are a future input interface, not a separate financial system.

Potential interaction:

```text
User → Telegram

₹250 milk
```

or:

```text
User → Telegram
[UPI screenshot]
```

The bot should send the request to the same backend transaction engine.

Conceptually:

```text
Flutter ────────┐
Bank Import ────┤
Screenshot ─────┤
Telegram ───────┤──→ Transaction API/Engine
WhatsApp ───────┘
```

Do not duplicate transaction business logic inside the bot.

Telegram can be considered for an earlier prototype.
WhatsApp can be integrated later depending on platform/API requirements.

---

# 36. Suggested Core Transaction Structure

The exact schema must be adapted to the existing application.

Conceptually, a transaction may contain:

```text
Transaction

id
createdBy
familyId

type
amount
currency

mode

date
time

sender
recipient

upiId
transactionId
utr

category

source

visibility

confidence

status

metadata

createdAt
updatedAt
```

Potential source values:

```text
MANUAL
BANK_STATEMENT
SCREENSHOT
SHARE
TELEGRAM
WHATSAPP
```

Potential status values may include:

```text
ACTIVE
PENDING_REVIEW
RECONCILED
```

The final schema must follow existing project conventions.

---

# 37. Source vs Canonical Transaction

Separate these concepts conceptually:

### Source Record

What was received from a particular input.

Examples:

```text
Manual Entry
Bank Row
Screenshot OCR
Telegram Message
```

### Canonical Transaction

The application's best representation of the real-world financial event.

Multiple source records may point to the same canonical transaction.

This architecture is strongly preferred because it supports reconciliation and traceability.

---

# 38. Transaction Processing Pipeline

The central backend pipeline should look like:

```text
INPUT
  ↓
Parsing / Extraction
  ↓
Normalization
  ↓
Transaction Candidate
  ↓
Validation
  ↓
Deduplication / Reconciliation
  ↓
Canonical Transaction
  ↓
Family Ledger
  ↓
Reports / Charts / Budgets / Alerts
```

Every transaction source should eventually pass through this pipeline.

---

# 39. Data Integrity Requirements

Financial data must be treated carefully.

The system should:

- Avoid duplicate counting.
- Avoid accidental merging of unrelated transactions.
- Preserve source evidence.
- Maintain auditability.
- Validate imported data.
- Handle partial/failed imports safely.
- Avoid silently discarding ambiguous transactions.
- Make reconciliation decisions explainable.
- Support corrections without corrupting historical records.

Import operations should ideally be idempotent.

If the same statement is uploaded twice, the result should not double the ledger.

---

# 40. UI Principles

The application should feel simple even though the backend is sophisticated.

Users should not need to understand:

- Canonical transactions
- Reconciliation algorithms
- Confidence scores
- Source records
- Internal accounting mechanics

unless they inspect transaction details or resolve an ambiguity.

The normal flow should be fast.

Example:

```text
+ Add
  ↓
What happened?
  ↓
Amount
  ↓
Type / Mode
  ↓
Save
```

More advanced metadata should be automatically extracted wherever possible.

---

# 41. Phase-Based Implementation Plan

Do not implement every feature simultaneously.

## Phase 1 — Authentication & Family

Implement/integrate:

- Existing authentication
- User profile
- Create family
- Family invitation code
- Join family
- Join request
- Admin approval
- Family membership
- Family dashboard

---

## Phase 2 — Core Transaction Engine

Implement:

- Transaction model
- Expense
- Income
- Internal transfer
- Cash withdrawal
- Cash expense
- Manual entry
- Transaction modes
- Family association
- Individual association
- Transaction history
- Cash balance logic

This phase establishes the financial rules.

---

## Phase 3 — Bank Import

Implement:

- Excel/CSV upload
- Statement parsing
- Normalization
- Source records
- Matching
- Deduplication
- Reconciliation
- Canonical transactions
- Idempotent repeated imports

PDF support can be added after reliable structured-file importing.

---

## Phase 4 — Screenshot/OCR

Implement:

- Screenshot upload
- OCR
- Amount extraction
- Date/time extraction
- UPI ID extraction
- Transaction ID extraction
- Recipient extraction
- Candidate transaction generation
- Reconciliation against existing transactions

---

## Phase 5 — Share-to-App

Implement operating-system share integration:

```text
GPay
 ↓
Share
 ↓
Our Application
 ↓
Automatic processing
```

The shared screenshot should follow the same OCR and reconciliation pipeline.

---

## Phase 6 — Intelligent Recognition

Implement:

- UPI recipient memory
- Merchant mappings
- Category mappings
- Category suggestions
- Confidence scoring
- Improved duplicate detection
- Potential anomaly detection

Start with deterministic/rule-based approaches where possible.

---

## Phase 7 — Reports & Budgeting

Implement:

- Family spending dashboard
- Individual spending dashboard
- Category reports
- Charts
- Daily/weekly/monthly reports
- Highest spending day
- Budgets
- Budget progress
- Alerts
- Spending trends

---

## Phase 8 — Bots

Implement:

- Telegram integration
- WhatsApp integration

Both must use the same backend transaction engine.

---

# 42. What Makes This Feature Different

This is not intended to become another basic CRUD expense tracker.

A conventional expense tracker might do:

```text
Enter ₹500
→ Food
→ Save
```

This system should understand:

```text
Where did the money come from?
Where did it go?
Who moved it?
Was it actually spent?
Was it merely transferred?
Was it withdrawn as cash?
How was the transaction discovered?
Has the same transaction already been recorded?
Can different sources be reconciled?
What does this mean for the family ledger?
```

The system is therefore conceptually:

> **Family financial ledger + transaction aggregator + transaction reconciliation engine + expense analytics system.**

---

# 43. Important Engineering Constraints

When integrating this feature:

1. **Inspect before modifying.**
2. Reuse existing architecture where appropriate.
3. Do not duplicate authentication.
4. Do not duplicate existing transaction functionality unnecessarily.
5. Preserve existing application behavior.
6. Keep the transaction engine source-agnostic.
7. Separate raw/source data from canonical financial transactions where appropriate.
8. Make imports idempotent.
9. Treat duplicate detection as a reconciliation problem, not simple string matching.
10. Do not count internal transfers as family expenses.
11. Do not count bank-to-cash movement as expenditure.
12. Count actual cash spending as expenditure.
13. Preserve source evidence.
14. Avoid destructive automatic merging when confidence is insufficient.
15. Make ambiguous matches reviewable.
16. Design schemas so future privacy controls and additional transaction sources can be added.
17. Keep UI simple while keeping backend financial semantics rigorous.
18. Do not introduce AI merely for the sake of using AI; deterministic logic should be preferred when it is more reliable.
19. All monetary calculations must avoid floating-point precision problems; use the existing project's safe monetary representation or integer minor units where appropriate.
20. Financial calculations should be covered with strong automated tests.

---

# 44. Definition of Success

The feature is successful when a family can use the existing finance application like this:

1. Three family members have separate accounts.
2. They join the same family.
3. Transactions recorded by family members appear in the shared family ledger.
4. A manual transaction can be entered quickly.
5. A bank statement can be uploaded later without creating duplicates.
6. A UPI screenshot can be processed automatically.
7. A screenshot shared directly from a payment application can eventually be processed.
8. Recurring UPI recipients can be recognized.
9. Internal transfers do not inflate family expenditure.
10. ATM withdrawals do not inflate family expenditure.
11. Actual cash purchases count as expenditure.
12. Cash balances can be tracked.
13. Multiple representations of one transaction can be reconciled into one canonical transaction.
14. Ambiguous matches can be reviewed.
15. Family and individual reports remain financially meaningful.
16. Budgets and alerts operate on actual expenditure rather than raw money movement.
17. Future Telegram/WhatsApp interfaces can use the same backend transaction engine.

---

# 45. Instructions to the AI Agent Implementing This

Before writing code:

### Step 1 — Understand the existing system

Inspect the complete relevant codebase and identify:

- Current architecture
- Existing finance functionality
- Existing transaction model
- Existing user model
- Existing authentication
- Existing family/group-like concepts
- Existing database models
- Existing API structure
- Existing Flutter navigation
- Existing state management
- Existing storage/upload mechanisms
- Existing charts/reports
- Existing tests

### Step 2 — Identify reuse opportunities

Create a mapping:

```text
Requirement
    ↓
Existing system component
    ↓
Extend / modify / create new
```

Clearly identify what already exists and what is genuinely new.

### Step 3 — Produce an integration plan

The plan should include:

- Architecture changes
- Database/schema changes
- API changes
- Flutter UI changes
- Backend services
- Transaction-processing pipeline
- Import pipeline
- Reconciliation design
- Security/authorization
- Testing strategy
- Migration strategy
- Rollout order

### Step 4 — Resolve architectural conflicts before coding

If the existing system's model conflicts with this specification, explain:

```text
Current design
vs.
Required design
```

and recommend the smallest safe migration.

### Step 5 — Implement incrementally

Do not attempt the entire feature in one change.

Prefer:

```text
Foundation
→ Core transactions
→ Reconciliation
→ Import
→ OCR
→ Reports
→ Integrations
```

### Step 6 — Test financial semantics

Tests must specifically verify cases such as:

```text
₹5,000 internal transfer
→ ₹0 family expenditure

₹2,000 ATM withdrawal
→ ₹0 family expenditure

₹1,000 cash purchase
→ ₹1,000 family expenditure

Repeated bank statement
→ no duplicate expenditure

Manual ₹10,000 + matching bank transaction
→ one canonical transaction

User A ₹5,000 → User B
→ one internal transfer, not ₹5,000 expense + ₹5,000 income

Two genuinely separate ₹10,000 transactions
→ must NOT be merged merely because their amounts match
```

---

# 46. Final Product Philosophy

The system should not merely ask:

> **"What did you spend?"**

It should progressively understand:

> **"What happened to the family's money?"**

Then derive:

> **"What was actually spent?"**

That distinction should remain at the center of the architecture.

The long-term vision is a system where the family does as little manual bookkeeping as possible. Bank statements, screenshots, shared payment receipts, manual entries, and future messaging interfaces all feed one intelligent, auditable transaction ledger.

The result should be a finance-tracking feature that is **automated at the input level, rigorous at the accounting/reconciliation level, and simple at the user-interface level.**
