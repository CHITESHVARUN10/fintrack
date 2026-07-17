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

export interface TaxEstimate {
  oldRegime: TaxRegimeResult
  newRegime: TaxRegimeResult
  recommended: 'Old' | 'New'
  savings: number
  tips: TaxTip[]
}

export interface TaxTip {
  id: string
  title: string
  detail: string
  potentialSaving: number
}

export interface DashboardSummary {
  monthlyIncome: number
  monthlyOutflow: number
  investmentsWorth: number
  netSavings: number
  deltas: { income: number; outflow: number; investments: number; savings: number }
  incomeVsExpense: { month: string; income: number; expense: number }[]
  breakdown: { label: string; value: number; color: string }[]
  upcomingPayments: UpcomingPayment[]
}

export interface UpcomingPayment {
  id: string
  name: string
  amount: number
  dueInDays: number
  icon: string
  color: 'yellow' | 'cyan' | 'white' | 'error'
  action: 'Pay Now' | 'Schedule'
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

export interface RegimeSlab {
  label: string
  tax: number
}

export interface RegimeBreakdown {
  regime: Form16Regime
  grossIncome: number
  deductionLabel: string
  deductions: number
  taxableIncome: number
  taxBeforeCess: number
  cess: number
  totalTax: number
  slabs: RegimeSlab[]
  note: string
}

export interface TaxRecommendation {
  id: string
  form16Id: string
  userId: string
  grossIncome: number
  oldRegimeTax: number
  newRegimeTax: number
  recommendedRegime: Form16Regime
  savingsAmount: number
  explanation: string
  oldBreakdown: RegimeBreakdown
  newBreakdown: RegimeBreakdown
  taxSavingSuggestions: TaxSavingSuggestion[]
  generatedAt: string
  isStale: boolean
}
