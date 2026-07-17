// Service layer for FinStack.
//
// Today every call resolves from the in-memory mock data in `data/mock.ts`.
// When the backend is ready, flip USE_MOCK to false and the axios-based
// branch (TODO stubs) will be used — call sites in the UI never change.

import axios from 'axios'
import {
  dashboardSummary,
  draftForm16,
  educationPayments,
  expenses,
  form16Records,
  incomes,
  insurances,
  investments,
  loans,
  members,
  notifications,
  recurringPayments,
  subscriptions,
  taxEstimate,
  taxRecommendation,
} from '../data/mock'
import type {
  AdHocExpense,
  AppNotification,
  DashboardSummary,
  EducationPayment,
  EMILoan,
  Form16,
  Income,
  Insurance,
  Investment,
  RecurringPayment,
  Subscription,
  TaxEstimate,
  TaxRecommendation,
} from '../types'

const USE_MOCK = true

// Simulate network latency so loading states are exercised.
const delay = <T>(data: T, ms = 250): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), ms))

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

// Mutable in-memory stores for the Form 16 flow so create/update/duplicate
// behave realistically within a session.
const form16Store: Form16[] = [
  ...form16Records.map((r) => ({ ...r })),
  { ...draftForm16 },
]
const recommendationStore: Record<string, TaxRecommendation> = {
  [taxRecommendation.form16Id]: { ...taxRecommendation },
}
let form16Seq = 100

// Re-export raw mock collections where the UI may need a synchronous list
// (e.g. select options). Not used by async service calls.
export const mockCollections = {
  incomes,
  subscriptions,
  recurringPayments,
  investments,
  loans,
  expenses,
  insurances,
  educationPayments,
  notifications,
  members,
  form16: form16Store,
}

export const dashboardService = {
  getSummary: (): Promise<DashboardSummary> => {
    if (!USE_MOCK) return api.get('/dashboard').then((r) => r.data)
    return delay(dashboardSummary)
  },
}

export const incomeService = {
  list: (): Promise<Income[]> => {
    if (!USE_MOCK) return api.get('/income').then((r) => r.data)
    return delay(incomes)
  },
}

export const subscriptionService = {
  list: (frequency?: 'monthly' | 'yearly'): Promise<Subscription[]> => {
    if (!USE_MOCK)
      return api.get('/subscriptions', { params: { frequency } }).then((r) => r.data)
    const filtered = frequency
      ? subscriptions.filter((s) => s.frequency === frequency)
      : subscriptions
    return delay(filtered)
  },
}

export const recurringService = {
  list: (): Promise<RecurringPayment[]> => {
    if (!USE_MOCK) return api.get('/recurring').then((r) => r.data)
    return delay(recurringPayments)
  },
}

export const investmentService = {
  list: (type?: string): Promise<Investment[]> => {
    if (!USE_MOCK)
      return api.get('/investments', { params: { type } }).then((r) => r.data)
    const filtered = type
      ? investments.filter((i) => i.investmentType === type)
      : investments
    return delay(filtered)
  },
  summary: (): Promise<{ totalInvested: number; currentValue: number }> => {
    if (!USE_MOCK) return api.get('/investments/summary').then((r) => r.data)
    const totalInvested = investments.reduce((s, i) => s + i.totalInvested, 0)
    const currentValue = investments.reduce((s, i) => s + i.currentValue, 0)
    return delay({ totalInvested, currentValue })
  },
}

export const loanService = {
  list: (): Promise<EMILoan[]> => {
    if (!USE_MOCK) return api.get('/loans').then((r) => r.data)
    return delay(loans)
  },
}

export const expenseService = {
  list: (): Promise<AdHocExpense[]> => {
    if (!USE_MOCK) return api.get('/expenses').then((r) => r.data)
    return delay(expenses)
  },
}

export const insuranceService = {
  list: (): Promise<Insurance[]> => {
    if (!USE_MOCK) return api.get('/insurance').then((r) => r.data)
    return delay(insurances)
  },
}

export const educationService = {
  list: (): Promise<EducationPayment[]> => {
    if (!USE_MOCK) return api.get('/education').then((r) => r.data)
    return delay(educationPayments)
  },
}

export const taxService = {
  estimate: (): Promise<TaxEstimate> => {
    if (!USE_MOCK) return api.get('/tax/estimate').then((r) => r.data)
    return delay(taxEstimate)
  },
}

export const notificationService = {
  list: (): Promise<AppNotification[]> => {
    if (!USE_MOCK) return api.get('/notifications').then((r) => r.data)
    return delay(notifications)
  },
  unreadCount: (): Promise<number> => {
    const count = notifications.filter((n) => !n.isRead).length
    return delay(count)
  },
}

export const memberService = {
  list: (): Promise<typeof members> => {
    if (!USE_MOCK) return api.get('/members').then((r) => r.data)
    return delay(members)
  },
}

export const form16Service = {
  list: (): Promise<Form16[]> => {
    if (!USE_MOCK) return api.get('/form16').then((r) => r.data)
    // Exclude in-progress drafts from the saved list.
    const list = form16Store.filter((f) => f.status !== 'Draft')
    return delay(list)
  },

  get: (id: string): Promise<Form16 | undefined> => {
    if (!USE_MOCK) return api.get(`/form16/${id}`).then((r) => r.data)
    return delay(form16Store.find((f) => f.id === id))
  },

  // Simulates POST /api/form16/upload — returns the extracted (draft) record.
  upload: (): Promise<Form16> => {
    if (!USE_MOCK) {
      // POST multipart to /api/form16/upload; returns created id.
      return api.post('/form16/upload').then((r) => r.data)
    }
    const draft = form16Store.find((f) => f.id === draftForm16.id)
    return delay(draft ? { ...draft } : { ...draftForm16 })
  },

  // Simulates POST /api/form16/manual — blank record to fill in.
  createManual: (financialYear = '2025-26'): Promise<Form16> => {
    if (!USE_MOCK) return api.post('/form16/manual').then((r) => r.data)
    const id = `F16-${++form16Seq}`
    const now = '2026-07-16'
    const record: Form16 = {
      id,
      userId: 'm1',
      financialYear,
      employeeName: '',
      employeePAN: '',
      employeeDesignation: '',
      employeeCode: '',
      employeeAddress: '',
      employerName: '',
      employerTAN: '',
      employerPAN: '',
      employerAddress: '',
      basicSalary: 0,
      hra: 0,
      specialAllowance: 0,
      lta: 0,
      otherAllowances: 0,
      grossSalary: 0,
      standardDeduction: 50000,
      professionalTax: 0,
      section80C: 0,
      section80D: 0,
      section80E: 0,
      section80G: 0,
      section80CCD: 0,
      totalDeductions: 50000,
      taxableIncome: 0,
      taxOnIncome: 0,
      rebate87A: 0,
      educationCess: 0,
      totalTaxPayable: 0,
      tdsDeducted: 0,
      taxRegimeUsed: 'New',
      sourceType: 'Manual',
      originalForm16Id: null,
      pdfReference: null,
      isEdited: false,
      status: 'Draft',
      createdAt: now,
      updatedAt: now,
    }
    form16Store.push(record)
    return delay(record)
  },

  update: (id: string, patch: Partial<Form16>): Promise<Form16 | undefined> => {
    if (!USE_MOCK) return api.put(`/form16/${id}`, patch).then((r) => r.data)
    const idx = form16Store.findIndex((f) => f.id === id)
    if (idx === -1) return delay(undefined)
    form16Store[idx] = {
      ...form16Store[idx],
      ...patch,
      isEdited: true,
      status: 'Processed',
      updatedAt: '2026-07-16',
    }
    // Mark any linked recommendation stale (mock: regenerate lazily).
    if (recommendationStore[id]) recommendationStore[id].isStale = true
    return delay(form16Store[idx])
  },

  // Simulates POST /api/form16/:id/duplicate.
  duplicate: (id: string, newName?: string): Promise<Form16> => {
    if (!USE_MOCK) return api.post(`/form16/${id}/duplicate`).then((r) => r.data)
    const src = form16Store.find((f) => f.id === id)
    const newId = `F16-${++form16Seq}`
    const now = '2026-07-16'
    const copy: Form16 = {
      ...(src ?? draftForm16),
      id: newId,
      financialYear: newName?.replace(/^FY\s*/, '') || src?.financialYear || '2025-26',
      sourceType: 'Duplicate',
      originalForm16Id: id,
      isEdited: false,
      status: 'Processed',
      createdAt: now,
      updatedAt: now,
    }
    form16Store.push(copy)
    return delay(copy)
  },

  remove: (id: string): Promise<void> => {
    if (!USE_MOCK) return api.delete(`/form16/${id}`).then(() => undefined)
    const idx = form16Store.findIndex((f) => f.id === id)
    if (idx !== -1) form16Store.splice(idx, 1)
    delete recommendationStore[id]
    return delay(undefined)
  },

  // Simulates GET /api/form16/:id/recommendation (cached or regenerated).
  getRecommendation: (id: string): Promise<TaxRecommendation> => {
    if (!USE_MOCK) return api.get(`/form16/${id}/recommendation`).then((r) => r.data)
    if (!recommendationStore[id]) {
      // Regenerate from the base mock for any requested id.
      recommendationStore[id] = {
        ...taxRecommendation,
        id: `TAXREC-${id}`,
        form16Id: id,
        isStale: false,
      }
    } else if (recommendationStore[id].isStale) {
      recommendationStore[id] = { ...recommendationStore[id], isStale: false }
    }
    return delay(recommendationStore[id])
  },
}
