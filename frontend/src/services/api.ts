import type { LedgerTransaction, PaymentSuggestion, TransactionList, TransactionDetail, FamilyAnalytics, ImportResult, ApiMember, DuplicateGroup } from '../types/api'
// Service layer for FinStack. Every call goes through the central `apiClient`
// instance (see ./apiClient) with `withCredentials`, so cookies/sessions work
// end-to-end through the Vite proxy to the Express backend.

import { apiClient } from './apiClient'
import type {
  AdHocExpense,
  AppNotification,
  DashboardSummary,
  FamilyMember,
  Income,
  Investment,
  Subscription,
  TaxEstimate,
  TaxRegimeResult,
} from '../types'

export const dashboardService = {
  getSummary: (memberId?: string): Promise<DashboardSummary> =>
    apiClient.get(memberId ? `/dashboard/member/${memberId}` : '/dashboard').then((r) => r.data),
}

export const incomeService = {
  list: (): Promise<Income[]> => apiClient.get('/income').then((r) => r.data),
}

export const subscriptionService = {
  list: (params?: { frequency?: string }): Promise<Subscription[]> =>
    apiClient.get('/subscriptions', { params }).then((r) => r.data),
  get: (id: string): Promise<Subscription> =>
    apiClient.get(`/subscriptions/${id}`).then((r) => r.data),
  create: (payload: Record<string, unknown>): Promise<Subscription> =>
    apiClient.post('/subscriptions', payload).then((r) => r.data),
  update: (id: string, payload: Record<string, unknown>): Promise<Subscription> =>
    apiClient.put(`/subscriptions/${id}`, payload).then((r) => r.data),
  delete: (id: string): Promise<void> =>
    apiClient.delete(`/subscriptions/${id}`).then(() => undefined),
  getTransactions: (id: string): Promise<{ linked: LedgerTransaction[]; suggestions: LedgerTransaction[]; totalPaidPaise: number; totalCount: number }> =>
    apiClient.get(`/subscriptions/${id}/transactions`).then((r) => r.data),
  linkTransaction: (id: string, payload: { transactionId: string }) =>
    apiClient.post(`/subscriptions/${id}/link-transaction`, payload).then((r) => r.data),
  unlinkTransaction: (id: string, payload: { transactionId: string }) =>
    apiClient.post(`/subscriptions/${id}/unlink-transaction`, payload).then((r) => r.data),
  recordPayment: (id: string, payload: { amount?: number; date?: string; mode?: string; notes?: string; transactionId?: string }) =>
    apiClient.post(`/subscriptions/${id}/record-payment`, payload).then((r) => r.data),
  suggestions: (): Promise<{ suggestions: PaymentSuggestion[] }> =>
    apiClient.get('/subscriptions/suggestions').then((r) => r.data),
  applySuggestion: (id: string, payload: { acceptAmount?: number; acceptDate?: number; matchedTxIds?: string[] }) =>
    apiClient.post(`/subscriptions/${id}/apply-suggestion`, payload).then((r) => r.data),
  dismissSuggestion: (id: string) =>
    apiClient.post(`/subscriptions/${id}/dismiss-suggestion`).then((r) => r.data),
}

export const investmentService = {
  list: (type?: string): Promise<Investment[]> =>
    apiClient.get('/investments', { params: { type } }).then((r) => r.data),
  summary: (): Promise<{ totalInvested: number; currentValue: number }> =>
    apiClient.get('/investments/summary').then((r) => r.data.overall),
}

export const expenseService = {
  list: (): Promise<AdHocExpense[]> => apiClient.get('/expenses').then((r) => r.data),
}

export const taxService = {
  estimate: async (): Promise<TaxEstimate> => {
    const [est, tips] = await Promise.all([
      apiClient.get('/tax/estimate'),
      apiClient.get('/tax/tips'),
    ])
    const e = est.data
    const effectiveRate = (t: { totalTax: number }) =>
      e.grossIncome ? +((t.totalTax / e.grossIncome) * 100).toFixed(1) : 0
    const toRegime = (
      r: { taxableIncome: number; taxBeforeCess: number; cess: number; totalTax: number },
      regime: 'Old' | 'New',
    ): TaxRegimeResult => ({
      regime,
      grossIncome: e.grossIncome,
      deductions: e.deductions.totalDeductions,
      taxableIncome: r.taxableIncome,
      taxBeforeCess: r.taxBeforeCess,
      cess: r.cess,
      totalTax: r.totalTax,
      effectiveRate: effectiveRate(r),
    })
    return {
      grossIncome: e.grossIncome,
      deductions: e.deductions,
      oldRegime: toRegime(e.old, 'Old'),
      newRegime: toRegime(e.new, 'New'),
      recommended: e.recommended,
      savings: e.savings,
      tips: tips.data,
    }
  },
}

// Backend Notification docs use Mongo `_id`; normalize so `id` stays consistent
// across the UI (the `AppNotification` type uses `id`, not `_id`).
export function normalizeNotification(raw: Record<string, unknown>): AppNotification {
  const rest = { ...raw }; delete rest._id; delete rest.__v
  return {
    ...(rest as unknown as Omit<AppNotification, 'id'>),
    id: String(raw._id ?? raw.id),
  }
}

export const notificationService = {
  list: (): Promise<AppNotification[]> =>
    apiClient
      .get('/notifications')
      .then((r) => (r.data ?? []).map((n: Record<string, unknown>) => normalizeNotification(n))),

  // PUT /api/notifications/read-all — mark every notification for the user read.
  markAllRead: (): Promise<void> =>
    apiClient.put('/notifications/read-all').then(() => undefined),
}

export type ReportKind = 'monthly' | 'annual' | 'category' | 'tax' | 'family'
export type ReportFormat = 'pdf' | 'excel'

// Reports are generated on demand and streamed back as binary blobs
// (application/pdf or .xlsx). Family report is unified on Transaction ledger (source of truth).
export const reportService = {
  // GET /api/reports/:kind?...&format=pdf|excel — returns the file buffer.
  download: (
    kind: ReportKind,
    params: Record<string, string | number>,
    format: ReportFormat,
  ): Promise<Blob> =>
    apiClient
      .get(`/reports/${kind}`, {
        params: { ...params, format },
        responseType: 'blob',
      })
      .then((r) => r.data as Blob),
}

// Backend user documents use Mongo `_id`; normalize so the frontend
// `FamilyMember` type (and all call sites) stay unchanged.
export function normalizeMember(raw: Record<string, unknown>): FamilyMember {
  return {
    id: String(raw._id ?? raw.id),
    name: (raw.name as string) ?? '',
    email: (raw.email as string) ?? '',
    role: (raw.role as FamilyMember['role']) ?? 'member',
    familyAccountId: raw.familyAccountId ? String(raw.familyAccountId) : '',
    isActive: (raw.isActive as boolean) ?? true,
    createdAt: (raw.createdAt as string) ?? '',
  }
}

export const memberService = {
  list: (): Promise<FamilyMember[]> =>
    apiClient
      .get('/members')
      .then((r) => (r.data ?? []).map((m: Record<string, unknown>) => normalizeMember(m))),
}

export const familyService = {
  create: (payload: { name: string }) => apiClient.post('/families', payload).then((r) => r.data),
  me: () => apiClient.get('/families/me').then((r) => r.data),
  join: (inviteCode: string) => apiClient.post('/families/join', { inviteCode }).then((r) => r.data),
  members: (familyId: string) =>
    apiClient.get<{ family?: unknown; members: ApiMember[] }>(`/families/${familyId}/members`).then((r) => {
      const data = r.data
      if (data?.members) data.members = data.members.map((m) => normalizeMember(m as unknown as Record<string, unknown>)) as typeof data.members
      return r.data
    }),
  requests: (familyId: string) => apiClient.get(`/families/${familyId}/requests`).then((r) => r.data),
  review: (familyId: string, membershipId: string, action: 'accept' | 'reject') =>
    apiClient.patch(`/families/${familyId}/requests/${membershipId}`, { action }).then((r) => r.data),
  removeMember: (familyId: string, userId: string) =>
    apiClient.delete(`/families/${familyId}/members/${userId}`).then((r) => r.data),
  rotateCode: (familyId: string) => apiClient.post(`/families/${familyId}/rotate-code`).then((r) => r.data),
}

export const transactionService = {
  list: (params?: Record<string, string | number | boolean>) =>
    apiClient.get<TransactionList>('/transactions', { params }).then((r) => r.data),
  get: (id: string) => apiClient.get<TransactionDetail>(`/transactions/${id}`).then((r) => r.data),
  create: (payload: Record<string, unknown>) => apiClient.post('/transactions', payload).then((r) => r.data),
  update: (id: string, payload: Record<string, unknown>) => apiClient.patch(`/transactions/${id}`, payload).then((r) => r.data),
  resolve: (id: string, action: 'merge' | 'keepSeparate', targetId?: string) =>
    apiClient.post(`/transactions/${id}/resolve`, { action, targetId }).then((r) => r.data),
  bulkMergeDuplicates: (ids: string[]) =>
    apiClient.post('/transactions/bulk-merge-duplicates', { ids }).then((r) => r.data),
  duplicateGroups: (params?: Record<string, string | number | boolean>) =>
    apiClient.get<{ groups: DuplicateGroup[]; scanned: number }>('/transactions/duplicate-groups', { params }).then((r) => r.data),
}

export const analyticsService = {
  family: (params: Record<string,string>)=> apiClient.get<FamilyAnalytics>('/analytics/family', { params }).then(r=> r.data),
}
export const recipientService = {
  list: (params?: Record<string,string>)=> apiClient.get('/recipients', { params }).then(r=> r.data),
  teach: (payload: { label?: string; vendorKey?: string; upiId?: string; category: string })=> apiClient.post('/recipients', payload).then(r=> r.data),
  update: (id: string, payload: Record<string,string>)=> apiClient.put(`/recipients/${id}`, payload).then(r=> r.data),
  apply: (id: string, overwrite=false)=> apiClient.post(`/recipients/${id}/apply`, { overwrite }).then(r=> r.data),
}
export const importService = {
  bank: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiClient.post<ImportResult>('/imports/bank', fd).then((r) => r.data)
  },
  screenshot: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiClient.post<ImportResult>('/imports/screenshot', fd).then((r) => r.data)
  },
  batch: (id: string) => apiClient.get(`/imports/batches/${id}`).then((r) => r.data),
}
