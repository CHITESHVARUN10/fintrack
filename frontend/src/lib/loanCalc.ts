// Pure EMI / amortization / prepayment helpers — reducing balance only (RBI)
// No side effects, no I/O, safe to use on FE and BE (mirrors backend/utils/loanCalc.js)

export interface AmortRow {
  month: number // 1..n
  date: string // ISO date for this EMI (YYYY-MM-DD)
  emi: number // integer rupees (rounded)
  principal: number // integer
  interest: number // integer
  opening: number
  closing: number
}

export interface YearRow {
  yearIndex: number // 1..
  yearLabel: string // e.g. "Year 1" or "2021"
  emiTotal: number
  principalTotal: number
  interestTotal: number
  closing: number
}

export interface CalcResult {
  emi: number // nearest rupee
  totalPayable: number
  totalInterest: number
  months: number
  schedule: AmortRow[]
  yearly: YearRow[]
}

export function calcEmiRaw(P: number, annualRatePct: number, n: number): number {
  if (!isFinite(P) || !isFinite(annualRatePct) || !isFinite(n) || n <= 0 || P <= 0) return 0
  const r = annualRatePct / 12 / 100
  if (r === 0) return P / n
  const pow = Math.pow(1 + r, n)
  return (P * r * pow) / (pow - 1)
}

export function calcEMI(P: number, annualRatePct: number, n: number): { emi: number; totalPayable: number; totalInterest: number } {
  const raw = calcEmiRaw(P, annualRatePct, n)
  const emi = Math.round(raw || 0)
  const totalPayable = emi * n
  const totalInterest = Math.max(0, totalPayable - P)
  return { emi, totalPayable, totalInterest }
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function addMonths(d: Date, months: number, emiDate?: number): Date {
  const year = d.getFullYear()
  const month = d.getMonth() + months
  const day = emiDate && emiDate >= 1 && emiDate <= 28 ? emiDate : d.getDate()
  // clamp to month length if needed
  const dt = new Date(year, month, 1)
  const maxDay = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()
  const useDay = Math.min(day, maxDay)
  dt.setDate(useDay)
  return dt
}

export function amortizationSchedule(
  P: number,
  annualRatePct: number,
  n: number,
  opts: { startDate?: string; emiDate?: number } = {},
): AmortRow[] {
  if (!P || !n || n <= 0) return []
  const r = annualRatePct / 12 / 100
  const rawEmi = calcEmiRaw(P, annualRatePct, n)
  const emiRounded = Math.round(rawEmi || 0)
  const start = opts.startDate ? new Date(opts.startDate) : new Date()
  const rows: AmortRow[] = []
  let opening = Math.round(P)

  for (let i = 1; i <= n; i++) {
    const interestExact = opening * r
    const interest = Math.round(interestExact)
    let principal = emiRounded - interest
    let emi = emiRounded
    if (principal < 0) principal = 0
    if (i === n) {
      // adjust last EMI to clear exactly
      principal = opening
      emi = principal + interest
    } else if (opening - principal < 0) {
      principal = opening
      emi = principal + interest
    }
    const closing = Math.max(0, opening - principal)
    // date for this EMI: start + (i-1) months, prefer emiDate
    const payDate = addMonths(start, i - 1, opts.emiDate)
    rows.push({
      month: i,
      date: toISODate(payDate),
      emi,
      principal,
      interest,
      opening,
      closing,
    })
    opening = closing
    if (closing <= 0) break
  }
  return rows
}

export function yearlySummary(rows: AmortRow[], startDate?: string): YearRow[] {
  if (!rows.length) return []
  const map = new Map<number, YearRow>()
  const baseYear = startDate ? new Date(startDate).getFullYear() : new Date().getFullYear()
  for (const r of rows) {
    const yIdx = Math.floor((r.month - 1) / 12) + 1
    const yr = baseYear + yIdx - 1
    const existing = map.get(yIdx)
    if (!existing) {
      map.set(yIdx, {
        yearIndex: yIdx,
        yearLabel: `Year ${yIdx} (${yr})`,
        emiTotal: r.emi,
        principalTotal: r.principal,
        interestTotal: r.interest,
        closing: r.closing,
      })
    } else {
      existing.emiTotal += r.emi
      existing.principalTotal += r.principal
      existing.interestTotal += r.interest
      existing.closing = r.closing
    }
  }
  return Array.from(map.values())
}

export function calcFull(P: number, annualRatePct: number, n: number, opts: { startDate?: string; emiDate?: number } = {}): CalcResult {
  const { emi, totalPayable, totalInterest } = calcEMI(P, annualRatePct, n)
  const schedule = amortizationSchedule(P, annualRatePct, n, opts)
  const yearly = yearlySummary(schedule, opts.startDate)
  return { emi, totalPayable, totalInterest, months: n, schedule, yearly }
}

// Prepayment impact
// k = already paid months (0..n), prepayAmount, whenOffsetMonths = k (where prepay happens)
// mode: 'tenure' keep EMI, shorten tenure; 'emi' keep tenure, reduce EMI
export interface PrepayInput {
  principal: number // original principal
  annualRatePct: number
  totalMonths: number // n
  paidMonths: number // k already paid
  emi: number // current emi (rounded)
  prepayAmount: number
  prepayAtMonth: number // 1-indexed month where prepayment is applied after that EMI (e.g. after k)
  mode: 'tenure' | 'emi'
  startDate?: string
  emiDate?: number
}

export interface PrepayResult {
  original: { emi: number; totalPayable: number; totalInterest: number; closeDate: string; months: number }
  withPrepay: { emi: number; totalPayable: number; totalInterest: number; closeDate: string; months: number; newOutstanding: number }
  interestSaved: number
  monthsSaved: number
  newSchedule: AmortRow[]
  outstandingAfterPrepay: number
}

export function monthsBetween(startDate: string, endDate: string | Date): number {
  const s = new Date(startDate)
  const e = new Date(endDate)
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  // if day >= emi day, count as full month? For paid count, clamp 0..total
  if (e.getDate() < s.getDate()) months -= 1
  return Math.max(0, months)
}

export function outstandingAfterK(schedule: AmortRow[], k: number): number {
  if (k <= 0) return schedule[0]?.opening ?? 0
  if (k >= schedule.length) return 0
  return schedule[k - 1].closing // after k payments
}

export function prepaymentImpact(inp: PrepayInput): PrepayResult {
  const { principal, annualRatePct, totalMonths, paidMonths, emi, prepayAmount, prepayAtMonth, mode, startDate, emiDate } = inp
  const r = annualRatePct / 12 / 100
  const schedule = amortizationSchedule(principal, annualRatePct, totalMonths, { startDate, emiDate })
  const originalPayable = emi * totalMonths
  const originalInterest = Math.max(0, originalPayable - principal)
  const originalClose = schedule.length ? schedule[schedule.length - 1].date : ''

  // k is prepayAtMonth (e.g. after paidMonths). Clamp.
  const k = Math.max(0, Math.min(prepayAtMonth ?? paidMonths, totalMonths))
  const outstandingK = outstandingAfterK(schedule, k)
  const prepay = Math.min(Math.max(0, prepayAmount), outstandingK)
  const newOutstanding = Math.max(0, outstandingK - prepay)

  if (newOutstanding <= 0) {
    const withMonths = k
    const withPayable = emi * k + prepay
    const withInterest = Math.max(0, withPayable - principal)
    // empty new schedule after close
    const newSchedule: AmortRow[] = schedule.slice(0, k)
    return {
      original: { emi, totalPayable: originalPayable, totalInterest: originalInterest, closeDate: originalClose, months: totalMonths },
      withPrepay: { emi: emi, totalPayable: withPayable, totalInterest: withInterest, closeDate: k ? schedule[k - 1]?.date ?? '' : '', months: withMonths, newOutstanding },
      interestSaved: Math.max(0, originalInterest - withInterest),
      monthsSaved: Math.max(0, totalMonths - withMonths),
      newSchedule,
      outstandingAfterPrepay: newOutstanding,
    }
  }

  if (mode === 'emi') {
    // keep remaining tenure same, recompute EMI
    const nRem = totalMonths - k
    const newEmiRaw = r === 0 ? newOutstanding / nRem : (newOutstanding * r * Math.pow(1 + r, nRem)) / (Math.pow(1 + r, nRem) - 1)
    const newEmi = Math.round(newEmiRaw)
    const withPayable = emi * k + newEmi * nRem + prepay
    const withInterest = Math.max(0, withPayable - principal)
    const newScheduleTail = amortizationSchedule(newOutstanding, annualRatePct, nRem, {
      startDate: k < schedule.length ? schedule[k]?.date : schedule[schedule.length - 1]?.date,
      emiDate,
    }).map((row, idx) => ({ ...row, month: k + idx + 1 }))
    const newSchedule = [...schedule.slice(0, k), ...newScheduleTail]
    // adjust emi in tail to newEmi already via schedule generation
    const closeDate = newSchedule.length ? newSchedule[newSchedule.length - 1].date : originalClose
    const withPayableExact = emi * k + newScheduleTail.reduce((s, x) => s + x.emi, 0) + prepay
    const interestExact = Math.max(0, withPayableExact - principal)
    return {
      original: { emi, totalPayable: originalPayable, totalInterest: originalInterest, closeDate: originalClose, months: totalMonths },
      withPrepay: { emi: newEmi, totalPayable: withPayableExact, totalInterest: interestExact, closeDate, months: totalMonths, newOutstanding },
      interestSaved: Math.max(0, originalInterest - interestExact),
      monthsSaved: 0,
      newSchedule,
      outstandingAfterPrepay: newOutstanding,
    }
  } else {
    // tenure reduction: keep EMI same, reduce months
    let nPrime: number
    if (r === 0) {
      nPrime = Math.ceil(newOutstanding / emi)
    } else {
      const denom = 1 - (newOutstanding * r) / emi
      if (denom <= 0) {
        // EMI too small to cover interest, fallback to original remaining
        nPrime = totalMonths - k
      } else {
        nPrime = Math.ceil(-Math.log(denom) / Math.log(1 + r))
      }
    }
    nPrime = Math.max(0, Math.min(nPrime, totalMonths - k))
    const newTail = amortizationSchedule(newOutstanding, annualRatePct, nPrime, {
      startDate: k < schedule.length ? schedule[k]?.date : schedule[schedule.length - 1]?.date,
      emiDate,
    }).map((row, idx) => ({ ...row, month: k + idx + 1 }))
    const withPayableExact = emi * k + newTail.reduce((s, x) => s + x.emi, 0) + prepay
    const withInterest = Math.max(0, withPayableExact - principal)
    const newSchedule = [...schedule.slice(0, k), ...newTail]
    const closeDate = newSchedule.length ? newSchedule[newSchedule.length - 1].date : originalClose
    return {
      original: { emi, totalPayable: originalPayable, totalInterest: originalInterest, closeDate: originalClose, months: totalMonths },
      withPrepay: { emi, totalPayable: withPayableExact, totalInterest: withInterest, closeDate, months: k + nPrime, newOutstanding },
      interestSaved: Math.max(0, originalInterest - withInterest),
      monthsSaved: Math.max(0, totalMonths - (k + nPrime)),
      newSchedule,
      outstandingAfterPrepay: newOutstanding,
    }
  }
}

export function validateLoanInputs(P: number, rate: number, n: number): string[] {
  const errs: string[] = []
  if (!P || P <= 0) errs.push('Amount must be > 0')
  if (P < 1000) errs.push('Amount too small (min ₹1,000)')
  if (P > 100000000) errs.push('Amount too large (max ₹10Cr)')
  if (rate < 0) errs.push('Rate cannot be negative')
  if (rate > 30) errs.push('Rate too high (max 30%)')
  if (!Number.isFinite(n) || n < 1) errs.push('Tenure must be at least 1 month')
  if (n > 360) errs.push('Tenure too long (max 360 months)')
  return errs
}
