import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { RetroLoader } from '../components/ui/RetroLoader'
import { form16Service } from '../services/api'

const STEPS = [
  { label: 'Loading tax history…' },
  { label: 'Analyzing deductions and slabs…' },
  { label: 'Finalizing recommendation…' },
]

/**
 * Fetch-bound recommendation loader.
 *
 * Instead of waiting a fixed 3.2s timer, we actually start the
 * getRecommendation request immediately. The step indicator advances
 * on its own cadence (giving visual progress), but navigation only
 * happens once the API has responded AND at least 1s has passed
 * (so the user sees enough of the loader to understand what's happening).
 */
export function RecommendationLoading() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const formId = params.get('form') ?? ''
  const [step, setStep] = useState(0)
  const timer = useRef<number[]>([])

  useEffect(() => {
    let active = true

    // Advance visual step indicators on a cadence
    timer.current.push(window.setTimeout(() => active && setStep(1), 800))
    timer.current.push(window.setTimeout(() => active && setStep(2), 1600))

    // Start the actual fetch and track minimum display time together
    const fetchPromise = form16Service.getRecommendation(formId)
    const minTime = new Promise<void>((resolve) => {
      timer.current.push(window.setTimeout(resolve, 1200))
    })

    Promise.all([fetchPromise, minTime])
      .then(() => {
        if (active) navigate(`/form16/recommendation/${formId}`)
      })
      .catch(() => {
        // On error, still navigate — the recommendation page has its own error state
        if (active) navigate(`/form16/recommendation/${formId}`)
      })

    return () => {
      active = false
      timer.current.forEach(clearTimeout)
    }
  }, [navigate, formId])

  return (
    <div className="min-h-screen relative bg-surface overflow-hidden">
      {/* Background content with blur */}
      <div className="absolute inset-0 z-0">
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
        <div className="absolute inset-0 bg-on-surface/80 backdrop-blur-sm pointer-events-none" />
      </div>

      {/* Dialog sits above the blur */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        <RetroLoader
          steps={STEPS.map((s) => s.label)}
          step={step}
          title="Analyzing Your Tax Data"
        />
      </div>
    </div>
  )
}
