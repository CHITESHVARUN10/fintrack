import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { form16Service } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { formatCurrency } from '../lib/format'
import type { RegimeTrace, DeductionLineItem, CalculationTraceStep } from '../types'

// ----- small building blocks ------------------------------------------------

type RowTone = 'plain' | 'deduct' | 'add' | 'strong' | 'result-pos' | 'result-neg'

function MoneyRow({
  label,
  amount,
  tone = 'plain',
  sub,
}: {
  label: ReactNode
  amount: number
  tone?: RowTone
  sub?: ReactNode
}) {
  const toneCls =
    tone === 'deduct'
      ? 'text-error-container'
      : tone === 'add'
        ? 'text-on-surface'
        : tone === 'strong'
          ? 'font-bold text-lg'
          : tone === 'result-pos'
            ? 'font-bold text-lg text-on-surface'
            : tone === 'result-neg'
              ? 'font-bold text-lg text-error'
              : ''
  const sign = amount < 0 ? '− ' : tone === 'add' && amount > 0 ? '+ ' : ''
  return (
    <div className="flex justify-between items-baseline border-b-2 border-on-surface/70 pb-2 gap-3">
      <div className="font-medium">
        {label}
        {sub && <div className="font-normal text-xs text-on-surface-variant mt-0.5">{sub}</div>}
      </div>
      <div className={`font-mono-data whitespace-nowrap ${toneCls}`}>
        {sign}
        {formatCurrency(Math.abs(amount))}
      </div>
    </div>
  )
}

function Expandable({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string
  summary?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-2 border-on-surface brutal-thin">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-3 bg-surface-container-low hover:bg-surface-container-high"
      >
        <span className="font-bold uppercase text-sm flex items-center gap-2">
          <Icon name={open ? 'expand_less' : 'expand_more'} />
          {title}
        </span>
        {summary != null && <span className="font-mono-data text-sm">{summary}</span>}
      </button>
      {open && <div className="p-3 border-t-2 border-on-surface">{children}</div>}
    </div>
  )
}

function SlabTable({ slabs }: { slabs: RegimeTrace['slabs'] }) {
  return (
    <table className="w-full text-sm font-mono-data">
      <thead>
        <tr className="text-left border-b-2 border-on-surface text-on-surface-variant uppercase text-xs">
          <th className="py-1 pr-2 font-bold">Slab</th>
          <th className="py-1 px-2 font-bold text-right">Rate</th>
          <th className="py-1 px-2 font-bold text-right">Income in Band</th>
          <th className="py-1 pl-2 font-bold text-right">Tax</th>
        </tr>
      </thead>
      <tbody>
        {slabs.map((s, i) => (
          <tr key={i} className="border-b border-on-surface/40">
            <td className="py-1 pr-2">{s.label}</td>
            <td className="py-1 px-2 text-right">{s.rate > 0 ? `${Math.round(s.rate * 100)}%` : 'Nil'}</td>
            <td className="py-1 px-2 text-right">{formatCurrency(s.incomeInBand)}</td>
            <td className="py-1 pl-2 text-right">{formatCurrency(s.tax)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DeductionPlan({ items, regime }: { items: RegimeTrace['deductions']; regime: string }) {
  if (!items || items.length === 0) {
    return <p className="font-medium text-on-surface-variant text-sm">No itemised deductions recorded for this regime.</p>
  }
  return (
    <div className="space-y-2">
      {items.map((d) => (
        <div
          key={d.key}
          className="flex justify-between items-start gap-3 border-b border-on-surface/40 pb-2"
        >
          <div className="font-medium">
            {d.label}
            {d.disallowed && (
              <span className="ml-2 text-[10px] uppercase font-bold bg-on-surface text-white px-2 py-0.5 align-middle">
                Not allowed in {regime}
              </span>
            )}
            {d.source && !d.disallowed && (
              <span className="ml-2 text-[10px] uppercase font-bold bg-surface-container-high border-2 border-on-surface px-2 py-0.5 align-middle">
                {d.source}
              </span>
            )}
            {d.note && <div className="font-normal text-xs text-on-surface-variant mt-0.5">{d.note}</div>}
          </div>
          <div className="text-right font-mono-data whitespace-nowrap">
            {d.disallowed ? (
              <span className="text-on-surface-variant">—</span>
            ) : (
              <>
                <div className="font-bold">{formatCurrency(d.claimed)}</div>
                {d.remaining != null && d.remaining > 0 && (
                  <div className="text-[10px] text-on-surface-variant">
                    ₹{d.remaining.toLocaleString('en-IN')} more available
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ----- regime waterfall -----------------------------------------------------

function RegimeWaterfall({ trace, recommended }: { trace: RegimeTrace; recommended: boolean }) {
  const { hra, lta } = trace.salaryExemptions
  const hasExemptions = hra > 0 || lta > 0

  return (
    <div
      className={`bg-white brutal flex flex-col relative nb-card-enter ${
        recommended ? 'md:-translate-y-4' : ''
      }`}
    >
      {recommended && (
        <div className="absolute -top-4 -right-4 bg-brand-yellow brutal px-4 py-2 flex items-center gap-2 z-10 rotate-3">
          <Icon name="check_circle" />
          <span className="font-bold uppercase">Recommended</span>
        </div>
      )}
      <div
        className={`p-lg border-b-[3px] border-on-surface ${
          recommended ? 'bg-brand-yellow' : 'bg-surface-container-low'
        }`}
      >
        <h3 className="font-bold text-xl uppercase text-center">{trace.regime} Regime</h3>
      </div>

      <div className="p-lg space-y-4 flex-1">
        {/* Gross → Salary income */}
        <div className="space-y-2">
          <MoneyRow label="Gross Salary / Income" amount={trace.grossIncome} tone="strong" />
          {hasExemptions && (
            <Expandable title="Salary Exemptions" defaultOpen={false}>
              {hra > 0 && <MoneyRow label="HRA Exemption" amount={-hra} tone="deduct" />}
              {lta > 0 && <MoneyRow label="LTA Exemption" amount={-lta} tone="deduct" />}
            </Expandable>
          )}
          <MoneyRow label="Income from Salary" amount={trace.incomeFromSalary} />
          {trace.incomeFromOtherSources > 0 && (
            <MoneyRow label="Income from Other Sources" amount={trace.incomeFromOtherSources} />
          )}
          <MoneyRow label="Gross Total Income" amount={trace.grossTotalIncome} tone="strong" />
        </div>

        {/* Deductions */}
        <Expandable
          title="Deductions"
          summary={formatCurrency(trace.totalDeductions)}
          defaultOpen={false}
        >
          <DeductionPlan items={trace.deductions} regime={trace.regime} />
        </Expandable>
        <MoneyRow label="Total Deductions" amount={-trace.totalDeductions} tone="deduct" />
        <MoneyRow label="Taxable Income" amount={trace.taxableIncome} tone="strong" />

        {/* Slab-wise tax */}
        <Expandable
          title="Slab-wise Tax"
          summary={formatCurrency(trace.incomeTaxBeforeRebate)}
          defaultOpen={false}
        >
          <SlabTable slabs={trace.slabs} />
        </Expandable>
        <MoneyRow label="Income Tax (before rebate)" amount={trace.incomeTaxBeforeRebate} />

        {/* 87A rebate */}
        <MoneyRow
          label="Less: Section 87A Rebate"
          amount={-trace.rebate}
          tone={trace.rebate > 0 ? 'deduct' : 'plain'}
          sub={trace.rebate > 0 ? 'Refund of income tax up to the rebate limit' : undefined}
        />
        <MoneyRow label="Income Tax (after rebate)" amount={trace.incomeTaxAfterRebate} tone="strong" />

        {/* Surcharge + Cess */}
        {trace.surcharge > 0 && (
          <MoneyRow label="Add: Surcharge" amount={trace.surcharge} tone="add" />
        )}
        <MoneyRow label="Add: Health & Education Cess (4%)" amount={trace.cess} tone="add" />
        <MoneyRow label="Final Tax Liability" amount={trace.finalTax} tone="strong" />

        {/* TDS / payments */}
        <Expandable
          title="TDS & Advance Tax"
          summary={formatCurrency(trace.totalPaid)}
          defaultOpen={false}
        >
          {trace.tdsDeducted > 0 && (
            <MoneyRow label="TDS Deducted" amount={-trace.tdsDeducted} tone="deduct" />
          )}
          {trace.advanceTax > 0 && (
            <MoneyRow label="Advance Tax Paid" amount={-trace.advanceTax} tone="deduct" />
          )}
          {trace.selfAssessmentTax > 0 && (
            <MoneyRow label="Self-Assessment Tax" amount={-trace.selfAssessmentTax} tone="deduct" />
          )}
          <MoneyRow label="Total Paid" amount={-trace.totalPaid} tone="deduct" />
        </Expandable>
      </div>

      {/* Result footer */}
      <div className="p-lg border-t-[3px] border-on-surface text-center bg-surface-container-low">
        {trace.refund > 0 ? (
          <>
            <p className="font-bold uppercase mb-1 text-on-surface">Refund Due</p>
            <p className="font-bold text-2xl text-on-surface">{formatCurrency(trace.refund)}</p>
          </>
        ) : trace.taxPayable > 0 ? (
          <>
            <p className="font-bold uppercase mb-1 text-error">Tax Payable</p>
            <p className="font-bold text-2xl text-error">{formatCurrency(trace.taxPayable)}</p>
          </>
        ) : (
          <>
            <p className="font-bold uppercase mb-1">Balanced</p>
            <p className="font-bold text-2xl">₹0</p>
          </>
        )}
        <p className="font-mono-data text-xs mt-2">
          Final tax {formatCurrency(trace.finalTax)}
        </p>
      </div>
    </div>
  )
}

// ----- debug / calculation trace (audit aid) -------------------------------

type DebugTraceT = {
  grossSalary: number
  salaryExemptions: { hra: number; lta: number }
  incomeFromSalary: number
  grossTotalIncome: number
  deductions: Array<{
    key: string
    label: string
    source: string | null
    userAmount: number
    claimed: number
    disallowed: boolean
  }>
  totalDeductions: number
  taxableIncome: number
  incomeTaxBeforeRebate: number
  rebate: number
  incomeTaxAfterRebate: number
  surcharge: number
  cess: number
  finalTax: number
  tdsDeducted: number
  refund: number
  taxPayable: number
}

function DebugTraceBlock({ t, regime }: { t: DebugTraceT; regime: string }) {
  return (
    <div className="font-mono-data text-xs space-y-1">
      <div className="font-bold uppercase border-b-2 border-on-surface pb-1 mb-1">{regime} Regime</div>
      <div>Gross Salary: {formatCurrency(t.grossSalary)}</div>
      <div>
        HRA Exemption: {formatCurrency(t.salaryExemptions.hra)}
        {t.salaryExemptions.hra === 0 ? ' (insufficient info)' : ''}
      </div>
      <div>Income from Salary: {formatCurrency(t.incomeFromSalary)}</div>
      <div>Gross Total Income: {formatCurrency(t.grossTotalIncome)}</div>
      <div className="font-bold mt-1">Deductions:</div>
      {t.deductions.map((d) => (
        <div key={d.key} className="flex justify-between gap-2 pl-2">
          <span className="truncate">
            {d.label}
            {d.disallowed ? ' (N/A)' : ''}
            {d.source ? ` — ${d.source}` : ''}
          </span>
          <span className="whitespace-nowrap">{formatCurrency(d.claimed)}</span>
        </div>
      ))}
      <div>Total Deductions: {formatCurrency(t.totalDeductions)}</div>
      <div>Taxable Income: {formatCurrency(t.taxableIncome)}</div>
      <div>Income Tax (pre-rebate): {formatCurrency(t.incomeTaxBeforeRebate)}</div>
      <div>87A Rebate: −{formatCurrency(t.rebate)}</div>
      <div>Income Tax (post-rebate): {formatCurrency(t.incomeTaxAfterRebate)}</div>
      {t.surcharge > 0 && <div>Surcharge: {formatCurrency(t.surcharge)}</div>}
      <div>Cess (4%): {formatCurrency(t.cess)}</div>
      <div className="font-bold">Final Tax: {formatCurrency(t.finalTax)}</div>
      {t.tdsDeducted > 0 && <div>TDS: −{formatCurrency(t.tdsDeducted)}</div>}
      <div className="font-bold">
        {t.refund > 0
          ? `Refund: ${formatCurrency(t.refund)}`
          : t.taxPayable > 0
            ? `Payable: ${formatCurrency(t.taxPayable)}`
            : 'Balanced'}
      </div>
    </div>
  )
}

// Render an arbitrary trace cell (input/output are `unknown`) as readable text.
function traceCell(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

// Colour map for source badges in the Calculation Trace (Part 5).
const SOURCE_BADGE: Record<string, string> = {
  FORM16_OCR:        'bg-brand-yellow text-on-surface',
  INVESTMENT_RECORD: 'bg-surface-container-high text-on-surface',
  USER_INPUT:        'bg-on-surface text-white',
  SYSTEM_DEFAULT:    'bg-surface-container-low border border-on-surface/40 text-on-surface-variant',
  COMPUTED:          'bg-white border border-on-surface/40 text-on-surface-variant',
}

function SourceBadge({ source }: { source?: string }) {
  if (!source) return null
  const cls = SOURCE_BADGE[source] ?? 'bg-surface-container-low text-on-surface-variant'
  return (
    <span className={`inline-block text-[9px] font-bold uppercase px-2 py-0.5 brutal-thin whitespace-nowrap ${cls}`}>
      {source.replace(/_/g, ' ')}
    </span>
  )
}

// Calculation Trace — every step of the deterministic engine, rendered as a
// Step / Input / Formula / Source / Output table (Part 9 + Part 5).
function CalculationTraceTable({ trace }: { trace?: CalculationTraceStep[] | null }) {
  if (!trace || trace.length === 0) return null
  return (
    <div className="bg-white brutal p-lg overflow-x-auto">
      <table className="w-full text-xs font-mono-data">
        <thead>
          <tr className="text-left border-b-2 border-on-surface text-on-surface-variant uppercase">
            <th className="py-1 pr-3 font-bold">Step</th>
            <th className="py-1 px-3 font-bold">Input Value</th>
            <th className="py-1 px-3 font-bold">Formula</th>
            <th className="py-1 px-3 font-bold">Source</th>
            <th className="py-1 pl-3 font-bold">Output</th>
          </tr>
        </thead>
        <tbody>
          {trace.map((s, i) => (
            <tr key={i} className="border-b border-on-surface/40 align-top">
              <td className="py-2 pr-3 font-bold">{s.step}</td>
              <td className="py-2 px-3 whitespace-pre-wrap break-words">{traceCell(s.input)}</td>
              <td className="py-2 px-3 text-on-surface-variant whitespace-pre-wrap break-words">
                {s.formula}
              </td>
              <td className="py-2 px-3">
                <SourceBadge source={s.source} />
              </td>
              <td className="py-2 pl-3 font-bold">{traceCell(s.output)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Deduction Source Table — provenance for every deduction line item (Part 9).
function deductionStatus(d: DeductionLineItem): string {
  if (d.duplicateRisk) return 'Excluded – Exceeds Limit'
  if (d.needsConfirmation) return 'Excluded – Unconfirmed'
  return 'Applied'
}

function DeductionSourceTable({ items }: { items?: DeductionLineItem[] | null }) {
  if (!items || items.length === 0) return null
  return (
    <div className="bg-white brutal p-lg overflow-x-auto">
      <table className="w-full text-xs font-mono-data">
        <thead>
          <tr className="text-left border-b-2 border-on-surface text-on-surface-variant uppercase">
            <th className="py-1 pr-3 font-bold">Section</th>
            <th className="py-1 px-3 font-bold">Subtype</th>
            <th className="py-1 px-3 font-bold text-right">Amount</th>
            <th className="py-1 px-3 font-bold">Source</th>
            <th className="py-1 px-3 font-bold text-right">Conf.</th>
            <th className="py-1 pl-3 font-bold">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((d, i) => {
            const status = deductionStatus(d)
            const excluded = status !== 'Applied'
            return (
              <tr key={i} className="border-b border-on-surface/40 align-top">
                <td className="py-2 pr-3 font-bold">{d.section}</td>
                <td className="py-2 px-3">{d.subtype ?? '—'}</td>
                <td className="py-2 px-3 text-right">{formatCurrency(d.amount)}</td>
                <td className="py-2 px-3">{d.source ?? '—'}</td>
                <td className="py-2 px-3 text-right">{d.confidence}</td>
                <td className={`py-2 pl-3 font-bold ${excluded ? 'text-error' : 'text-on-surface'}`}>
                  {excluded && <Icon name="warning" className="text-sm align-middle mr-1" />}
                  {status}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ----- page ----------------------------------------------------------------

export function TaxRecommendation() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { data, loading } = useAsync(
    () => form16Service.getRecommendation(id ?? ''),
    [id],
  )



  if (loading || !data) return <LoadingBlock label="Loading recommendation…" />

  return (
    <div>
      <PageHeader
        title="Tax Recommendation"
        subtitle="Based on your Form 16 & declared investments for FY 2025-26."
        action={
          <Button variant="white" onClick={() => navigate('/form16')}>
            <Icon name="arrow_back" className="text-xl" />
            Back to Form 16
          </Button>
        }
      />

      {/* Audit: Gross-Salary vs component-sum mismatch warning */}
      {data.grossSalaryMismatch && (
        <div className="w-full bg-error-container border-[3px] border-on-surface brutal p-md mb-xl flex items-start gap-3 relative overflow-hidden">
          <Icon name="warning" className="text-2xl mt-0.5 shrink-0" />
          <div>
            <p className="font-bold uppercase">Gross Salary mismatch detected</p>
            <p className="font-medium">{data.mismatchDetail}</p>
          </div>
        </div>
      )}

      {/* Recommendation banner */}
      <div className="w-full bg-brand-yellow brutal p-lg md:p-xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden mb-xl">
        <div className="absolute -right-10 -top-10 opacity-10">
          <Icon name="verified" className="text-[200px]" filled />
        </div>
        <div className="z-10 flex-1">
          <div className="inline-flex items-center gap-2 bg-white brutal-thin px-3 py-1 mb-4">
            <Icon name="star" className="text-on-surface" filled />
            <span className="font-bold uppercase">Optimal Choice</span>
          </div>
          <h2 className="font-bold text-2xl mb-2">
            {data.recommendedRegime} Regime saves you more
          </h2>
          <p className="font-medium border-l-[3px] border-on-surface pl-4 ml-1 max-w-xl">
            {data.explanation}
          </p>
        </div>
        <div className="z-10 bg-white brutal p-lg text-center min-w-[220px]">
          <p className="font-bold uppercase text-on-surface-variant mb-2">You Save</p>
          <p className="font-bold text-4xl text-on-surface">{formatCurrency(data.savingsAmount)}</p>
        </div>
      </div>

      {/* Comparison waterfalls */}
      <div className="relative mb-xl">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 hidden md:flex w-16 h-16 rounded-full brutal bg-white items-center justify-center">
          <span className="font-bold text-lg">VS</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <RegimeWaterfall trace={data.regimes.old} recommended={data.recommendedRegime === 'Old'} />
          <RegimeWaterfall trace={data.regimes.new} recommended={data.recommendedRegime === 'New'} />
        </div>
      </div>

      {/* Tax saving suggestions */}
      <div className="pt-lg border-t-[3px] border-on-surface">
        <h3 className="font-bold text-xl uppercase mb-6">Tax Saving Suggestions (Next FY)</h3>
        <div className="flex overflow-x-auto gap-6 pb-8 no-scrollbar">
          {data.taxSavingSuggestions.map((s) => (
            <div
              key={s.id}
              className="min-w-[300px] md:min-w-[340px] bg-white brutal p-lg flex flex-col"
            >
              <div className="w-12 h-12 bg-brand-yellow brutal flex items-center justify-center mb-4">
                <Icon name={s.icon} />
              </div>
              <h4 className="font-bold text-lg mb-2">{s.title}</h4>
              <p className="font-medium text-on-surface-variant flex-1 mb-4">{s.detail}</p>
              <div className="bg-surface-container-low brutal-thin flex justify-between items-center p-3">
                <span className="font-bold uppercase">Potential Savings:</span>
                <span className="font-mono-data font-bold">{formatCurrency(s.potentialSaving)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* General Reference — static deduction notes (NOT personalized data) */}
      {data.deductionBreakdown && data.deductionBreakdown.length > 0 && (
        <div className="pt-lg border-t-[3px] border-on-surface mt-xl">
          {/* Prominent disclaimer box — this section must never be confused with the user's actual deductions */}
          <div className="flex items-start gap-3 bg-surface-container-high border-[3px] border-on-surface brutal-thin p-4 mb-6">
            <Icon name="info" className="text-2xl mt-0.5 shrink-0 text-on-surface-variant" />
            <div>
              <p className="font-bold uppercase text-sm text-on-surface-variant mb-1">
                General Reference Only — These Are Not Your Actual Deductions
              </p>
              <p className="font-medium text-on-surface-variant text-sm">
                The table below shows the statutory rules and limits for each deduction section
                as general educational reference. Your actual verified deductions are shown in the
                waterfall breakdown above.
              </p>
            </div>
          </div>
          <h3 className="font-bold text-xl uppercase mb-2 text-on-surface-variant">Deduction Section Reference</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {data.deductionBreakdown.map((d) => (
              <div key={d.section} className="bg-surface-container-low brutal-thin border-2 border-on-surface/40 p-lg flex flex-col gap-3">
                <div className="flex justify-between items-baseline border-b-2 border-on-surface/40 pb-2">
                  <h4 className="font-bold text-base uppercase text-on-surface-variant">{d.label}</h4>
                  {d.amount > 0 && (
                    <span className="font-mono-data font-bold text-on-surface-variant">{formatCurrency(d.amount)}</span>
                  )}
                </div>
                <p className="font-medium text-on-surface-variant text-sm">{d.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Debug / calculation trace (every figure, derived step by step) */}
      {data.debug && (
        <div className="pt-lg border-t-[3px] border-on-surface mt-xl">
          <h3 className="font-bold text-xl uppercase mb-2">Calculation Trace (Debug)</h3>
          <p className="font-medium text-on-surface-variant mb-6 max-w-2xl">
            Every figure above, derived step by step from the Form 16 and your declared data — so any
            value can be verified against its source.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white brutal p-lg">
              <DebugTraceBlock t={(data.debug as { old: DebugTraceT }).old} regime="Old" />
            </div>
            <div className="bg-white brutal p-lg">
              <DebugTraceBlock t={(data.debug as { new: DebugTraceT }).new} regime="New" />
            </div>
          </div>
        </div>
      )}

      {/* Deduction source table — provenance for every deduction (Part 9) */}
      {data.deductionLineItems && data.deductionLineItems.length > 0 && (
        <div className="pt-lg border-t-[3px] border-on-surface mt-xl">
          <h3 className="font-bold text-xl uppercase mb-2">Deduction Source Table</h3>
          <p className="font-medium text-on-surface-variant mb-6 max-w-2xl">
            Every deduction, its origin, the confidence we have in it, and its verification status.
            Items that could not be confirmed, or that exceed the statutory limit, are excluded
            from the calculation.
          </p>
          <DeductionSourceTable items={data.deductionLineItems} />
        </div>
      )}

      {/* Calculation trace — collapsible, every step of the engine (Part 9) */}
      <div className="pt-lg border-t-[3px] border-on-surface mt-xl">
        <Expandable title="Calculation Trace" defaultOpen={false}>
          <p className="font-medium text-on-surface-variant mb-6 max-w-2xl">
            Every step of the deterministic computation, with the input values, the exact formula
            applied, and the output — so each figure can be verified against its source. This trace
            is generated by the engine, not written by AI.
          </p>
          {data.calculationTrace && data.calculationTrace.length > 0 ? (
            <CalculationTraceTable trace={data.calculationTrace} />
          ) : (
            <p className="font-medium text-on-surface-variant">
              A structured trace was not stored for this recommendation. See the Calculation Trace
              (Debug) block above for the regime-specific breakdown.
            </p>
          )}
        </Expandable>
      </div>

      {/* Bottom actions */}
      <div className="flex flex-col md:flex-row justify-end gap-4 mt-lg pt-lg border-t-[3px] border-on-surface">
        <Button variant="white" onClick={() => navigate('/form16')}>
          Back to Form 16
        </Button>
        <Button variant="yellow" onClick={() => window.print()}>
          <Icon name="download" className="text-xl" />
          Download Tax Summary PDF
        </Button>
      </div>
    </div>
  )
}
