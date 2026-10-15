import type { TaxPayment } from '../../types'
import { Field, Input, Select } from './Field'

export function TaxPaymentsEditor({ value, onChange }: { value: TaxPayment[]; onChange: (payments: TaxPayment[]) => void }) {
  const update = (index: number, patch: Partial<TaxPayment>) => onChange(value.map((payment, i) => i === index ? { ...payment, ...patch } : payment))
  return <fieldset className="brutal-thin p-sm flex flex-col gap-sm">
    <legend className="font-bold text-sm">Paid amounts for tax (optional)</legend>
    <p className="text-xs text-on-surface-variant">Enter eligible amounts actually paid during the financial year. Portfolio balances and scheduled payments are not counted automatically.</p>
    {value.map((payment, index) => <div key={index} className="grid grid-cols-1 sm:grid-cols-4 gap-sm items-end">
      <Field label="Financial year"><Input aria-label={`Financial year ${index + 1}`} required pattern="[0-9]{4}-[0-9]{2}" placeholder="2025-26" value={payment.financialYear} onChange={event => update(index, { financialYear: event.target.value })} /></Field>
      <Field label="Section"><Select aria-label={`Section ${index + 1}`} value={payment.section} onChange={event => update(index, { section: event.target.value as TaxPayment['section'] })}>{['80C', '80CCD', '80D', '80E', '80G', '24b'].map(section => <option key={section}>{section}</option>)}</Select></Field>
      <Field label="Amount paid (₹)"><Input aria-label={`Amount paid ${index + 1}`} type="number" required min="0.01" step="0.01" value={payment.amount || ''} onChange={event => update(index, { amount: Number(event.target.value) })} /></Field>
      <button type="button" className="brutal-thin px-sm py-xs font-bold text-sm" onClick={() => onChange(value.filter((_, i) => i !== index))}>Remove</button>
    </div>)}
    <button type="button" className="brutal-thin px-sm py-xs self-start font-bold text-sm" onClick={() => onChange([...value, { financialYear: '2025-26', section: '80C', amount: 0 }])}>Add paid amount</button>
  </fieldset>
}
