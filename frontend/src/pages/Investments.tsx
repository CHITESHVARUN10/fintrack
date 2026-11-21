import { FinanceTransactions } from '../components/payments/FinanceTransactions'
import { TaxPaymentsEditor } from '../components/ui/TaxPaymentsEditor'
import { toApiError } from '../lib/apiError'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiClient } from '../services/apiClient'
import { Icon } from '../components/ui/Icon'
import { formatCompact, formatCurrency } from '../lib/format'
import {
  PaymentsEmpty,
  PaymentsLoading,
  PaymentsModal,
  PaymentsNotice,
  PaymentsPage,
} from '../components/payments/PaymentsKit'
import type { FdMaturityAction, Investment, InvestmentType } from '../types'

type Tab = 'all' | 'stock' | 'mf_sip' | 'fd' | 'real_estate'

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'stock', label: 'Stocks' },
  { key: 'mf_sip', label: 'Mutual Funds / SIP' },
  { key: 'fd', label: 'Fixed Deposits' },
  { key: 'real_estate', label: 'Real Estate' },
]

const TYPES: InvestmentType[] = ['stock', 'mf_sip', 'fd', 'real_estate', 'other']

const FUND_CATEGORIES = ['Equity', 'Debt', 'Hybrid', 'ELSS', 'Index', 'Other']
const ASSET_TYPES = ['Real Estate', 'Gold', 'PPF', 'NPS', 'Other']
const STATUSES = ['Active', 'Matured', 'Closed', 'Broken']
const MATURITY_ACTIONS: Record<FdMaturityAction, string> = {
  credit_account: 'Credit principal and interest',
  renew_principal: 'Renew principal, pay out interest',
  renew_full: 'Renew principal and interest',
}

// Portfolio allocation palette — flat fills, matching the prototype's
// asset-class legend (real estate / MF / stock / FD).
const ASSET_META: Record<string, { label: string; color: string }> = {
  real_estate: { label: 'Real estate', color: 'var(--accent)' },
  mf_sip: { label: 'MF SIP', color: 'var(--nb-cyan)' },
  stock: { label: 'Stock', color: 'var(--nb-violet)' },
  fd: { label: 'FD', color: 'var(--nb-teal)' },
  other: { label: 'Other', color: 'var(--nb-orange)' },
}

const ALLOC_ORDER = ['real_estate', 'mf_sip', 'stock', 'fd', 'other'] as const

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
    taxPayments: (raw.taxPayments as import('../types').TaxPayment[]) || [],
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
    tenureDays: raw.tenureDays as number | undefined,
    maturityAction: raw.maturityAction as FdMaturityAction | undefined,
    payoutAccount: raw.payoutAccount as string | undefined,
    maturityDate: raw.maturityDate ? String(raw.maturityDate) : undefined,
    maturityAmount: raw.maturityAmount as number | undefined,
    interestType: raw.interestType as 'Simple' | 'Compound' | undefined,
    taxableInterest: raw.taxableInterest as boolean | undefined,
    assetType: raw.assetType as string | undefined,
    totalInvested: Number(raw.investmentType === 'fd' ? raw.principalAmount ?? raw.totalInvested ?? 0 : raw.totalInvested ?? 0),
    currentValue: Number(raw.investmentType === 'fd' ? raw.maturityAmount ?? raw.principalAmount ?? raw.currentValue ?? 0 : raw.currentValue ?? 0),
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

// Signed compact form with the sign ahead of the symbol (-₹1.05Cr), matching
// the prototype's gain/loss readout. formatCompact() would put it after.
function formatSignedCompact(amount: number): string {
  const sign = amount < 0 ? '-' : '+'
  return `${sign}${formatCompact(Math.abs(amount))}`
}

function toDateInput(value: string | null | undefined): string {
  return value ? String(value).slice(0, 10) : ''
}

interface InvestmentFormProps {
  formId: string
  initial?: Investment | null
  onSaved: () => void
  onBusyChange: (busy: boolean) => void
}

function InvestmentForm({ formId, initial, onSaved, onBusyChange }: InvestmentFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [type, setType] = useState<InvestmentType>(initial?.investmentType ?? 'stock')
  const [totalInvested, setTotalInvested] = useState(
    initial ? String(initial.totalInvested) : '',
  )
  const [currentValue, setCurrentValue] = useState(
    initial ? String(initial.currentValue) : '',
  )
  const [startDate, setStartDate] = useState(toDateInput(initial?.startDate))
  const [endDate, setEndDate] = useState(toDateInput(initial?.endDate))
  const [status, setStatus] = useState(initial?.status ?? 'Active')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [taxPayments, setTaxPayments] = useState(initial?.taxPayments || [])

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
  const [tenureDays, setTenureDays] = useState(initial?.tenureDays?.toString() ?? '')
  const [maturityAction, setMaturityAction] = useState<FdMaturityAction | ''>(initial?.maturityAction ?? '')
  const [payoutAccount, setPayoutAccount] = useState(initial?.payoutAccount ?? '')
  const [maturityDate, setMaturityDate] = useState(toDateInput(initial?.maturityDate))
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

  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (type === 'fd' && Number(tenureMonths) + Number(tenureDays) <= 0) {
      setError('Enter the deposit term in months, days, or both.')
      return
    }
    onBusyChange(true)

    const payload: Record<string, unknown> = {
      investmentType: type,
      totalInvested: Number(totalInvested),
      currentValue: numOrUndef(currentValue),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      status,
      notes: notes || undefined,
      taxPayments,
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
      payload.principalAmount = Number(principalAmount)
      payload.totalInvested = payload.principalAmount
      payload.currentValue = numOrUndef(maturityAmount) ?? payload.principalAmount
      payload.interestRate = numOrUndef(interestRate)
      payload.tenureMonths = Number(tenureMonths)
      payload.tenureDays = Number(tenureDays)
      payload.maturityAction = maturityAction
      payload.payoutAccount = maturityAction === 'renew_full' ? null : payoutAccount.trim() || null
      payload.maturityDate = maturityDate || null
      payload.maturityAmount = numOrUndef(maturityAmount) ?? null
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
      const msg = toApiError(err).response?.data?.error ?? 'Could not save investment.'
      setError(msg)
    } finally {
      onBusyChange(false)
    }
  }

  return (
    <form id={formId} onSubmit={onSubmit} className="pmt-stack">
      {error && <PaymentsNotice tone="error">{error}</PaymentsNotice>}

      <div className="pmt-form-grid">
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="inv-name">Name / title</label>
          <input
            id="inv-name"
            className="pmt-input"
            placeholder="e.g. Infosys, PPFAS Flexi Cap"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="inv-type">Type</label>
          <select
            id="inv-type"
            className="pmt-select pmt-mono"
            value={type}
            onChange={(e) => setType(e.target.value as InvestmentType)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t === 'fd' ? 'Fixed deposit' : t === 'mf_sip' ? 'Mutual fund / SIP' : t.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {type !== 'fd' && <div className="pmt-form-grid">
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="inv-invested">Total invested</label>
          <div className="pmt-rupee">
            <span className="pmt-rupee-prefix">₹</span>
            <input
              id="inv-invested"
              type="number"
              min={0}
              placeholder="0.00"
              value={totalInvested}
              onChange={(e) => setTotalInvested(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="inv-current">Current value</label>
          <div className="pmt-rupee">
            <span className="pmt-rupee-prefix">₹</span>
            <input
              id="inv-current"
              type="number"
              min={0}
              placeholder="0.00"
              value={currentValue}
              onChange={(e) => setCurrentValue(e.target.value)}
            />
          </div>
        </div>
      </div>}

      {type === 'stock' && (
        <>
          <div className="pmt-form-grid">
            <div className="pmt-field">
              <label className="pmt-label" htmlFor="inv-ticker">Ticker</label>
              <input
                id="inv-ticker"
                className="pmt-input pmt-mono"
                placeholder="e.g. INFY"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
              />
            </div>
            <div className="pmt-field">
              <label className="pmt-label" htmlFor="inv-buy">Buy price</label>
              <input
                id="inv-buy"
                className="pmt-input pmt-mono"
                type="number"
                placeholder="0.00"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
              />
            </div>
          </div>
          <div className="pmt-form-grid">
            <div className="pmt-field">
              <label className="pmt-label" htmlFor="inv-qty">Quantity</label>
              <input
                id="inv-qty"
                className="pmt-input pmt-mono"
                type="number"
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="pmt-field">
              <label className="pmt-label" htmlFor="inv-curp">Current price</label>
              <input
                id="inv-curp"
                className="pmt-input pmt-mono"
                type="number"
                placeholder="0.00"
                value={currentPrice}
                onChange={(e) => setCurrentPrice(e.target.value)}
              />
            </div>
          </div>
        </>
      )}

      {type === 'mf_sip' && (
        <>
          <div className="pmt-form-grid">
            <div className="pmt-field">
              <label className="pmt-label" htmlFor="inv-house">Fund house</label>
              <input
                id="inv-house"
                className="pmt-input"
                placeholder="e.g. PPFAS"
                value={fundHouse}
                onChange={(e) => setFundHouse(e.target.value)}
              />
            </div>
            <div className="pmt-field">
              <label className="pmt-label" htmlFor="inv-fundcat">Category</label>
              <select
                id="inv-fundcat"
                className="pmt-select"
                value={fundCategory}
                onChange={(e) => setFundCategory(e.target.value)}
              >
                <option value="">Select category</option>
                {FUND_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="pmt-form-grid">
            <div className="pmt-field">
              <label className="pmt-label" htmlFor="inv-sip">SIP amount (₹/mo)</label>
              <input
                id="inv-sip"
                className="pmt-input pmt-mono"
                type="number"
                placeholder="5000"
                value={sipAmount}
                onChange={(e) => setSipAmount(e.target.value)}
              />
            </div>
            <div className="pmt-field">
              <label className="pmt-label" htmlFor="inv-sipday">SIP day (1–28)</label>
              <input
                id="inv-sipday"
                className="pmt-input pmt-mono"
                type="number"
                min={1}
                max={28}
                value={sipDate}
                onChange={(e) => setSipDate(e.target.value)}
              />
            </div>
          </div>
          <div className="pmt-form-grid">
            <div className="pmt-field">
              <label className="pmt-label" htmlFor="inv-units">Units</label>
              <input
                id="inv-units"
                className="pmt-input pmt-mono"
                type="number"
                placeholder="0"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
              />
            </div>
            <div className="pmt-field">
              <label className="pmt-label" htmlFor="inv-nav">NAV</label>
              <input
                id="inv-nav"
                className="pmt-input pmt-mono"
                type="number"
                placeholder="0.00"
                value={nav}
                onChange={(e) => setNav(e.target.value)}
              />
            </div>
          </div>
        </>
      )}

      {type === 'fd' && (
        <>
          <div className="pmt-form-grid">
            <div className="pmt-field">
              <label className="pmt-label" htmlFor="inv-bank">Bank name</label>
              <input
                id="inv-bank"
                className="pmt-input"
                placeholder="e.g. SBI"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </div>
            <div className="pmt-field">
              <label className="pmt-label" htmlFor="inv-prin">Principal (₹)</label>
              <input
                id="inv-prin"
                className="pmt-input pmt-mono"
                type="number"
                min={0.01}
                step={0.01}
                required
                placeholder="100000"
                value={principalAmount}
                onChange={(e) => setPrincipalAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="pmt-form-grid">
            <div className="pmt-field">
              <label className="pmt-label" htmlFor="inv-rate">Annual interest rate (%)</label>
              <input
                id="inv-rate"
                className="pmt-input pmt-mono"
                type="number"
                placeholder="0"
                min={0}
                step="any"
                required
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
              />
            </div>
            <div className="pmt-field">
              <label className="pmt-label" htmlFor="inv-fd-open">Opened on</label>
              <input id="inv-fd-open" className="pmt-input pmt-mono" type="date" required
                value={startDate} onChange={event => {
                  setStartDate(event.target.value)
                  setMaturityDate('')
                }} />
            </div>
          </div>
          <fieldset className="pmt-tax-fieldset pmt-stack">
            <legend className="pmt-label">Deposit term</legend>
            <div className="pmt-form-grid">
              <div className="pmt-field">
                <label className="pmt-label" htmlFor="inv-ten">Months</label>
                <input id="inv-ten" className="pmt-input pmt-mono" type="number" min={0} max={1200}
                  placeholder="0" value={tenureMonths} onChange={event => {
                    setTenureMonths(event.target.value)
                    setMaturityDate('')
                  }} />
              </div>
              <div className="pmt-field">
                <label className="pmt-label" htmlFor="inv-ten-days">Additional days</label>
                <input id="inv-ten-days" className="pmt-input pmt-mono" type="number" min={0} max={36500}
                  placeholder="0" value={tenureDays} onChange={event => {
                    setTenureDays(event.target.value)
                    setMaturityDate('')
                  }} />
              </div>
            </div>
          </fieldset>
          <div className="pmt-form-grid">
            <div className="pmt-field">
              <label className="pmt-label" htmlFor="inv-maturity">Maturity date</label>
              <input
                id="inv-maturity"
                className="pmt-input pmt-mono"
                type="date"
                aria-describedby="inv-maturity-help"
                value={maturityDate}
                onChange={(e) => setMaturityDate(e.target.value)}
              />
              <small id="inv-maturity-help" className="pmt-tiny">Leave blank to calculate from the opening date and term.</small>
            </div>
            <div className="pmt-field">
              <label className="pmt-label" htmlFor="inv-maturity-amt">Bank-quoted maturity amount (optional)</label>
              <input
                id="inv-maturity-amt"
                className="pmt-input pmt-mono"
                type="number"
                placeholder="0.00"
                min={0.01}
                step={0.01}
                value={maturityAmount}
                onChange={(e) => setMaturityAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="pmt-field">
            <label className="pmt-label" htmlFor="inv-maturity-action">At maturity</label>
            <select id="inv-maturity-action" className="pmt-select" value={maturityAction} required
              onChange={event => setMaturityAction(event.target.value as FdMaturityAction)}>
              <option value="">Select the bank’s instruction</option>
              {Object.entries(MATURITY_ACTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {maturityAction && maturityAction !== 'renew_full' && <div className="pmt-field">
            <label className="pmt-label" htmlFor="inv-payout-account">Payout account nickname (optional)</label>
            <input id="inv-payout-account" className="pmt-input" maxLength={80} placeholder="e.g. Main savings"
              value={payoutAccount} onChange={event => setPayoutAccount(event.target.value)} />
          </div>}
          <p className="pmt-tiny">Your bank handles the payout or renewal. A renewal uses the same term.</p>
          <div className="pmt-form-grid">
            <div className="pmt-field">
              <label className="pmt-label" htmlFor="inv-inttype">Interest type</label>
              <select
                id="inv-inttype"
                className="pmt-select"
                value={interestType}
                onChange={(e) => setInterestType(e.target.value as 'Simple' | 'Compound' | '')}
              >
                <option value="">Select</option>
                <option value="Simple">Simple</option>
                <option value="Compound">Compound</option>
              </select>
            </div>
            <div className="pmt-field">
              <span className="pmt-label">Taxable interest?</span>
              <label className="pmt-check">
                <input
                  type="checkbox"
                  checked={taxableInterest}
                  onChange={(e) => setTaxableInterest(e.target.checked)}
                />
                <span>{taxableInterest ? 'Yes' : 'No'}</span>
              </label>
            </div>
          </div>
        </>
      )}

      {(type === 'real_estate' || type === 'other') && (
        <div className="pmt-form-grid">
          <div className="pmt-field">
            <label className="pmt-label" htmlFor="inv-assettype">Asset type</label>
            <select
              id="inv-assettype"
              className="pmt-select"
              value={assetType}
              onChange={(e) => setAssetType(e.target.value)}
            >
              <option value="">Select</option>
              {ASSET_TYPES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="pmt-field">
            <label className="pmt-label" htmlFor="inv-purchase">Purchase value</label>
            <input
              id="inv-purchase"
              className="pmt-input pmt-mono"
              type="number"
              placeholder="0.00"
              value={purchaseValue}
              onChange={(e) => setPurchaseValue(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="pmt-form-grid-3">
        {type !== 'fd' && <>
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="inv-start">Start date</label>
          <input
            id="inv-start"
            className="pmt-input pmt-mono"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="inv-end">End date</label>
          <input
            id="inv-end"
            className="pmt-input pmt-mono"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        </>}
        <div className="pmt-field">
          <label className="pmt-label" htmlFor="inv-status">Status</label>
          <select
            id="inv-status"
            className="pmt-select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="pmt-tax-fieldset">
        <TaxPaymentsEditor value={taxPayments} onChange={setTaxPayments} />
      </div>

      <div className="pmt-field">
        <label className="pmt-label" htmlFor="inv-notes">Notes</label>
        <textarea
          id="inv-notes"
          className="pmt-textarea"
          placeholder="Additional details…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </form>
  )
}

function InvestmentCard({
  inv,
  onEdit,
  onDelete,
  onTransactions,
  today,
}: {
  inv: Investment
  onEdit: () => void
  onDelete: () => void
  onTransactions?: () => void
  today: string
}) {
  const { pct } = gainLoss(inv)
  const positive = pct >= 0
  const meta = ASSET_META[inv.investmentType] ?? ASSET_META.other

  const detail = ((): { label: string; value: string } => {
    if (inv.investmentType === 'stock') {
      return {
        label: inv.ticker || 'EQUITY',
        value: inv.quantity != null ? `Qty: ${inv.quantity}` : '',
      }
    }
    if (inv.investmentType === 'mf_sip') {
      return {
        label: 'SIP',
        value: inv.sipAmount != null ? `${formatCurrency(inv.sipAmount)}/mo` : '',
      }
    }
    if (inv.investmentType === 'fd') {
      const rate = inv.interestRate != null || inv.tenureMonths != null
        ? `${inv.interestRate ?? 0}% p.a.${inv.tenureMonths ? ` · ${inv.tenureMonths} mo` : ''}${inv.tenureDays ? ` · ${inv.tenureDays} d` : ''}`
        : ''
      return { label: inv.bankName || 'FIXED DEPOSIT', value: rate }
    }
    return {
      label: inv.assetType || 'PROPERTY ASSET',
      value: inv.notes || '',
    }
  })()
  const detailLabel = detail.label
  const detailValue = detail.value

  return (
    <article className="pmt-item-card pmt-inv-card">
      <div>
        <div className="pmt-card-top">
          <div style={{ minWidth: 0 }}>
            <h2 className="pmt-card-title break-all-safe" style={{ fontSize: 17 }}>
              {inv.title}
            </h2>
            <div className="pmt-inv-type">{meta.label.toUpperCase()}</div>
          </div>
          <div className="pmt-row" style={{ gap: 7 }}>
            <button
              type="button"
              className="pmt-icon-btn"
              onClick={onEdit}
              title="Edit investment"
              aria-label={`Edit ${inv.title}`}
            >
              <Icon name="edit" className="text-base" />
            </button>
            <button
              type="button"
              className="pmt-icon-btn pmt-icon-btn-danger"
              onClick={onDelete}
              title="Delete investment"
              aria-label={`Delete ${inv.title}`}
            >
              <Icon name="delete" className="text-base" />
            </button>
          </div>
        </div>
        <div className="pmt-inv-detail">
          <span className="pmt-inv-detail-label">{detailLabel}</span>
          {detailValue || '—'}
        </div>
        {inv.investmentType === 'fd' && (
          <div className="pmt-inv-detail pmt-fd-details">
            {inv.maturityDate && <span>Maturity: {toDateInput(inv.maturityDate)} · {inv.status === 'Active' &&
              toDateInput(inv.maturityDate) <= today ? 'Due for confirmation' : inv.status}</span>}
            <span>{inv.maturityAction ? MATURITY_ACTIONS[inv.maturityAction] : 'Maturity instruction not set'}</span>
            {inv.payoutAccount && <span>Payout account: {inv.payoutAccount}</span>}
          </div>
        )}
      </div>

      <div>
        <div className="pmt-inv-vals">
          <div>
            <div className="pmt-inv-label">{inv.investmentType === 'fd' ? 'Maturity value' : 'Current value'}</div>
            <div className="pmt-inv-val">{inv.investmentType === 'fd' && inv.maturityAmount == null ? '—' : formatCompact(inv.currentValue)}</div>
          </div>
          <div className="pmt-inv-right">
            <div className="pmt-inv-label">Invested</div>
            <div className="pmt-inv-val-sm">{formatCompact(inv.totalInvested)}</div>
          </div>
        </div>
        <div className="pmt-row-between" style={{ marginTop: 10 }}>
          <span className={`pmt-tag ${positive ? 'pmt-tag-cyan' : 'pmt-tag-red'}`}>
            {positive ? '+' : ''}
            {pct.toFixed(1)}%
          </span>
          {onTransactions && <button type="button" className="pmt-btn pmt-btn-white pmt-btn-sm" onClick={onTransactions}>Transactions</button>}
        </div>
      </div>
    </article>
  )
}

export function Investments() {
  const [tab, setTab] = useState<Tab>('all')
  const [today] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))
  const [items, setItems] = useState<Investment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Investment | null>(null)
  const [ledgerItem, setLedgerItem] = useState<Investment | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeAsset, setActiveAsset] = useState<string | null>(null)

  const load = useCallback(() => Promise.resolve().then(async () => {
    setLoading(true);
    try {
      // Fetch the whole portfolio so the allocation strip and the summary
      // KPIs describe every holding, not only the selected tab.
      const res = await apiClient.get('/investments')
      setError(null)
      setItems(((res.data ?? []) as Record<string, unknown>[]).map(normalizeInvestment))
    } catch (err: unknown) {
      const msg = toApiError(err).response?.data?.error ?? 'Could not load investments.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }), [])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (inv: Investment) => {
    if (!window.confirm(`Delete "${inv.title}"?`)) return
    setDeleteError('')
    try {
      await apiClient.delete(`/investments/${inv.id}`)
      await load()
    } catch (err: unknown) {
      const msg = toApiError(err).response?.data?.error ?? 'Could not delete investment.'
      setDeleteError(msg)
    }
  }

  const totalInvested = useMemo(
    () => items.reduce((s, i) => s + i.totalInvested, 0),
    [items],
  )
  const currentValue = useMemo(
    () => items.reduce((s, i) => s + i.currentValue, 0),
    [items],
  )
  const gain = currentValue - totalInvested

  const totalsByType = useMemo(() => {
    const acc: Record<string, number> = {}
    ALLOC_ORDER.forEach((key) => { acc[key] = 0 })
    items.forEach((inv) => {
      const key = ASSET_META[inv.investmentType] ? inv.investmentType : 'other'
      acc[key] += Number(inv.currentValue) || 0
    })
    return acc
  }, [items])

  const allocation = useMemo(
    () =>
      ALLOC_ORDER.map((key) => ({
        key,
        label: ASSET_META[key].label,
        color: ASSET_META[key].color,
        value: totalsByType[key],
        pct: currentValue > 0 ? (totalsByType[key] / currentValue) * 100 : 0,
      })),
    [totalsByType, currentValue],
  )

  const nonZero = allocation.filter((a) => a.value > 0)
  const filtered = tab === 'all' ? items : items.filter((x) => x.investmentType === tab)

  const activeAlloc = activeAsset ? allocation.find((a) => a.key === activeAsset) : null
  const allocReadout = activeAlloc
    ? `${activeAlloc.label.toUpperCase()} · ${activeAlloc.pct.toFixed(1)}% (${formatCompact(activeAlloc.value)})`
    : `TOTAL PORTFOLIO · ${formatCompact(currentValue)}`

  const modalOpen = open || !!editing
  const formId = 'pmt-investment-form'
  const closeModal = () => {
    setOpen(false)
    setEditing(null)
  }

  if (loading) {
    return (
      <div className="pmt-page">
        <PaymentsLoading />
      </div>
    )
  }

  if (error) {
    return (
      <div className="pmt-page">
        <PaymentsNotice tone="error">{error}</PaymentsNotice>
        <button type="button" className="pmt-btn pmt-btn-white pmt-btn-sm" onClick={load}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
      <PaymentsPage
        title="Investments"
        subtitle="Stocks, mutual funds, FDs & real estate."
        action={
          <button type="button" className="pmt-btn" onClick={() => setOpen(true)}>
            <Icon name="add" className="text-lg" />
            Add Investment
          </button>
        }
      >
        <div className="pmt-tabs" role="tablist" aria-label="Asset class">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`pmt-tab${tab === t.key ? ' is-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Portfolio allocation by asset class — live values, flat fills. */}
        <section className="pmt-viz" aria-label="Portfolio allocation by asset class">
          <div className="pmt-viz-head">
            <span className="pmt-viz-title">Portfolio allocation by asset class</span>
            <span className="pmt-readout">{allocReadout}</span>
          </div>

          {nonZero.length > 0 && currentValue > 0 ? (
            <>
              <div className="pmt-track" role="presentation">
                {nonZero.map((a) => (
                  <div
                    key={a.key}
                    className="pmt-seg"
                    style={{
                      width: `${Math.max(2.5, a.pct)}%`,
                      background: a.color,
                      opacity: activeAsset === null || activeAsset === a.key ? 1 : 0.3,
                    }}
                  />
                ))}
              </div>
              <div className="pmt-legend">
                {allocation.map((a) => (
                  <span
                    key={a.key}
                    className={`pmt-legend-item${activeAsset === a.key ? ' is-active' : ''}`}
                    onMouseEnter={() => setActiveAsset(a.key)}
                    onMouseLeave={() => setActiveAsset(null)}
                  >
                    <span className="pmt-swatch" style={{ background: a.color }} />
                    {a.label} {a.pct.toFixed(1)}% ({formatCompact(a.value)})
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="pmt-tiny">No valued holdings yet.</p>
          )}
        </section>

        {deleteError && <PaymentsNotice tone="error">{deleteError}</PaymentsNotice>}
        <div className="pmt-grid-3">
          {filtered.map((inv) => (
            <InvestmentCard
              key={inv.id}
              inv={inv}
              today={today}
              onEdit={() => setEditing(inv)}
              onDelete={() => handleDelete(inv)}
              onTransactions={inv.investmentType === 'fd' || inv.investmentType === 'stock'
                ? () => setLedgerItem(inv) : undefined}
            />
          ))}

          {filtered.length === 0 && (
            <PaymentsEmpty title="No holdings in this asset class yet">
              Add an investment to start tracking invested value and gains.
            </PaymentsEmpty>
          )}
        </div>

        {/* Portfolio summary KPI row */}
        <div className="pmt-grid-3">
          <div className="pmt-card pmt-summary-kpi">
            <span className="pmt-label" style={{ color: 'var(--text-secondary)' }}>Invested</span>
            <div className="pmt-kpi-val">{formatCompact(totalInvested)}</div>
          </div>
          <div className="pmt-card-yellow pmt-summary-kpi">
            <span className="pmt-label">Current value</span>
            <div className="pmt-kpi-val">{formatCompact(currentValue)}</div>
          </div>
          <div className="pmt-card-cyan pmt-summary-kpi">
            <span className="pmt-label">Total gain / loss</span>
            <div className="pmt-kpi-val">{formatSignedCompact(gain)}</div>
          </div>
        </div>
      </PaymentsPage>

      {ledgerItem && (ledgerItem.investmentType === 'fd' || ledgerItem.investmentType === 'stock') &&
        <FinanceTransactions kind={ledgerItem.investmentType} id={ledgerItem.id} name={ledgerItem.title} onClose={() => setLedgerItem(null)} />}
      <PaymentsModal
        open={modalOpen}
        onClose={closeModal}
        wide
        title={editing ? 'Edit investment' : 'Add investment'}
        footer={
          <>
            <button type="button" className="pmt-btn pmt-btn-white" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" form={formId} className="pmt-btn" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update' : 'Save'}
            </button>
          </>
        }
      >
        <InvestmentForm
          key={editing?.id ?? 'new'}
          formId={formId}
          initial={editing}
          onBusyChange={setSaving}
          onSaved={() => {
            closeModal()
            load()
          }}
        />
      </PaymentsModal>
    </>
  )
}
