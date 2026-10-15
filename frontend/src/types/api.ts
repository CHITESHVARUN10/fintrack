import type { CanonicalTransaction, SourceRecord, FamilyMember, EMILoan, Subscription, Investment } from './index'
import type { AmortRow, YearRow } from '../lib/loanCalc'
export type Raw<T> = T & { _id: string }
export interface LineItem { productName?: string; productRef?: string; category?: string; subcategory?: string; amountPaise: number; quantity?: number; unit?: string }
export interface LedgerTransaction extends Omit<CanonicalTransaction, 'createdBy' | 'familyTransfer'> {
  createdBy: string | { _id: string; name: string; email?: string }
  familyTransfer?: { fromUserId: string | { name: string }; toUserId: string | { name: string } }
  subcategory?: string; productName?: string; productRef?: string; lineItems?: LineItem[]
  categorySplit?: { category: string; amountPaise: number }[]
  loanRef?: string | Raw<EMILoan> | null; subscriptionRef?: string | Raw<Subscription> | null
  loanMeta?: { isPrepayment?: boolean; isLoanPayment?: boolean }; recipientVendorRef?: string | Vendor
  notes?: string; candidateOf?: string; upiId?: string; utr?: string; UTR?: string; utu?: string
}
export interface LedgerSummary { actualExpenditurePaise: number; internalTransfersPaise: number; cashWithdrawalsPaise: number; totalMovementPaise: number; cashRemainingPaise: number; cashSpentPaise: number; cashWithdrawnPaise: number }
export interface TransactionList { items: LedgerTransaction[]; summary: LedgerSummary }
export interface TransactionDetail { transaction: LedgerTransaction; sources: SourceRecord[]; candidateOfTx?: LedgerTransaction | null }
export interface CompareData { items: LedgerTransaction[]; sourcesByTx: Record<string, SourceRecord[]> }
export interface DuplicateGroup { key: string; type: string; amountPaise: number; reason: string; items: LedgerTransaction[]; count?: number }
export interface MergeResult { error?: string; kept?: number; voided?: number; groups?: { amountPaise: number; count: number }[] }
export interface CategorizeResult { error?: string; scanned?: number; updated?: number; stillOther?: number; details?: { id: string; oldCategory: string; newCategory: string; confidence: number; amount: number; rule?: string }[] }
export interface VendorProduct { _id: string; name: string; productName?: string; category: string; subcategory?: string; typicalAmountPaise?: number; hits: number; lastSeen?: string; product?: VendorProduct }
export interface Vendor { _id: string; label: string; vendorKey: string; upiId?: string; primaryCategory?: string; category?: string; description?: string; notes?: string; aliases?: string[]; contact?: { phone?: string; preferredMode?: string; address?: string }; offerings: { category: string; hits: number; subcategories?: string[] }[]; products: VendorProduct[]; hits: number; lastSeen?: string; createdBy?: { name: string } }
export interface VendorSummary { totalPaise: number; count: number; byCategory: Record<string, number>; bySubcategory: Record<string, number>; byProduct: Record<string, number>; byMember: { name: string; spend: number; count: number }[]; monthlyBuckets: { month: string; spend: number }[] }
export interface Budget { _id: string; scope: string; category?: string; memberId?: string; period: string; amountPaise: number; spentPaise: number }
export interface PaymentSuggestion { id: string; name: string; kind: string; suggestedAmount: number; suggestedDate: number; matchedTxIds: string[]; confidence: number; currentAmount: number; currentDate: number; reason?: string; current: { amount: number; billingDate: number }; suggested?: { amount: number; billingDate: number }; amountDriftPct: number; matchedCount: number; sample?: { date: string; amount: number; recipient?: string }[] }
export interface LinkedTransactions { linked: LedgerTransaction[]; suggestions: LedgerTransaction[]; totalPaidPaise: number; totalPaidFromLinked: number; totalCount: number }
export interface LoanSchedule { loan: Raw<EMILoan>; schedule: AmortRow[]; yearly: YearRow[]; paid: AmortRow[]; future: AmortRow[]; totalInterest: number; totalPayable: number }
export interface ImportResult { status: string; batch?: { total: number; createdAt: string }; fileName?: string; batchId: string; total: number; message?: string; duplicateOf?: string; periodFrom?: string; periodTo?: string; summary?: { created: number; reconciled: number; pendingReview: number; deduped: number; failed: number }; parsed?: { amountPaise: number; recipient?: { name?: string }; occurredAt?: string }; transaction?: LedgerTransaction }
export interface SpendRow { name: string; category: string; vendor: string; mode: string; spend: number; spendPaise: number; count: number; sharePct: number; memberId: string; memberName: string }
export interface SpendDay { date: string; spend: number; spendPaise: number }
export interface FamilyAnalytics { summary: LedgerSummary; timeSeries: SpendDay[]; byMember: SpendRow[]; byCategory: SpendRow[]; topVendors: SpendRow[]; byMode: SpendRow[]; heatmap: SpendDay[]; highestDay: SpendDay | null; avgDaily: number; totalCount: number; byMemberShare: SpendRow[]; byCategoryShare: SpendRow[]; byVendorShare: SpendRow[]; byModeShare: SpendRow[]; monthlyArea: { month: string; expense: number; income: number; net: number }[]; byMemberByVendor: SpendRow[] }
export type ApiMember = Raw<FamilyMember>
export type RawLoan = Raw<EMILoan>
export type RawSubscription = Raw<Subscription>
export type RawInvestment = Raw<Investment> & { name?: string }
