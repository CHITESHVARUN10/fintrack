export interface TaxPayment { financialYear: string; section: '80C' | '80CCD' | '80D' | '80E' | '80G' | '24b'; amount: number }

// TypeScript domain types for FinStack.
// Field names mirror the PRD MongoDB schemas (camelCase) so the mock layer
// can be swapped for the real API without changing call sites.

export type Role = 'admin' | 'member'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  familyAccountId: string
  isActive: boolean
  createdAt: string
}

export interface FamilyMember extends User {
  avatarColor?: string
  membershipRole?: string
  membershipStatus?: string
}

export interface FamilyAccount {
  _id: string
  name: string
  adminId: string
  members: string[]
  inviteCode?: string
  createdAt: string
  updatedAt: string
}

export interface FamilyMembership {
  _id: string
  userId: string
  familyId: string
  role: 'ADMIN' | 'MEMBER'
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REMOVED'
  inviteCode?: string
  requestedAt: string
  reviewedBy?: string
  reviewedAt?: string
}

export interface TransactionCategory {
  id: string
  label: string
}

export type TxType = 'EXPENSE' | 'INCOME' | 'INTERNAL_TRANSFER' | 'CASH_WITHDRAWAL' | 'CASH_EXPENSE'
export type TxMode = 'UPI' | 'BANK' | 'CASH' | 'CARD' | 'OTHER'
export type TxSource = 'MANUAL' | 'QR_SCAN' | 'BANK_STATEMENT' | 'SCREENSHOT' | 'SHARE' | 'TELEGRAM' | 'WHATSAPP'
export type TxStatus = 'ACTIVE' | 'PENDING_REVIEW' | 'RECONCILED' | 'VOIDED'

export interface CanonicalTransaction {
  _id: string
  familyId: string
  createdBy: string
  type: TxType
  mode: TxMode
  amountPaise: number
  currency: string
  occurredAt: string
  category?: string
  sender?: { name?: string; upiId?: string; accountRef?: string }
  recipient?: { name?: string; upiId?: string; accountRef?: string }
  familyTransfer?: { fromUserId: string; toUserId: string }
  visibility: string
  status: TxStatus
  confidence?: number
  sourceIds: string[]
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface SourceRecord {
  createdAt?: string
  _id: string
  transactionId: string
  familyId: string
  createdBy: string
  source: TxSource
  rawPayload?: unknown
  parsedFields?: unknown
  upiId?: string
  transactionIdExt?: string
  utr?: string
  confidence?: number
}

export type IncomeCategory = 'Salary' | 'Freelance' | 'Rental' | 'Business' | 'Other'

export interface Income {
  id: string
  memberId: string
  title: string
  amount: number
  creditDate: number
  category: IncomeCategory
  taxable: boolean
  startDate: string
  endDate: string | null
  notes?: string
}

export type SubscriptionCategory =
  | 'Entertainment'
  | 'Productivity'
  | 'Health'
  | 'News'
  | 'Gaming'
  | 'Cloud Storage'
  | 'Other'

export type SubscriptionFrequency = 'monthly' | 'yearly'
export type SubscriptionStatus = 'Active' | 'Paused' | 'Cancelled'

export interface Subscription {
  id: string
  memberId: string
  name: string
  category: SubscriptionCategory
  amount: number
  billingDate: number
  frequency: SubscriptionFrequency
  startDate: string
  endDate: string | null
  renewalReminderDays: number
  paymentMethod: string
  autoRenew: boolean
  status: SubscriptionStatus
  notes?: string
}

export type RecurringCategory =
  | 'Household'
  | 'Utility'
  | 'Staff'
  | 'Society'
  | 'Vehicle'
  | 'Other'

export interface RecurringPayment {
  id: string
  memberId: string
  title: string
  category: RecurringCategory
  amount: number
  dueDate: number
  paymentMethod: string
  startDate: string
  notes?: string
}

export type InvestmentType = 'stock' | 'mf_sip' | 'fd' | 'real_estate' | 'other'

export interface Investment {
  taxPayments?: TaxPayment[]
  id: string
  memberId: string
  investmentType: InvestmentType
  title: string
  // Stock / MF fields
  ticker?: string
  fundHouse?: string
  buyPrice?: number
  currentPrice?: number
  quantity?: number
  units?: number
  nav?: number
  sipAmount?: number
  sipDate?: number
  fundCategory?: string
  // FD fields
  bankName?: string
  principalAmount?: number
  interestRate?: number
  tenureMonths?: number
  maturityDate?: string
  maturityAmount?: number
  interestType?: 'Simple' | 'Compound'
  taxableInterest?: boolean
  // Common
  assetType?: string
  totalInvested: number
  currentValue: number
  startDate: string
  endDate: string | null
  status: string
  notes?: string
}

export type ExpenseCategory =
  | 'Fuel'
  | 'Travel'
  | 'Maintenance'
  | 'Medical'
  | 'Shopping'
  | 'Food'
  | 'Other'

export interface AdHocExpense {
  id: string
  memberId: string
  title: string
  category: ExpenseCategory
  amount: number
  date: string
  recurrenceHint?: string
  tags?: string[]
  paymentMode?: string
  notes?: string
}

export type NotificationType =
  | 'subscription'
  | 'emi'
  | 'insurance'
  | 'fd'
  | 'sip'
  | 'report'
  | 'budget'

export interface AppNotification {
  id: string
  memberId: string
  type: NotificationType
  message: string
  relatedModule: string
  isRead: boolean
  scheduledAt: string
  channel: string[]
}

export interface TaxRegimeResult {
  regime: 'Old' | 'New'
  grossIncome: number
  deductions: number
  taxableIncome: number
  taxBeforeCess: number
  cess: number
  totalTax: number
  effectiveRate: number
}

export interface TaxDeductions {
  section80C: number
  section80CCD: number
  section80D: number
  section80E: number
  section24: number
  totalDeductions: number
}

// Shape returned by GET /api/tax/estimate (real backend aggregation).
export interface TaxEstimate {
  grossIncome: number
  deductions: TaxDeductions
  oldRegime: TaxRegimeResult
  newRegime: TaxRegimeResult
  recommended: 'Old' | 'New'
  savings: number
  tips: string[]
}

// Shape returned by GET /api/dashboard (real aggregate from the backend).
// Expenses (AdHocExpense) is deprecated — dashboard now uses Transaction ledger for individual.
// adHocSpendThisMonth kept for backward compat (mirrors transactionSpendThisMonth).
export interface DashboardSummary {
  monthlyIncome: number
  monthlyObligations: number
  netMonthlyFlow: number
  investmentPortfolioValue: { totalInvested: number; totalCurrentValue: number }
  adHocSpendThisMonth: number
  transactionSpendThisMonth: number
  transactionCountThisMonth: number
  monthlyBurnBreakdown: Record<string, number>
  transactionCategoryBreakdown: Record<string, number>
  transactionVendorBreakdown: Record<string, number>
  transactionCategoryEntries: { label: string; value: number }[]
  transactionVendorEntries: { label: string; value: number }[]
  upcomingPayments: UpcomingPayment[]
  taxEstimate: {
    taxableIncome: number
    taxBeforeCess: number
    cess: number
    totalTax: number
  }
}

export interface UpcomingPayment {
  id: string
  type: string
  name: string
  amount: number
  dueDate: string
}
