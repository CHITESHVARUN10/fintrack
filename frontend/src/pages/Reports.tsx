import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'

const reportTypes = [
  { icon: 'calendar_month', title: 'Monthly Summary', desc: 'High-level overview of income vs expenses.' },
  { icon: 'pie_chart', title: 'Category Breakdown', desc: 'Detailed spending by budget categories.' },
  { icon: 'candlestick_chart', title: 'Investment Report', desc: 'Portfolio performance and allocation.' },
  { icon: 'account_balance', title: 'Tax Summary', desc: 'Deductions, liabilities, and prep.' },
]

const recent = [
  { name: 'Monthly Summary - Q1', meta: 'Mar 31, 2026 • All Members', format: 'PDF' as const },
  { name: 'Category Breakdown - Jun', meta: 'Jun 30, 2026 • Jane Doe', format: 'EXCEL' as const },
  { name: '2026 Tax Summary Pre-Fill', meta: 'Jul 15, 2026 • Family', format: 'PDF' as const },
]

export function Reports() {
  const [format, setFormat] = useState<'PDF' | 'EXCEL'>('PDF')
  const [selected, setSelected] = useState(0)

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Generate and download financial insights."
      />

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-md">
        {/* Controls */}
        <div className="lg:col-span-4 flex flex-col gap-md">
          <Card color="surface">
            <h3 className="font-bold uppercase border-b-2 border-on-surface pb-2 mb-2">Date Range</h3>
            <div className="flex items-center gap-2 mt-2">
              <input
                className="w-full bg-white border-[3px] border-on-surface p-2 font-bold focus:shadow-brutal-sm outline-none"
                type="date"
                defaultValue="2026-04-01"
              />
              <span className="font-bold text-on-surface-variant uppercase text-xs">to</span>
              <input
                className="w-full bg-white border-[3px] border-on-surface p-2 font-bold focus:shadow-brutal-sm outline-none"
                type="date"
                defaultValue="2026-06-30"
              />
            </div>
          </Card>

          <Card color="white">
            <h3 className="font-bold uppercase border-b-2 border-on-surface pb-2 mb-2">
              Portfolio Member
            </h3>
            <select className="w-full mt-2 bg-white border-[3px] border-on-surface p-2 font-bold appearance-none cursor-pointer focus:shadow-brutal-sm outline-none">
              <option>All Members (Combined)</option>
              <option>Jane Doe (Admin)</option>
              <option>Rohan Sharma</option>
              <option>Priya Sharma</option>
            </select>
          </Card>

          <Card color="white">
            <h3 className="font-bold uppercase border-b-2 border-on-surface pb-2 mb-2">
              Output Format
            </h3>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setFormat('PDF')}
                className={`flex-1 border-[3px] border-on-surface p-2 font-bold transition-all ${
                  format === 'PDF'
                    ? 'bg-brand-yellow shadow-brutal-sm -translate-x-[1px] -translate-y-[1px]'
                    : 'bg-white hover:bg-surface-container-high'
                }`}
              >
                PDF
              </button>
              <button
                onClick={() => setFormat('EXCEL')}
                className={`flex-1 border-[3px] border-on-surface p-2 font-bold transition-all ${
                  format === 'EXCEL'
                    ? 'bg-brand-yellow shadow-brutal-sm -translate-x-[1px] -translate-y-[1px]'
                    : 'bg-white hover:bg-surface-container-high'
                }`}
              >
                EXCEL
              </button>
            </div>
          </Card>

          <Button variant="yellow" size="lg" className="mt-2">
            <Icon name="description" className="text-xl" />
            Generate Report
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

      {/* Recent history */}
      <section className="mt-xl">
        <h3 className="text-2xl font-bold uppercase border-b-[3px] border-on-surface pb-sm mb-md">
          Recent History
        </h3>
        <div className="border-[3px] border-on-surface bg-white shadow-brutal">
          {recent.map((r) => (
            <div
              key={r.name}
              className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-md border-b-[3px] border-on-surface last:border-b-0 hover:bg-surface-container-low transition-colors`}
            >
              <div className="flex flex-col">
                <span className="font-bold uppercase">{r.name}</span>
                <span className="font-medium text-on-surface-variant text-sm">{r.meta}</span>
              </div>
              <div className="flex items-center gap-md mt-sm sm:mt-0">
                <Badge color={r.format === 'PDF' ? 'error' : 'surface'}>{r.format}</Badge>
                <button
                  className="border-2 border-on-surface p-2 hover:bg-brand-yellow transition-all bg-white"
                  title="Download"
                >
                  <Icon name="download" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
