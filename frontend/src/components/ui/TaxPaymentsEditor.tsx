import type { TaxPayment } from '../../types'
import { Field, Input, Select } from './Field'
import { Icon } from './Icon'

const SECTIONS: TaxPayment['section'][] = ['80C', '80CCD', '80D', '80E', '80G', '24b']

// Records the amounts actually paid during a financial year. These are the
// only figures the tax engine aggregates — portfolio balances and scheduled
// premiums are deliberately excluded.
export function TaxPaymentsEditor({
  value,
  onChange,
}: {
  value: TaxPayment[]
  onChange: (payments: TaxPayment[]) => void
}) {
  const update = (index: number, patch: Partial<TaxPayment>) =>
    onChange(value.map((payment, i) => (i === index ? { ...payment, ...patch } : payment)))

  return (
    <fieldset className="brutal-thin p-sm flex flex-col gap-sm min-w-0">
      <legend className="font-bold text-sm uppercase tracking-wide px-1">
        Paid amounts for tax (optional)
      </legend>

      <p className="text-xs font-medium text-on-surface-variant">
        Enter eligible amounts actually paid during the financial year. Portfolio balances and
        scheduled payments are not counted automatically, so only these entries feed the tax
        estimate.
      </p>

      {value.length === 0 && (
        <p className="text-xs font-bold text-on-surface-variant border-[3px] border-on-surface bg-surface-container-high px-sm py-xs">
          No payments recorded yet — the tax estimate will show ₹0 claimed for this holding.
        </p>
      )}

      {value.map((payment, index) => (
        <div
          key={`${payment.financialYear}-${payment.section}-${index}`}
          className="grid grid-cols-1 sm:grid-cols-4 gap-sm items-end border-t-[3px] border-on-surface pt-sm min-w-0"
        >
          <Field label="Financial year">
            <Input
              aria-label={`Financial year ${index + 1}`}
              required
              pattern="[0-9]{4}-[0-9]{2}"
              placeholder="2025-26"
              value={payment.financialYear}
              onChange={(event) => update(index, { financialYear: event.target.value })}
            />
          </Field>

          <Field label="Section">
            <Select
              aria-label={`Section ${index + 1}`}
              value={payment.section}
              onChange={(event) => update(index, { section: event.target.value as TaxPayment['section'] })}
            >
              {SECTIONS.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Amount paid (₹)">
            <Input
              aria-label={`Amount paid ${index + 1}`}
              type="number"
              required
              min="0.01"
              step="0.01"
              value={payment.amount || ''}
              onChange={(event) => update(index, { amount: Number(event.target.value) })}
            />
          </Field>

          <button
            type="button"
            className="brutal-thin px-sm py-xs font-bold text-sm uppercase bg-white hover:bg-surface-container-high min-h-[42px]"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            aria-label={`Remove payment ${index + 1}`}
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        className="brutal-thin self-start px-sm py-xs font-bold text-sm uppercase bg-brand-yellow hover:bg-surface-container-high inline-flex items-center gap-1"
        onClick={() => onChange([...value, { financialYear: '2025-26', section: '80C', amount: 0 }])}
      >
        <Icon name="add" className="text-base" />
        Add paid amount
      </button>
    </fieldset>
  )
}
