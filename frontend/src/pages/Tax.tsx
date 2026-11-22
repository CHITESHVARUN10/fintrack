import { useState } from 'react'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { DownloadButton } from '../components/ui/DownloadButton'
import { Icon } from '../components/ui/Icon'
import { reportService, taxService } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { formatCurrency } from '../lib/format'
import type { TaxDeductions, TaxRegimeResult } from '../types'
import { WORKSPACE_COLORS } from '../components/family/workspaceTheme'
import './family-workspace.css'

const DEDUCTION_TILES: { key: keyof TaxDeductions; label: string; cap: string }[] = [
  { key: 'section80C', label: '80C', cap: 'MAX ₹1.5L' },
  { key: 'section80CCD', label: '80CCD', cap: 'MAX ₹50K' },
  { key: 'section80D', label: '80D', cap: 'MAX ₹25K' },
  { key: 'section80E', label: '80E', cap: 'NO LIMIT' },
  { key: 'section24', label: '24 (HOME)', cap: 'MAX ₹2.0L' },
]

function RegimeCard({
  regime,
  recommended,
  deductions,
}: {
  regime: TaxRegimeResult
  recommended: boolean
  deductions: number
}) {
  return (
    <article className={`fw-regime${recommended ? ' is-rec' : ''}`}>
      <div className="fw-regime__head">
        <span className="fw-regime__title">{regime.regime} Regime</span>
        {recommended && (
          <span title="Recommended" aria-label="Recommended">
            <Icon name="verified" className="text-xl" filled />
          </span>
        )}
      </div>

      <div className="fw-regime__body">
        <div className="fw-stack" style={{ gap: 5 }}>
          <span className="fw-label">Gross income</span>
          <div className="fw-rowbox">
            <span className="fw-mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              ANNUAL ₹
            </span>
            <span className="fw-rowbox__value">{formatCurrency(regime.grossIncome)}</span>
          </div>
        </div>

        <div className="fw-rowbox fw-rowbox--cyan">
          <span className="fw-label">Deductions{regime.standardDeduction ? ` (includes ${formatCurrency(regime.standardDeduction)} standard)` : ''}</span>
          <span className="fw-tag">{formatCurrency(deductions)}</span>
        </div>

        <div className="fw-rowbox">
          <span className="fw-label">Taxable income</span>
          <span className="fw-tag fw-tag--accent">{formatCurrency(regime.taxableIncome)}</span>
        </div>

        <div className="fw-tax-total">
          <span className="fw-label">Total tax payable</span>
          <div className={`fw-tax-total__value${recommended ? '' : ' is-red'}`}>
            {formatCurrency(regime.totalTax)}
          </div>
          <div className="fw-mono" style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>
            Effective {regime.effectiveRate}%
          </div>
        </div>
      </div>
    </article>
  )
}

// Stacked take-home / tax / deductions bar for one regime. Shares come from
// the server's gross, deduction and liability figures — nothing is estimated
// in the browser.
function RegimeBar({ regime, deductions }: { regime: TaxRegimeResult; deductions: number }) {
  const gross = Math.max(1, regime.grossIncome)
  const taxPct = Math.min(100, (regime.totalTax / gross) * 100)
  const dedPct = Math.min(Math.max(0, 100 - taxPct), (deductions / gross) * 100)
  const takePct = Math.max(0, 100 - taxPct - dedPct)
  const takeHome = Math.max(0, regime.grossIncome - regime.totalTax)

  return (
    <div className="fw-bar">
      <div className="fw-bar__meta">
        <span>{regime.regime.toUpperCase()} REGIME</span>
        <span>
          Take-Home {formatCurrency(takeHome)} · Tax {formatCurrency(regime.totalTax)}
        </span>
      </div>
      <div
        className="fw-bar__track"
        role="img"
        aria-label={`${regime.regime} regime: take-home ${formatCurrency(takeHome)}, tax ${formatCurrency(regime.totalTax)}, deductions ${formatCurrency(deductions)}`}
      >
        <div className="fw-bar__seg" style={{ width: `${takePct.toFixed(1)}%`, background: WORKSPACE_COLORS.teal }} />
        <div className="fw-bar__seg" style={{ width: `${taxPct.toFixed(1)}%`, background: WORKSPACE_COLORS.pink }} />
        <div className="fw-bar__seg" style={{ width: `${dedPct.toFixed(1)}%`, background: WORKSPACE_COLORS.cyan }} />
      </div>
    </div>
  )
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export function Tax() {
  const { data, loading, error } = useAsync(() => taxService.estimate(), [])
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  if (loading) return <LoadingBlock label="Calculating tax…" />

  if (!data) {
    return (
      <div className="fw-page">
        <PageHeader title="Tax Calculator" subtitle="Compare Old vs New regimes." />
        <div className="fw-status fw-status--error" role="alert">
          Could not load your tax estimate{error ? ` — ${error}` : ''}. Check that your income and
          tax-payment records are set up, then reload.
        </div>
      </div>
    )
  }

  const oldDeductions = data.oldRegime.deductions
  const newDeductions = data.newRegime.deductions
  const recommendedNew = data.recommended === 'New'
  const reportYear = new Date().getFullYear()

  const exportSummary = async () => {
    setExportError(null)
    setExporting(true)
    try {
      const blob = await reportService.download('tax', { year: reportYear }, 'pdf')
      downloadBlob(blob, `tax-summary-${reportYear}.pdf`)
    } catch {
      setExportError('Could not export the tax summary. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="fw-page">
      <PageHeader
        title="Tax Calculator"
        subtitle="Old vs New regime for the current financial year, computed from your income and declared tax payments."
        action={
          <DownloadButton
            variant="pdf"
            size="large"
            label="EXPORT TAX SUMMARY"
            onClick={exportSummary}
            loading={exporting}
          />
        }
      />

      {exportError && (
        <div className="fw-status fw-status--error" role="alert">
          {exportError}
        </div>
      )}

      <div className="fw-flow">
        <div className="fw-grid-2">
          <RegimeCard
            regime={data.oldRegime}
            recommended={!recommendedNew}
            deductions={oldDeductions}
          />
          <RegimeCard
            regime={data.newRegime}
            recommended={recommendedNew}
            deductions={newDeductions}
          />
        </div>

        <div className="fw-ink-banner">
          <span className="fw-ink-banner__title">
            RECOMMENDED: <strong>{data.recommended.toUpperCase()} REGIME</strong>
          </span>
          <span className="fw-ink-banner__value">Save {formatCurrency(data.savings)}</span>
        </div>

        <section className="fw-card fw-stack" style={{ gap: 14 }}>
          <div className="fw-split">
            <span className="fw-label" style={{ color: 'var(--text-secondary)' }}>
              Regime breakdown (take-home vs tax vs deductions)
            </span>
            <div className="fw-legend">
              <span className="fw-legend-item">
                <span className="fw-swatch" style={{ background: WORKSPACE_COLORS.teal }} />
                Take-Home
              </span>
              <span className="fw-legend-item">
                <span className="fw-swatch" style={{ background: WORKSPACE_COLORS.pink }} />
                Tax Payable
              </span>
              <span className="fw-legend-item">
                <span className="fw-swatch" style={{ background: WORKSPACE_COLORS.cyan }} />
                Deductions
              </span>
            </div>
          </div>
          <RegimeBar regime={data.oldRegime} deductions={oldDeductions} />
          <RegimeBar regime={data.newRegime} deductions={newDeductions} />
        </section>

        <section className="fw-card fw-stack" style={{ gap: 14 }}>
          <span className="fw-label" style={{ color: 'var(--text-secondary)' }}>
            Investment and payment deductions (annual)
          </span>
          <div className="fw-grid-3">
            {DEDUCTION_TILES.map((tile) => (
              <div key={tile.key} className="fw-ded">
                <div className="fw-ded__head">
                  <span>{tile.label}</span>
                  <span className="fw-ded__cap">{tile.cap}</span>
                </div>
                <div className="fw-ded__value">{formatCurrency(data.deductions[tile.key])}</div>
              </div>
            ))}
            <div className="fw-ded fw-ded--total">
              <div className="fw-ded__head">
                <span>TOTAL</span>
                <span className="fw-ded__cap" style={{ color: 'inherit' }}>
                  OLD REGIME
                </span>
              </div>
              <div className="fw-ded__value">{formatCurrency(data.deductions.totalDeductions)}</div>
            </div>
          </div>
          <p className="fw-muted" style={{ fontSize: 12 }}>
            Claimed amounts are aggregated from the tax payments recorded against your investments
            for this financial year. Update those records to change the calculation.
          </p>
        </section>

        <section className="fw-stack">
          <h2 className="fw-h2" style={{ fontSize: 18 }}>
            Tax-saving tips
          </h2>
          {data.tips.length === 0 ? (
            <p className="fw-muted">
              No specific tips yet — add investments, insurance or loans to get personalised
              suggestions.
            </p>
          ) : (
            <div className="fw-grid-3">
              {data.tips.map((tip, i) => (
                <article key={tip} className="fw-tip">
                  <div className="fw-tip__head">
                    <span className="fw-bulb">
                      <Icon name="lightbulb" className="text-base" />
                    </span>
                    <span>Tip {i + 1}</span>
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)' }}>{tip}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
