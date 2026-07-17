# Product Requirements Document (PRD)
## Personal & Family Finance Management System

---

**Document Version:** 1.0  
**Date:** July 16, 2026  
**Status:** Draft  
**Tech Stack:** Node.js · React.js · MongoDB · Passport.js (Local Strategy) · Session-Based Auth

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Goals & Objectives](#2-goals--objectives)
3. [User Roles & Personas](#3-user-roles--personas)
4. [Authentication & Session Management](#4-authentication--session-management)
5. [Feature Modules](#5-feature-modules)
   - 5.1 Dashboard
   - 5.2 Income Tracker
   - 5.3 Subscription Tracker
   - 5.4 Recurring Payments
   - 5.5 Investment Tracker
   - 5.6 EMI & Loan Tracker
   - 5.7 Variable / Ad-hoc Expenses
   - 5.8 Insurance Tracker
   - 5.9 Education Payments
   - 5.10 Yearly Subscriptions
   - 5.11 Daily / Weekly Random Payments
   - 5.12 Tax Calculator & Advisor
   - 5.13 Reports & Exports
   - 5.14 Notifications & Alerts
6. [Multi-Member Account System](#6-multi-member-account-system)
7. [Data Models (MongoDB Schemas)](#7-data-models-mongodb-schemas)
8. [API Endpoints](#8-api-endpoints)
9. [Tech Stack & Architecture](#9-tech-stack--architecture)
13. [Form 16 Processing and Tax Recommendation System](#13-form-16-processing-and-tax-recommendation-system)
    - 13.1 Overview
    - 13.2 Feature Goals
    - 13.3 AI Integration
    - 13.4 MongoDB Schema
    - 13.5 API Endpoints
    - 13.6 Frontend Flow
    - 13.7 Duplicate Flow
    - 13.8 Caching and Stale Logic
    - 13.9 Gemini Prompt Structure
    - 13.10 Out of Scope for This Feature
14. [Non-Functional Requirements](#14-non-functional-requirements)
15. [Milestones & Phases](#15-milestones--phases)
16. [Out of Scope](#16-out-of-scope)

---

## 1. Project Overview

A full-stack personal and family finance management web application that enables users to track all inflows and outflows of money in a structured, categorised, and insightful manner. The system supports multiple members under a single family account, with an admin having full visibility over all members. It covers monthly income, subscriptions, recurring payments, investments, EMIs, loans, insurance, education, ad-hoc expenses, and provides an Indian tax calculator with regime comparison (New vs Old slab).

---

## 2. Goals & Objectives

| # | Goal |
|---|------|
| G1 | Provide a single dashboard that reflects real-time financial health |
| G2 | Auto-track all recurring obligations so users never miss a payment |
| G3 | Help families manage finances collaboratively with clear role separation |
| G4 | Give actionable tax-saving tips and compare Old vs New income tax regimes |
| G5 | Support ad-hoc and irregular expenses with flexible entry |
| G6 | Generate monthly PDF/Excel reports and email alerts for upcoming payments |

---

## 3. User Roles & Personas

### 3.1 Roles

| Role | Description |
|------|-------------|
| **Super Admin** | Account owner; can add/remove members, see all data across all members, manage account-level settings |
| **Member** | Family member added by admin; can manage only their own financial data |

### 3.2 Personas

**Persona A — Rohan (Admin, 38, salaried professional)**
- Manages family finances, investments, loans
- Wants a single view across wife's and his own expenses
- Needs tax comparison to decide old vs new regime

**Persona B — Priya (Member, 35, working spouse)**
- Has her own subscriptions, SIPs, and education fees for kids
- Admin (Rohan) can see her data; she cannot see his

---

## 4. Authentication & Session Management

### 4.1 Strategy
- **Passport.js Local Strategy** (email + password)
- **Session-based** using `express-session` with MongoDB session store (`connect-mongo`)
- Passwords hashed with **bcrypt** (salt rounds: 12)
- Sessions expire after **7 days** of inactivity (configurable)

### 4.2 Auth Flows

```
POST /auth/register     → Create account (first user = Super Admin)
POST /auth/login        → Authenticate, create session
POST /auth/logout       → Destroy session
GET  /auth/me           → Return current session user
POST /auth/invite       → Admin invites a member (sends invite token via email)
POST /auth/accept-invite→ Member sets password via invite token
```

### 4.3 Session Security
- `httpOnly: true`, `secure: true` (in production), `sameSite: 'strict'`
- CSRF protection via `csurf` middleware
- Rate limiting on login route (max 10 attempts per 15 min per IP)

---

## 5. Feature Modules

---

### 5.1 Dashboard

The central hub showing a consolidated financial snapshot.

**Widgets / Cards:**

| Widget | Description |
|--------|-------------|
| **Net Monthly Flow** | Total Income − All Recurring Obligations |
| **Upcoming Payments (7 days)** | Subscriptions, EMIs, insurance, SIPs due soon |
| **Monthly Burn Breakdown** | Donut chart: Subscriptions / EMI / Household / Insurance / Education |
| **Investment Portfolio Value** | Total current value vs total invested |
| **Ad-hoc Spend This Month** | Sum of random/variable expenses logged |
| **Tax Estimate** | Quick view: estimated tax liability (current FY) |
| **Member Switcher (Admin only)** | Toggle between members to view their dashboard |

**Charts:**
- Monthly income vs expense (bar chart, last 6 months)
- Category-wise spend (pie/donut)
- Investment growth over time (line chart)

---

### 5.2 Income Tracker

Tracks all sources of recurring monthly income.

**Fields per Income Entry:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | String | e.g., "Salary — TCS", "Freelance Client A" |
| `amount` | Number | Monthly amount (INR) |
| `creditDate` | Number (1–31) | Day of month income arrives |
| `category` | Enum | Salary, Freelance, Rental, Business, Other |
| `taxable` | Boolean | Whether this income is taxable |
| `startDate` | Date | When this income stream began |
| `endDate` | Date \| null | Optional end date |
| `notes` | String | Optional remarks |
| `memberId` | ObjectId | Which member owns this entry |

**Behaviour:**
- Multiple income sources per member
- Income is auto-included in tax estimate
- Admin sees combined family income

---

### 5.3 Subscription Tracker (Monthly)

Tracks all monthly subscription services.

**Fields per Subscription:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | e.g., "Netflix", "Spotify" |
| `category` | Enum | Entertainment, Productivity, Health, News, Gaming, Cloud Storage, Other |
| `amount` | Number | Monthly deduction (INR) |
| `billingDate` | Number (1–31) | Day of month it gets debited |
| `startDate` | Date | When subscription started |
| `endDate` | Date \| null | Renewal/expiry date |
| `paymentMethod` | String | Credit card / UPI / Bank |
| `autoRenew` | Boolean | Whether it auto-renews |
| `status` | Enum | Active, Paused, Cancelled |
| `notes` | String | Optional |
| `memberId` | ObjectId | Owner |

**Behaviour:**
- Alert 3 days before billing date
- Show days remaining to renewal
- Flag subscriptions approaching end date

---

### 5.4 Recurring Payments (Household & Others)

Fixed monthly payments that are not subscriptions — utilities, maintenance, staff, etc.

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | String | e.g., "Electricity Bill", "Cook Salary" |
| `category` | Enum | Household, Utility, Staff, Society, Vehicle, Other |
| `amount` | Number | Monthly amount |
| `dueDate` | Number (1–31) | Day of month due |
| `paymentMethod` | String | |
| `startDate` | Date | |
| `notes` | String | |
| `memberId` | ObjectId | |

---

### 5.5 Investment Tracker

Comprehensive tracker for all investment types.

#### 5.5.1 Stocks / Equities

| Field | Type | Description |
|-------|------|-------------|
| `stockName` | String | Company name |
| `ticker` | String | NSE/BSE symbol |
| `buyPrice` | Number | Price per share at purchase |
| `quantity` | Number | Number of shares |
| `buyDate` | Date | |
| `currentPrice` | Number | Manually updated or via API |
| `currentValue` | Number | Computed: qty × currentPrice |
| `gainLoss` | Number | Computed |
| `notes` | String | |
| `memberId` | ObjectId | |

#### 5.5.2 Mutual Funds / SIP

| Field | Type | Description |
|-------|------|-------------|
| `fundName` | String | |
| `fundHouse` | String | e.g., "Mirae Asset", "HDFC" |
| `sipAmount` | Number | Monthly SIP deduction |
| `sipDate` | Number (1–31) | Day of month SIP debits |
| `startDate` | Date | |
| `endDate` | Date \| null | |
| `totalInvested` | Number | Cumulative |
| `currentValue` | Number | Manually updated |
| `units` | Number | Total units held |
| `nav` | Number | Current NAV |
| `category` | Enum | Equity, Debt, Hybrid, ELSS, Index, Other |
| `memberId` | ObjectId | |

**Note:** ELSS funds auto-flag for Section 80C deduction in tax module.

#### 5.5.3 Fixed Deposits (FD)

| Field | Type | Description |
|-------|------|-------------|
| `bankName` | String | |
| `principalAmount` | Number | |
| `interestRate` | Number | Annual % |
| `tenure` | Number | In months |
| `startDate` | Date | |
| `maturityDate` | Date | Computed |
| `maturityAmount` | Number | Computed |
| `interestType` | Enum | Simple, Compound |
| `taxableInterest` | Boolean | TDS applicable? |
| `status` | Enum | Active, Matured, Broken |
| `notes` | String | |
| `memberId` | ObjectId | |

#### 5.5.4 Real Estate / Other Assets

| Field | Type | Description |
|-------|------|-------------|
| `assetName` | String | e.g., "Flat — Andheri" |
| `assetType` | Enum | Real Estate, Gold, PPF, NPS, Other |
| `purchaseValue` | Number | |
| `currentValue` | Number | |
| `purchaseDate` | Date | |
| `notes` | String | |
| `memberId` | ObjectId | |

---

### 5.6 EMI & Loan Tracker

| Field | Type | Description |
|-------|------|-------------|
| `loanName` | String | e.g., "Home Loan — SBI" |
| `loanType` | Enum | Home, Car, Personal, Education, Gold, Other |
| `lender` | String | Bank / NBFC name |
| `principalAmount` | Number | Original loan amount |
| `outstandingAmount` | Number | Current balance |
| `emiAmount` | Number | Monthly deduction |
| `emiDate` | Number (1–31) | Day of month EMI debits |
| `interestRate` | Number | Annual % |
| `tenureMonths` | Number | Total tenure |
| `startDate` | Date | |
| `endDate` | Date | Computed |
| `status` | Enum | Active, Closed, Prepaid |
| `notes` | String | |
| `memberId` | ObjectId | |

**Behaviour:**
- Show total interest payable
- Show months remaining
- Alert on EMI due date (3 days before)
- Home loan interest auto-flags for Section 24 deduction in tax module

---

### 5.7 Variable / Ad-hoc Expenses

For irregular expenses that don't fit a fixed schedule: fuel, travel, maintenance, etc.

| Field | Type | Description |
|-------|------|-------------|
| `title` | String | e.g., "Petrol — Hero Splendor" |
| `category` | Enum | Fuel, Travel, Maintenance, Medical, Shopping, Food, Other |
| `amount` | Number | |
| `date` | Date | Date of expense |
| `recurrenceHint` | String | Optional: "Every 2 days", "Every week", etc. |
| `tags` | [String] | Free-form tags |
| `receipt` | String | Optional image URL |
| `notes` | String | |
| `memberId` | ObjectId | |

**Behaviour:**
- Quick-add from dashboard (floating button)
- Filter by category, date range, member
- Show weekly/monthly aggregates per category
- If `recurrenceHint` set, suggest converting to recurring payment

---

### 5.8 Insurance Tracker

| Field | Type | Description |
|-------|------|-------------|
| `policyName` | String | e.g., "LIC Jeevan Anand" |
| `insurer` | String | Company name |
| `insuranceType` | Enum | Life, Health, Vehicle, Term, Home, Other |
| `premiumAmount` | Number | |
| `premiumFrequency` | Enum | Monthly, Quarterly, Half-Yearly, Yearly |
| `nextDueDate` | Date | |
| `startDate` | Date | |
| `endDate` | Date | Policy maturity |
| `sumAssured` | Number | Coverage amount |
| `nominee` | String | |
| `policyNumber` | String | |
| `status` | Enum | Active, Lapsed, Matured, Claimed |
| `tax80C` | Boolean | Eligible for 80C deduction? |
| `notes` | String | |
| `memberId` | ObjectId | |

---

### 5.9 Education Payments

| Field | Type | Description |
|-------|------|-------------|
| `title` | String | e.g., "School Fees — Aryan", "UPSC Coaching" |
| `institution` | String | |
| `category` | Enum | School, College, Coaching, Online Course, Other |
| `amount` | Number | |
| `frequency` | Enum | Monthly, Quarterly, Half-Yearly, Yearly, One-time |
| `dueDate` | Date | Next due date |
| `startDate` | Date | |
| `endDate` | Date \| null | |
| `forMember` | String | Student name (can be a child, not a system member) |
| `notes` | String | |
| `memberId` | ObjectId | Paying member |

---

### 5.10 Yearly Subscriptions

Same schema as monthly subscriptions (Section 5.3) but with `frequency: "Yearly"`. Maintained as a separate view/filter for clarity.

**Additional Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `renewalReminderDays` | Number | Days before renewal to alert (default: 30) |
| `lastRenewalDate` | Date | |
| `nextRenewalDate` | Date | Computed from startDate + interval |

---

### 5.11 Daily / Weekly Random Payments

A lightweight quick-log for day-to-day spending.

| Field | Type | Description |
|-------|------|-------------|
| `title` | String | e.g., "Groceries", "Auto fare" |
| `amount` | Number | |
| `date` | Date | |
| `category` | Enum | Food, Transport, Grocery, Entertainment, Health, Miscellaneous |
| `paymentMode` | Enum | Cash, UPI, Card, Net Banking |
| `splitWith` | [ObjectId] | Other members to split expense with |
| `splitType` | Enum | Equal, Custom |
| `splitAmounts` | Object | `{ memberId: amount }` if Custom |
| `memberId` | ObjectId | Who paid |

**Behaviour:**
- Bulk import via CSV
- Expense splitting between members (admin can see split summary)
- Weekly spend summary card on dashboard

---

### 5.12 Tax Calculator & Advisor (India)

#### 5.12.1 Input Sources (auto-pulled from modules)

| Source | Tax Relevance |
|--------|--------------|
| Salary income | Taxable under "Income from Salary" |
| Freelance / business income | Taxable under "PGBP" |
| FD interest | Taxable as "Income from Other Sources" |
| ELSS SIP | 80C deduction |
| Life / health insurance premiums | 80C / 80D deduction |
| Home loan interest | Section 24(b) deduction |
| Home loan principal repayment | 80C deduction |
| Education loan interest | Section 80E deduction |
| NPS contribution | 80CCD(1B) — additional ₹50,000 |
| Rental income | Taxable after 30% standard deduction |

#### 5.12.2 Old Regime Slabs (FY 2025-26)

| Income Range | Tax Rate |
|---|---|
| Up to ₹2,50,000 | Nil |
| ₹2,50,001 – ₹5,00,000 | 5% |
| ₹5,00,001 – ₹10,00,000 | 20% |
| Above ₹10,00,000 | 30% |

Deductions: 80C (up to ₹1.5L), 80D, 80E, 24(b), HRA, Standard Deduction ₹50,000.

#### 5.12.3 New Regime Slabs (FY 2025-26)

| Income Range | Tax Rate |
|---|---|
| Up to ₹3,00,000 | Nil |
| ₹3,00,001 – ₹7,00,000 | 5% |
| ₹7,00,001 – ₹10,00,000 | 10% |
| ₹10,00,001 – ₹12,00,000 | 15% |
| ₹12,00,001 – ₹15,00,000 | 20% |
| Above ₹15,00,000 | 30% |

Standard Deduction: ₹75,000. No other deductions permitted.

#### 5.12.4 Tax Module Features

- Side-by-side comparison: Old vs New regime
- Shows which regime saves more and by how much
- Tax-saving tips panel:
  - "You can invest ₹X more in ELSS to maximise 80C"
  - "Adding NPS can save ₹X additional tax"
  - "Health insurance for parents (80D) can save ₹Y"
- Surcharge and cess auto-applied (4% Health & Education Cess)
- Advance tax estimator (quarterly instalments)
- Per-member tax calculation; admin sees family aggregate

---

### 5.13 Reports & Exports

| Report | Format | Frequency |
|--------|--------|-----------|
| Monthly Financial Summary | PDF, Excel | Monthly (auto-generated) |
| Category-wise Expense Report | PDF, Excel | On demand |
| Investment Portfolio Report | PDF | On demand |
| Tax Summary Report | PDF | On demand / Yearly |
| Member-wise Expense Report (Admin) | PDF, Excel | On demand |
| Annual Financial Report | PDF | Yearly |

**Export Fields:**
- Date range selector
- Member selector (admin only)
- Module selector (which categories to include)

---

### 5.14 Notifications & Alerts

| Alert Type | Trigger | Channel |
|---|---|---|
| Upcoming subscription billing | 3 days before billing date | In-app + Email |
| EMI due reminder | 3 days before EMI date | In-app + Email |
| Insurance premium due | 7 days before due date | In-app + Email |
| FD maturity | 15 days before maturity | In-app + Email |
| Yearly subscription renewal | 30 days before renewal | In-app + Email |
| SIP debit reminder | 2 days before SIP date | In-app |
| Monthly report ready | 1st of each month | Email |
| Budget overspend (if budgets added) | When category exceeds limit | In-app |

**Email provider:** Nodemailer with SMTP (e.g., Gmail / SendGrid)

---

## 6. Multi-Member Account System

### 6.1 Account Structure

```
Family Account
├── Super Admin (account creator)
│   ├── Own financial data
│   └── Can view ALL members' data
└── Members (invited)
    └── Can view & edit ONLY their own data
```

### 6.2 Member Management (Admin only)

- Invite member by email (generates secure token, valid 48 hours)
- Set member display name and avatar
- Remove member (data retained, marked as archived)
- View per-member dashboard
- Export per-member report

### 6.3 Shared Expenses

- Daily/weekly random payments can be split between members
- Admin can see split summary and settlement status
- "Who owes whom" mini-ledger within the family account

---

## 7. Data Models (MongoDB Schemas)

### 7.1 User

```js
{
  _id: ObjectId,
  name: String,
  email: { type: String, unique: true },
  passwordHash: String,
  role: { type: String, enum: ['admin', 'member'] },
  familyAccountId: ObjectId,
  inviteToken: String,
  inviteExpiry: Date,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### 7.2 FamilyAccount

```js
{
  _id: ObjectId,
  name: String,          // e.g., "Sharma Family"
  adminId: ObjectId,
  members: [ObjectId],
  createdAt: Date
}
```

### 7.3 Income

```js
{
  _id: ObjectId,
  memberId: ObjectId,
  familyAccountId: ObjectId,
  title: String,
  amount: Number,
  creditDate: Number,
  category: String,
  taxable: Boolean,
  startDate: Date,
  endDate: Date,
  notes: String,
  createdAt: Date
}
```

### 7.4 Subscription

```js
{
  _id: ObjectId,
  memberId: ObjectId,
  familyAccountId: ObjectId,
  name: String,
  category: String,
  amount: Number,
  billingDate: Number,
  frequency: { type: String, enum: ['monthly', 'yearly'] },
  startDate: Date,
  endDate: Date,
  renewalReminderDays: Number,
  paymentMethod: String,
  autoRenew: Boolean,
  status: String,
  notes: String,
  createdAt: Date
}
```

### 7.5 RecurringPayment

```js
{
  _id: ObjectId,
  memberId: ObjectId,
  familyAccountId: ObjectId,
  title: String,
  category: String,
  amount: Number,
  dueDate: Number,
  paymentMethod: String,
  startDate: Date,
  notes: String,
  createdAt: Date
}
```

### 7.6 Investment

```js
{
  _id: ObjectId,
  memberId: ObjectId,
  familyAccountId: ObjectId,
  investmentType: { type: String, enum: ['stock', 'mf_sip', 'fd', 'real_estate', 'other'] },
  // Stock fields
  stockName: String, ticker: String, buyPrice: Number, quantity: Number, currentPrice: Number,
  // MF/SIP fields
  fundName: String, fundHouse: String, sipAmount: Number, sipDate: Number, units: Number, nav: Number, fundCategory: String,
  // FD fields
  bankName: String, principalAmount: Number, interestRate: Number, tenureMonths: Number, maturityDate: Date, maturityAmount: Number,
  // Common
  totalInvested: Number,
  currentValue: Number,
  startDate: Date,
  endDate: Date,
  status: String,
  notes: String,
  createdAt: Date
}
```

### 7.7 EMILoan

```js
{
  _id: ObjectId,
  memberId: ObjectId,
  familyAccountId: ObjectId,
  loanName: String,
  loanType: String,
  lender: String,
  principalAmount: Number,
  outstandingAmount: Number,
  emiAmount: Number,
  emiDate: Number,
  interestRate: Number,
  tenureMonths: Number,
  startDate: Date,
  endDate: Date,
  status: String,
  notes: String,
  createdAt: Date
}
```

### 7.8 AdHocExpense

```js
{
  _id: ObjectId,
  memberId: ObjectId,
  familyAccountId: ObjectId,
  title: String,
  category: String,
  amount: Number,
  date: Date,
  recurrenceHint: String,
  tags: [String],
  paymentMode: String,
  splitWith: [ObjectId],
  splitType: String,
  splitAmounts: Map,
  receipt: String,
  notes: String,
  createdAt: Date
}
```

### 7.9 Insurance

```js
{
  _id: ObjectId,
  memberId: ObjectId,
  familyAccountId: ObjectId,
  policyName: String,
  insurer: String,
  insuranceType: String,
  premiumAmount: Number,
  premiumFrequency: String,
  nextDueDate: Date,
  startDate: Date,
  endDate: Date,
  sumAssured: Number,
  nominee: String,
  policyNumber: String,
  status: String,
  tax80C: Boolean,
  notes: String,
  createdAt: Date
}
```

### 7.10 EducationPayment

```js
{
  _id: ObjectId,
  memberId: ObjectId,
  familyAccountId: ObjectId,
  title: String,
  institution: String,
  category: String,
  amount: Number,
  frequency: String,
  dueDate: Date,
  startDate: Date,
  endDate: Date,
  forMember: String,
  notes: String,
  createdAt: Date
}
```

### 7.11 Notification

```js
{
  _id: ObjectId,
  memberId: ObjectId,
  familyAccountId: ObjectId,
  type: String,
  message: String,
  relatedModule: String,
  relatedId: ObjectId,
  isRead: Boolean,
  scheduledAt: Date,
  sentAt: Date,
  channel: [String],
  createdAt: Date
}
```

---

## 8. API Endpoints

### Auth

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/invite
POST   /api/auth/accept-invite/:token
```

### Dashboard

```
GET    /api/dashboard                    → Summary for current member
GET    /api/dashboard/member/:memberId   → Summary for specific member (admin only)
```

### Income

```
GET    /api/income
POST   /api/income
PUT    /api/income/:id
DELETE /api/income/:id
```

### Subscriptions

```
GET    /api/subscriptions?frequency=monthly|yearly
POST   /api/subscriptions
PUT    /api/subscriptions/:id
DELETE /api/subscriptions/:id
```

### Recurring Payments

```
GET    /api/recurring
POST   /api/recurring
PUT    /api/recurring/:id
DELETE /api/recurring/:id
```

### Investments

```
GET    /api/investments?type=stock|mf_sip|fd|real_estate
POST   /api/investments
PUT    /api/investments/:id
DELETE /api/investments/:id
GET    /api/investments/summary
```

### EMI & Loans

```
GET    /api/loans
POST   /api/loans
PUT    /api/loans/:id
DELETE /api/loans/:id
```

### Ad-hoc Expenses

```
GET    /api/expenses?from=&to=&category=
POST   /api/expenses
PUT    /api/expenses/:id
DELETE /api/expenses/:id
POST   /api/expenses/bulk-import
```

### Insurance

```
GET    /api/insurance
POST   /api/insurance
PUT    /api/insurance/:id
DELETE /api/insurance/:id
```

### Education

```
GET    /api/education
POST   /api/education
PUT    /api/education/:id
DELETE /api/education/:id
```

### Tax

```
GET    /api/tax/estimate                 → Auto-calculated from all modules
POST   /api/tax/calculate                → Manual override inputs
GET    /api/tax/tips                     → Personalised saving tips
GET    /api/tax/compare                  → Old vs New regime side-by-side
```

### Members (Admin only)

```
GET    /api/members
DELETE /api/members/:id
GET    /api/members/:id/dashboard
GET    /api/members/:id/summary
```

### Reports

```
GET    /api/reports/monthly?month=&year=&format=pdf|excel
GET    /api/reports/annual?year=&format=pdf|excel
GET    /api/reports/category?from=&to=&format=pdf|excel
GET    /api/reports/tax?year=&format=pdf
```

### Notifications

```
GET    /api/notifications
PUT    /api/notifications/:id/read
DELETE /api/notifications/:id
PUT    /api/notifications/read-all
```

---

## 9. Tech Stack & Architecture

### 9.1 Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React.js (Vite), React Router v6, Axios, Recharts, TailwindCSS |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB (Mongoose ODM) |
| **Authentication** | Passport.js (Local Strategy), express-session, connect-mongo |
| **Email** | Nodemailer (SMTP / SendGrid) |
| **Scheduling** | node-cron (daily job for alerts and report generation) |
| **PDF Export** | pdfkit or puppeteer |
| **Excel Export** | exceljs |
| **Validation** | Joi / express-validator |

### 9.2 Folder Structure

```
/
├── client/                   # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   │   ├── Dashboard/
│   │   │   ├── Income/
│   │   │   ├── Subscriptions/
│   │   │   ├── Investments/
│   │   │   ├── Loans/
│   │   │   ├── Expenses/
│   │   │   ├── Insurance/
│   │   │   ├── Education/
│   │   │   ├── Tax/
│   │   │   ├── Reports/
│   │   │   └── Members/
│   │   ├── context/          # AuthContext, MemberContext
│   │   ├── hooks/
│   │   ├── services/         # Axios API calls
│   │   └── utils/
│   └── public/
│
├── server/                   # Node.js + Express backend
│   ├── config/
│   │   ├── db.js             # MongoDB connection
│   │   └── passport.js       # Passport local strategy
│   ├── models/               # Mongoose schemas
│   ├── routes/               # Express route handlers
│   ├── controllers/          # Business logic
│   ├── middleware/
│   │   ├── auth.js           # isAuthenticated, isAdmin
│   │   └── rateLimiter.js
│   ├── services/
│   │   ├── taxService.js
│   │   ├── notificationService.js
│   │   ├── reportService.js
│   │   └── cronJobs.js
│   └── app.js
│
└── .env
```

### 9.3 Architecture Diagram

```
[React Client]
     │  HTTPS + Session Cookie
     ▼
[Express Server]
     ├── Passport.js (auth middleware)
     ├── Route handlers
     ├── Controllers (business logic)
     └── Services
          ├── MongoDB (Mongoose)
          ├── node-cron (scheduled alerts)
          └── Nodemailer (email)
```

---

## 13. Form 16 Processing and Tax Recommendation System

### Overview

This feature allows users to upload a Form 16 PDF or fill the details manually, have the data extracted by Google Gemini 2.5 Flash AI, review and edit the extracted data in a structured web form, and then receive an AI-generated tax regime recommendation comparing the Old and New regimes based on their complete financial profile stored in the application.

### Feature Goals

| # | Goal |
|---|------|
| G1 | Eliminate manual data entry by auto-extracting all Form 16 fields from an uploaded PDF using Gemini AI |
| G2 | Store structured Form 16 data in MongoDB so repeated AI calls are not needed |
| G3 | Combine Form 16 data with existing user financial data for accurate tax recommendations |
| G4 | Allow users to have multiple Form 16 records per financial year with duplicate and edit capability |
| G5 | Cache AI-generated tax recommendations and only regenerate when underlying data changes |

### AI Integration

Google Gemini 2.5 Flash model is used via the Gemini API for two distinct AI calls. The first call is document understanding, where the uploaded PDF is sent to Gemini with a strict prompt instructing it to return only a JSON object (with no preamble) containing all Form 16 fields. The second call is tax recommendation generation, where the confirmed Form 16 structured data is combined with all existing user financial records from the database — including investments, SIPs, loans, insurance, and education payments — and sent to Gemini to generate the regime comparison, tax payable under each regime, recommendation, explanation, and tax-saving suggestions.

> **Note:** Both prompts must enforce JSON-only responses. The backend must strip any markdown formatting (e.g., ` ```json ` code fences) before parsing the model output.

### MongoDB Schema

```js
// Form16
{
  _id: ObjectId,
  userId: { type: ObjectId, ref: 'User' },
  financialYear: String,                 // e.g., "2024-25"
  employeeName: String,
  employeePAN: String,
  employeeDesignation: String,
  employeeCode: String,
  employeeAddress: String,
  employerName: String,
  employerTAN: String,
  employerPAN: String,
  employerAddress: String,
  basicSalary: Number,
  hra: Number,
  specialAllowance: Number,
  lta: Number,
  otherAllowances: Number,
  grossSalary: Number,                   // computed
  standardDeduction: Number,
  professionalTax: Number,
  section80C: Number,
  section80D: Number,
  section80E: Number,
  section80G: Number,
  section80CCD: Number,
  totalDeductions: Number,               // computed
  taxableIncome: Number,
  taxOnIncome: Number,
  rebate87A: Number,
  educationCess: Number,
  totalTaxPayable: Number,
  tdsDeducted: Number,
  taxRegimeUsed: { type: String, enum: ['Old', 'New'] },
  sourceType: { type: String, enum: ['PDF', 'Manual', 'Duplicate'] },
  originalForm16Id: { type: ObjectId, ref: 'Form16', default: null },  // set for duplicates
  pdfReference: { type: String, default: null },
  isEdited: { type: Boolean, default: false },
  createdAt: Date,
  updatedAt: Date
}
```

```js
// TaxRecommendation
{
  _id: ObjectId,
  userId: { type: ObjectId, ref: 'User' },
  form16Id: { type: ObjectId, ref: 'Form16' },
  oldRegimeTax: Number,
  newRegimeTax: Number,
  recommendedRegime: { type: String, enum: ['Old', 'New'] },
  savingsAmount: Number,
  explanation: String,
  taxSavingSuggestions: [
    {
      suggestion: String,
      potentialSaving: Number
    }
  ],
  generatedAt: Date,
  isStale: { type: Boolean, default: false }
}
```

```js
// Stale-invalidation note:
// A TaxRecommendation record is marked isStale = true whenever the linked Form16
// record is updated, OR when any related financial record belonging to the same user
// (Investment, Insurance, EMILoan, EducationPayment) is created, updated, or deleted.
// This causes the next recommendation request to trigger a fresh Gemini call that
// overwrites the stale document with up-to-date values.
```

### API Endpoints

```
POST   /api/form16/upload              → Upload Form 16 PDF; triggers Gemini extraction; returns created Form16 id
POST   /api/form16/manual              → Create Form16 record from manually entered data
GET    /api/form16                     → List all Form16 records for the current user
GET    /api/form16/:id                 → Fetch a single Form16 record with all fields
PUT    /api/form16/:id                 → Update fields; sets isEdited=true and linked TaxRecommendation isStale=true
POST   /api/form16/:id/duplicate       → Duplicate an existing Form16; optional new financialYear; sourceType=Duplicate, originalForm16Id=source id
DELETE /api/form16/:id                 → Delete Form16 record and its linked TaxRecommendation
GET    /api/form16/:id/recommendation  → Fetch TaxRecommendation; if isStale or missing, trigger Gemini call, save, and return; otherwise return cached recommendation
```

### Frontend Flow

1. User lands on the Form 16 page and sees a list of existing records or an empty state.
2. User clicks **New Form 16** and chooses **Upload PDF**, **Fill Manually**, or **Duplicate Existing**.
3. If PDF upload is chosen, the file is sent to `POST /api/form16/upload` and a processing screen is displayed showing live step status.
4. On success, the frontend fetches the new Form16 record from `GET /api/form16/:id` and renders the review-and-edit form pre-populated with extracted values; AI-filled fields are tagged visually.
5. User reviews, corrects any fields, and clicks **Save and Continue**.
6. Frontend calls `GET /api/form16/:id/recommendation`, which returns the cached or freshly generated recommendation.
7. The tax recommendation screen is shown with the Old vs New comparison, recommended regime, savings amount, explanation, and tax-saving suggestions.
8. User can return to edit the Form16; on save, the linked recommendation is marked stale and regenerated on next view.

### Duplicate Flow

When a user selects **Duplicate Existing**, the backend creates a new Form16 document copying all field values from the source record, sets `sourceType` to `Duplicate`, sets `originalForm16Id` to the source `_id`, and sets `isEdited` to `false`. The duplicate is fully independent — editing it does not affect the original. The user can then update the `financialYear` and any changed fields in the review form before saving. No Gemini call is made during duplication since the data is copied from the database.

### Caching and Stale Logic

The `TaxRecommendation` document acts as a persistent cache keyed by `form16Id`. The `isStale` flag is set to `true` by a post-save Mongoose middleware hook on `Form16` whenever any field is updated. The same stale flag is set by post-save hooks on the `Investment`, `Insurance`, `EMILoan`, and `EducationPayment` models when a document belonging to the same `userId` is modified, since these affect the deduction and income inputs used in the tax recommendation prompt. When `GET /api/form16/:id/recommendation` is called, the backend checks `isStale` — if `false`, it returns the existing document instantly with no AI call. If `true`, it assembles the full context, calls Gemini, parses the JSON response, overwrites the `TaxRecommendation` document, sets `isStale` to `false`, and returns the fresh result.

### Gemini Prompt Structure

- **PDF Extraction Prompt:** Instructs Gemini to act as a document extraction specialist, read the attached Form 16 PDF, and return only a valid JSON object (no explanation, no markdown, no code fences) containing all the fields, matching the `Form16` MongoDB schema field names exactly.
- **Tax Recommendation Prompt:** Instructs Gemini to act as an Indian tax advisor for the specified financial year, provides the full Form16 JSON and a summary of all user financial records as context, and asks Gemini to return only a valid JSON object with the fields `oldRegimeTax`, `newRegimeTax`, `recommendedRegime`, `savingsAmount`, `explanation` (string), and `taxSavingSuggestions` (array of objects with `suggestion` and `potentialSaving` fields).

### Out of Scope for This Feature

- Automatic Form 16 fetching from the TRACES portal
- Support for Form 16A or Form 16B
- Multi-employer Form 16 merging in a single financial-year record
- Direct ITR filing integration

---

## 14. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Performance** | Dashboard loads within 2 seconds; API responses under 500ms for typical queries |
| **Security** | bcrypt hashing, session httpOnly cookies, CSRF protection, input sanitisation |
| **Scalability** | MongoDB indexes on memberId, familyAccountId, date fields |
| **Availability** | 99.5% uptime target |
| **Accessibility** | WCAG 2.1 AA compliance for all UI components |
| **Responsive Design** | Mobile-first; works on screens from 375px width |
| **Data Backup** | Daily MongoDB Atlas automated backups |
| **Audit Log** | All create/update/delete actions logged with userId and timestamp |

---

## 15. Milestones & Phases

### Phase 1 — Foundation (Weeks 1–3)
- Project setup (monorepo, ESLint, env config)
- MongoDB connection and base models
- Passport.js auth (register, login, logout, session)
- Family account + member invite flow
- Basic Express routes + React routing skeleton

### Phase 2 — Core Modules (Weeks 4–7)
- Income Tracker (CRUD + UI)
- Subscriptions — monthly and yearly (CRUD + UI)
- Recurring Payments (CRUD + UI)
- EMI & Loan Tracker (CRUD + UI)
- Ad-hoc & daily/weekly expenses (CRUD + quick-add UI)
- Expense splitting logic

### Phase 3 — Investments & Insurance (Weeks 8–10)
- Investment Tracker — stocks, MF/SIP, FD, real estate (CRUD + UI)
- Insurance Tracker (CRUD + UI)
- Education Payments (CRUD + UI)

### Phase 4 — Dashboard & Tax (Weeks 11–13)
- Dashboard with all widgets and charts (Recharts)
- Admin member-switcher
- Tax Calculator — Old vs New regime
- Auto-populated tax inputs from all modules
- Tax tips engine

### Phase 5 — Reports, Notifications & Polish (Weeks 14–16)
- Monthly PDF/Excel export
- Email alerts via node-cron + Nodemailer
- In-app notification centre
- Mobile responsiveness pass
- Performance optimisation (indexes, lazy loading)
- Testing (Jest + Supertest for API; React Testing Library for UI)

---

## 16. Out of Scope

The following are explicitly not included in v1.0:

- Google OAuth / Phone OTP login
- Crypto asset tracking
- Bank account / UPI auto-sync (no Plaid/Setu integration)
- Budget limits and alerts (can be Phase 2)
- Multi-currency support
- Mobile native app (iOS/Android)
- CA / accountant external sharing
- GST tracking for businesses
- AI-powered spending insights (future)

---

*End of PRD — v1.0*  
*Prepared for development team handoff. All field names use camelCase to match Mongoose schema conventions.*
