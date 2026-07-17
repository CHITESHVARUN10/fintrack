import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { form16Service } from '../services/api'
import { Icon } from '../components/ui/Icon'

const STEPS = [
  { label: 'Uploading PDF', icon: 'check' },
  { label: 'Sending to Gemini AI', icon: 'sync' },
  { label: 'Extracting Form 16 fields', icon: 'hourglass_empty' },
]

export function Form16Processing() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const timer = useRef<number[]>([])

  useEffect(() => {
    let active = true

    // Advance through the steps, then route to the review screen.
    timer.current.push(window.setTimeout(() => active && setStep(1), 900))
    timer.current.push(window.setTimeout(() => active && setStep(2), 1900))
    timer.current.push(
      window.setTimeout(() => {
        if (!active) return
        form16Service.upload().then((rec) => navigate(`/form16/review/${rec.id}`))
      }, 3200),
    )

    return () => {
      active = false
      timer.current.forEach(clearTimeout)
    }
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 bg-grid-pattern">
      <main className="w-full max-w-2xl">
        <div className="bg-white brutal flex flex-col">
          <div className="p-xl border-b-[3px] border-on-surface flex flex-col gap-3 text-center">
            <div className="flex justify-center items-center gap-2 mb-2">
              <span className="font-bold text-2xl uppercase tracking-tighter">FinStack</span>
              <Icon name="document_scanner" className="text-3xl" filled />
            </div>
            <h1 className="font-bold text-3xl uppercase">Processing Form 16</h1>
            <p className="font-medium text-on-surface-variant">
              This usually takes 10 to 20 seconds. Do not close this page.
            </p>
          </div>

          <div className="p-xl flex flex-col gap-xl bg-surface-container-low">
            <div className="h-12 w-full bg-white brutal-thin relative overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full bg-brand-yellow border-r-[3px] border-on-surface transition-all duration-700"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              />
            </div>

            <div className="flex flex-col gap-4">
              {STEPS.map((s, i) => {
                const done = i < step
                const activeStep = i === step
                return (
                  <div
                    key={s.label}
                    className={`flex items-center gap-4 p-3 border-[3px] ${
                      done
                        ? 'bg-white border-on-surface opacity-60'
                        : activeStep
                          ? 'bg-brand-yellow border-on-surface shadow-brutal-sm translate-x-[-2px] translate-y-[-2px]'
                          : 'bg-white border-on-surface-variant border-dashed'
                    }`}
                  >
                    <div
                      className={`h-8 w-8 border-[2px] border-on-surface flex items-center justify-center shrink-0 ${
                        done ? 'bg-[#4ade80]' : activeStep ? 'bg-white animate-spin' : 'bg-surface-container-high'
                      }`}
                    >
                      <Icon
                        name={done ? 'check' : s.icon}
                        className={activeStep && !done ? 'text-on-surface animate-spin' : 'text-on-surface'}
                        filled={done}
                      />
                    </div>
                    <span
                      className={`font-bold uppercase ${
                        activeStep ? 'text-on-surface' : done ? 'text-on-surface' : 'text-on-surface-variant'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="p-md border-t-[3px] border-on-surface bg-white flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Icon name="bolt" className="text-on-surface" filled />
              <span className="font-bold uppercase text-xs">Powered by Gemini 2.5 Flash</span>
            </div>
            <div className="font-mono-data text-xs text-on-surface-variant">
              SESSION_ID: FS-99482
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
