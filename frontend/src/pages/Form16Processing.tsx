import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { form16Service } from '../services/api'
import { Icon } from '../components/ui/Icon'
import { Button } from '../components/ui/Button'
import { RetroLoader } from '../components/ui/RetroLoader'

const STEPS = [
  { label: 'Uploading PDF', icon: 'check' },
  { label: 'Sending to Gemini AI', icon: 'sync' },
  { label: 'Extracting Form 16 fields', icon: 'hourglass_empty' },
]

export function Form16Processing() {
  const navigate = useNavigate()
  const location = useLocation()
  const file = (location.state as { file?: File } | null)?.file
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number[]>([])

  useEffect(() => {
    if (!file) {
      setError('No file was selected for upload.')
      return
    }
    let active = true

    // Advance through the steps, then upload and route to the review screen.
    timer.current.push(window.setTimeout(() => active && setStep(1), 900))
    timer.current.push(window.setTimeout(() => active && setStep(2), 1900))
    timer.current.push(
      window.setTimeout(() => {
        if (!active) return
        form16Service
          .upload(file)
          .then((rec) => navigate(`/form16/review/${rec.id}`))
          .catch((e) =>
            active &&
            setError(
              (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
                'Could not process the PDF. Please try again.',
            ),
          )
      }, 3200),
    )

    return () => {
      active = false
      timer.current.forEach(clearTimeout)
    }
  }, [navigate, file])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <main className="w-full max-w-xl bg-white brutal p-xl flex flex-col gap-lg items-center text-center">
          <Icon name="error" className="text-5xl text-error" filled />
          <h1 className="font-bold text-2xl uppercase">Upload failed</h1>
          <p className="font-medium text-on-surface-variant">{error}</p>
          <Button variant="yellow" onClick={() => navigate('/form16/upload')}>
            <Icon name="arrow_back" className="text-xl" />
            Back to Upload
          </Button>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 bg-grid-pattern">
      <RetroLoader steps={STEPS.map((s) => s.label)} step={step} title="Processing Form 16" />
    </div>
  )
}
