import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { form16Service } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Input } from '../components/ui/Field'
import { UnsavedModal } from '../components/form16/UnsavedModal'
import { formatCurrency } from '../lib/format'
import type { Form16, Form16Regime } from '../types'

const num = (v: unknown) => Number(v) || 0

// Simplified slab calc (FY 2025-26) for the live regime preview.
function computeTax(taxable: number, regime: Form16Regime): { before: number; total: number } {
  const slabs: [number, number][] =
    regime === 'Old'
      ? [[250000, 0], [250000, 0.05], [500000, 0.2], [Infinity, 0.3]]
      : [[300000, 0], [300000, 0.05], [300000, 0.1], [300000, 0.15], [300000, 0.2], [Infinity, 0.3]]
  let remaining = Math.max(0, taxable)
  let before = 0
  for (const [span, rate] of slabs) {
    if (remaining <= 0) break
    const portion = Math.min(remaining, span)
    before += portion * rate
    remaining -= span
  }
  const total = before + before * 0.04
  return { before: Math.round(before), total: Math.round(total) }
}

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

  const aiExtracted = record.sourceType !== 'Manual'

  const setField = (k: keyof Form16, v: string | number) => {
    setForm((f) => ({ ...f, [k]: v }))
    setModified((m) => new Set(m).add(k as string))
  }

  const dirty = modified.size > 0 || regime !== record.taxRegimeUsed

  const gross =
    num(form.basicSalary) +
    num(form.hra) +
    num(form.specialAllowance) +
    num(form.lta) +
    num(form.otherAllowances)
  const totalDed =
    num(form.standardDeduction) +
    num(form.professionalTax) +
    num(form.section80C) +
    num(form.section80D) +
    num(form.section80E) +
    num(form.section80G) +
    num(form.section80CCD)
  const taxable = gross - totalDed

  const oldT = computeTax(taxable, 'Old')
  const newT = computeTax(taxable, 'New')
  const recommended: Form16Regime = oldT.total <= newT.total ? 'Old' : 'New'
  const savings = Math.abs(oldT.total - newT.total)

  const goBack = () => {
    if (dirty) setUnsavedOpen(true)
    else navigate('/form16')
  }

  const save = async (then: 'list' | 'recommend') => {
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
            <span className="font-bold uppercase">Total Gross Salary (computed)</span>
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
          <div className="mt-lg p-4 bg-surface-container-high border-[3px] border-on-surface flex justify-between items-center">
            <span className="font-bold uppercase">Total Deductions (computed)</span>
            <span className="font-bold text-2xl">{formatCurrency(totalDed)}</span>
          </div>
          <div className="mt-sm p-4 bg-white border-[3px] border-on-surface flex justify-between items-center">
            <span className="font-bold uppercase">Taxable Income (computed)</span>
            <span className="font-bold text-2xl">{formatCurrency(taxable)}</span>
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
                        <span>{formatCurrency(taxable)}</span>
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
