import { useState } from 'react'
import { incomeService } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { formatCurrency, formatDay } from '../lib/format'
import type { Income } from '../types'

function IncomeForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('Salary')
  const [creditDate, setCreditDate] = useState('1')
  const [taxable, setTaxable] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [notes, setNotes] = useState('')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="flex flex-col gap-lg"
    >
      <Field label="Title">
        <Input placeholder="e.g. Main Salary" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Amount">
          <div className="flex">
            <span className="bg-surface-container-high border-[4px] border-r-0 border-on-surface px-3 flex items-center font-bold">
              ₹
            </span>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="border-l-0"
            />
          </div>
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option>Salary</option>
            <option>Freelance</option>
            <option>Rental</option>
            <option>Business</option>
            <option>Other</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg items-end">
        <Field label="Credit Date (Day of Month)">
          <Input
            type="number"
            min={1}
            max={31}
            value={creditDate}
            onChange={(e) => setCreditDate(e.target.value)}
            className="w-24 text-center"
          />
        </Field>
        <Field label="Taxable Income?">
          <label className="flex items-center gap-sm cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={taxable}
              onChange={(e) => setTaxable(e.target.checked)}
              className="w-5 h-5 accent-brand-yellow"
            />
            <span className="font-bold">{taxable ? 'Yes' : 'No'}</span>
          </label>
        </Field>
      </div>
      <Field label="Start Date">
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </Field>
      <Field label="Notes">
        <Textarea placeholder="Additional details…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-sm pt-sm">
        <Button variant="white" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="yellow" type="submit">
          Save
        </Button>
      </div>
    </form>
  )
}

export function Income({ initialAddOpen = false }: { initialAddOpen?: boolean }) {
  const { data, loading } = useAsync(() => incomeService.list(), [])
  const [open, setOpen] = useState(initialAddOpen)
  const [editing, setEditing] = useState<Income | null>(null)

  if (loading || !data) return <LoadingBlock label="Loading income…" />

  const total = data.reduce((s, i) => s + i.amount, 0)

  return (
    <div>
      <PageHeader
        title="Income Sources"
        subtitle="All recurring monthly income streams."
        action={
          <Button variant="yellow" onClick={() => setOpen(true)}>
            <Icon name="add" className="text-xl" />
            Add Income
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-md lg:gap-8 mb-8">
        {data.map((inc) => (
          <div
            key={inc.id}
            className="bg-white brutal p-md flex flex-col gap-4 relative group"
          >
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold">{inc.title}</h2>
                <Badge color={inc.taxable ? 'yellow' : 'surface'}>
                  {inc.category}
                </Badge>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(inc)}
                  className="bg-white p-2 brutal-thin hover:bg-surface-container-high"
                  title="Edit"
                >
                  <Icon name="edit" className="text-sm" />
                </button>
                <button
                  className="bg-error-container text-on-error-container p-2 brutal-thin hover:bg-error hover:text-on-error"
                  title="Delete"
                >
                  <Icon name="delete" className="text-sm" />
                </button>
              </div>
            </div>
            <div>
              <p className="text-3xl font-bold">{formatCurrency(inc.amount)}</p>
              <div className="flex items-center gap-2 mt-2 font-bold text-sm">
                <Icon name="calendar_today" className="text-sm" />
                Credits on {formatDay(inc.creditDate)}
              </div>
            </div>
            <div className="mt-auto pt-3 border-t-2 border-on-surface flex items-center gap-2">
              <div
                className={`w-3 h-3 brutal-thin ${
                  inc.taxable ? 'bg-error' : 'bg-brand-yellow'
                }`}
              />
              <span className="font-bold text-xs uppercase text-on-surface-variant">
                {inc.taxable ? 'Taxable' : 'Non-Taxable'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="w-full bg-on-surface text-white py-6 px-6 brutal mb-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-lg font-bold uppercase tracking-wider">
            Total Monthly Income
          </span>
          <span className="text-3xl md:text-4xl font-bold text-brand-yellow">
            {formatCurrency(total)}
          </span>
        </div>
      </div>

      <Modal
        open={open || !!editing}
        onClose={() => {
          setOpen(false)
          setEditing(null)
        }}
        title={editing ? 'Edit Income Source' : 'Add Income Source'}
      >
        <IncomeForm onClose={() => { setOpen(false); setEditing(null) }} />
      </Modal>
    </div>
  )
}
