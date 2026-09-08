import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { ProgressBar } from '../components/ui/ProgressBar'
import { formatCurrency, formatDate, formatDay } from '../lib/format'
import type { EMILoan, LoanType } from '../types'
import { loanService } from '../services/api'
import { apiClient } from '../services/apiClient'
import { calcEMI, amortizationSchedule, yearlySummary, type AmortRow, type YearRow } from '../lib/loanCalc'
import { PrepaymentPlannerModal } from '../components/loans/PrepaymentPlannerModal'
import { RecordPrepaymentModal } from '../components/loans/RecordPrepaymentModal'

const LOAN_TYPES: LoanType[] = ['Home', 'Car', 'Personal', 'Education', 'Gold', 'Other']
const STATUSES = ['Active', 'Closed', 'Prepaid']

function normalizeLoan(raw: Record<string, unknown>): EMILoan {
  return {
    id: String(raw._id ?? raw.id),
    memberId: String(raw.memberId ?? ''),
    loanName: (raw.loanName as string) ?? '',
    loanType: ((raw.loanType as LoanType) ?? 'Other'),
    lender: (raw.lender as string) ?? '',
    principalAmount: Number(raw.principalAmount ?? 0),
    outstandingAmount: Number(raw.outstandingAmount ?? 0),
    emiAmount: Number(raw.emiAmount ?? 0),
    emiDate: Number(raw.emiDate ?? 1),
    interestRate: Number(raw.interestRate ?? 0),
    tenureMonths: Number(raw.tenureMonths ?? 0),
    startDate: raw.startDate ? String(raw.startDate) : '',
    endDate: raw.endDate ? String(raw.endDate) : '',
    status: ((raw.status as EMILoan['status']) ?? 'Active'),
    notes: raw.notes as string | undefined,
  }
}

function csvDownload(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function LoanDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [loan, setLoan] = useState<EMILoan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Linked transactions & suggestions
  const [linkedTxs, setLinkedTxs] = useState<any[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [totalPaidFromLinked, setTotalPaidFromLinked] = useState(0)

  // Modals
  const [prepayPlannerOpen, setPrepayPlannerOpen] = useState(false)
  const [recordPrepayOpen, setRecordPrepayOpen] = useState(false)
  const [recordPrepayInitialAmt, setRecordPrepayInitialAmt] = useState<number | undefined>(undefined)
  const [editing, setEditing] = useState(false)

  // Schedule View States
  const [scheduleView, setScheduleView] = useState<'yearly' | 'monthly'>('yearly')
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'paid' | 'upcoming'>('all')

  const loadData = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [loanRes, txRes] = await Promise.all([
        loanService.get(id),
        loanService.getTransactions(id).catch(() => ({ linked: [], suggestions: [], totalPaidFromLinked: 0 })),
      ])
      setLoan(normalizeLoan(loanRes as any))
      setLinkedTxs(txRes.linked || [])
      setSuggestions(txRes.suggestions || [])
      setTotalPaidFromLinked(txRes.totalPaidFromLinked || 0)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not load loan details.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [id])

  // Compute full amortization schedule
  const scheduleData = useMemo(() => {
    if (!loan) return { schedule: [] as AmortRow[], yearly: [] as YearRow[], totalPayable: 0, totalInterest: 0 }
    const P = loan.principalAmount || 0
    const R = loan.interestRate || 0
    const N = loan.tenureMonths || 0
    const startDate = loan.startDate ? String(loan.startDate).slice(0, 10) : new Date().toISOString().slice(0, 10)
    const emiDate = loan.emiDate || 5

    const { totalPayable, totalInterest } = calcEMI(P, R, N)
    const schedule = amortizationSchedule(P, R, N, { startDate, emiDate })
    const yearly = yearlySummary(schedule, startDate)
    return { schedule, yearly, totalPayable, totalInterest }
  }, [loan])

  const todayIso = new Date().toISOString().slice(0, 10)

  const filteredMonthlyRows = useMemo(() => {
    if (scheduleFilter === 'paid') {
      return scheduleData.schedule.filter((r) => r.date < todayIso)
    }
    if (scheduleFilter === 'upcoming') {
      return scheduleData.schedule.filter((r) => r.date >= todayIso)
    }
    return scheduleData.schedule
  }, [scheduleData.schedule, scheduleFilter, todayIso])

  const handleDelete = async () => {
    if (!loan || !window.confirm(`Delete "${loan.loanName}"?`)) return
    try {
      await apiClient.delete(`/loans/${loan.id}`)
      navigate('/loans')
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not delete loan.')
    }
  }

  const handleUnlink = async (txId: string) => {
    if (!loan || !window.confirm('Unlink this transaction from the loan?')) return
    try {
      await loanService.unlinkTransaction(loan.id, { transactionId: txId })
      loadData()
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not unlink transaction.')
    }
  }

  const handleLinkSuggestion = async (txId: string, isPrepayment = false) => {
    if (!loan) return
    try {
      await loanService.linkTransaction(loan.id, { transactionId: txId, isPrepayment })
      loadData()
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not link transaction.')
    }
  }

  function handleExportCsv() {
    if (!loan || !scheduleData) return
    let csv = ''
    if (scheduleView === 'monthly') {
      csv += 'Month,Date,EMI,Principal,Interest,Opening,Closing\n'
      for (const r of scheduleData.schedule) {
        csv += `${r.month},${r.date},${r.emi},${r.principal},${r.interest},${r.opening},${r.closing}\n`
      }
    } else {
      csv += 'Year,Label,EMI Total,Principal,Interest,Closing\n'
      for (const y of scheduleData.yearly) {
        csv += `${y.yearIndex},${y.yearLabel},${y.emiTotal},${y.principalTotal},${y.interestTotal},${y.closing}\n`
      }
    }
    csvDownload(`${loan.loanName}-amortization-${scheduleView}.csv`, csv)
  }

  function handleExportPdf() {
    if (!loan || !scheduleData) return
    const rowsHtml = scheduleView === 'monthly'
      ? `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:monospace;font-size:11px"><tr><th>Month</th><th>Date</th><th>EMI</th><th>Principal</th><th>Interest</th><th>Closing</th></tr>${scheduleData.schedule.map(r=>`<tr><td>${r.month}</td><td>${r.date}</td><td>${r.emi}</td><td>${r.principal}</td><td>${r.interest}</td><td>${r.closing}</td></tr>`).join('')}</table>`
      : `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:monospace;font-size:11px"><tr><th>Year</th><th>EMI Total</th><th>Principal Total</th><th>Interest Total</th><th>Closing Balance</th></tr>${scheduleData.yearly.map(y=>`<tr><td>${y.yearLabel}</td><td>${y.emiTotal}</td><td>${y.principalTotal}</td><td>${y.interestTotal}</td><td>${y.closing}</td></tr>`).join('')}</table>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<html><head><title>Loan Schedule — ${loan.loanName}</title></head><body><h2>${loan.loanName} — Amortization Schedule</h2><p>Lender: ${loan.lender || '—'} · Type: ${loan.loanType} · Principal ₹${loan.principalAmount.toLocaleString('en-IN')} · Rate ${loan.interestRate}% · EMI ₹${loan.emiAmount.toLocaleString('en-IN')}</p><p>Total Payable ₹${scheduleData.totalPayable.toLocaleString('en-IN')} (Total Interest ₹${scheduleData.totalInterest.toLocaleString('en-IN')}) · Outstanding ₹${loan.outstandingAmount.toLocaleString('en-IN')}</p>${rowsHtml}<p style="font-size:10px;opacity:0.6">Reducing balance schedule (RBI). Generated by FinStack.</p></body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  if (loading) return <LoadingBlock label="Loading loan details…" />
  if (error || !loan) {
    return (
      <div className="flex flex-col gap-md">
        <Button variant="white" onClick={() => navigate('/loans')} className="self-start">
          ← Back to Loans
        </Button>
        <div className="border-[3px] border-on-surface bg-red-100 p-md font-bold text-error">
          {error || 'Loan not found'}
        </div>
      </div>
    )
  }

  const repaidAmount = Math.max(0, loan.principalAmount - loan.outstandingAmount)
  const repaidPct = loan.principalAmount > 0 ? Math.round((repaidAmount / loan.principalAmount) * 100) : 0

  return (
    <div className="flex flex-col gap-lg pb-xl min-w-0">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/loans')}
          className="text-xs font-bold uppercase tracking-wider mb-sm flex items-center gap-1 hover:underline"
        >
          <Icon name="arrow_back" className="text-sm" /> Back to Loans
        </button>
        <PageHeader
          title={loan.loanName}
          subtitle={`${loan.lender ? `${loan.lender} · ` : ''}${loan.loanType} Loan · ${loan.interestRate}% p.a. Reducing Balance`}
          action={
            <div className="flex flex-wrap gap-sm">
              <Button
                variant="white"
                onClick={() => setPrepayPlannerOpen(true)}
                title="Simulate prepayment savings"
              >
                <Icon name="calculate" className="text-xl" />
                Prepay Check
              </Button>
              <Button
                variant="yellow"
                onClick={() => {
                  setRecordPrepayInitialAmt(undefined)
                  setRecordPrepayOpen(true)
                }}
                title="Record an actual prepayment"
              >
                <Icon name="payments" className="text-xl" />
                Record Prepayment
              </Button>
              <Button variant="white" onClick={() => setEditing(true)} title="Edit Loan details">
                <Icon name="edit" className="text-base" />
              </Button>
              <button
                onClick={handleDelete}
                className="bg-error-container text-on-error-container p-2 brutal-thin hover:bg-error hover:text-on-error"
                title="Delete Loan"
              >
                <Icon name="delete" className="text-base" />
              </button>
            </div>
          }
        />
      </div>

      {/* Hero Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md min-w-0">
        {/* Outstanding */}
        <div className="brutal bg-white p-md flex flex-col justify-between min-w-0">
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                Outstanding Balance
              </span>
              <Badge color={loan.status === 'Active' ? 'cyan' : 'surface'}>{loan.status}</Badge>
            </div>
            <p className="text-3xl font-bold text-error mt-2">
              {formatCurrency(loan.outstandingAmount)}
            </p>
          </div>
          <div className="text-xs text-on-surface-variant mt-3">
            Principal: {formatCurrency(loan.principalAmount)}
          </div>
        </div>

        {/* Monthly EMI */}
        <div className="brutal bg-brand-yellow p-md flex flex-col justify-between min-w-0">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Monthly EMI
            </span>
            <p className="text-3xl font-bold text-on-surface mt-2">
              {formatCurrency(loan.emiAmount)}
            </p>
          </div>
          <div className="text-xs font-bold text-on-surface-variant mt-3 flex items-center gap-1">
            <Icon name="event" className="text-sm" /> Due on {formatDay(loan.emiDate)} of each month
          </div>
        </div>

        {/* Total Interest & Cost */}
        <div className="brutal bg-white p-md flex flex-col justify-between min-w-0">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Total Interest
            </span>
            <p className="text-2xl font-bold text-on-surface mt-2">
              {formatCurrency(scheduleData.totalInterest)}
            </p>
          </div>
          <div className="text-xs text-on-surface-variant mt-3">
            Total Payable: {formatCurrency(scheduleData.totalPayable)}
          </div>
        </div>

        {/* Tenure & Timeline */}
        <div className="brutal bg-white p-md flex flex-col justify-between min-w-0">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Tenure &amp; Payoff
            </span>
            <p className="text-2xl font-bold text-on-surface mt-2">
              {loan.tenureMonths} Mo <span className="text-sm font-normal text-on-surface-variant">({(loan.tenureMonths / 12).toFixed(1)}y)</span>
            </p>
          </div>
          <div className="text-xs text-on-surface-variant mt-3">
            Ends: {formatDate(loan.endDate || (scheduleData.schedule.length ? scheduleData.schedule[scheduleData.schedule.length - 1].date : ''))}
          </div>
        </div>
      </div>

      {/* Progress & Quick Actions Card */}
      <div className="brutal bg-white p-md flex flex-col gap-md min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-sm">
          <div className="min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Repayment Progress
            </span>
            <div className="text-lg font-bold break-words">
              {formatCurrency(repaidAmount)} repaid of {formatCurrency(loan.principalAmount)} ({repaidPct}%)
            </div>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-sm">
            <Button
              variant="white"
              onClick={() => setPrepayPlannerOpen(true)}
              className="text-xs"
            >
              <Icon name="insights" className="text-sm" />
              Check Prepayment Savings
            </Button>
            <Button
              variant="yellow"
              onClick={() => setRecordPrepayOpen(true)}
              className="text-xs"
            >
              <Icon name="add_circle" className="text-sm" />
              Record Prepayment
            </Button>
          </div>
        </div>
        <ProgressBar value={repaidPct} />
      </div>

      {/* Amortization Schedule Section */}
      <div className="brutal bg-white p-md flex flex-col gap-md min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-sm border-b-2 border-on-surface pb-sm">
          <div className="min-w-0">
            <h3 className="font-bold uppercase tracking-tight text-lg break-words">Amortization Schedule</h3>
            <span className="text-xs text-on-surface-variant">
              RBI Reducing Balance Breakdown · {scheduleData.schedule.length} Total Monthly EMIs
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-sm min-w-0">
            {/* View Toggle */}
            <div className="flex gap-xs">
              <button
                type="button"
                onClick={() => setScheduleView('yearly')}
                className={`brutal px-md py-xs text-xs font-bold uppercase ${
                  scheduleView === 'yearly' ? 'bg-brand-yellow' : 'bg-white'
                }`}
              >
                Yearly
              </button>
              <button
                type="button"
                onClick={() => setScheduleView('monthly')}
                className={`brutal px-md py-xs text-xs font-bold uppercase ${
                  scheduleView === 'monthly' ? 'bg-brand-yellow' : 'bg-white'
                }`}
              >
                Monthly
              </button>
            </div>

            {/* Sub-filter if monthly */}
            {scheduleView === 'monthly' && (
              <select
                value={scheduleFilter}
                onChange={(e) => setScheduleFilter(e.target.value as any)}
                className="brutal-thin px-sm py-xs text-xs font-bold uppercase"
              >
                <option value="all">All EMIs ({scheduleData.schedule.length})</option>
                <option value="paid">Paid EMIs</option>
                <option value="upcoming">Upcoming EMIs</option>
              </select>
            )}

            {/* Exports */}
            <div className="flex flex-wrap gap-xs">
              <Button variant="white" onClick={handleExportCsv} className="text-xs">
                Export CSV
              </Button>
              <Button variant="white" onClick={handleExportPdf} className="text-xs">
                Export PDF
              </Button>
            </div>
          </div>
        </div>

        {/* Schedule Table */}
        <div className="overflow-x-auto max-h-96">
          {scheduleView === 'monthly' ? (
            <table className="w-full min-w-[760px] text-xs">
              <thead className="bg-on-surface text-white sticky top-0">
                <tr>
                  <th className="px-sm py-xs text-left whitespace-nowrap"># Month</th>
                  <th className="px-sm py-xs text-left whitespace-nowrap">Due Date</th>
                  <th className="px-sm py-xs text-right whitespace-nowrap">Monthly EMI</th>
                  <th className="px-sm py-xs text-right whitespace-nowrap">Principal</th>
                  <th className="px-sm py-xs text-right whitespace-nowrap">Interest</th>
                  <th className="px-sm py-xs text-right whitespace-nowrap">Opening Balance</th>
                  <th className="px-sm py-xs text-right whitespace-nowrap">Closing Balance</th>
                  <th className="px-sm py-xs text-center whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-on-surface/10">
                {filteredMonthlyRows.map((r) => {
                  const isPaid = r.date < todayIso
                  return (
                    <tr
                      key={r.month}
                      className={`hover:bg-surface-container-low/60 ${isPaid ? 'bg-surface-container-low/30' : ''}`}
                    >
                      <td className="px-sm py-xs font-mono whitespace-nowrap">{r.month}</td>
                      <td className="px-sm py-xs whitespace-nowrap font-medium">{formatDate(r.date)}</td>
                      <td className="px-sm py-xs text-right font-bold whitespace-nowrap">{formatCurrency(r.emi)}</td>
                      <td className="px-sm py-xs text-right whitespace-nowrap">{formatCurrency(r.principal)}</td>
                      <td className="px-sm py-xs text-right opacity-70 whitespace-nowrap">{formatCurrency(r.interest)}</td>
                      <td className="px-sm py-xs text-right whitespace-nowrap">{formatCurrency(r.opening)}</td>
                      <td className="px-sm py-xs text-right font-bold whitespace-nowrap">{formatCurrency(r.closing)}</td>
                      <td className="px-sm py-xs text-center">
                        {isPaid ? (
                          <span className="brutal-thin bg-tertiary-container px-xs py-0.5 text-[10px] font-bold uppercase">
                            Paid
                          </span>
                        ) : (
                          <span className="brutal-thin bg-white px-xs py-0.5 text-[10px] font-bold uppercase opacity-70">
                            Upcoming
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[600px] text-xs">
              <thead className="bg-on-surface text-white sticky top-0">
                <tr>
                  <th className="px-sm py-xs text-left whitespace-nowrap">Year</th>
                  <th className="px-sm py-xs text-right whitespace-nowrap">EMI Total</th>
                  <th className="px-sm py-xs text-right whitespace-nowrap">Principal Repaid</th>
                  <th className="px-sm py-xs text-right whitespace-nowrap">Interest Paid</th>
                  <th className="px-sm py-xs text-right whitespace-nowrap">Closing Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-on-surface/10">
                {scheduleData.yearly.map((y) => (
                  <tr key={y.yearIndex} className="hover:bg-surface-container-low/60">
                    <td className="px-sm py-xs font-bold">{y.yearLabel}</td>
                    <td className="px-sm py-xs text-right font-bold">{formatCurrency(y.emiTotal)}</td>
                    <td className="px-sm py-xs text-right text-tertiary font-medium">
                      {formatCurrency(y.principalTotal)}
                    </td>
                    <td className="px-sm py-xs text-right opacity-70">{formatCurrency(y.interestTotal)}</td>
                    <td className="px-sm py-xs text-right font-bold">{formatCurrency(y.closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Linked Transactions & Payment History */}
      <div className="brutal bg-white p-md flex flex-col gap-md min-w-0">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-sm border-b-2 border-on-surface pb-sm">
          <div className="min-w-0">
            <h3 className="font-bold uppercase tracking-tight text-lg break-words">Linked Transactions &amp; Payments</h3>
            <span className="text-xs text-on-surface-variant">
              Actual bank and ledger records linked to this loan ({linkedTxs.length} linked · Total Paid:{' '}
              {formatCurrency(totalPaidFromLinked / 100)})
            </span>
          </div>
          <Button
            variant="yellow"
            onClick={() => {
              setRecordPrepayInitialAmt(undefined)
              setRecordPrepayOpen(true)
            }}
            className="text-xs"
          >
            + Link / Record Payment
          </Button>
        </div>

        {/* Unmatched Suggestions Banner */}
        {suggestions.length > 0 && (
          <div className="brutal bg-brand-yellow p-sm flex flex-col gap-xs">
            <span className="text-xs font-bold uppercase">
              💡 Suggested Transactions ({suggestions.length} found matching loan EMI / lender)
            </span>
            <div className="flex flex-col gap-xs max-h-36 overflow-auto">
              {suggestions.map((s: any) => {
                const sAmt = s.amountPaise ? s.amountPaise / 100 : 0
                return (
                  <div
                    key={s._id}
                    className="brutal-thin bg-white p-xs flex flex-col sm:flex-row sm:items-center gap-xs sm:justify-between text-xs min-w-0"
                  >
                    <span className="break-words min-w-0">
                      {formatDate(s.occurredAt)} · <strong>{formatCurrency(sAmt)}</strong> ·{' '}
                      {s.recipient?.name || s.mode}
                    </span>
                    <div className="flex flex-wrap gap-xs">
                      <button
                        type="button"
                        onClick={() => handleLinkSuggestion(s._id, false)}
                        className="brutal bg-brand-yellow px-xs py-0.5 text-[10px] font-bold uppercase hover:bg-white"
                      >
                        Link as EMI
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLinkSuggestion(s._id, true)}
                        className="brutal bg-white px-xs py-0.5 text-[10px] font-bold uppercase hover:bg-brand-yellow"
                      >
                        Link as Prepayment
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Linked List */}
        {linkedTxs.length === 0 ? (
          <div className="p-md text-xs font-bold text-on-surface-variant bg-surface-container-low brutal-thin">
            No transactions currently linked. Click “Link / Record Payment” or import a bank statement to link EMI payments and prepayments.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-80">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="bg-surface-container-high border-b border-on-surface/20">
                <tr>
                  <th className="px-sm py-xs text-left whitespace-nowrap">Date</th>
                  <th className="px-sm py-xs text-left whitespace-nowrap">Type / Purpose</th>
                  <th className="px-sm py-xs text-right whitespace-nowrap">Amount</th>
                  <th className="px-sm py-xs text-left whitespace-nowrap">Mode</th>
                  <th className="px-sm py-xs text-left whitespace-nowrap">Recipient / Memo</th>
                  <th className="px-sm py-xs text-center whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-on-surface/10">
                {linkedTxs.map((t: any) => {
                  const isPrepayment = t.loanMeta?.isPrepayment
                  const amt = t.amountPaise ? t.amountPaise / 100 : 0
                  return (
                    <tr key={t._id} className="hover:bg-surface-container-low/60">
                      <td className="px-sm py-xs whitespace-nowrap font-medium">{formatDate(t.occurredAt)}</td>
                      <td className="px-sm py-xs">
                        {isPrepayment ? (
                          <span className="brutal-thin bg-brand-yellow px-xs py-0.5 text-[10px] font-bold uppercase">
                            ⭐ Prepayment
                          </span>
                        ) : (
                          <span className="brutal-thin bg-white px-xs py-0.5 text-[10px] font-bold uppercase">
                            Regular EMI
                          </span>
                        )}
                      </td>
                      <td className="px-sm py-xs text-right font-bold whitespace-nowrap">{formatCurrency(amt)}</td>
                      <td className="px-sm py-xs whitespace-nowrap">{t.mode}</td>
                      <td className="px-sm py-xs opacity-80 break-words">{t.recipient?.name || t.productName || '—'}</td>
                      <td className="px-sm py-xs text-center">
                        <button
                          type="button"
                          onClick={() => handleUnlink(t._id)}
                          className="brutal-thin bg-white px-xs py-0.5 text-[10px] font-bold uppercase hover:bg-error-container hover:text-on-error-container"
                          title="Unlink transaction from this loan"
                        >
                          Unlink
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notes & Audit Section */}
      {loan.notes && (
        <div className="brutal bg-white p-md flex flex-col gap-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            Notes &amp; Prepayment Log
          </span>
          <pre className="text-xs font-mono bg-surface-container-low p-sm brutal-thin whitespace-pre-wrap">
            {loan.notes}
          </pre>
        </div>
      )}

      {/* Prepayment Planner Modal */}
      {loan && (
        <PrepaymentPlannerModal
          open={prepayPlannerOpen}
          onClose={() => setPrepayPlannerOpen(false)}
          loan={loan}
          onRecordPrepayment={(amt) => {
            setRecordPrepayInitialAmt(amt)
            setRecordPrepayOpen(true)
          }}
        />
      )}

      {/* Record Prepayment Modal */}
      {loan && (
        <RecordPrepaymentModal
          open={recordPrepayOpen}
          onClose={() => setRecordPrepayOpen(false)}
          loan={loan}
          initialAmount={recordPrepayInitialAmt}
          onPrepaymentRecorded={() => loadData()}
        />
      )}

      {/* Edit Loan Modal */}
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit Loan Details">
        <EditLoanForm
          loan={loan}
          onSaved={() => {
            setEditing(false)
            loadData()
          }}
          onCancel={() => setEditing(false)}
        />
      </Modal>
    </div>
  )
}

function EditLoanForm({
  loan,
  onSaved,
  onCancel,
}: {
  loan: EMILoan
  onSaved: () => void
  onCancel: () => void
}) {
  const [loanName, setLoanName] = useState(loan.loanName)
  const [loanType, setLoanType] = useState<LoanType>(loan.loanType)
  const [lender, setLender] = useState(loan.lender)
  const [principalAmount, setPrincipalAmount] = useState(String(loan.principalAmount))
  const [outstandingAmount, setOutstandingAmount] = useState(String(loan.outstandingAmount))
  const [emiAmount, setEmiAmount] = useState(String(loan.emiAmount))
  const [emiDate, setEmiDate] = useState(String(loan.emiDate))
  const [interestRate, setInterestRate] = useState(String(loan.interestRate))
  const [tenureMonths, setTenureMonths] = useState(String(loan.tenureMonths))
  const [startDate, setStartDate] = useState(loan.startDate ? String(loan.startDate).slice(0, 10) : '')
  const [endDate, setEndDate] = useState(loan.endDate ? String(loan.endDate).slice(0, 10) : '')
  const [status, setStatus] = useState<EMILoan['status']>(loan.status)
  const [notes, setNotes] = useState(loan.notes || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const payload = {
      loanName,
      loanType,
      lender,
      principalAmount: Number(principalAmount),
      outstandingAmount: Number(outstandingAmount),
      emiAmount: Number(emiAmount),
      emiDate: Number(emiDate),
      interestRate: Number(interestRate),
      tenureMonths: Number(tenureMonths),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      status,
      notes: notes || undefined,
    }
    try {
      await apiClient.put(`/loans/${loan.id}`, payload)
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not update loan.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-lg">
      {error && (
        <div className="border-[3px] border-on-surface bg-red-100 px-sm py-2 font-bold text-sm">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Loan Name">
          <Input value={loanName} onChange={(e) => setLoanName(e.target.value)} required />
        </Field>
        <Field label="Loan Type">
          <Select value={loanType} onChange={(e) => setLoanType(e.target.value as LoanType)}>
            {LOAN_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Lender">
          <Input value={lender} onChange={(e) => setLender(e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as EMILoan['status'])}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Principal Amount">
          <Input
            type="number"
            value={principalAmount}
            onChange={(e) => setPrincipalAmount(e.target.value)}
            required
          />
        </Field>
        <Field label="Outstanding Amount">
          <Input
            type="number"
            value={outstandingAmount}
            onChange={(e) => setOutstandingAmount(e.target.value)}
            required
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="EMI Amount">
          <Input
            type="number"
            value={emiAmount}
            onChange={(e) => setEmiAmount(e.target.value)}
            required
          />
        </Field>
        <Field label="EMI Date (Day of Month)">
          <Input
            type="number"
            min={1}
            max={31}
            value={emiDate}
            onChange={(e) => setEmiDate(e.target.value)}
            required
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Interest Rate (%)">
          <Input
            type="number"
            step={0.1}
            value={interestRate}
            onChange={(e) => setInterestRate(e.target.value)}
          />
        </Field>
        <Field label="Tenure (Months)">
          <Input
            type="number"
            value={tenureMonths}
            onChange={(e) => setTenureMonths(e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Start Date">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="End Date">
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex flex-wrap justify-end gap-sm pt-sm">
        <Button variant="white" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="yellow" type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Update Loan'}
        </Button>
      </div>
    </form>
  )
}
