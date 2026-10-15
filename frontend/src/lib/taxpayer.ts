import type { Form16, TaxpayerContext as TaxpayerContextType, DeductionLineItem, GrossSalarySource } from '../types'

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

