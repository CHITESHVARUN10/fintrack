import { createContext, useContext, useReducer, type ReactNode } from 'react'
import type { Form16, TaxpayerContext as TaxpayerContextType, DeductionLineItem, GrossSalarySource } from '../types'

// -----------------------------------------------------------------------------
// Frontend mirror of the backend canonical TaxpayerContext (Part 1). This is the
// SINGLE source of truth for salary + deduction values on the Review page and the
// downstream Recommendation page. Edits flow through the reducer so no component
// keeps an independent copy of the numbers.
//
// NOTE: the Review page only has the Form 16 fields (not the user's investment /
// loan / insurance / education records). `fromForm16` below therefore builds the
// context from the Form 16 alone; the backend's `fromForm16` additionally
// merges the aggregated financial records. Both use the SAME slab constants
// (lib/tax.ts), so Form 16-only figures match across screens. The authoritative
// final numbers always come from the saved backend recommendation.
// -----------------------------------------------------------------------------

const SD: Record<'Old' | 'New', number> = { Old: 50000, New: 75000 }

export function computeHraExemptionFrontend(basicSalary: number, hra: number, rentPaid: number | null): number {
  if (!basicSalary || rentPaid == null) return 0
  const tenPct = 0.1 * basicSalary
  return Math.max(0, Math.min(hra || 0, tenPct, Math.max(0, rentPaid - tenPct)))
}

// Build a TaxpayerContext from a Form 16 record (mirrors backend builder).
export function fromForm16(record: Form16): TaxpayerContextType {
  const r = record
  const grossSalary = r.grossSalary ?? null
  const componentSum =
    (r.basicSalary || 0) + (r.hra || 0) + (r.specialAllowance || 0) + (r.lta || 0) + (r.otherAllowances || 0)
  const grossSalarySource: GrossSalarySource =
    grossSalary != null ? 'FORM16_EXPLICIT' : 'COMPONENT_SUM'

  const basic = r.basicSalary || 0
  const hra = r.hra || 0
  const rent = (r as Partial<Form16> & { rentPaid?: number }).rentPaid ?? null
  const hraExemption = computeHraExemptionFrontend(basic, hra, rent)

  const items: DeductionLineItem[] = []
  items.push({
    section: 'StandardDeduction',
    subtype: null,
    subtypeConfirmed: true,
    amount: r.standardDeduction || SD.Old,
    source: r.standardDeduction != null ? 'FORM16_OCR' : 'SYSTEM_DEFAULT',
    confidence: r.standardDeduction != null ? 95 : 100,
    needsConfirmation: false,
    notes: null,
    duplicateRisk: false,
  })
  items.push({
    section: 'HRA',
    subtype: null,
    subtypeConfirmed: rent != null,
    amount: hraExemption,
    source: rent != null ? 'FORM16_OCR' : null,
    confidence: rent != null ? 90 : 40,
    needsConfirmation: rent == null,
    notes: rent == null ? 'HRA exemption cannot be computed without rent-paid data.' : null,
    duplicateRisk: false,
  })
  if ((r.lta || 0) > 0) {
    items.push({
      section: 'LTA',
      subtype: null,
      subtypeConfirmed: true,
      amount: r.lta || 0,
      source: 'FORM16_OCR',
      confidence: 90,
      needsConfirmation: false,
      notes: null,
      duplicateRisk: false,
    })
  }

  const viat: Array<{ sec: string; val: number }> = [
    { sec: '80C', val: r.section80C || 0 },
    { sec: '80CCD', val: r.section80CCD || 0 },
    { sec: '80D', val: r.section80D || 0 },
    { sec: '80E', val: r.section80E || 0 },
    { sec: '24b', val: (r as unknown as Record<string, number>).section24 || 0 },
  ]
  for (const { sec, val } of viat) {
    if (val <= 0) continue // never invent a deduction
    if (sec === '80CCD') {
      items.push({
        section: '80CCD',
        subtype: null,
        subtypeConfirmed: false,
        amount: val,
        source: 'FORM16_OCR',
        confidence: 95,
        needsConfirmation: true,
        notes: 'Subsection unknown — could be 80CCD(1), 80CCD(1B), or 80CCD(2).',
        duplicateRisk: false,
      })
    } else {
      items.push({
        section: sec,
        subtype: sec,
        subtypeConfirmed: true,
        amount: val,
        source: 'FORM16_OCR',
        confidence: 95,
        needsConfirmation: false,
        notes: null,
        duplicateRisk: false,
      })
    }
  }

  return {
    salary: {
      grossSalary,
      basicSalary: basic,
      hra,
      specialAllowance: r.specialAllowance || 0,
      lta: r.lta || 0,
      otherAllowances: r.otherAllowances || 0,
      grossSalarySource,
      componentSum,
      tdsDeducted: r.tdsDeducted || 0,
      employeePAN: r.employeePAN || null,
    },
    deductions: items,
    computedIncome: { totalDeductions: 0, taxableIncomeOldRegime: 0, taxableIncomeNewRegime: 0 },
    taxResult: { oldRegime: null, newRegime: null },
    metadata: {
      extractionTimestamp: r.updatedAt || r.createdAt || null,
      lastEditedTimestamp: null,
      lastCalculationTimestamp: null,
      validationStatus: 'pending',
      validationErrors: [],
    },
    financialYear: r.financialYear || '2025-26',
    intendedRegime: r.taxRegimeUsed || null,
  }
}

interface State {
  base: Form16 | null
  ctx: TaxpayerContextType | null
}

type Action =
  | { type: 'LOAD'; record: Form16 }
  | { type: 'SET_FROM_FORM'; form: Partial<Form16> }
  | { type: 'LOAD_DEDUCTIONS'; items: DeductionLineItem[] }
  | { type: 'FINALIZE' }
  | { type: 'RESET' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOAD':
      return { base: action.record, ctx: fromForm16(action.record) }
    case 'RESET':
      return { base: null, ctx: null }
    case 'SET_FROM_FORM': {
      if (!state.base) return state
      // Part 1: isFinalized lock — once the user clicks "Save and Continue" no
      // further mutations are permitted. Throw in dev, no-op in prod.
      if (state.ctx?.isFinalized) {
        const msg = '[TaxpayerContext] Attempt to mutate deductions after isFinalized=true. ' +
          'Only call setFromForm before the user confirms the Review page.'
        if (import.meta.env.DEV) throw new Error(msg)
        console.error(msg)
        return state
      }
      const merged = { ...state.base, ...action.form }
      const ctx = fromForm16(merged)
      // A user edit marks the gross salary source accordingly (Part 1).
      if (ctx.salary.grossSalary != null) ctx.salary.grossSalarySource = 'USER_EDITED'
      ctx.metadata.lastEditedTimestamp = new Date().toISOString()
      return { base: merged, ctx }
    }
    case 'LOAD_DEDUCTIONS': {
      if (!state.ctx) return state
      // Part 1 / Final 3%: Replace ctx.deductions with the complete merged
      // array returned by GET /api/form16/:id/deductions-preview.
      // This is the authoritative list for the Review page — it includes
      // INVESTMENT_RECORD items (like 24b from loans) that the Form16-only
      // builder cannot produce.
      if (state.ctx.isFinalized) {
        // Already finalized — never mutate.
        return state
      }
      return {
        ...state,
        ctx: {
          ...state.ctx,
          deductions: action.items,
        },
      }
    }
    case 'FINALIZE':
      if (!state.ctx) return state
      return {
        ...state,
        ctx: {
          ...state.ctx,
          // Part 1: freeze the context — no more deduction mutations allowed.
          isFinalized: true,
          metadata: { ...state.ctx.metadata, lastCalculationTimestamp: new Date().toISOString() },
        },
      }
    default:
      return state
  }
}

interface TaxpayerContextValue {
  ctx: TaxpayerContextType | null
  load: (record: Form16) => void
  setFromForm: (form: Partial<Form16>) => void
  loadDeductions: (items: DeductionLineItem[]) => void
  finalize: () => void
  reset: () => void
}

const TaxpayerContext = createContext<TaxpayerContextValue | undefined>(undefined)

export function TaxpayerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { base: null, ctx: null })
  const value: TaxpayerContextValue = {
    ctx: state.ctx,
    load: (record) => dispatch({ type: 'LOAD', record }),
    setFromForm: (form) => dispatch({ type: 'SET_FROM_FORM', form }),
    loadDeductions: (items) => dispatch({ type: 'LOAD_DEDUCTIONS', items }),
    finalize: () => dispatch({ type: 'FINALIZE' }),
    reset: () => dispatch({ type: 'RESET' }),
  }
  return <TaxpayerContext.Provider value={value}>{children}</TaxpayerContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTaxpayerContext() {
  const ctx = useContext(TaxpayerContext)
  if (!ctx) throw new Error('useTaxpayerContext must be used within TaxpayerProvider')
  return ctx
}
