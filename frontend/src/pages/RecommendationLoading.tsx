import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { RetroLoader } from '../components/ui/RetroLoader'

const STEPS = [
  { label: 'Loading tax history…' },
  { label: 'Analyzing deductions and slabs…' },
  { label: 'Finalizing recommendation…' },
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

      <RetroLoader
        steps={STEPS.map((s) => s.label)}
        step={step}
        title="Analyzing Your Tax Data"
      />
    </div>
  )
}
