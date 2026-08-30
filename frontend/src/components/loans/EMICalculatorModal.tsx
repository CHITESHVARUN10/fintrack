import { useMemo, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Field'
import { formatCurrency, formatDate } from '../../lib/format'
import { calcEMI, amortizationSchedule, yearlySummary, validateLoanInputs } from '../../lib/loanCalc'

function csvDownload(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function EMICalculatorModal({ open, onClose, onUse }: { open: boolean; onClose: () => void; onUse?: (vals: { principal: number; rate: number; tenure: number; emi: number }) => void }) {
  const [principal, setPrincipal] = useState('1000000')
  const [rate, setRate] = useState('8.5')
  const [tenureMonths, setTenureMonths] = useState('240')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [emiDate, setEmiDate] = useState('5')
  const [view, setView] = useState<'yearly' | 'monthly'>('yearly')

  const P = Number(principal) || 0
  const R = Number(rate) || 0
  const N = Number(tenureMonths) || 0
  const ed = Number(emiDate) || 5

  const errs = validateLoanInputs(P, R, N)
  const hasErr = errs.length > 0

  const calc = useMemo(() => {
    if (hasErr) return null
    const { emi, totalPayable, totalInterest } = calcEMI(P, R, N)
    const schedule = amortizationSchedule(P, R, N, { startDate, emiDate: ed })
    const yearly = yearlySummary(schedule, startDate)
    return { emi, totalPayable, totalInterest, schedule, yearly }
  }, [P, R, N, startDate, ed, hasErr])

  const principalPct = calc ? Math.round((P / calc.totalPayable) * 100) : 0
  const interestPct = calc ? 100 - principalPct : 0

  function handleExportCsv() {
    if (!calc) return
    const rows = view === 'monthly' ? calc.schedule : calc.yearly as any
    let csv = ''
    if (view === 'monthly') {
      csv += 'Month,Date,EMI,Principal,Interest,Opening,Closing\n'
      for (const r of calc.schedule) csv += `${r.month},${r.date},${r.emi},${r.principal},${r.interest},${r.opening},${r.closing}\n`
    } else {
      csv += 'Year,Label,EMI Total,Principal,Interest,Closing\n'
      for (const y of calc.yearly) csv += `${y.yearIndex},${y.yearLabel},${y.emiTotal},${y.principalTotal},${y.interestTotal},${y.closing}\n`
    }
    csvDownload(`emi-schedule-${P}-${R}pct-${N}mo-${view}.csv`, csv)
  }

  function handleExportPdf() {
    // reuse browser print-like PDF via opening new window with table — simplest without new deps
    if (!calc) return
    const rowsHtml = view === 'monthly'
      ? `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:monospace;font-size:11px"><tr><th>Month</th><th>Date</th><th>EMI</th><th>Principal</th><th>Interest</th><th>Closing</th></tr>${calc.schedule.map(r=>`<tr><td>${r.month}</td><td>${r.date}</td><td>${r.emi}</td><td>${r.principal}</td><td>${r.interest}</td><td>${r.closing}</td></tr>`).join('')}</table>`
      : `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:monospace;font-size:11px"><tr><th>Year</th><th>EMI</th><th>Principal</th><th>Interest</th><th>Closing</th></tr>${calc.yearly.map(y=>`<tr><td>${y.yearLabel}</td><td>${y.emiTotal}</td><td>${y.principalTotal}</td><td>${y.interestTotal}</td><td>${y.closing}</td></tr>`).join('')}</table>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<html><head><title>EMI Schedule ${formatCurrency(P)} @${R}% ${N}mo</title></head><body><h2>EMI ₹${calc.emi.toLocaleString('en-IN')} — Total ₹${calc.totalPayable.toLocaleString('en-IN')} (Interest ₹${calc.totalInterest.toLocaleString('en-IN')})</h2><p>Principal ₹${P.toLocaleString('en-IN')} · Rate ${R}% · Tenure ${N} months (${(N/12).toFixed(1)}y) · Start ${startDate}</p>${rowsHtml}<p style="font-size:10px;opacity:0.6">Reducing balance, last EMI adjusted. Not tax advice.</p></body></html>`)
    w.document.close()
    w.focus()
    setTimeout(()=> w.print(), 300)
  }

  return (
    <Modal open={open} onClose={onClose} title="Loan EMI Calculator" width="max-w-3xl">
      <div className="flex flex-col gap-md">
        <div className="brutal bg-brand-yellow p-sm text-xs font-bold">
          Plan your loan: amount, interest rate and duration → EMI + yearly breakdown. Reducing balance (RBI). Last EMI adjusted.
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
          <Field label="Loan Amount (₹)">
            <Input type="number" value={principal} onChange={e=> setPrincipal(e.target.value)} placeholder="1000000" />
            <input type="range" min={100000} max={10000000} step={50000} value={String(P)} onChange={e=> setPrincipal(e.target.value)} className="w-full mt-sm" />
            <span className="text-xs opacity-60">{formatCurrency(P)}</span>
          </Field>
          <Field label="Interest Rate (% p.a.)">
            <Input type="number" step={0.1} value={rate} onChange={e=> setRate(e.target.value)} placeholder="8.5" />
            <input type="range" min={6} max={15} step={0.1} value={String(R)} onChange={e=> setRate(e.target.value)} className="w-full mt-sm" />
          </Field>
          <Field label="Tenure (Months)">
            <Input type="number" value={tenureMonths} onChange={e=> setTenureMonths(e.target.value)} placeholder="240" />
            <input type="range" min={12} max={360} step={12} value={String(N)} onChange={e=> setTenureMonths(e.target.value)} className="w-full mt-sm" />
            <span className="text-xs opacity-60">{N} mo · {(N/12).toFixed(1)} yrs</span>
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          <Field label="Start Date">
            <Input type="date" value={startDate} onChange={e=> setStartDate(e.target.value)} />
          </Field>
          <Field label="EMI Date (1–28)">
            <Input type="number" min={1} max={28} value={emiDate} onChange={e=> setEmiDate(e.target.value)} />
          </Field>
        </div>

        {hasErr && <div className="brutal bg-red-100 p-sm text-xs font-bold">{errs.join(' · ')}</div>}

        {calc && (
          <>
            {/* Hero stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
              <div className="brutal bg-brand-yellow p-md">
                <div className="text-xs uppercase font-bold tracking-wider opacity-70">Monthly EMI</div>
                <div className="text-3xl font-bold">{formatCurrency(calc.emi)}</div>
                <div className="text-xs opacity-60">{formatCurrency(calc.emi * 12)} / year</div>
              </div>
              <div className="brutal bg-white p-md">
                <div className="text-xs uppercase font-bold tracking-wider opacity-70">Total Interest</div>
                <div className="text-2xl font-bold text-error">{formatCurrency(calc.totalInterest)}</div>
                <div className="text-xs opacity-60">{interestPct}% of payable</div>
              </div>
              <div className="brutal bg-white p-md">
                <div className="text-xs uppercase font-bold tracking-wider opacity-70">Total Payable</div>
                <div className="text-2xl font-bold">{formatCurrency(calc.totalPayable)}</div>
                <div className="text-xs opacity-60">Principal {formatCurrency(P)} + interest</div>
              </div>
            </div>

            {/* Simple bar: principal vs interest */}
            <div className="brutal bg-white p-sm flex flex-col gap-sm">
              <div className="text-xs font-bold uppercase">Principal vs Interest</div>
              <div className="flex h-6 brutal-thin overflow-hidden">
                <div className="bg-brand-yellow flex items-center justify-center text-xs font-bold border-r-2 border-on-surface" style={{ width: `${principalPct}%` }}>{principalPct}% P</div>
                <div className="bg-on-surface text-white flex items-center justify-center text-xs font-bold" style={{ width: `${interestPct}%` }}>{interestPct}% I</div>
              </div>
              <div className="flex justify-between text-xs"><span>P {formatCurrency(P)}</span><span>I {formatCurrency(calc.totalInterest)}</span></div>
            </div>

            {/* Schedule toggle + export */}
            <div className="flex flex-wrap items-center justify-between gap-sm">
              <div className="flex gap-xs">
                <button onClick={()=> setView('yearly')} className={`brutal px-md py-xs text-xs font-bold uppercase ${view==='yearly'?'bg-brand-yellow':'bg-white'}`}>Yearly</button>
                <button onClick={()=> setView('monthly')} className={`brutal px-md py-xs text-xs font-bold uppercase ${view==='monthly'?'bg-brand-yellow':'bg-white'}`}>Monthly</button>
                <span className="text-xs opacity-60 self-center ml-sm">{calc.schedule.length} EMIs · Ends {formatDate(calc.schedule[calc.schedule.length-1]?.date || '')}</span>
              </div>
              <div className="flex gap-xs">
                <Button variant="white" onClick={handleExportCsv}>Export CSV</Button>
                <Button variant="white" onClick={handleExportPdf}>Export PDF</Button>
              </div>
            </div>

            <div className="brutal bg-white overflow-auto max-h-80">
              {view === 'monthly' ? (
                <table className="w-full text-xs">
                  <thead className="bg-on-surface text-white sticky top-0"><tr><th className="px-sm py-xs text-left">#</th><th className="px-sm py-xs text-left">Date</th><th className="px-sm py-xs text-right">EMI</th><th className="px-sm py-xs text-right">Principal</th><th className="px-sm py-xs text-right">Interest</th><th className="px-sm py-xs text-right">Closing</th></tr></thead>
                  <tbody>{calc.schedule.map(r=> <tr key={r.month} className="border-t border-on-surface/20"><td className="px-sm py-xs">{r.month}</td><td className="px-sm py-xs whitespace-nowrap">{formatDate(r.date)}</td><td className="px-sm py-xs text-right font-bold">{formatCurrency(r.emi)}</td><td className="px-sm py-xs text-right">{formatCurrency(r.principal)}</td><td className="px-sm py-xs text-right opacity-70">{formatCurrency(r.interest)}</td><td className="px-sm py-xs text-right">{formatCurrency(r.closing)}</td></tr>)}</tbody>
                </table>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-on-surface text-white sticky top-0"><tr><th className="px-sm py-xs text-left">Year</th><th className="px-sm py-xs text-right">EMI Total</th><th className="px-sm py-xs text-right">Principal</th><th className="px-sm py-xs text-right">Interest</th><th className="px-sm py-xs text-right">Closing</th></tr></thead>
                  <tbody>{calc.yearly.map(y=> <tr key={y.yearIndex} className="border-t border-on-surface/20"><td className="px-sm py-xs">{y.yearLabel}</td><td className="px-sm py-xs text-right font-bold">{formatCurrency(y.emiTotal)}</td><td className="px-sm py-xs text-right">{formatCurrency(y.principalTotal)}</td><td className="px-sm py-xs text-right opacity-70">{formatCurrency(y.interestTotal)}</td><td className="px-sm py-xs text-right">{formatCurrency(y.closing)}</td></tr>)}</tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end gap-sm">
              <Button variant="white" onClick={onClose}>Close</Button>
              {onUse && <Button variant="yellow" onClick={()=> { onUse({ principal: P, rate: R, tenure: N, emi: calc.emi }); onClose() }}>Use values to create loan</Button>}
            </div>
            <div className="text-[11px] opacity-60">Reducing balance · last EMI adjusted to zero · Not a sanction letter.</div>
          </>
        )}
      </div>
    </Modal>
  )
}
