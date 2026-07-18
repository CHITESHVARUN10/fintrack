import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { form16Service } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Input } from '../components/ui/Field'
import { UnsavedModal } from '../components/form16/UnsavedModal'
import { formatCurrency } from '../lib/format'
import { useTaxpayerContext } from '../context/TaxpayerContext'
import { computeTax, computeTaxPreview, previewDeductionSplit, TAX_CONFIG } from '../lib/tax'
import type { Form16, Form16Regime, GrossSalarySource, DeductionLineItem } from '../types'


type TagKind = 'ai' | 'modified' | 'none'

function Tag({ kind }: { kind: TagKind }) {
  if (kind === 'ai')
    return (
      <span className="bg-brand-yellow text-on-surface text-[10px] px-2 py-0.5 brutal-thin uppercase font-bold">
        AI Filled
      </span>
    )
  if (kind === 'modified')
    return (
      <span className="bg-on-surface text-white text-[10px] px-2 py-0.5 border-2 border-on-surface uppercase font-bold">
        Modified
      </span>
    )
  return null
}

// Source badge colours: INVESTMENT_RECORD=teal (distinct) vs FORM16_OCR=yellow.
// Users immediately see which deductions came from stored financial data vs the PDF.
function SourceBadge({ source }: { source: string | null | undefined }) {
  if (!source) return null
  const cls =
    source === 'INVESTMENT_RECORD'
      ? 'bg-teal-100 text-teal-800 border border-teal-400'
      : source === 'FORM16_OCR'
        ? 'bg-brand-yellow text-on-surface border border-on-surface'
        : 'bg-surface-container-high text-on-surface-variant border border-on-surface/40'
  return (
    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-sm whitespace-nowrap ${cls}`}>
      {source.replace(/_/g, ' ')}
    </span>
  )
}

// Single applied-deduction row. 24b gets special treatment: bold subheading +
// inline regime note (immediately visible, no hover required).
function AppliedDeductionRow({ d }: { d: { section: string; subtype: string | null; amount: number; source: string | null } }) {
  const is24b = d.section.startsWith('24')
  return (
    <div className="px-4 py-3 border-b border-on-surface/20 last:border-0">
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{d.section}</span>
            <SourceBadge source={d.source} />
          </div>
          {is24b && (
            <>
              <p className="font-bold text-xs mt-1">Home Loan Interest</p>
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-300 px-2 py-0.5 mt-1 rounded-sm font-medium">
                ⚠ Applies in Old Regime only — not applicable in New Regime
              </p>
            </>
          )}
          {d.source === 'INVESTMENT_RECORD' && !is24b && (
            <p className="text-[11px] text-teal-700 mt-0.5">From your stored financial records</p>
          )}
        </div>
        <span className="font-bold whitespace-nowrap">{formatCurrency(d.amount)}</span>
      </div>
    </div>
  )
}

function EditableField({
  formKey,
  label,
  form,
  setField,
  modified,
  tagKind,
  type = 'text',
}: {
  formKey: keyof Form16
  label: string
  form: Partial<Form16>
  setField: (k: keyof Form16, v: string | number) => void
  modified: boolean
  tagKind: TagKind
  type?: 'text' | 'number'
}) {
  const value = (form[formKey] as string | number | undefined) ?? ''
  return (
    <div className="space-y-2">
      <label className="font-bold text-sm uppercase flex justify-between items-center gap-2">
        <span>{label}</span>
        <Tag kind={modified ? 'modified' : tagKind} />
      </label>
      <Input
        type={type}
        value={value as string}
        onChange={(e) =>
          setField(formKey, type === 'number' ? Number(e.target.value) : e.target.value)
        }
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white brutal p-lg">
      <h2 className="font-bold text-xl uppercase mb-4 border-b-[3px] border-on-surface pb-2">
        {title}
      </h2>
      {children}
    </section>
  )
}

function ReviewForm({ record }: { record: Form16 }) {
  const navigate = useNavigate()
  const [form, setForm] = useState<Partial<Form16>>({ ...record })
  const [modified, setModified] = useState<Set<string>>(new Set())
  const [regime, setRegime] = useState<Form16Regime>(record.taxRegimeUsed)
  const [unsavedOpen, setUnsavedOpen] = useState(false)
  const [deductionsLoaded, setDeductionsLoaded] = useState(false)

  const { ctx, load, setFromForm, loadDeductions, finalize } = useTaxpayerContext()

  // Step 1: Load Form16 record into TaxpayerContext (Form16-only fields).
  useEffect(() => {
    if (record) load(record)
  }, [record, load])

  // Step 2 (Final 3% Part 1): Fetch complete merged deductions from all three
  // sources via /deductions-preview and populate ctx.deductions.
  useEffect(() => {
    if (!record.id) return
    form16Service.getDeductionsPreview(record.id).then(({ deductions }) => {
      if (deductions && deductions.length > 0) loadDeductions(deductions)
      setDeductionsLoaded(true)
    }).catch(() => setDeductionsLoaded(true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id])

  const aiExtracted = record.sourceType !== 'Manual'

  const setField = (k: keyof Form16, v: string | number) => {
    setForm((f) => {
      const next = { ...f, [k]: v }
      setFromForm(next) // keep the canonical context in sync
      return next
    })
    setModified((m) => new Set(m).add(k as string))
  }

  const dirty = modified.size > 0 || regime !== record.taxRegimeUsed

  const preview = ctx ? computeTaxPreview(ctx) : null
  const gross = ctx?.salary.grossSalary ?? 0
  const grossSource: GrossSalarySource | undefined = ctx?.salary.grossSalarySource
  const unverified = preview?.unverifiedDeductions ?? 0
  const oldTaxable = preview?.oldTaxable ?? 0
  const newTaxable = preview?.newTaxable ?? 0

  // Itemized deduction split — mirrors the exact three-condition filter in computeRegimeResult.
  const split = ctx ? previewDeductionSplit(ctx.deductions) : null
  const verified = split ? split.verifiedTotal : 0
  const duplicateFlagged = preview?.duplicateFlaggedDeductions ?? 0

  const oldT = computeTax(oldTaxable, 'Old')
  const newT = computeTax(newTaxable, 'New')
  const recommended: Form16Regime = oldT.total <= newT.total ? 'Old' : 'New'
  const savings = Math.abs(oldT.total - newT.total)

  // Part 6 — Runtime consistency guard (dev-only). Verifies that the values
  // computed by computeTaxPreview match the canonical context's computedIncome
  // snapshot (when available after the backend returns a recommendation).
  useEffect(() => {
    if (!ctx || import.meta.env.PROD) return
    const ci = ctx.computedIncome
    if (!ci || ci.totalDeductions === 0) return // not yet computed by backend
    if (Math.abs(verified - ci.totalDeductions) > 1) {
      console.error(
        `[REVIEW GUARD] verifiedDeductions mismatch: ` +
        `preview=${verified} vs ctx.computedIncome=${ci.totalDeductions}`
      )
    }
    if (Math.abs(oldTaxable - ci.taxableIncomeOldRegime) > 1) {
      console.error(
        `[REVIEW GUARD] Old regime taxable mismatch: ` +
        `preview=${oldTaxable} vs ctx.computedIncome=${ci.taxableIncomeOldRegime}`
      )
    }
  }, [ctx, verified, oldTaxable])

  const goBack = () => {
    if (dirty) setUnsavedOpen(true)
    else navigate('/form16')
  }

  const save = async (then: 'list' | 'recommend') => {
    // Part 1 / Final 3%: finalize context lock BEFORE saving.
    finalize()
    // Persist finalized deductions to backend so recommendation flow uses them.
    if (ctx && ctx.deductions && ctx.deductions.length > 0) {
      try {
        await form16Service.finalizeForm16(record.id, ctx.deductions as DeductionLineItem[])
      } catch {
        console.warn('[Form16Review] Failed to persist finalized deductions.')
      }
    }
    const updated = await form16Service.update(record.id, { ...form, taxRegimeUsed: regime })
    if (then === 'list' || !updated) navigate('/form16')
    else navigate(`/form16/recommendation/loading?form=${record.id}`)
  }

  // Brief loading state while fetching merged deductions from all sources.
  if (!deductionsLoaded) {
    return <LoadingBlock label="Loading deduction preview from all sources…" />
  }

  return (
    <div>
      <PageHeader
        title="Review Form 16 Details"
        subtitle="Verify the extracted information before proceeding to tax recommendations."
        action={
          <Button variant="white" onClick={goBack}>
            <Icon name="arrow_back" className="text-xl" />
            Back
          </Button>
        }
      />

      <div className="bg-brand-yellow brutal p-4 mb-lg flex items-start gap-3">
        <Icon name="auto_awesome" className="mt-1" />
        <div>
          <p className="font-bold">AI has extracted the following fields.</p>
          <p className="font-medium text-on-surface-variant">
            Please review carefully. Yellow tags indicate AI-filled data. Black tags indicate manually
            modified data.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-col gap-lg"
      >
        {/* Employee Details */}
        <Section title="Employee Details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
            <EditableField formKey="employeePAN" label="PAN" form={form} setField={setField} modified={modified.has('employeePAN')} tagKind={aiExtracted ? 'ai' : 'none'} />
            <EditableField formKey="employeeName" label="Full Name" form={form} setField={setField} modified={modified.has('employeeName')} tagKind={aiExtracted ? 'ai' : 'none'} />
            <EditableField formKey="employeeDesignation" label="Designation" form={form} setField={setField} modified={modified.has('employeeDesignation')} tagKind={aiExtracted ? 'ai' : 'none'} />
            <EditableField formKey="employeeCode" label="Employee Code" form={form} setField={setField} modified={modified.has('employeeCode')} tagKind={aiExtracted ? 'ai' : 'none'} />
            <div className="md:col-span-2">
              <EditableField formKey="employeeAddress" label="Address" form={form} setField={setField} modified={modified.has('employeeAddress')} tagKind={aiExtracted ? 'ai' : 'none'} />
            </div>
          </div>
        </Section>

        {/* Employer Details */}
        <Section title="Employer Details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
            <EditableField formKey="employerTAN" label="TAN" form={form} setField={setField} modified={modified.has('employerTAN')} tagKind={aiExtracted ? 'ai' : 'none'} />
            <EditableField formKey="employerName" label="Employer Name" form={form} setField={setField} modified={modified.has('employerName')} tagKind={aiExtracted ? 'ai' : 'none'} />
            <EditableField formKey="employerPAN" label="Employer PAN" form={form} setField={setField} modified={modified.has('employerPAN')} tagKind={aiExtracted ? 'ai' : 'none'} />
            <EditableField formKey="employerAddress" label="Employer Address" form={form} setField={setField} modified={modified.has('employerAddress')} tagKind={aiExtracted ? 'ai' : 'none'} />
          </div>
        </Section>

        {/* Salary Breakdown */}
        <Section title="Salary Breakdown">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
            <EditableField formKey="basicSalary" label="Basic Salary" form={form} setField={setField} modified={modified.has('basicSalary')} tagKind={aiExtracted ? 'ai' : 'none'} type="number" />
            <EditableField formKey="hra" label="HRA" form={form} setField={setField} modified={modified.has('hra')} tagKind={aiExtracted ? 'ai' : 'none'} type="number" />
            <EditableField formKey="specialAllowance" label="Special Allowance" form={form} setField={setField} modified={modified.has('specialAllowance')} tagKind={aiExtracted ? 'ai' : 'none'} type="number" />
            <EditableField formKey="lta" label="LTA" form={form} setField={setField} modified={modified.has('lta')} tagKind={aiExtracted ? 'ai' : 'none'} type="number" />
            <EditableField formKey="otherAllowances" label="Other Allowances" form={form} setField={setField} modified={modified.has('otherAllowances')} tagKind={aiExtracted ? 'ai' : 'none'} type="number" />
          </div>
          <div className="mt-lg p-4 bg-brand-yellow border-[3px] border-on-surface flex justify-between items-center">
            <span className="font-bold uppercase flex items-center gap-2">
              Gross Salary
              {grossSource && (
                <span className="text-[10px] bg-on-surface text-white px-2 py-0.5 border-2 border-on-surface uppercase">
                  {grossSource.replace(/_/g, ' ')}
                </span>
              )}
            </span>
            <span className="font-bold text-2xl">{formatCurrency(gross)}</span>
          </div>
        </Section>

        {/* Deductions */}
        <Section title="Deductions">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
            <EditableField formKey="standardDeduction" label="Standard Deduction (16(ia))" form={form} setField={setField} modified={modified.has('standardDeduction')} tagKind={aiExtracted ? 'ai' : 'none'} type="number" />
            <EditableField formKey="professionalTax" label="Professional Tax (16(iii))" form={form} setField={setField} modified={modified.has('professionalTax')} tagKind={aiExtracted ? 'ai' : 'none'} type="number" />
            <EditableField formKey="section80C" label="Section 80C" form={form} setField={setField} modified={modified.has('section80C')} tagKind={aiExtracted ? 'ai' : 'none'} type="number" />
            <EditableField formKey="section80D" label="Section 80D" form={form} setField={setField} modified={modified.has('section80D')} tagKind={aiExtracted ? 'ai' : 'none'} type="number" />
            <EditableField formKey="section80E" label="Section 80E" form={form} setField={setField} modified={modified.has('section80E')} tagKind={aiExtracted ? 'ai' : 'none'} type="number" />
            <EditableField formKey="section80G" label="Section 80G" form={form} setField={setField} modified={modified.has('section80G')} tagKind={aiExtracted ? 'ai' : 'none'} type="number" />
            <EditableField formKey="section80CCD" label="Section 80CCD" form={form} setField={setField} modified={modified.has('section80CCD')} tagKind={aiExtracted ? 'ai' : 'none'} type="number" />
          </div>
          {/* Itemized Deduction Split — shows exactly what the engine will apply
              vs exclude. Produced by previewDeductionSplit() which mirrors the
              three-condition filter in computeRegimeResult identically. */}
          <div className="mt-lg space-y-4">
            {/* Source legend */}
            <div className="flex items-center gap-3 text-[11px] text-on-surface-variant">
              <span className="font-bold uppercase">Source:</span>
              <SourceBadge source="FORM16_OCR" /><span>Form 16 PDF</span>
              <SourceBadge source="INVESTMENT_RECORD" /><span>Your financial records</span>
            </div>
            {/* Applied deductions list */}
            <div>
              <p className="font-bold text-xs uppercase text-on-surface-variant mb-2 flex items-center gap-2">
                Chapter VI-A Deductions
                <span className="text-[10px] bg-surface-container-high border border-on-surface/40 px-2 py-0.5 cursor-help" title="These are deductions available under the Old Regime only">INFO</span>
              </p>
              <div className="bg-surface-container-low border-[3px] border-on-surface">
                {split?.appliedDeductions.length === 0 && (
                  <p className="p-3 text-sm text-on-surface-variant">No verified deductions found.</p>
                )}
                {split?.appliedDeductions.map((d, i) => (
                  <AppliedDeductionRow key={i} d={d} />
                ))}
                <div className="flex justify-between items-center px-4 py-3 bg-surface-container-high border-t-[3px] border-on-surface">
                  <span className="font-bold uppercase text-sm">Chapter VI-A Total</span>
                  <span className="font-bold text-xl">{formatCurrency(verified)}</span>
                </div>
              </div>
            </div>

            {/* Standard Deduction */}
            <div className="mt-4">
              <p className="font-bold text-xs uppercase text-on-surface-variant mb-2">Standard Deduction (Available to salaried taxpayers)</p>
              <div className="bg-surface-container-low border-[3px] border-on-surface">
                <div className="px-4 py-3 border-b border-on-surface/20">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">Old Regime Standard Deduction</span>
                        <SourceBadge source="SYSTEM_DEFAULT" />
                      </div>
                    </div>
                    {/* Reads TAX_CONFIG STANDARD_DEDUCTION.Old */}
                    <span className="font-bold whitespace-nowrap">{formatCurrency(TAX_CONFIG['2025-26'].STANDARD_DEDUCTION.Old)}</span>
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">New Regime Standard Deduction</span>
                        <SourceBadge source="SYSTEM_DEFAULT" />
                      </div>
                    </div>
                    {/* Reads TAX_CONFIG STANDARD_DEDUCTION.New */}
                    <span className="font-bold whitespace-nowrap">{formatCurrency(TAX_CONFIG['2025-26'].STANDARD_DEDUCTION.New)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Computed Summary Box */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white border-[3px] border-on-surface p-4 flex flex-col justify-between">
                <div>
                  <p className="font-bold uppercase text-sm mb-2">Old Regime</p>
                  <div className="text-sm space-y-1 mb-4 text-on-surface-variant">
                    <div className="flex justify-between"><span>Chapter VI-A Total</span><span>{formatCurrency(verified)}</span></div>
                    <div className="flex justify-between"><span>+ Standard Deduction Old</span><span>{formatCurrency(TAX_CONFIG['2025-26'].STANDARD_DEDUCTION.Old)}</span></div>
                  </div>
                </div>
                <div className="flex justify-between items-center border-t-2 border-on-surface/20 pt-2 mt-auto">
                  <span className="font-bold uppercase text-sm">Total Deductions Old</span>
                  <span className="font-bold text-lg">{formatCurrency(verified + TAX_CONFIG['2025-26'].STANDARD_DEDUCTION.Old)}</span>
                </div>
              </div>
              
              <div className="bg-white border-[3px] border-on-surface p-4 flex flex-col justify-between">
                <div>
                  <p className="font-bold uppercase text-sm mb-2">New Regime</p>
                  <div className="text-sm space-y-1 mb-4 text-on-surface-variant">
                    <div className="flex justify-between"><span>No Chapter VI-A Deductions</span><span>₹0</span></div>
                    <div className="flex justify-between"><span>+ Standard Deduction New</span><span>{formatCurrency(TAX_CONFIG['2025-26'].STANDARD_DEDUCTION.New)}</span></div>
                  </div>
                </div>
                <div className="flex justify-between items-center border-t-2 border-on-surface/20 pt-2 mt-auto">
                  <span className="font-bold uppercase text-sm">Total Deductions New</span>
                  <span className="font-bold text-lg">{formatCurrency(TAX_CONFIG['2025-26'].STANDARD_DEDUCTION.New)}</span>
                </div>
              </div>
            </div>

            {/* Excluded deductions list */}
            {split && split.excludedDeductions.length > 0 && (
              <div>
                <p className="font-bold text-xs uppercase text-on-surface-variant mb-2 flex items-center gap-2">
                  <Icon name="warning" className="text-base" />
                  Deductions That Will Be Excluded
                </p>
                <div className="bg-error-container border-[3px] border-on-surface">
                  {split.excludedDeductions.map((d, i) => (
                    <div key={i} className="flex justify-between items-start px-4 py-2 border-b border-on-surface/20 last:border-0">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{d.section}</p>
                          <SourceBadge source={d.source} />
                        </div>
                        <p className="text-[11px] text-on-surface-variant">{d.reason}</p>
                      </div>
                      <span className="font-bold ml-4">{formatCurrency(d.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center px-4 py-3 border-t-[3px] border-on-surface">
                    <span className="font-bold uppercase text-sm">Total Excluded</span>
                    <span className="font-bold text-xl">{formatCurrency(unverified + duplicateFlagged)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Taxable income previews */}
            <p className="font-bold text-xs uppercase text-on-surface-variant">Taxable Income Preview</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 bg-white border-[3px] border-on-surface flex justify-between items-center">
                <span className="font-bold uppercase">Old Regime Taxable Income</span>
                <span className="font-bold text-xl">{formatCurrency(oldTaxable)}</span>
              </div>
              <div className="p-4 bg-white border-[3px] border-on-surface flex justify-between items-center">
                <span className="font-bold uppercase">New Regime Taxable Income</span>
                <span className="font-bold text-xl">{formatCurrency(newTaxable)}</span>
              </div>
            </div>
          </div>
        </Section>

        {/* Regime Selector */}
        <section className="mt-lg pt-md">
          <h3 className="font-bold text-xl uppercase text-center mb-6">Select Recommended Regime</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(['Old', 'New'] as Form16Regime[]).map((r) => {
              const t = r === 'Old' ? oldT : newT
              const isRec = recommended === r
              const selected = regime === r
              return (
                <label key={r} className="cursor-pointer relative">
                  <input
                    type="radio"
                    name="tax_regime"
                    className="sr-only"
                    checked={selected}
                    onChange={() => setRegime(r)}
                  />
                  <div
                    className={`bg-white brutal p-lg h-full transition-all ${
                      selected ? 'bg-brand-yellow translate-x-[4px] translate-y-[4px] shadow-none' : ''
                    }`}
                  >
                    {isRec && (
                      <div className="absolute -top-3 -right-3 bg-on-surface text-white px-3 py-1 border-[3px] border-on-surface font-bold uppercase rotate-3 shadow-brutal-sm">
                        Recommended
                      </div>
                    )}
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="font-bold text-lg uppercase">{r} Regime</h4>
                      <div className="w-6 h-6 border-[3px] border-on-surface flex items-center justify-center bg-white">
                        {selected && <Icon name="check" className="text-on-surface" filled />}
                      </div>
                    </div>
                    <div className="space-y-2 mb-4 border-t-[3px] border-on-surface pt-4">
                      <div className="flex justify-between font-mono-data">
                        <span>Taxable Income</span>
                        <span>{formatCurrency(r === 'Old' ? oldTaxable : newTaxable)}</span>
                      </div>
                      <div className="flex justify-between font-mono-data font-bold">
                        <span>Estimated Tax</span>
                        <span>{formatCurrency(t.total)}</span>
                      </div>
                    </div>
                    <div className="bg-surface-container-high border-[3px] border-on-surface p-2 text-center font-bold uppercase">
                      {isRec ? 'Optimal choice' : r === 'New' ? `Saves ${formatCurrency(savings)}` : 'Requires deductions'}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 pt-lg border-t-[3px] border-on-surface mt-lg">
          <Button variant="white" type="button" onClick={() => save('list')}>
            Save as Draft
          </Button>
          <Button
            variant="yellow"
            type="button"
            block
            className="sm:flex-1 sm:text-right"
            onClick={() => save('recommend')}
          >
            Save and Continue to Tax Recommendation
            <Icon name="arrow_forward" className="text-xl align-middle ml-2" />
          </Button>
        </div>
      </form>

      <UnsavedModal
        open={unsavedOpen}
        onStay={() => setUnsavedOpen(false)}
        onLeave={() => navigate('/form16')}
      />
    </div>
  )
}

export function Form16Review() {
  const { id } = useParams()
  const { data, loading } = useAsync(() => form16Service.get(id ?? ''), [id])
  if (loading || !data) return <LoadingBlock label="Loading Form 16…" />
  return <ReviewForm record={data} />
}
