import { useNavigate, useParams } from 'react-router-dom'
import { form16Service } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { formatCurrency } from '../lib/format'
import type { RegimeBreakdown } from '../types'

function ComparisonCard({
  data,
  recommended,
}: {
  data: RegimeBreakdown
  recommended: boolean
}) {
  return (
    <div
      className={`bg-white brutal flex flex-col relative ${
        recommended ? 'md:-translate-y-4' : ''
      }`}
    >
      {recommended && (
        <div className="absolute -top-4 -right-4 bg-brand-yellow brutal px-4 py-2 flex items-center gap-2 z-10 rotate-3">
          <Icon name="check_circle" />
          <span className="font-bold uppercase">Recommended</span>
        </div>
      )}
      <div
        className={`p-lg border-b-[3px] border-on-surface ${
          recommended ? 'bg-brand-yellow' : 'bg-surface-container-low'
        }`}
      >
        <h3 className="font-bold text-xl uppercase text-center">{data.regime} Regime</h3>
      </div>
      <div className="p-lg space-y-4 flex-1">
        <div className="flex justify-between items-end border-b-2 border-on-surface pb-2">
          <span className="font-bold">Gross Income</span>
          <span className="font-mono-data text-lg">{formatCurrency(data.grossIncome)}</span>
        </div>
        <div className="flex justify-between items-end border-b-2 border-on-surface pb-2 text-error-container">
          <span className="font-medium">{data.deductionLabel}</span>
          <span className="font-mono-data">- {formatCurrency(data.deductions)}</span>
        </div>
        <div className="flex justify-between items-end border-b-2 border-on-surface pb-2">
          <span className="font-bold">Taxable Income</span>
          <span className="font-mono-data text-lg">{formatCurrency(data.taxableIncome)}</span>
        </div>
        <div className="mt-4 bg-surface-container-low p-4 brutal-thin">
          <h4 className="font-bold uppercase mb-4 border-b-2 border-on-surface pb-2">
            Slab Breakdown
          </h4>
          <ul className="space-y-2 font-mono-data">
            {data.slabs.map((s) => (
              <li key={s.label} className="flex justify-between">
                <span>{s.label}</span>
                <span>{formatCurrency(s.tax)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="p-lg border-t-[3px] border-on-surface text-center bg-surface-container-low">
        <p className="font-bold uppercase mb-1">Total Tax Liability</p>
        <p className="font-bold text-2xl">{formatCurrency(data.totalTax)}</p>
        <p className="font-mono-data text-xs mt-2">+ 4% Cess applicable</p>
      </div>
    </div>
  )
}

export function TaxRecommendation() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { data, loading } = useAsync(
    () => form16Service.getRecommendation(id ?? ''),
    [id],
  )

  if (loading || !data) return <LoadingBlock label="Loading recommendation…" />

  return (
    <div>
      <PageHeader
        title="Tax Recommendation"
        subtitle="Based on your Form 16 & declared investments for FY 2025-26."
        action={
          <Button variant="white" onClick={() => navigate('/form16')}>
            <Icon name="arrow_back" className="text-xl" />
            Back to Form 16
          </Button>
        }
      />

      {/* Recommendation banner */}
      <div className="w-full bg-brand-yellow brutal p-lg md:p-xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden mb-xl">
        <div className="absolute -right-10 -top-10 opacity-10">
          <Icon name="verified" className="text-[200px]" filled />
        </div>
        <div className="z-10 flex-1">
          <div className="inline-flex items-center gap-2 bg-white brutal-thin px-3 py-1 mb-4">
            <Icon name="star" className="text-on-surface" filled />
            <span className="font-bold uppercase">Optimal Choice</span>
          </div>
          <h2 className="font-bold text-2xl mb-2">
            {data.recommendedRegime} Regime saves you more
          </h2>
          <p className="font-medium border-l-[3px] border-on-surface pl-4 ml-1 max-w-xl">
            {data.explanation}
          </p>
        </div>
        <div className="z-10 bg-white brutal p-lg text-center min-w-[220px]">
          <p className="font-bold uppercase text-on-surface-variant mb-2">You Save</p>
          <p className="font-bold text-4xl text-on-surface">{formatCurrency(data.savingsAmount)}</p>
        </div>
      </div>

      {/* Comparison cards */}
      <div className="relative mb-xl">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 hidden md:flex w-16 h-16 rounded-full brutal bg-white items-center justify-center">
          <span className="font-bold text-lg">VS</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <ComparisonCard data={data.oldBreakdown} recommended={data.recommendedRegime === 'Old'} />
          <ComparisonCard data={data.newBreakdown} recommended={data.recommendedRegime === 'New'} />
        </div>
      </div>

      {/* Tax saving suggestions */}
      <div className="pt-lg border-t-[3px] border-on-surface">
        <h3 className="font-bold text-xl uppercase mb-6">Tax Saving Suggestions (Next FY)</h3>
        <div className="flex overflow-x-auto gap-6 pb-8 no-scrollbar">
          {data.taxSavingSuggestions.map((s) => (
            <div
              key={s.id}
              className="min-w-[300px] md:min-w-[340px] bg-white brutal p-lg flex flex-col"
            >
              <div className="w-12 h-12 bg-brand-yellow brutal flex items-center justify-center mb-4">
                <Icon name={s.icon} />
              </div>
              <h4 className="font-bold text-lg mb-2">{s.title}</h4>
              <p className="font-medium text-on-surface-variant flex-1 mb-4">{s.detail}</p>
              <div className="bg-surface-container-low brutal-thin flex justify-between items-center p-3">
                <span className="font-bold uppercase">Potential Savings:</span>
                <span className="font-mono-data font-bold">{formatCurrency(s.potentialSaving)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="flex flex-col md:flex-row justify-end gap-4 mt-lg pt-lg border-t-[3px] border-on-surface">
        <Button variant="white" onClick={() => navigate('/form16')}>
          Back to Form 16
        </Button>
        <Button variant="yellow" onClick={() => window.print()}>
          <Icon name="download" className="text-xl" />
          Download Tax Summary PDF
        </Button>
      </div>
    </div>
  )
}
