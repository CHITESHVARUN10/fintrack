import { taxService } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { formatCurrency } from '../lib/format'
import type { TaxRegimeResult } from '../types'

function RegimeCard({ r, recommended }: { r: TaxRegimeResult; recommended: boolean }) {
  return (
    <div
      className={`brutal flex flex-col ${
        recommended ? 'bg-brand-yellow' : 'bg-white'
      }`}
    >
      <div className="bg-white border-b-[3px] border-on-surface p-sm flex justify-between items-center">
        <h2 className="text-lg font-bold uppercase">{r.regime} Regime</h2>
        {recommended && <Icon name="verified" className="text-2xl" filled />}
      </div>
      <div className="p-md flex flex-col gap-sm">
        <div className="flex flex-col gap-xs">
          <label className="font-bold uppercase text-xs">Gross Income</label>
          <div className="border-[3px] border-on-surface bg-white p-sm text-right font-bold">
            {formatCurrency(r.grossIncome)}
          </div>
        </div>
        <div className="bg-tertiary-container border-[3px] border-on-surface p-sm flex justify-between items-center">
          <span className="font-bold uppercase text-xs">Deductions</span>
          <span className="bg-white px-2 border-2 border-on-surface font-bold">
            {formatCurrency(r.deductions)}
          </span>
        </div>
        <div className="bg-white border-[3px] border-on-surface p-sm flex justify-between items-center">
          <span className="font-bold uppercase text-xs">Taxable Income</span>
          <span className="bg-brand-yellow px-2 border-2 border-on-surface font-bold">
            {formatCurrency(r.taxableIncome)}
          </span>
        </div>
        <div className="border-t-[3px] border-on-surface p-md text-center mt-auto">
          <span className="font-bold uppercase text-xs block mb-1">Total Tax Payable</span>
          <div className={`text-4xl font-bold ${recommended ? '' : 'text-error'}`}>
            {formatCurrency(r.totalTax)}
          </div>
          <span className="text-xs font-bold text-on-surface-variant">
            Effective {r.effectiveRate}%
          </span>
        </div>
      </div>
    </div>
  )
}

export function Tax() {
  const { data, loading } = useAsync(() => taxService.estimate(), [])

  if (loading || !data) return <LoadingBlock label="Calculating tax…" />

  return (
    <div>
      <PageHeader
        title="Tax Calculator"
        subtitle="Compare Old vs New regimes for FY 2025-26."
        action={
          <Button variant="yellow">
            <Icon name="download" className="text-xl" />
            Export
          </Button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-lg mb-xl">
        <RegimeCard r={data.oldRegime} recommended={data.recommended === 'Old'} />
        <RegimeCard r={data.newRegime} recommended={data.recommended === 'New'} />
      </div>

      <div className="bg-on-surface text-white py-6 px-6 brutal mb-xl">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-lg font-bold uppercase tracking-wider">
            Recommended: <span className="text-brand-yellow">{data.recommended} Regime</span>
          </span>
          <span className="text-3xl md:text-4xl font-bold text-brand-yellow">
            Save {formatCurrency(data.savings)}
          </span>
        </div>
      </div>

      <div className="bg-white brutal p-md mb-xl flex flex-col gap-xs nb-card-enter nb-card-hover">
        <span className="font-bold uppercase text-xs text-on-surface-variant tracking-wider">
          Deductions Claimed (annual)
        </span>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-sm">
          <div className="brutal-thin bg-surface-container-high p-sm">
            <span className="block text-xs font-bold uppercase">80C</span>
            <span className="font-bold">{formatCurrency(data.deductions.section80C)}</span>
          </div>
          <div className="brutal-thin bg-surface-container-high p-sm">
            <span className="block text-xs font-bold uppercase">80CCD</span>
            <span className="font-bold">{formatCurrency(data.deductions.section80CCD)}</span>
          </div>
          <div className="brutal-thin bg-surface-container-high p-sm">
            <span className="block text-xs font-bold uppercase">80D</span>
            <span className="font-bold">{formatCurrency(data.deductions.section80D)}</span>
          </div>
          <div className="brutal-thin bg-surface-container-high p-sm">
            <span className="block text-xs font-bold uppercase">80E</span>
            <span className="font-bold">{formatCurrency(data.deductions.section80E)}</span>
          </div>
          <div className="brutal-thin bg-surface-container-high p-sm">
            <span className="block text-xs font-bold uppercase">24 (Home)</span>
            <span className="font-bold">{formatCurrency(data.deductions.section24)}</span>
          </div>
          <div className="brutal-thin bg-brand-yellow p-sm">
            <span className="block text-xs font-bold uppercase">Total</span>
            <span className="font-bold">{formatCurrency(data.deductions.totalDeductions)}</span>
          </div>
        </div>
      </div>

      <h3 className="text-2xl font-bold uppercase mb-md">Tax-Saving Tips</h3>
      {data.tips.length === 0 ? (
        <p className="font-bold text-on-surface-variant">
          No specific tips yet — add investments, insurance or loans to get personalised
          suggestions.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
          {data.tips.map((tip, i) => (
            <div key={i} className="bg-white brutal p-md flex flex-col gap-2 nb-card-enter nb-card-hover">
              <div className="flex items-center gap-xs">
                <div className="w-9 h-9 bg-brand-yellow brutal-thin flex items-center justify-center">
                  <Icon name="lightbulb" />
                </div>
                <span className="font-bold">Tip {i + 1}</span>
              </div>
              <p className="font-medium text-sm">{tip}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
