import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/ui/Icon'

const STEPS = [
  { label: 'Loading tax history…', state: 'done' },
  { label: 'Analyzing deductions and slabs…', state: 'active' },
  { label: 'Finalizing recommendation…', state: 'pending' },
]

export function RecommendationLoading() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const formId = params.get('form') ?? ''
  const [step, setStep] = useState(0)
  const timer = useRef<number[]>([])

  useEffect(() => {
    let active = true
    timer.current.push(window.setTimeout(() => active && setStep(1), 1000))
    timer.current.push(window.setTimeout(() => active && setStep(2), 2000))
    timer.current.push(
      window.setTimeout(() => {
        if (active) navigate(`/form16/recommendation/${formId}`)
      }, 3200),
    )
    return () => {
      active = false
      timer.current.forEach(clearTimeout)
    }
  }, [navigate, formId])

  const stepStatus = (i: number) => (i < step ? 'done' : i === step ? 'active' : 'pending')

  return (
    <div className="min-h-screen flex items-center justify-center relative bg-surface overflow-hidden">
      {/* Faux blurred background */}
      <div className="absolute inset-0 grid grid-cols-12 gap-4 p-4 opacity-30 pointer-events-none grayscale">
        <div className="col-span-3 border-r-[3px] border-on-surface h-full" />
        <div className="col-span-9 h-full flex flex-col gap-4">
          <div className="h-20 border-b-[3px] border-on-surface w-full" />
          <div className="flex-1 grid grid-cols-2 gap-4">
            <div className="border-[3px] border-on-surface bg-white h-64" />
            <div className="border-[3px] border-on-surface bg-white h-64" />
            <div className="col-span-2 border-[3px] border-on-surface bg-white h-96" />
          </div>
        </div>
      </div>
      <div className="absolute inset-0 bg-on-surface/80 backdrop-blur-sm z-40" />

      <main className="relative z-50 w-full max-w-2xl px-4">
        <div className="bg-white border-[3px] border-on-surface shadow-brutal flex flex-col overflow-hidden">
          <header className="p-xl pb-6 bg-white relative overflow-hidden">
            <h1 className="font-bold text-2xl uppercase tracking-tight">Analyzing Your Tax Data</h1>
          </header>

          <div className="px-8 pb-6">
            <div className="w-full h-6 border-[3px] border-on-surface bg-white overflow-hidden relative">
              <div
                className="h-full bg-brand-yellow border-r-[3px] border-on-surface transition-all duration-700"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="px-8 pb-8 flex flex-col gap-6 bg-white">
            {STEPS.map((s, i) => {
              const status = stepStatus(i)
              return (
                <div
                  key={s.label}
                  className={`flex items-center gap-4 ${
                    status === 'done'
                      ? 'opacity-70'
                      : status === 'active'
                        ? 'animate-pulse'
                        : 'opacity-40'
                  }`}
                >
                  <div
                    className={`w-8 h-8 shrink-0 border-[3px] border-on-surface flex items-center justify-center ${
                      status === 'done' ? 'bg-on-surface' : status === 'active' ? 'bg-brand-yellow' : 'bg-white'
                    }`}
                  >
                    <Icon
                      name={status === 'done' ? 'check' : status === 'active' ? 'sync' : 'hourglass_empty'}
                      className={status === 'active' ? 'text-on-surface animate-spin' : 'text-on-surface'}
                      filled={status === 'done'}
                    />
                  </div>
                  <p
                    className={`font-bold ${
                      status === 'active' ? 'text-on-surface' : 'text-on-surface'
                    }`}
                  >
                    {s.label}
                  </p>
                </div>
              )
            })}
          </div>

          <div className="px-8 pb-8">
            <div className="bg-surface-container-low border-[3px] border-on-surface p-4">
              <p className="font-medium">
                Our AI is calculating the optimal regime for your income structure. This usually takes
                10 seconds.
              </p>
            </div>
          </div>

          <footer className="bg-surface-container-low border-t-[3px] border-on-surface py-3 px-8 flex justify-between items-center">
            <div className="font-bold text-sm uppercase tracking-widest">FinStack</div>
            <div className="flex items-center gap-1.5 text-on-surface opacity-80">
              <Icon name="auto_awesome" className="text-sm" filled />
              <span className="font-bold text-xs uppercase tracking-widest">Powered by Gemini</span>
            </div>
          </footer>
        </div>
      </main>
    </div>
  )
}
