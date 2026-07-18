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

export type LoanType =
  | 'Home'
  | 'Car'
  | 'Personal'
  | 'Education'
  | 'Gold'
  | 'Other'

export interface EMILoan {
  id: string
  memberId: string
  loanName: string
  loanType: LoanType
  lender: string
  principalAmount: number
  outstandingAmount: number
  emiAmount: number
  emiDate: number
  interestRate: number
  tenureMonths: number
  startDate: string
  endDate: string
  status: 'Active' | 'Closed' | 'Prepaid'
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

export type InsuranceType =
  | 'Life'
  | 'Health'
  | 'Vehicle'
  | 'Term'
  | 'Home'
  | 'Other'

export type PremiumFrequency = 'Monthly' | 'Quarterly' | 'Half-Yearly' | 'Yearly'

export interface Insurance {
  id: string
  memberId: string
  policyName: string
  insurer: string
  insuranceType: InsuranceType
  premiumAmount: number
  premiumFrequency: PremiumFrequency
  nextDueDate: string
  startDate: string
  endDate: string
  sumAssured: number
  nominee: string
  policyNumber: string
  status: 'Active' | 'Lapsed' | 'Matured' | 'Claimed'
  tax80C: boolean
  notes?: string
}

export type EducationCategory =
  | 'School'
  | 'College'
  | 'Coaching'
  | 'Online Course'
  | 'Other'

export type EducationFrequency =
  | 'Monthly'
  | 'Quarterly'
  | 'Half-Yearly'
  | 'Yearly'
  | 'One-time'

export interface EducationPayment {
  id: string
  memberId: string
  title: string
  institution: string
  category: EducationCategory
  amount: number
  frequency: EducationFrequency
  dueDate: string
  startDate: string
  endDate: string | null
  forMember: string
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
export interface DashboardSummary {
  monthlyIncome: number
  monthlyObligations: number
  netMonthlyFlow: number
  investmentPortfolioValue: { totalInvested: number; totalCurrentValue: number }
  adHocSpendThisMonth: number
  monthlyBurnBreakdown: Record<string, number>
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

// ---------------------------------------------------------------------------
// Form 16 Processing & Tax Recommendation (PRD Section 13)
// ---------------------------------------------------------------------------

export type Form16SourceType = 'PDF' | 'Manual' | 'Duplicate'
export type Form16Regime = 'Old' | 'New'
export type Form16Status = 'Processing' | 'Processed' | 'Draft'

export interface Form16 {
  id: string
  userId: string
  financialYear: string // e.g. "2024-25"
  employeeName: string
  employeePAN: string
  employeeDesignation: string
  employeeCode: string
  employeeAddress: string
  employerName: string
  employerTAN: string
  employerPAN: string
  employerAddress: string
  basicSalary: number
  hra: number
  rentPaid: number
  specialAllowance: number
  lta: number
  otherAllowances: number
  grossSalary: number // computed
  standardDeduction: number
  professionalTax: number
  section80C: number
  section80D: number
  section80E: number
  section80G: number
  section80CCD: number
  totalDeductions: number // computed
  taxableIncome: number
  taxOnIncome: number
  rebate87A: number
  educationCess: number
  totalTaxPayable: number
  tdsDeducted: number
  taxRegimeUsed: Form16Regime
  sourceType: Form16SourceType
  originalForm16Id: string | null
  pdfReference: string | null
  isEdited: boolean
  status: Form16Status
  createdAt: string
  updatedAt: string
}

export interface TaxSavingSuggestion {
  id: string
  title: string
  detail: string
  icon: string
  potentialSaving: number
}

// One band of the slab-wise tax computation. `incomeInBand` is the portion of
// taxable income that falls in this band; `tax` is rate * incomeInBand.
export interface SlabRow {
  label: string
  lower: number
  upper: number
  rate: number
  incomeInBand: number
  tax: number
}

// One line of the per-regime deduction plan. `claimed` is what actually reduces
// taxable income (0 when disallowed in the regime). `remaining` is headroom left
// in the section cap (null when the section has no cap or is disallowed).
export interface DeductionPlanItem {
  key: string
  label: string
  allowed: boolean
  disallowed: boolean
  maxLimit: number | null
  userAmount: number
  claimed: number
  remaining: number | null
  qualifying: number | null
  source?: string | null
  note: string
}

export interface SalaryExemptions {
  hra: number
  lta: number
}

// Full per-regime tax waterfall trace returned by the backend. Mirrors
// server/services/tax.service.js computeLiability output exactly, so the
// frontend renders identical numbers to what was stored in the recommendation
// (and what the user can revisit days later).
export interface RegimeTrace {
  regime: Form16Regime
  grossIncome: number
  salaryExemptions: SalaryExemptions
  incomeFromSalary: number
  incomeFromOtherSources: number
  grossTotalIncome: number
  deductions: DeductionPlanItem[]
  totalDeductions: number
  taxableIncome: number
  slabs: SlabRow[]
  incomeTaxBeforeRebate: number
  rebate: number
  incomeTaxAfterRebate: number
  surcharge: number
  cess: number
  finalTax: number
  tdsDeducted: number
  advanceTax: number
  selfAssessmentTax: number
  totalPaid: number
  refund: number
  taxPayable: number
}

// Plain-English description of a claimed deduction section (authored in code,
// not by AI). `section` matches the backend deduction keys (section80C, etc.).
export interface DeductionBreakdown {
  section: string
  label: string
  amount: number
  note: string
}

// --- Canonical tax-engine types (Part 1 / 2 / 4 / 9) ---------------------

export type DeductionSource =
  | 'FORM16_OCR'
  | 'INVESTMENT_RECORD'
  | 'USER_MANUAL'
  | 'SYSTEM_DEFAULT'

export type DeductionStatus =
  | 'Applied'
  | 'Excluded – Unconfirmed'
  | 'Excluded – Exceeds Limit'
  | 'Excluded – Not Allowed in Regime'

// A single, source-tracked deduction (Part 2). Every deduction in the
// system — extracted, from financial records, or manual — is exactly one of
// these; nothing is ever stored as a bare `section80C = 150000`.
export interface DeductionLineItem {
  section: string // '80C' | '80CCD' | 'HRA' | 'StandardDeduction' | ...
  subtype: string | null
  subtypeConfirmed: boolean
  amount: number
  originalAmount?: number | null // pre-cap raw amount; null when amount == raw
  source: DeductionSource | null
  confidence: number // 0–100
  needsConfirmation: boolean
  notes: string | null
  duplicateRisk: boolean
}

export type GrossSalarySource = 'FORM16_EXPLICIT' | 'COMPONENT_SUM' | 'USER_EDITED'

// The ONE source of truth for tax data across every screen (Part 1).
export interface TaxpayerContext {
  salary: {
    grossSalary: number | null
    basicSalary: number
    hra: number
    specialAllowance: number
    lta: number
    otherAllowances: number
    grossSalarySource: GrossSalarySource
    componentSum: number
    tdsDeducted: number
    employeePAN: string | null
  }
  deductions: DeductionLineItem[]
  computedIncome: {
    totalDeductions: number
    taxableIncomeOldRegime: number
    taxableIncomeNewRegime: number
  }
  taxResult: { oldRegime: TaxRegimeResult | null; newRegime: TaxRegimeResult | null }
  metadata: {
    extractionTimestamp: string | null
    lastEditedTimestamp: string | null
    lastCalculationTimestamp: string | null
    validationStatus: string
    validationErrors: string[]
  }
  financialYear: string
  intendedRegime: Form16Regime | null
  // Part 1: once the user clicks "Save and Continue" on the Review page this
  // flag is set to true. Any attempt to mutate `deductions` after finalization
  // throws in development and silently no-ops in production.
  isFinalized?: boolean
}

export interface CalculationTraceStep {
  step: string
  input: unknown
  formula: string
  output: unknown
  // Part 5: provenance of the value in `output`.
  // FORM16_OCR | INVESTMENT_RECORD | USER_INPUT | SYSTEM_DEFAULT | COMPUTED
  source?: string
}

export interface UnverifiedDeduction extends DeductionLineItem {
  status: DeductionStatus
  reason: string
}

export interface TaxRecommendation {
  id: string
  form16Id: string
  userId: string
  grossIncome: number
  recommendedRegime: Form16Regime
  savingsAmount: number
  explanation: string
  // Full per-regime waterfall traces (Old + New), computed from the same
  // gross salary and aggregated deductions so the user can compare and choose.
  regimes: { old: RegimeTrace; new: RegimeTrace }
  taxSavingSuggestions: TaxSavingSuggestion[]
  // Snapshot of the inputs the recommendation was computed from, so the saved
  // view stays consistent when revisited later.
  grossSalaryUsed: number
  totalDeductions: number
  deductionBreakdown: DeductionBreakdown[]
  // Audit fields (backend FY 2025-26 pipeline): a Gross-Salary vs component-sum
  // mismatch flag and the full machine-readable calculation trace.
  grossSalaryMismatch?: boolean
  mismatchDetail?: string | null
  debug?: Record<string, unknown> | null
  // Per-deduction provenance (Part 2) and the full step-by-step audit
  // trace (Part 9) for the saved recommendation.
  deductionLineItems?: DeductionLineItem[]
  calculationTrace?: CalculationTraceStep[]
  generatedAt: string
  isStale: boolean
}
