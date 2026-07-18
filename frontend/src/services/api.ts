// Service layer for FinStack. Every call goes through the central `apiClient`
// instance (see ./apiClient) with `withCredentials`, so cookies/sessions work
// end-to-end through the Vite proxy to the Express backend.

import { apiClient } from './apiClient'
import { buildRegimeTrace } from '../lib/tax'
import type {
  AdHocExpense,
  AppNotification,
  DashboardSummary,
  EducationPayment,
  EMILoan,
  FamilyMember,
  Form16,
  Form16Regime,
  Income,
  Insurance,
  Investment,
  RecurringPayment,
  RegimeTrace,
  Subscription,
  TaxEstimate,
  TaxRecommendation,
  TaxRegimeResult,
  TaxSavingSuggestion,
  DeductionBreakdown,
  DeductionLineItem,
  CalculationTraceStep,
} from '../types'

export const dashboardService = {
  getSummary: (): Promise<DashboardSummary> =>
    apiClient.get('/dashboard').then((r) => r.data),
}

export const incomeService = {
  list: (): Promise<Income[]> => apiClient.get('/income').then((r) => r.data),
}

export const subscriptionService = {
  list: (frequency?: 'monthly' | 'yearly'): Promise<Subscription[]> =>
    apiClient
      .get('/subscriptions', { params: { frequency } })
      .then((r) => r.data),
}

export const recurringService = {
  list: (): Promise<RecurringPayment[]> =>
    apiClient.get('/recurring').then((r) => r.data),
}

export const investmentService = {
  list: (type?: string): Promise<Investment[]> =>
    apiClient.get('/investments', { params: { type } }).then((r) => r.data),
  summary: (): Promise<{ totalInvested: number; currentValue: number }> =>
    apiClient.get('/investments/summary').then((r) => r.data.overall),
}

export const loanService = {
  list: (): Promise<EMILoan[]> => apiClient.get('/loans').then((r) => r.data),
}

export const expenseService = {
  list: (): Promise<AdHocExpense[]> => apiClient.get('/expenses').then((r) => r.data),
}

export const insuranceService = {
  list: (): Promise<Insurance[]> => apiClient.get('/insurance').then((r) => r.data),
}

export const educationService = {
  list: (): Promise<EducationPayment[]> => apiClient.get('/education').then((r) => r.data),
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
  const { _id, __v, ...rest } = raw
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

export type ReportKind = 'monthly' | 'annual' | 'category' | 'tax'
export type ReportFormat = 'pdf' | 'excel'

// Reports are generated on demand and streamed back as binary blobs
// (application/pdf or .xlsx). The backend scopes every report to the
// requesting user (it ignores any memberId the client might send for
// non-admins), so no member scoping is needed on the client.
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

// Backend Form 16 docs use Mongo `_id`; normalize so the frontend `Form16`
// type (and all call sites) stay unchanged.
export function normalizeForm16(raw: Record<string, unknown>): Form16 {
  const id = String(raw._id ?? raw.id)
  const { _id, __v, ...rest } = raw
  return {
    ...(rest as unknown as Omit<Form16, 'id'>),
    id,
  }
}

export const form16Service = {
  list: (): Promise<Form16[]> =>
    apiClient
      .get('/form16')
      .then((r) => (r.data ?? []).map((f: Record<string, unknown>) => normalizeForm16(f))),

  get: (id: string): Promise<Form16 | undefined> =>
    apiClient
      .get(`/form16/${id}`)
      .then((r) => (r.data ? normalizeForm16(r.data) : undefined)),

  // POST /api/form16/upload — multipart PDF; backend extracts via Gemini and
  // returns { _id, sourceType } (the full record is fetched by the review screen).
  upload: (file: File): Promise<Form16> => {
    const fd = new FormData()
    fd.append('pdf', file)
    return apiClient.post('/form16/upload', fd).then((r) => normalizeForm16(r.data))
  },

  // POST /api/form16/manual — backend fills defaults; returns the created doc.
  createManual: (): Promise<Form16> =>
    apiClient.post('/form16/manual', {}).then((r) => normalizeForm16(r.data)),

  update: (id: string, patch: Partial<Form16>): Promise<Form16 | undefined> => {
    const { id: _omit, ...body } = patch
    return apiClient
      .put(`/form16/${id}`, body)
      .then((r) => (r.data ? normalizeForm16(r.data) : undefined))
  },

  // POST /api/form16/:id/duplicate
  duplicate: (id: string, financialYear?: string): Promise<Form16> =>
    apiClient
      .post(`/form16/${id}/duplicate`, financialYear ? { financialYear } : {})
      .then((r) => normalizeForm16(r.data)),

  // GET /api/form16/:id/deductions-preview
  // Returns the COMPLETE merged DeductionLineItem array from all three sources
  // (Form16 OCR + Investment Records + User Manual). Called by the Review page
  // on mount to populate TaxpayerContext.deductions before rendering.
  getDeductionsPreview: (id: string): Promise<{ deductions: import('../types').DeductionLineItem[]; isFinalized: boolean }> =>
    apiClient.get(`/form16/${id}/deductions-preview`).then((r) => r.data),

  // PATCH /api/form16/:id — store isFinalized + finalizedDeductions.
  // Called when the user clicks "Save and Continue" on the Review page.
  finalizeForm16: (id: string, finalizedDeductions: import('../types').DeductionLineItem[]): Promise<{ isFinalized: boolean }> =>
    apiClient.patch(`/form16/${id}`, { isFinalized: true, finalizedDeductions }).then((r) => r.data),

  remove: (id: string): Promise<void> =>
    apiClient.delete(`/form16/${id}`).then(() => undefined),

  // GET /api/form16/:id/recommendation — assemble the display shape from the
  // saved recommendation. The regime breakdowns are rebuilt from the SNAPSHOT
  // fields the backend stored (grossSalaryUsed / totalDeductions / per-regime
  // taxable income) so what the user sees matches exactly what was computed and
  // saved, even when revisited days later.
  getRecommendation: async (id: string): Promise<TaxRecommendation> => {
    const [recRes, f16Res] = await Promise.all([
      apiClient.get(`/form16/${id}/recommendation`),
      apiClient.get(`/form16/${id}`),
    ])
    const rec = recRes.data ?? {}
    const f16 = f16Res.data ? normalizeForm16(f16Res.data) : undefined

    // Prefer the saved snapshot; fall back to the raw Form 16 if missing.
    const gross = Number(rec.grossSalaryUsed ?? f16?.grossSalary ?? 0)
    const totalDed = Number(rec.totalDeductions ?? f16?.totalDeductions ?? 0)
    const oldTaxable = Number(rec.oldTaxableIncome ?? 0)
    const newTaxable = Number(rec.newTaxableIncome ?? 0)

    const suggestions: TaxSavingSuggestion[] = (
      (rec.taxSavingSuggestions as Array<{ suggestion?: string; potentialSaving?: number }>) ?? []
    ).map((s, i) => ({
      id: `sug-${i}`,
      title: s.suggestion ?? '',
      detail: s.suggestion ?? '',
      icon: 'savings',
      potentialSaving: Number(s.potentialSaving ?? 0),
    }))

    const breakdown: DeductionBreakdown[] = (
      (rec.deductionBreakdown as Array<{ section?: string; label?: string; amount?: number; note?: string }>) ?? []
    ).map((d) => ({
      section: d.section ?? '',
      label: d.label ?? '',
      amount: Number(d.amount ?? 0),
      note: d.note ?? '',
    }))

    // Prefer the full backend trace (authoritative, matches what was saved).
    // Fall back to a computed minimal trace only for recommendations that predate
    // the rich regimes trace.
    const oldTrace =
      (rec.regimes?.old as RegimeTrace | undefined) ??
      buildRegimeTrace('Old', gross, totalDed, oldTaxable)
    const newTrace =
      (rec.regimes?.new as RegimeTrace | undefined) ??
      buildRegimeTrace('New', gross, totalDed, newTaxable)

    return {
      id: `TAXREC-${id}`,
      form16Id: id,
      userId: f16?.userId ?? '',
      grossIncome: gross,
      recommendedRegime: (rec.recommendedRegime ?? 'New') as Form16Regime,
      savingsAmount: Number(rec.savingsAmount ?? 0),
      explanation: rec.explanation ?? '',
      regimes: { old: oldTrace, new: newTrace },
      taxSavingSuggestions: suggestions,
      grossSalaryUsed: gross,
      totalDeductions: totalDed,
      deductionBreakdown: breakdown,
      grossSalaryMismatch: Boolean(rec.grossSalaryMismatch),
      mismatchDetail: (rec.mismatchDetail as string | null) ?? null,
      debug: (rec.debug as Record<string, unknown> | null) ?? null,
      deductionLineItems: (rec.deductionLineItems as DeductionLineItem[]) ?? [],
      calculationTrace: (rec.calculationTrace as CalculationTraceStep[]) ?? [],
      generatedAt: f16?.updatedAt ?? '',
      isStale: Boolean(rec.isStale),
    }
  },
}
