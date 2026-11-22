import { indiaDateKey } from '../lib/format'
import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { Icon } from '../components/ui/Icon'
import { reportService, type ReportKind, type ReportFormat } from '../services/api'
import './family-workspace.css'

const reportTypes: { icon: string; title: string; desc: string; kind: ReportKind }[] = [
  {
    icon: 'groups',
    title: 'Family Report',
    desc: 'Unified transaction ledger: member, category, vendor and mode shares, monthly area, budgets.',
    kind: 'family',
  },
  {
    icon: 'calendar_month',
    title: 'Monthly Summary',
    desc: 'Income, obligations & expenses for one month.',
    kind: 'monthly',
  },
  {
    icon: 'event_repeat',
    title: 'Annual Summary',
    desc: 'Full-year income, obligations & trends.',
    kind: 'annual',
  },
  {
    icon: 'pie_chart',
    title: 'Category Breakdown',
    desc: 'Spending by category over a date range.',
    kind: 'category',
  },
  {
    icon: 'account_balance',
    title: 'Tax Summary',
    desc: 'Deductions, liabilities & regime pick.',
    kind: 'tax',
  },
]

function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

function buildParams(kind: ReportKind, from: string, to: string): Record<string, string | number> {
  const p: Record<string, string | number> = { year: Number(from.slice(0, 4)) }
  if (kind === 'monthly') p.month = Number(from.slice(5, 7))
  if (kind === 'category' || kind === 'family') {
    p.from = from
    p.to = to
  }
  return p
}

function buildFilename(kind: ReportKind, from: string, to: string, format: ReportFormat) {
  const year = from.slice(0, 4)
  const ext = format === 'pdf' ? 'pdf' : 'xlsx'
  if (kind === 'family') return `family-report-${from}-to-${to}.${ext}`
  if (kind === 'monthly') return `monthly-report-${year}-${from.slice(5, 7)}.${ext}`
  if (kind === 'annual') return `annual-report-${year}.${ext}`
  if (kind === 'tax') return `tax-summary-${year}.pdf`
  return `expense-report-${from}-to-${to}.${ext}`
}

interface GeneratedReport {
  title: string
  filename: string
  range: string
  format: ReportFormat
  generatedAt: string
  kind: ReportKind
  params: Record<string, string | number>
}

async function fetchReport(kind: ReportKind, params: Record<string, string | number>, format: ReportFormat) {
  return reportService.download(kind, params, format)
}

export function Reports() {
  const [format, setFormat] = useState<'PDF' | 'EXCEL'>('PDF')
  const [selected, setSelected] = useState(0)
  const [from, setFrom] = useState(() => indiaDateKey(new Date()).slice(0, 8) + '01')
  const [to, setTo] = useState(() => indiaDateKey(new Date()))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Session-only log of what this tab actually downloaded. Nothing is
  // persisted by the backend, so this mirrors the real action and is cleared
  // on reload rather than inventing stored history.
  const [history, setHistory] = useState<GeneratedReport[]>([])

  const active = reportTypes[selected]
  const kind = active.kind
  // Tax reports are PDF only.
  const effectiveFormat: ReportFormat = kind === 'tax' ? 'pdf' : format === 'PDF' ? 'pdf' : 'excel'
  const formatLocked = kind === 'tax'

  const handleGenerate = async () => {
    const usesRange = kind === 'category' || kind === 'family'
    if (!from || (usesRange && !to)) {
      setError(usesRange ? 'Choose a start date and an end date.' : 'Choose a start date for this report.')
      return
    }
    if (usesRange && from > to) {
      setError('The end date must be on or after the start date.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const params = buildParams(kind, from, to)
      const filename = buildFilename(kind, from, to, effectiveFormat)
      const blob = await fetchReport(kind, params, effectiveFormat)
      triggerDownload(blob, filename)
      setHistory((prev) => [
        {
          title: active.title,
          filename,
          range:
            kind === 'monthly' || kind === 'annual' || kind === 'tax'
              ? `FY ${from.slice(0, 4)}`
              : `${from} → ${to}`,
          format: effectiveFormat,
          generatedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          kind,
          params,
        },
        ...prev,
      ].slice(0, 5))
    } catch {
      setError('Could not generate the report. Please check the date range and try again.')
    } finally {
      setLoading(false)
    }
  }

  // Re-runs the stored request, so the button always reproduces the file it
  // is attached to rather than whatever is currently selected above.
  const handleRedownload = async (entry: GeneratedReport) => {
    setError(null)
    setLoading(true)
    try {
      const blob = await fetchReport(entry.kind, entry.params, entry.format)
      triggerDownload(blob, entry.filename)
    } catch {
      setError(`Could not re-download ${entry.filename}. Please try again.`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fw-page">
      <PageHeader title="Reports" subtitle="Generate and download financial insights." />

      {error && (
        <div className="fw-status fw-status--error" role="alert">
          {error}
        </div>
      )}

      <div className="fw-reports">
        <div className="fw-stack" style={{ gap: 18 }}>
          <div className="fw-card fw-card--warm fw-stack">
            <span className="fw-label" style={{ paddingBottom: 8, borderBottom: '2px solid var(--border)' }}>
              DATE RANGE
            </span>
            <div className="fw-stack" style={{ gap: 10 }}>
              <label className="fw-field">
                <span className="fw-label" style={{ fontSize: 9.5, color: 'var(--text-secondary)' }}>
                  FROM
                </span>
                <input
                  className="fw-input fw-mono"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="fw-field">
                <span className="fw-label" style={{ fontSize: 9.5, color: 'var(--text-secondary)' }}>
                  TO
                </span>
                <input
                  className="fw-input fw-mono"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
            </div>
            <p className="fw-muted" style={{ fontSize: 12 }}>
              Monthly / Annual / Tax reports use the <strong>FROM</strong> date. Category and Family
              reports use the full range.
            </p>
          </div>

          <div className="fw-card fw-stack">
            <span className="fw-label" style={{ paddingBottom: 8, borderBottom: '2px solid var(--border)' }}>
              OUTPUT FORMAT
            </span>
            <div className="fw-grid-2" style={{ gap: 10 }}>
              <button
                type="button"
                onClick={() => setFormat('PDF')}
                disabled={formatLocked}
                aria-pressed={format === 'PDF' || formatLocked}
                className={`fw-btn${format === 'PDF' || formatLocked ? '' : ' fw-btn--white'}`}
              >
                PDF
              </button>
              <button
                type="button"
                onClick={() => setFormat('EXCEL')}
                disabled={formatLocked}
                aria-pressed={format === 'EXCEL'}
                className={`fw-btn${format === 'EXCEL' ? '' : ' fw-btn--white'}`}
              >
                EXCEL
              </button>
            </div>
            {formatLocked && (
              <p className="fw-muted" style={{ fontSize: 12 }}>
                Tax Summary is available as PDF only.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="fw-btn fw-btn--full"
            style={{ padding: 14 }}
          >
            <Icon name={effectiveFormat === 'pdf' ? 'picture_as_pdf' : 'table_chart'} className="text-base" />
            {loading ? 'Generating…' : 'GENERATE REPORT'}
          </button>
        </div>

        <div className="fw-stack">
          <span className="fw-label" style={{ paddingBottom: 8, borderBottom: '2px solid var(--border)' }}>
            SELECT REPORT TYPE
          </span>
          <div className="fw-grid-2">
            {reportTypes.map((t, i) => (
              <button
                key={t.kind}
                type="button"
                onClick={() => setSelected(i)}
                aria-pressed={selected === i}
                className={`fw-report-card${selected === i ? ' is-selected' : ''}`}
              >
                <Icon name={t.icon} className="text-3xl" filled />
                <h3>{t.title}</h3>
                <p>{t.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="fw-stack" style={{ marginTop: 8 }}>
        <h2 className="fw-h2" style={{ paddingBottom: 10, borderBottom: '2px solid var(--border)' }}>
          Recent history
        </h2>

        <div className="fw-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="fw-info-dot">i</span>
          <p className="fw-muted">
            Reports are generated on demand from your live data and are not stored. Pick a report
            type and date range above, then hit <strong>GENERATE REPORT</strong> to download a PDF or
            Excel file.
          </p>
        </div>

        {history.map((r) => (
          <div key={`${r.filename}-${r.generatedAt}`} className="fw-card fw-split" style={{ padding: '14px 18px' }}>
            <div className="min-w-0">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>{r.title}</strong>
                <span className="fw-tag fw-tag--accent">{r.format === 'pdf' ? 'PDF' : 'EXCEL'}</span>
              </div>
              <div className="fw-mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3, overflowWrap: 'anywhere' }}>
                {r.filename} · {r.range} · Downloaded {r.generatedAt}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleRedownload(r)}
              className="fw-btn fw-btn--white fw-btn--sm"
              disabled={loading}
            >
              <Icon name="download" className="text-base" />
              DOWNLOAD AGAIN
            </button>
          </div>
        ))}
      </section>
    </div>
  )
}
