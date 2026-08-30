import { useMemo, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Field'
import { Icon } from '../ui/Icon'
import { formatCurrency, formatDate } from '../../lib/format'
import type { EMILoan } from '../../types'
import { calcEMI, prepaymentImpact, monthsBetween, yearlySummary } from '../../lib/loanCalc'

function csvDownload(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

interface PrepaymentPlannerModalProps {
  open: boolean
  onClose: () => void
  loan: EMILoan
  onRecordPrepayment?: (amount: number) => void
}

export function PrepaymentPlannerModal({
  open,
  onClose,
  loan,
  onRecordPrepayment,
}: PrepaymentPlannerModalProps) {
  const principal = Number(loan.principalAmount || 0)
  const rate = Number(loan.interestRate || 0)
  const tenure = Number(loan.tenureMonths || 240)
  const currentEmi = Number(loan.emiAmount || calcEMI(principal, rate, tenure).emi)
  const outstanding = Number(loan.outstandingAmount || principal)
  const startDate = loan.startDate ? String(loan.startDate).slice(0, 10) : new Date().toISOString().slice(0, 10)
  const emiDate = Number(loan.emiDate || 5)

  const paidMonthsDerived = useMemo(() => {
    const elapsed = monthsBetween(startDate, new Date())
    return Math.min(tenure, Math.max(0, elapsed))
  }, [startDate, tenure])

  const [prepayAmountStr, setPrepayAmountStr] = useState('100000')
  const [prepayMonthOffset, setPrepayMonthOffset] = useState(String(Math.min(tenure - 1, paidMonthsDerived)))
  const [mode, setMode] = useState<'tenure' | 'emi'>('tenure')
  const [view, setView] = useState<'yearly' | 'monthly'>('yearly')

  const prepayAmount = Math.max(0, Math.min(outstanding, Number(prepayAmountStr) || 0))
  const prepayAtMonth = Math.max(0, Math.min(tenure - 1, Number(prepayMonthOffset) || 0))

  const impact = useMemo(() => {
    if (!principal || !tenure || rate < 0) return null
    return prepaymentImpact({
      principal,
      annualRatePct: rate,
      totalMonths: tenure,
      paidMonths: paidMonthsDerived,
      emi: currentEmi,
      prepayAmount,
      prepayAtMonth,
      mode,
      startDate,
      emiDate,
    })
  }, [principal, rate, tenure, paidMonthsDerived, currentEmi, prepayAmount, prepayAtMonth, mode, startDate, emiDate])

  const yearlyNewSchedule = useMemo(() => {
    if (!impact) return []
    return yearlySummary(impact.newSchedule, startDate)
  }, [impact, startDate])

  function handleQuickAdd(addAmt: number) {
    const current = Number(prepayAmountStr) || 0
    const next = Math.min(outstanding, current + addAmt)
    setPrepayAmountStr(String(next))
  }

  function handleExportCsv() {
    if (!impact) return
    let csv = ''
    if (view === 'monthly') {
      csv += 'Month,Date,EMI,Principal,Interest,Opening,Closing\n'
      for (const r of impact.newSchedule) {
        csv += `${r.month},${r.date},${r.emi},${r.principal},${r.interest},${r.opening},${r.closing}\n`
      }
    } else {
      csv += 'Year,Label,EMI Total,Principal,Interest,Closing\n'
      for (const y of yearlyNewSchedule) {
        csv += `${y.yearIndex},${y.yearLabel},${y.emiTotal},${y.principalTotal},${y.interestTotal},${y.closing}\n`
      }
    }
    csvDownload(`prepayment-plan-${loan.loanName}-${prepayAmount}-${mode}-${view}.csv`, csv)
  }

  function handleExportPdf() {
    if (!impact) return
    const rowsHtml = view === 'monthly'
      ? `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:monospace;font-size:11px"><tr><th>Month</th><th>Date</th><th>EMI</th><th>Principal</th><th>Interest</th><th>Closing</th></tr>${impact.newSchedule.map(r=>`<tr><td>${r.month}</td><td>${r.date}</td><td>${r.emi}</td><td>${r.principal}</td><td>${r.interest}</td><td>${r.closing}</td></tr>`).join('')}</table>`
      : `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:monospace;font-size:11px"><tr><th>Year</th><th>EMI</th><th>Principal</th><th>Interest</th><th>Closing</th></tr>${yearlyNewSchedule.map(y=>`<tr><td>${y.yearLabel}</td><td>${y.emiTotal}</td><td>${y.principalTotal}</td><td>${y.interestTotal}</td><td>${y.closing}</td></tr>`).join('')}</table>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<html><head><title>Prepayment Plan — ${loan.loanName}</title></head><body><h2>Prepayment Plan: ₹${prepayAmount.toLocaleString('en-IN')} (${mode === 'tenure' ? 'Reduce Tenure' : 'Reduce EMI'})</h2><p>Loan: ${loan.loanName} · Principal ₹${principal.toLocaleString('en-IN')} · Rate ${rate}% · Outstanding ₹${outstanding.toLocaleString('en-IN')}</p><p><b>Interest Saved: ₹${impact.interestSaved.toLocaleString('en-IN')}</b> · <b>Months Saved: ${impact.monthsSaved} mo (${(impact.monthsSaved/12).toFixed(1)} yrs)</b> · New Close: ${formatDate(impact.withPrepay.closeDate)}</p>${rowsHtml}<p style="font-size:10px;opacity:0.6">Reducing balance calculation (RBI). Last EMI adjusted. Subject to bank confirmation.</p></body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  return (
    <Modal open={open} onClose={onClose} title={`Prepay Check — ${loan.loanName}`} width="max-w-4xl">
      <div className="flex flex-col gap-md">
        {/* Banner */}
        <div className="brutal bg-brand-yellow p-sm text-xs font-bold flex items-center justify-between">
          <span>
            Simulate prepayment on your active loan. Compare interest saved, tenure reduction, and new payoff dates.
          </span>
          <span className="brutal-thin bg-white px-xs py-0.5 text-[11px] font-bold">
            Outstanding: {formatCurrency(outstanding)}
          </span>
        </div>

        {/* Inputs Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-md bg-surface-container-low p-md brutal-thin">
          <div className="flex flex-col gap-xs md:col-span-2">
            <Field label="Prepayment Amount (₹)">
              <div className="flex">
                <span className="bg-surface-container-high border-[3px] border-r-0 border-on-surface px-3 flex items-center font-bold">
                  ₹
                </span>
                <Input
                  type="number"
                  placeholder="100000"
                  value={prepayAmountStr}
                  onChange={(e) => setPrepayAmountStr(e.target.value)}
                  className="border-l-0"
                />
              </div>
              <input
                type="range"
                min={10000}
                max={outstanding || 1000000}
                step={10000}
                value={String(prepayAmount)}
                onChange={(e) => setPrepayAmountStr(e.target.value)}
                className="w-full mt-sm"
              />
            </Field>
            {/* Quick Increment Pills */}
            <div className="flex flex-wrap gap-xs mt-1">
              <button
                type="button"
                onClick={() => handleQuickAdd(25000)}
                className="brutal-thin bg-white px-xs py-0.5 text-xs font-bold hover:bg-brand-yellow"
              >
                +₹25k
              </button>
              <button
                type="button"
                onClick={() => handleQuickAdd(50000)}
                className="brutal-thin bg-white px-xs py-0.5 text-xs font-bold hover:bg-brand-yellow"
              >
                +₹50k
              </button>
              <button
                type="button"
                onClick={() => handleQuickAdd(100000)}
                className="brutal-thin bg-white px-xs py-0.5 text-xs font-bold hover:bg-brand-yellow"
              >
                +₹1L
              </button>
              <button
                type="button"
                onClick={() => handleQuickAdd(200000)}
                className="brutal-thin bg-white px-xs py-0.5 text-xs font-bold hover:bg-brand-yellow"
              >
                +₹2L
              </button>
              <button
                type="button"
                onClick={() => handleQuickAdd(500000)}
                className="brutal-thin bg-white px-xs py-0.5 text-xs font-bold hover:bg-brand-yellow"
              >
                +₹5L
              </button>
              <button
                type="button"
                onClick={() => setPrepayAmountStr(String(outstanding))}
                className="brutal-thin bg-brand-yellow px-xs py-0.5 text-xs font-bold hover:bg-white"
              >
                Full Prepay
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-sm">
            <Field label={`Prepay Timing (After Month #${prepayAtMonth})`}>
              <Input
                type="number"
                min={0}
                max={tenure - 1}
                value={prepayMonthOffset}
                onChange={(e) => setPrepayMonthOffset(e.target.value)}
              />
              <input
                type="range"
                min={0}
                max={tenure - 1}
                value={String(prepayAtMonth)}
                onChange={(e) => setPrepayMonthOffset(e.target.value)}
                className="w-full mt-sm"
              />
              <span className="text-[11px] opacity-70">
                {prepayAtMonth === paidMonthsDerived ? 'Next EMI Date' : `Month ${prepayAtMonth} from start`}
              </span>
            </Field>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="flex flex-col gap-xs">
          <label className="text-xs uppercase font-bold tracking-wider opacity-70">
            Prepayment Strategy
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
            <button
              type="button"
              onClick={() => setMode('tenure')}
              className={`brutal p-sm text-left flex flex-col gap-1 transition-all ${
                mode === 'tenure' ? 'bg-brand-yellow ring-2 ring-on-surface' : 'bg-white hover:bg-surface-container-low'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">Option A: Reduce Tenure</span>
                <span className="brutal-thin bg-white px-xs py-0.5 text-[10px] font-bold uppercase">
                  ⭐ Recommended (Max Savings)
                </span>
              </div>
              <span className="text-xs opacity-80">
                Keeps your monthly EMI constant at {formatCurrency(currentEmi)}, shortening loan duration and saving the maximum interest.
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMode('emi')}
              className={`brutal p-sm text-left flex flex-col gap-1 transition-all ${
                mode === 'emi' ? 'bg-brand-yellow ring-2 ring-on-surface' : 'bg-white hover:bg-surface-container-low'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">Option B: Reduce Monthly EMI</span>
                <span className="brutal-thin bg-white px-xs py-0.5 text-[10px] font-bold uppercase">
                  Cash Flow Relief
                </span>
              </div>
              <span className="text-xs opacity-80">
                Keeps tenure the same, lowering your monthly EMI payment to free up cash flow immediately.
              </span>
            </button>
          </div>
        </div>

        {impact && (
          <>
            {/* Hero Benefit Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
              <div className="brutal bg-tertiary-container text-on-tertiary-container p-md">
                <div className="text-xs uppercase font-bold tracking-wider opacity-80">
                  Total Interest Saved
                </div>
                <div className="text-3xl font-bold mt-1">
                  {formatCurrency(impact.interestSaved)}
                </div>
                <div className="text-xs opacity-80 mt-1">
                  Net direct money saved in interest
                </div>
              </div>

              <div className="brutal bg-white p-md">
                <div className="text-xs uppercase font-bold tracking-wider opacity-70">
                  {mode === 'tenure' ? 'Tenure Shortened By' : 'New Monthly EMI'}
                </div>
                <div className="text-2xl font-bold mt-1 text-on-surface">
                  {mode === 'tenure'
                    ? `${impact.monthsSaved} Months (${(impact.monthsSaved / 12).toFixed(1)} yrs)`
                    : formatCurrency(impact.withPrepay.emi)}
                </div>
                <div className="text-xs opacity-70 mt-1">
                  {mode === 'tenure'
                    ? `Closes on ${formatDate(impact.withPrepay.closeDate)}`
                    : `Reduced by ${formatCurrency(currentEmi - impact.withPrepay.emi)} / month`}
                </div>
              </div>

              <div className="brutal bg-white p-md">
                <div className="text-xs uppercase font-bold tracking-wider opacity-70">
                  New Projected Payoff Date
                </div>
                <div className="text-2xl font-bold mt-1">
                  {formatDate(impact.withPrepay.closeDate) || '—'}
                </div>
                <div className="text-xs opacity-70 mt-1">
                  Original payoff was {formatDate(impact.original.closeDate)}
                </div>
              </div>
            </div>

            {/* Side-by-Side Comparison Table */}
            <div className="brutal bg-white overflow-hidden">
              <div className="p-sm bg-surface-container-high font-bold text-xs uppercase border-b-2 border-on-surface flex justify-between">
                <span>Side-by-Side Comparison</span>
                <span className="text-xs normal-case opacity-70">
                  Reducing Balance (RBI Mandate)
                </span>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-surface-container-low border-b border-on-surface/20">
                  <tr>
                    <th className="px-md py-xs text-left">Metric</th>
                    <th className="px-md py-xs text-right">Without Prepayment</th>
                    <th className="px-md py-xs text-right font-bold">With Prepayment (₹{prepayAmount.toLocaleString('en-IN')})</th>
                    <th className="px-md py-xs text-right text-tertiary font-bold">Net Benefit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-on-surface/10">
                  <tr>
                    <td className="px-md py-xs font-medium">Monthly EMI</td>
                    <td className="px-md py-xs text-right">{formatCurrency(impact.original.emi)}</td>
                    <td className="px-md py-xs text-right font-bold">{formatCurrency(impact.withPrepay.emi)}</td>
                    <td className="px-md py-xs text-right text-tertiary font-bold">
                      {mode === 'emi' ? `-${formatCurrency(impact.original.emi - impact.withPrepay.emi)}/mo` : 'Same EMI'}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-md py-xs font-medium">Remaining Duration</td>
                    <td className="px-md py-xs text-right">{impact.original.months} months ({(impact.original.months/12).toFixed(1)}y)</td>
                    <td className="px-md py-xs text-right font-bold">{impact.withPrepay.months} months ({(impact.withPrepay.months/12).toFixed(1)}y)</td>
                    <td className="px-md py-xs text-right text-tertiary font-bold">
                      {impact.monthsSaved > 0 ? `-${impact.monthsSaved} months (${(impact.monthsSaved/12).toFixed(1)}y saved)` : 'Same duration'}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-md py-xs font-medium">Total Interest Payable</td>
                    <td className="px-md py-xs text-right text-error">{formatCurrency(impact.original.totalInterest)}</td>
                    <td className="px-md py-xs text-right font-bold">{formatCurrency(impact.withPrepay.totalInterest)}</td>
                    <td className="px-md py-xs text-right text-tertiary font-bold">
                      Save {formatCurrency(impact.interestSaved)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-md py-xs font-medium">Total Money Outflow</td>
                    <td className="px-md py-xs text-right">{formatCurrency(impact.original.totalPayable)}</td>
                    <td className="px-md py-xs text-right font-bold">{formatCurrency(impact.withPrepay.totalPayable)}</td>
                    <td className="px-md py-xs text-right text-tertiary font-bold">
                      Save {formatCurrency(impact.original.totalPayable - impact.withPrepay.totalPayable)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-md py-xs font-medium">Loan Payoff Date</td>
                    <td className="px-md py-xs text-right">{formatDate(impact.original.closeDate)}</td>
                    <td className="px-md py-xs text-right font-bold">{formatDate(impact.withPrepay.closeDate)}</td>
                    <td className="px-md py-xs text-right text-tertiary font-bold">
                      {impact.monthsSaved > 0 ? `${impact.monthsSaved} months earlier` : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Financial Insights & RBI Regulation Box */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
              <div className="brutal-thin bg-brand-yellow/30 p-sm text-xs flex flex-col gap-1">
                <div className="font-bold flex items-center gap-1">
                  <Icon name="lightbulb" className="text-sm text-on-surface" />
                  <span>Early Prepayment Advantage</span>
                </div>
                <p className="opacity-80">
                  Prepaying in Year 1–3 of a long-term loan saves <strong>2.5× to 4× more interest</strong> than Year 12+, because early EMIs consist of 75–85% interest.
                </p>
              </div>

              <div className="brutal-thin bg-surface-container-low p-sm text-xs flex flex-col gap-1">
                <div className="font-bold flex items-center gap-1">
                  <Icon name="verified_user" className="text-sm text-on-surface" />
                  <span>RBI Zero Penalty Mandate</span>
                </div>
                <p className="opacity-80">
                  Under RBI regulations (2025), banks &amp; NBFCs cannot charge foreclosure or prepayment penalties on floating-rate individual term loans.
                </p>
              </div>
            </div>

            {/* Schedule View Toggle + Export */}
            <div className="flex flex-wrap items-center justify-between gap-sm pt-xs">
              <div className="flex gap-xs items-center">
                <span className="text-xs font-bold uppercase mr-1">New Schedule:</span>
                <button
                  type="button"
                  onClick={() => setView('yearly')}
                  className={`brutal px-md py-xs text-xs font-bold uppercase ${
                    view === 'yearly' ? 'bg-brand-yellow' : 'bg-white'
                  }`}
                >
                  Yearly
                </button>
                <button
                  type="button"
                  onClick={() => setView('monthly')}
                  className={`brutal px-md py-xs text-xs font-bold uppercase ${
                    view === 'monthly' ? 'bg-brand-yellow' : 'bg-white'
                  }`}
                >
                  Monthly
                </button>
              </div>
              <div className="flex gap-xs">
                <Button variant="white" onClick={handleExportCsv}>
                  Export CSV
                </Button>
                <Button variant="white" onClick={handleExportPdf}>
                  Export PDF
                </Button>
              </div>
            </div>

            {/* Table */}
            <div className="brutal bg-white overflow-auto max-h-56">
              {view === 'monthly' ? (
                <table className="w-full text-xs">
                  <thead className="bg-on-surface text-white sticky top-0">
                    <tr>
                      <th className="px-sm py-xs text-left">#</th>
                      <th className="px-sm py-xs text-left">Date</th>
                      <th className="px-sm py-xs text-right">EMI</th>
                      <th className="px-sm py-xs text-right">Principal</th>
                      <th className="px-sm py-xs text-right">Interest</th>
                      <th className="px-sm py-xs text-right">Closing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {impact.newSchedule.map((r) => (
                      <tr key={r.month} className="border-t border-on-surface/20">
                        <td className="px-sm py-xs">{r.month}</td>
                        <td className="px-sm py-xs whitespace-nowrap">{formatDate(r.date)}</td>
                        <td className="px-sm py-xs text-right font-bold">{formatCurrency(r.emi)}</td>
                        <td className="px-sm py-xs text-right">{formatCurrency(r.principal)}</td>
                        <td className="px-sm py-xs text-right opacity-70">{formatCurrency(r.interest)}</td>
                        <td className="px-sm py-xs text-right">{formatCurrency(r.closing)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-on-surface text-white sticky top-0">
                    <tr>
                      <th className="px-sm py-xs text-left">Year</th>
                      <th className="px-sm py-xs text-right">EMI Total</th>
                      <th className="px-sm py-xs text-right">Principal Total</th>
                      <th className="px-sm py-xs text-right">Interest Total</th>
                      <th className="px-sm py-xs text-right">Closing Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearlyNewSchedule.map((y) => (
                      <tr key={y.yearIndex} className="border-t border-on-surface/20">
                        <td className="px-sm py-xs font-medium">{y.yearLabel}</td>
                        <td className="px-sm py-xs text-right font-bold">{formatCurrency(y.emiTotal)}</td>
                        <td className="px-sm py-xs text-right">{formatCurrency(y.principalTotal)}</td>
                        <td className="px-sm py-xs text-right opacity-70">{formatCurrency(y.interestTotal)}</td>
                        <td className="px-sm py-xs text-right">{formatCurrency(y.closing)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-sm border-t-2 border-on-surface">
              <span className="text-[11px] opacity-60">
                Simulated with RBI reducing-balance formula. Zero persistence on check.
              </span>
              <div className="flex gap-sm">
                <Button variant="white" onClick={onClose}>
                  Close
                </Button>
                {onRecordPrepayment && prepayAmount > 0 && (
                  <Button
                    variant="yellow"
                    onClick={() => {
                      onClose()
                      onRecordPrepayment(prepayAmount)
                    }}
                  >
                    <Icon name="payments" className="text-base" />
                    Record This Prepayment (₹{prepayAmount.toLocaleString('en-IN')})
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
