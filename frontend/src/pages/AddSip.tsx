import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Field, Input, Select } from '../components/ui/Field'
import { Card } from '../components/ui/Card'

export function AddSip() {
  const navigate = useNavigate()
  const [sipAmount, setSipAmount] = useState('5000')
  const [sipDate, setSipDate] = useState(5)

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Add SIP / Mutual Fund"
        subtitle="Log a new systematic investment plan."
        action={
          <Button variant="white" onClick={() => navigate('/investments')}>
            <Icon name="close" className="text-xl" />
            Cancel
          </Button>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          navigate('/investments')
        }}
        className="grid grid-cols-1 lg:grid-cols-12 gap-xl"
      >
        {/* Left: Fund details */}
        <div className="lg:col-span-8 flex flex-col gap-lg">
          <Card color="white">
            <h2 className="text-lg font-bold mb-md border-b-[3px] border-on-surface pb-xs">
              Fund Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <Field label="Fund Name">
                <Input placeholder="e.g. Parag Parikh Flexi Cap" />
              </Field>
              <Field label="Fund House">
                <Input placeholder="e.g. PPFAS Mutual Fund" />
              </Field>
              <Field label="Category" className="md:col-span-2">
                <Select>
                  <option value="">Select Category</option>
                  <option>Equity</option>
                  <option>Debt</option>
                  <option>Hybrid</option>
                  <option>ELSS</option>
                  <option>Index</option>
                </Select>
              </Field>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
            <Field label="Total Invested (Optional)">
              <Input placeholder="₹0.00" />
            </Field>
            <Field label="Current NAV">
              <Input placeholder="0.00" />
            </Field>
            <Field label="Current Value">
              <Input placeholder="₹0.00" />
            </Field>
          </div>

          <div className="bg-brand-yellow p-md brutal flex items-start gap-sm">
            <Icon name="info" className="text-2xl mt-0.5" />
            <div>
              <h3 className="font-bold uppercase tracking-tight text-sm">Tax Benefit Notice</h3>
              <p className="font-bold mt-1">ELSS funds qualify for Section 80C deduction.</p>
            </div>
          </div>
        </div>

        {/* Right: SIP setup */}
        <div className="lg:col-span-4 flex flex-col gap-lg">
          <Card color="white">
            <h2 className="text-lg font-bold border-b-[3px] border-on-surface pb-xs mb-md">
              SIP Setup
            </h2>
            <Field label="SIP Amount">
              <div className="flex">
                <span className="bg-surface-container-high border-[4px] border-r-0 border-on-surface px-3 flex items-center font-bold">
                  ₹
                </span>
                <Input
                  type="number"
                  value={sipAmount}
                  onChange={(e) => setSipAmount(e.target.value)}
                  className="border-l-0"
                />
              </div>
            </Field>
            <Field label="SIP Date (Select One)" className="mt-sm">
              <div className="grid grid-cols-7 gap-xs mt-xs">
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSipDate(d)}
                    className={`h-10 w-full border-2 border-on-surface font-bold transition-all ${
                      sipDate === d
                        ? 'bg-brand-yellow shadow-brutal-sm -translate-x-[1px] -translate-y-[1px]'
                        : 'bg-white hover:bg-surface-container-high'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-sm mt-sm">
              <Field label="Start Date">
                <Input type="date" />
              </Field>
              <Field label="End Date (Opt)">
                <Input type="date" />
              </Field>
            </div>
          </Card>

          <div className="bg-white p-md brutal text-center">
            <p className="font-bold uppercase">Monthly SIP Outflow:</p>
            <p className="text-4xl font-bold tracking-tighter mt-1">
              ₹{Number(sipAmount || 0).toLocaleString('en-IN')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-sm">
            <Button variant="white" type="button" onClick={() => navigate('/investments')}>
              CANCEL
            </Button>
            <Button variant="yellow" type="submit">
              SAVE
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
