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
import { computeTax, computeTaxPreview, previewDeductionSplit } from '../lib/tax'
import type { Form16, Form16Regime, GrossSalarySource } from '../types'


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

  // The TaxpayerContext is the SINGLE source of truth (Part 1 / Part 6).
  // We load it from the record and keep it in sync on every edit; the
  // computed boxes below read from it (never an independent re-sum).
  const { ctx, load, setFromForm, finalize } = useTaxpayerContext()
  useEffect(() => {
    if (record) load(record)
  }, [record, load])

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
    finalize() // freeze the canonical context as the values sent to the engine
    const updated = await form16Service.update(record.id, { ...form, taxRegimeUsed: regime })
    if (then === 'list' || !updated) navigate('/form16')
    else navigate(`/form16/recommendation/loading?form=${record.id}`)
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
            {/* Applied deductions list */}
            <div>
              <p className="font-bold text-xs uppercase text-on-surface-variant mb-2">Deductions That Will Be Applied</p>
              <div className="bg-surface-container-low border-[3px] border-on-surface">
                {split?.appliedDeductions.length === 0 && (
                  <p className="p-3 text-sm text-on-surface-variant">No verified deductions found.</p>
                )}
                {split?.appliedDeductions.map((d, i) => (
                  <div key={i} className="flex justify-between items-center px-4 py-2 border-b border-on-surface/20 last:border-0">
                    <span className="text-sm font-medium">{d.section}</span>
                    <span className="font-bold">{formatCurrency(d.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center px-4 py-3 bg-surface-container-high border-t-[3px] border-on-surface">
                  <span className="font-bold uppercase text-sm">Total (excl. Standard Deduction)</span>
                  <span className="font-bold text-xl">{formatCurrency(verified)}</span>
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
                        <p className="text-sm font-medium">{d.section}</p>
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
