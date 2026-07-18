import { useEffect, useState } from 'react'
import { apiClient } from '../services/apiClient'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { formatCurrency, formatCompact } from '../lib/format'
import type { Investment, InvestmentType } from '../types'

type Tab = 'all' | 'stock' | 'mf_sip' | 'fd' | 'real_estate'

const tabLabel: Record<Tab, string> = {
  all: 'All',
  stock: 'Stocks',
  mf_sip: 'Mutual Funds / SIP',
  fd: 'Fixed Deposits',
  real_estate: 'Real Estate',
}

const TYPES: InvestmentType[] = ['stock', 'mf_sip', 'fd', 'real_estate', 'other']

const FUND_CATEGORIES = ['Equity', 'Debt', 'Hybrid', 'ELSS', 'Index', 'Other']
const ASSET_TYPES = ['Real Estate', 'Gold', 'PPF', 'NPS', 'Other']
const STATUSES = ['Active', 'Matured', 'Closed', 'Broken']

// Backend documents use Mongo `_id` and type-specific name fields
// (stockName / fundName / assetName) instead of a single `title`.
function pickName(raw: Record<string, unknown>): string {
  return (
    (raw.stockName as string) ||
    (raw.fundName as string) ||
    (raw.assetName as string) ||
    (raw.title as string) ||
    ''
  )
}

function normalizeInvestment(raw: Record<string, unknown>): Investment {
  return {
    id: String(raw._id ?? raw.id),
    memberId: String(raw.memberId ?? ''),
    investmentType: ((raw.investmentType as InvestmentType) ?? 'other'),
    title: pickName(raw),
    ticker: raw.ticker as string | undefined,
    fundHouse: raw.fundHouse as string | undefined,
    buyPrice: raw.buyPrice as number | undefined,
    currentPrice: raw.currentPrice as number | undefined,
    quantity: raw.quantity as number | undefined,
    units: raw.units as number | undefined,
    nav: raw.nav as number | undefined,
    sipAmount: raw.sipAmount as number | undefined,
    sipDate: raw.sipDate as number | undefined,
    fundCategory: raw.fundCategory as string | undefined,
    bankName: raw.bankName as string | undefined,
    principalAmount: raw.principalAmount as number | undefined,
    interestRate: raw.interestRate as number | undefined,
    tenureMonths: raw.tenureMonths as number | undefined,
    maturityDate: raw.maturityDate ? String(raw.maturityDate) : undefined,
    maturityAmount: raw.maturityAmount as number | undefined,
    interestType: raw.interestType as 'Simple' | 'Compound' | undefined,
    taxableInterest: raw.taxableInterest as boolean | undefined,
    assetType: raw.assetType as string | undefined,
    totalInvested: Number(raw.totalInvested ?? 0),
    currentValue: Number(raw.currentValue ?? 0),
    startDate: raw.startDate ? String(raw.startDate) : '',
    endDate: raw.endDate ? String(raw.endDate) : null,
    status: ((raw.status as string) ?? 'Active'),
    notes: raw.notes as string | undefined,
  }
}

function gainLoss(inv: Investment) {
  const g = inv.currentValue - inv.totalInvested
  return { g, pct: inv.totalInvested ? (g / inv.totalInvested) * 100 : 0 }
}

const numOrUndef = (v: string): number | undefined =>
  v.trim() === '' ? undefined : Number(v)

interface InvestmentFormProps {
  initial?: Investment | null
  onSaved: () => void
  onCancel: () => void
}

function InvestmentForm({ initial, onSaved, onCancel }: InvestmentFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [type, setType] = useState<InvestmentType>(initial?.investmentType ?? 'stock')
  const [totalInvested, setTotalInvested] = useState(
    initial ? String(initial.totalInvested) : '',
  )
  const [currentValue, setCurrentValue] = useState(
    initial ? String(initial.currentValue) : '',
  )
  const [startDate, setStartDate] = useState(initial?.startDate ?? '')
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [status, setStatus] = useState(initial?.status ?? 'Active')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  // stock
  const [ticker, setTicker] = useState(initial?.ticker ?? '')
  const [buyPrice, setBuyPrice] = useState(initial?.buyPrice != null ? String(initial.buyPrice) : '')
  const [quantity, setQuantity] = useState(initial?.quantity != null ? String(initial.quantity) : '')
  const [currentPrice, setCurrentPrice] = useState(
    initial?.currentPrice != null ? String(initial.currentPrice) : '',
  )
  // mf_sip
  const [fundHouse, setFundHouse] = useState(initial?.fundHouse ?? '')
  const [sipAmount, setSipAmount] = useState(initial?.sipAmount != null ? String(initial.sipAmount) : '')
  const [sipDate, setSipDate] = useState(initial?.sipDate != null ? String(initial.sipDate) : '')
  const [units, setUnits] = useState(initial?.units != null ? String(initial.units) : '')
  const [nav, setNav] = useState(initial?.nav != null ? String(initial.nav) : '')
  const [fundCategory, setFundCategory] = useState(initial?.fundCategory ?? '')
  // fd
  const [bankName, setBankName] = useState(initial?.bankName ?? '')
  const [principalAmount, setPrincipalAmount] = useState(
    initial?.principalAmount != null ? String(initial.principalAmount) : '',
  )
  const [interestRate, setInterestRate] = useState(
    initial?.interestRate != null ? String(initial.interestRate) : '',
  )
  const [tenureMonths, setTenureMonths] = useState(
    initial?.tenureMonths != null ? String(initial.tenureMonths) : '',
  )
  const [maturityDate, setMaturityDate] = useState(initial?.maturityDate ?? '')
  const [maturityAmount, setMaturityAmount] = useState(
    initial?.maturityAmount != null ? String(initial.maturityAmount) : '',
  )
  const [interestType, setInterestType] = useState<'Simple' | 'Compound' | ''>(
    initial?.interestType ?? '',
  )
  const [taxableInterest, setTaxableInterest] = useState(initial?.taxableInterest ?? false)
  // real_estate / other
  const [assetType, setAssetType] = useState(initial?.assetType ?? '')
  const [purchaseValue, setPurchaseValue] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const payload: Record<string, unknown> = {
      investmentType: type,
      totalInvested: Number(totalInvested),
      currentValue: numOrUndef(currentValue),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      status,
      notes: notes || undefined,
    }
    if (type === 'stock') payload.stockName = title
    else if (type === 'mf_sip') payload.fundName = title
    else payload.assetName = title

    if (type === 'stock') {
      payload.ticker = ticker || undefined
      payload.buyPrice = numOrUndef(buyPrice)
      payload.quantity = numOrUndef(quantity)
      payload.currentPrice = numOrUndef(currentPrice)
    } else if (type === 'mf_sip') {
      payload.fundHouse = fundHouse || undefined
      payload.sipAmount = numOrUndef(sipAmount)
      payload.sipDate = numOrUndef(sipDate)
      payload.units = numOrUndef(units)
      payload.nav = numOrUndef(nav)
      payload.fundCategory = fundCategory || undefined
    } else if (type === 'fd') {
      payload.bankName = bankName || undefined
      payload.principalAmount = numOrUndef(principalAmount)
      payload.interestRate = numOrUndef(interestRate)
      payload.tenureMonths = numOrUndef(tenureMonths)
      payload.maturityDate = maturityDate || undefined
      payload.maturityAmount = numOrUndef(maturityAmount)
      payload.interestType = interestType || undefined
      payload.taxableInterest = taxableInterest
    } else {
      payload.assetType = assetType || undefined
      payload.purchaseValue = numOrUndef(purchaseValue)
    }

    try {
      if (initial) {
        await apiClient.put(`/investments/${initial.id}`, payload)
      } else {
        await apiClient.post('/investments', payload)
      }
      onSaved()
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not save investment.'
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Name / Title">
          <Input
            placeholder="e.g. Infosys, PPFAS Flexi Cap, SBI FD"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </Field>
        <Field label="Type">
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as InvestmentType)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Total Invested">
          <div className="flex">
            <span className="bg-surface-container-high border-[4px] border-r-0 border-on-surface px-3 flex items-center font-bold">
              ₹
            </span>
            <Input
              type="number"
              placeholder="0.00"
              value={totalInvested}
              onChange={(e) => setTotalInvested(e.target.value)}
              className="border-l-0"
              required
            />
          </div>
        </Field>
        <Field label="Current Value">
          <div className="flex">
            <span className="bg-surface-container-high border-[4px] border-r-0 border-on-surface px-3 flex items-center font-bold">
              ₹
            </span>
            <Input
              type="number"
              placeholder="0.00"
              value={currentValue}
              onChange={(e) => setCurrentValue(e.target.value)}
              className="border-l-0"
            />
          </div>
        </Field>
      </div>

      {type === 'stock' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
          <Field label="Ticker">
            <Input placeholder="e.g. INFY" value={ticker} onChange={(e) => setTicker(e.target.value)} />
          </Field>
          <Field label="Buy Price">
            <Input type="number" placeholder="0.00" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} />
          </Field>
          <Field label="Quantity">
            <Input type="number" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          <Field label="Current Price">
            <Input type="number" placeholder="0.00" value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} />
          </Field>
        </div>
      )}

      {type === 'mf_sip' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
          <Field label="Fund House">
            <Input placeholder="e.g. PPFAS" value={fundHouse} onChange={(e) => setFundHouse(e.target.value)} />
          </Field>
          <Field label="Category">
            <Select value={fundCategory} onChange={(e) => setFundCategory(e.target.value)}>
              <option value="">Select Category</option>
              {FUND_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="SIP Amount">
            <Input type="number" placeholder="0.00" value={sipAmount} onChange={(e) => setSipAmount(e.target.value)} />
          </Field>
          <Field label="SIP Date (Day)">
            <Input type="number" min={1} max={28} value={sipDate} onChange={(e) => setSipDate(e.target.value)} />
          </Field>
          <Field label="Units">
            <Input type="number" placeholder="0" value={units} onChange={(e) => setUnits(e.target.value)} />
          </Field>
          <Field label="NAV">
            <Input type="number" placeholder="0.00" value={nav} onChange={(e) => setNav(e.target.value)} />
          </Field>
        </div>
      )}

      {type === 'fd' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
          <Field label="Bank Name">
            <Input placeholder="e.g. SBI" value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </Field>
          <Field label="Principal Amount">
            <Input type="number" placeholder="0.00" value={principalAmount} onChange={(e) => setPrincipalAmount(e.target.value)} />
          </Field>
          <Field label="Interest Rate (%)">
            <Input type="number" placeholder="0" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
          </Field>
          <Field label="Tenure (Months)">
            <Input type="number" placeholder="0" value={tenureMonths} onChange={(e) => setTenureMonths(e.target.value)} />
          </Field>
          <Field label="Maturity Date">
            <Input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} />
          </Field>
          <Field label="Maturity Amount">
            <Input type="number" placeholder="0.00" value={maturityAmount} onChange={(e) => setMaturityAmount(e.target.value)} />
          </Field>
          <Field label="Interest Type">
            <Select value={interestType} onChange={(e) => setInterestType(e.target.value as 'Simple' | 'Compound' | '')}>
              <option value="">Select</option>
              <option value="Simple">Simple</option>
              <option value="Compound">Compound</option>
            </Select>
          </Field>
          <Field label="Taxable Interest?">
            <label className="flex items-center gap-sm cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={taxableInterest}
                onChange={(e) => setTaxableInterest(e.target.checked)}
                className="w-5 h-5 accent-brand-yellow"
              />
              <span className="font-bold">{taxableInterest ? 'Yes' : 'No'}</span>
            </label>
          </Field>
        </div>
      )}

      {(type === 'real_estate' || type === 'other') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
          <Field label="Asset Type">
            <Select value={assetType} onChange={(e) => setAssetType(e.target.value)}>
              <option value="">Select</option>
              {ASSET_TYPES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Select>
          </Field>
          <Field label="Purchase Value">
            <Input type="number" placeholder="0.00" value={purchaseValue} onChange={(e) => setPurchaseValue(e.target.value)} />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <Field label="Start Date">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="End Date">
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
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

function InvestmentCard({
  inv,
  onEdit,
  onDelete,
}: {
  inv: Investment
  onEdit: () => void
  onDelete: () => void
}) {
  const { g, pct } = gainLoss(inv)
  const positive = g >= 0
  return (
    <div className="bg-white brutal p-md flex flex-col gap-3 nb-card-enter nb-card-hover">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-bold">{inv.title}</h3>
          <span className="text-xs text-on-surface-variant uppercase">
            {inv.investmentType.replace('_', ' ')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="bg-white p-2 brutal-thin hover:bg-surface-container-high"
            title="Edit"
          >
            <Icon name="edit" className="text-sm" />
          </button>
          <button
            onClick={onDelete}
            className="bg-error-container text-on-error-container p-2 brutal-thin hover:bg-error hover:text-on-error"
            title="Delete"
          >
            <Icon name="delete" className="text-sm" />
          </button>
        </div>
      </div>

      {inv.ticker && (
        <div className="text-xs font-bold text-on-surface-variant">{inv.ticker}</div>
      )}

      <div className="grid grid-cols-2 gap-2 text-sm">
        {inv.quantity != null && (
          <div>
            <div className="text-xs text-on-surface-variant">Qty</div>
            <div className="font-bold">{inv.quantity}</div>
          </div>
        )}
        {inv.units != null && (
          <div>
            <div className="text-xs text-on-surface-variant">Units</div>
            <div className="font-bold">{inv.units}</div>
          </div>
        )}
        {inv.nav != null && (
          <div>
            <div className="text-xs text-on-surface-variant">NAV</div>
            <div className="font-bold">{inv.nav}</div>
          </div>
        )}
        {inv.interestRate != null && (
          <div>
            <div className="text-xs text-on-surface-variant">Interest</div>
            <div className="font-bold">{inv.interestRate}%</div>
          </div>
        )}
        {inv.sipAmount != null && (
          <div>
            <div className="text-xs text-on-surface-variant">SIP</div>
            <div className="font-bold">{formatCurrency(inv.sipAmount)}/mo</div>
          </div>
        )}
      </div>

      <div className="mt-auto pt-3 border-t-2 border-on-surface">
        <div className="flex justify-between items-end">
          <div>
            <div className="text-xs text-on-surface-variant">Current Value</div>
            <div className="text-xl font-bold">{formatCompact(inv.currentValue)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-on-surface-variant">Invested</div>
            <div className="font-bold">{formatCompact(inv.totalInvested)}</div>
          </div>
        </div>
        <Badge color={positive ? 'cyan' : 'error'} className="mt-2">
          {positive ? '+' : ''}
          {pct.toFixed(1)}%
        </Badge>
      </div>
    </div>
  )
}

export function Investments() {
  const [tab, setTab] = useState<Tab>('all')
  const [items, setItems] = useState<Investment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Investment | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get('/investments', {
        params: { type: tab === 'all' ? undefined : tab },
      })
      setItems(((res.data ?? []) as Record<string, unknown>[]).map(normalizeInvestment))
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not load investments.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const handleDelete = async (inv: Investment) => {
    if (!window.confirm(`Delete "${inv.title}"?`)) return
    try {
      await apiClient.delete(`/investments/${inv.id}`)
      await load()
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error ?? 'Could not delete investment.'
      setError(msg)
    }
  }

  if (loading) return <LoadingBlock label="Loading investments…" />
  if (error)
    return (
      <div className="border-[3px] border-on-surface bg-red-100 p-md font-bold">
        {error}
      </div>
    )

  const totalInvested = items.reduce((s, i) => s + i.totalInvested, 0)
  const currentValue = items.reduce((s, i) => s + i.currentValue, 0)
  const gain = currentValue - totalInvested

  return (
    <div>
      <PageHeader
        title="Investments"
        subtitle="Stocks, mutual funds, FDs & real estate."
        action={
          <Button variant="yellow" onClick={() => setOpen(true)}>
            <Icon name="add" className="text-xl" />
            Add Investment
          </Button>
        }
      />

      <div className="flex flex-wrap gap-sm mb-lg border-b-[3px] border-on-surface pb-md">
        {(Object.keys(tabLabel) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`brutal-sm px-4 py-2 font-bold uppercase ${
              tab === t
                ? 'bg-brand-yellow text-on-surface'
                : 'bg-white text-on-surface hover:bg-surface-container-high'
            }`}
          >
            {tabLabel[t]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md mb-8">
        {items.map((inv) => (
          <InvestmentCard
            key={inv.id}
            inv={inv}
            onEdit={() => setEditing(inv)}
            onDelete={() => handleDelete(inv)}
          />
        ))}
      </div>

      {items.length === 0 && (
        <p className="font-bold text-on-surface-variant mb-8">
          No investments yet. Click “Add Investment” to create one.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        <div className="bg-white brutal p-md nb-card-enter nb-card-hover">
          <span className="font-bold uppercase text-sm text-on-surface-variant">Invested</span>
          <p className="text-2xl font-bold mt-1">{formatCompact(totalInvested)}</p>
        </div>
        <div className="bg-brand-yellow brutal p-md">
          <span className="font-bold uppercase text-sm text-on-surface-variant">Current Value</span>
          <p className="text-2xl font-bold mt-1">{formatCompact(currentValue)}</p>
        </div>
        <div className={`brutal p-md ${gain >= 0 ? 'bg-tertiary-container' : 'bg-error-container'}`}>
          <span className="font-bold uppercase text-sm text-on-surface-variant">Total Gain / Loss</span>
          <p className="text-2xl font-bold mt-1">
            {gain >= 0 ? '+' : ''}
            {formatCompact(gain)}
          </p>
        </div>
      </div>

      <Modal
        open={open || !!editing}
        onClose={() => {
          setOpen(false)
          setEditing(null)
        }}
        title={editing ? 'Edit Investment' : 'Add Investment'}
      >
        <InvestmentForm
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
