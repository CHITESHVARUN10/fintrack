import { useEffect, useState } from 'react'
import { apiClient } from '../services/apiClient'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Table } from '../components/ui/Table'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { formatCurrency, formatDate } from '../lib/format'
import type { EducationPayment, EducationCategory, EducationFrequency } from '../types'

const CATEGORIES: EducationCategory[] = [
  'School',
  'College',
  'Coaching',
  'Online Course',
  'Other',
]
const FREQUENCIES: EducationFrequency[] = [
  'Monthly',
  'Quarterly',
  'Half-Yearly',
  'Yearly',
  'One-time',
]

// Backend documents use Mongo `_id`; normalize so the frontend
// `EducationPayment` type (and all call sites) stay unchanged.
function normalizeEducation(raw: Record<string, unknown>): EducationPayment {
  return {
    id: String(raw._id ?? raw.id),
    memberId: String(raw.memberId ?? ''),
    title: (raw.title as string) ?? '',
    institution: (raw.institution as string) ?? '',
    category: ((raw.category as EducationCategory) ?? 'Other'),
    amount: Number(raw.amount ?? 0),
    frequency: ((raw.frequency as EducationFrequency) ?? 'One-time'),
    dueDate: raw.dueDate ? String(raw.dueDate) : '',
    startDate: raw.startDate ? String(raw.startDate) : '',
    endDate: raw.endDate ? String(raw.endDate) : null,
    forMember: (raw.forMember as string) ?? '',
    notes: raw.notes as string | undefined,
  }
}

interface EducationFormProps {
  initial?: EducationPayment | null
  onSaved: () => void
  onCancel: () => void
}

function EducationForm({ initial, onSaved, onCancel }: EducationFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [institution, setInstitution] = useState(initial?.institution ?? '')
  const [category, setCategory] = useState<EducationCategory>(
    initial?.category ?? 'School',
  )
  const [forMember, setForMember] = useState(initial?.forMember ?? '')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [frequency, setFrequency] = useState<EducationFrequency>(
    initial?.frequency ?? 'Monthly',
  )
  const [dueDate, setDueDate] = useState(
    initial?.dueDate ? initial.dueDate.slice(0, 10) : '',
  )
  const [startDate, setStartDate] = useState(
    initial?.startDate ? initial.startDate.slice(0, 10) : '',
  )
  const [endDate, setEndDate] = useState(
    initial?.endDate ? initial.endDate.slice(0, 10) : '',
  )
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const payload = {
      title,
      institution,
      category,
      forMember,
      amount: Number(amount),
      frequency,
      dueDate: dueDate || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      notes: notes || undefined,
    }
    try {
      if (initial) {
        await apiClient.put(`/education/${initial.id}`, payload)
      } else {
        await apiClient.post('/education', payload)
      }
      onSaved()
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not save payment.'
      setError(msg)
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
      <Field label="Title">
        <Input
          placeholder="e.g. Tuition Fees"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Institution">
          <Input
            placeholder="e.g. Delhi Public School"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
          />
        </Field>
        <Field label="For Member">
          <Input
            placeholder="e.g. Aarav"
            value={forMember}
            onChange={(e) => setForMember(e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Category">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as EducationCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Frequency">
          <Select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as EducationFrequency)}
          >
            {FREQUENCIES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
        </Field>
      </div>
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
              required
            />
          </div>
        </Field>
        <Field label="Next Due Date">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
        <Textarea placeholder="Additional details…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-sm pt-sm">
        <Button variant="white" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="yellow" type="submit" disabled={loading}>
          {loading ? 'Saving…' : initial ? 'Update' : 'Save'}
        </Button>
      </div>
    </form>
  )
}

export function Education() {
  const [items, setItems] = useState<EducationPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<EducationPayment | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get('/education')
      setItems(((res.data ?? []) as Record<string, unknown>[]).map(normalizeEducation))
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not load education.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = async (edu: EducationPayment) => {
    if (!window.confirm(`Delete "${edu.title}"?`)) return
    try {
      await apiClient.delete(`/education/${edu.id}`)
      await load()
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not delete payment.'
      setError(msg)
    }
  }

  if (loading) return <LoadingBlock label="Loading education…" />
  if (error)
    return (
      <div className="border-[3px] border-on-surface bg-red-100 p-md font-bold">
        {error}
      </div>
    )

  const total = items.reduce((s, e) => s + e.amount, 0)

  return (
    <div>
      <PageHeader
        title="Education"
        subtitle="School, college, coaching & course fees."
        action={
          <Button variant="yellow" onClick={() => setOpen(true)}>
            <Icon name="add" className="text-xl" />
            Add Payment
          </Button>
        }
      />

      <Table<EducationPayment>
        rowKey={(e) => e.id}
        columns={[
          {
            key: 'title',
            header: 'Payment',
            render: (e) => (
              <div className="flex flex-col">
                <span className="font-bold">{e.title}</span>
                <span className="text-xs text-on-surface-variant">{e.institution}</span>
              </div>
            ),
          },
          { key: 'forMember', header: 'For', render: (e) => e.forMember },
          { key: 'category', header: 'Category', render: (e) => <Badge color="yellow">{e.category}</Badge> },
          { key: 'frequency', header: 'Frequency', align: 'center', render: (e) => e.frequency },
          {
            key: 'amount',
            header: 'Amount',
            align: 'right',
            render: (e) => <span className="font-bold">{formatCurrency(e.amount)}</span>,
          },
          {
            key: 'dueDate',
            header: 'Next Due',
            align: 'right',
            render: (e) => <span className="text-sm">{formatDate(e.dueDate)}</span>,
          },
          {
            key: 'actions',
            header: '',
            align: 'center',
            render: (e) => (
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setEditing(e)}
                  className="bg-white p-2 brutal-thin hover:bg-surface-container-high active:translate-x-[2px] active:translate-y-[2px]"
                  title="Edit"
                >
                  <Icon name="edit" className="text-sm" />
                </button>
                <button
                  onClick={() => handleDelete(e)}
                  className="bg-error-container text-on-error-container p-2 brutal-thin hover:bg-error hover:text-on-error active:translate-x-[2px] active:translate-y-[2px]"
                  title="Delete"
                >
                  <Icon name="delete" className="text-sm" />
                </button>
              </div>
            ),
          },
        ]}
        rows={items}
      />

      {items.length === 0 && (
        <p className="font-bold text-on-surface-variant mt-6">
          No education payments yet. Click “Add Payment” to create one.
        </p>
      )}

      <div className="w-full bg-on-surface text-white py-6 px-6 brutal mt-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-lg font-bold uppercase tracking-wider">
            Total Education Outlay
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
        title={editing ? 'Edit Payment' : 'Add Payment'}
      >
        <EducationForm
          initial={editing}
          onSaved={() => {
            setOpen(false)
            setEditing(null)
            load()
          }}
          onCancel={() => {
            setOpen(false)
            setEditing(null)
          }}
        />
      </Modal>
    </div>
  )
}
