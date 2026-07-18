import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Card } from '../components/ui/Card'
import { reportService, type ReportKind, type ReportFormat } from '../services/api'

const reportTypes: { icon: string; title: string; desc: string; kind: ReportKind }[] = [
  { icon: 'calendar_month', title: 'Monthly Summary', desc: 'Income, obligations & expenses for one month.', kind: 'monthly' },
  { icon: 'event_repeat', title: 'Annual Summary', desc: 'Full-year income, obligations & trends.', kind: 'annual' },
  { icon: 'pie_chart', title: 'Category Breakdown', desc: 'Spending by category over a date range.', kind: 'category' },
  { icon: 'account_balance', title: 'Tax Summary', desc: 'Deductions, liabilities & regime pick.', kind: 'tax' },
]

// Reports are produced on demand from your live data — there is no stored
// history, so we surface an honest note instead of fabricated entries.
function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

function buildParams(kind: ReportKind, from: string, to: string): Record<string, string | number> {
  const d = new Date(from)
  const p: Record<string, string | number> = { year: d.getFullYear() }
  if (kind === 'monthly') p.month = d.getMonth() + 1
  if (kind === 'category') {
    p.from = from
    p.to = to
  }
  return p
}

function buildFilename(kind: ReportKind, from: string, to: string, format: ReportFormat) {
  const d = new Date(from)
  const year = d.getFullYear()
  const ext = format === 'pdf' ? 'pdf' : 'xlsx'
  if (kind === 'monthly') return `monthly-report-${year}-${pad2(d.getMonth() + 1)}.${ext}`
  if (kind === 'annual') return `annual-report-${year}.${ext}`
  if (kind === 'tax') return `tax-summary-${year}.pdf`
  return `expense-report-${from}-to-${to}.${ext}`
}

export function Reports() {
  const [format, setFormat] = useState<'PDF' | 'EXCEL'>('PDF')
  const [selected, setSelected] = useState(0)
  const [from, setFrom] = useState('2026-04-01')
  const [to, setTo] = useState('2026-04-30')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const kind = reportTypes[selected].kind
  // Tax reports are PDF only.
  const effectiveFormat: ReportFormat = kind === 'tax' ? 'pdf' : format === 'PDF' ? 'pdf' : 'excel'

  const handleGenerate = async () => {
    setError(null)
    setLoading(true)
    try {
      const blob = await reportService.download(kind, buildParams(kind, from, to), effectiveFormat)
      triggerDownload(blob, buildFilename(kind, from, to, effectiveFormat))
    } catch {
      setError('Could not generate the report. Please check the date range and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Generate and download financial insights."
      />

      {error && (
        <div className="border-[3px] border-on-surface bg-error-container text-on-error-container p-md mb-md font-bold flex items-center gap-2">
          <Icon name="error" className="text-lg" filled />
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-md">
        {/* Controls */}
        <div className="lg:col-span-4 flex flex-col gap-md">
          <Card color="surface">
            <h3 className="font-bold uppercase border-b-2 border-on-surface pb-2 mb-2">Date Range</h3>
            <div className="flex items-center gap-2 mt-2">
              <input
                className="w-full bg-white border-[3px] border-on-surface p-2 font-bold focus:shadow-brutal-sm outline-none"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <span className="font-bold text-on-surface-variant uppercase text-xs">to</span>
              <input
                className="w-full bg-white border-[3px] border-on-surface p-2 font-bold focus:shadow-brutal-sm outline-none"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <p className="text-xs font-medium text-on-surface-variant mt-2">
              Monthly / Annual / Tax reports use the <span className="font-bold uppercase">From</span> date.
              Category reports use the full range.
            </p>
          </Card>

          <Card color="white">
            <h3 className="font-bold uppercase border-b-2 border-on-surface pb-2 mb-2">
              Output Format
            </h3>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setFormat('PDF')}
                disabled={kind === 'tax'}
                className={`flex-1 border-[3px] border-on-surface p-2 font-bold transition-all ${
                  format === 'PDF'
                    ? 'bg-brand-yellow shadow-brutal-sm -translate-x-[1px] -translate-y-[1px]'
                    : 'bg-white hover:bg-surface-container-high'
                } ${kind === 'tax' ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                PDF
              </button>
              <button
                onClick={() => setFormat('EXCEL')}
                disabled={kind === 'tax'}
                className={`flex-1 border-[3px] border-on-surface p-2 font-bold transition-all ${
                  format === 'EXCEL'
                    ? 'bg-brand-yellow shadow-brutal-sm -translate-x-[1px] -translate-y-[1px]'
                    : 'bg-white hover:bg-surface-container-high'
                } ${kind === 'tax' ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                EXCEL
              </button>
            </div>
            {kind === 'tax' && (
              <p className="text-xs font-medium text-on-surface-variant mt-2">
                Tax Summary is available as PDF only.
              </p>
            )}
          </Card>

          <Button variant="yellow" size="lg" className="mt-2" onClick={handleGenerate} disabled={loading}>
            <Icon name={loading ? 'sync' : 'description'} className={`text-xl ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Generating…' : 'Generate Report'}
          </Button>
        </div>

        {/* Report type grid */}
        <div className="lg:col-span-8 flex flex-col gap-sm">
          <h3 className="font-bold uppercase border-b-[3px] border-on-surface pb-2">
            Select Report Type
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md mt-2">
            {reportTypes.map((t, i) => (
              <button
                key={t.title}
                onClick={() => setSelected(i)}
                className={`border-[3px] border-on-surface p-xl h-full flex flex-col justify-center items-center gap-md text-center transition-all ${
                  selected === i
                    ? 'bg-brand-yellow shadow-brutal-sm -translate-x-[2px] -translate-y-[2px]'
                    : 'bg-white hover:bg-surface-container-high'
                }`}
              >
                <Icon name={t.icon} className="text-5xl" filled />
                <h4 className="font-bold uppercase">{t.title}</h4>
                <p className="font-medium text-on-surface-variant text-sm">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* On-demand note (no stored history) */}
      <section className="mt-xl">
        <h3 className="text-2xl font-bold uppercase border-b-[3px] border-on-surface pb-sm mb-md">
          Recent History
        </h3>
        <div className="border-[3px] border-on-surface bg-white shadow-brutal p-xl flex items-center gap-md">
          <Icon name="info" className="text-4xl" filled />
          <p className="font-medium text-on-surface-variant">
            Reports are generated on demand from your live data and are not stored. Pick a
            report type and date range above, then hit{' '}
            <span className="font-bold uppercase text-on-surface">Generate Report</span> to
            download a PDF or Excel file.
          </p>
        </div>
      </section>
    </div>
  )
}
