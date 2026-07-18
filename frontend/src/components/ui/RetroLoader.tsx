import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

// Retro "decode" effect: scrambles every character, locking in the correct
// one left-to-right every 80ms until the full string is revealed.
function useScramble(target: string) {
  const [text, setText] = useState(target)
  const timers = useRef<number[]>([])

  useEffect(() => {
    timers.current.forEach(clearInterval)
    timers.current = []
    let revealed = 0
    const render = () => {
      let out = ''
      for (let i = 0; i < target.length; i++) {
        out += i < revealed ? target[i] : CHARS[Math.floor(Math.random() * CHARS.length)]
      }
      setText(out)
    }
    render()
    const iv = window.setInterval(() => {
      revealed = Math.min(target.length, revealed + 1)
      render()
      if (revealed >= target.length) clearInterval(iv)
    }, 80)
    timers.current.push(iv)
    return () => timers.current.forEach(clearInterval)
  }, [target])

  return text
}

const DEFUALT_FUN = [
  'Crunching your numbers',
  'Asking the AI nicely',
  'Counting every rupee',
  'Almost there, hold tight',
  'Running the tax math',
  'Gemini is on it',
]

// Animated AI-processing card. Replaces the static loaders on the Form 16
// processing and tax-recommendation screens. `step` is driven by the
// parent (so navigation timing stays under its control); the ticker, hazard
// bar, step rows and rotating fun messages animate independently.
export function RetroLoader({
  steps,
  step,
  title = 'Processing',
  funMessages = DEFUALT_FUN,
}: {
  steps: string[]
  step: number
  title?: string
  funMessages?: string[]
}) {
  const current = steps[Math.min(step, steps.length - 1)] ?? ''
  const ticker = useScramble(current)

  const [funIdx, setFunIdx] = useState(0)
  useEffect(() => {
    const iv = window.setInterval(
      () => setFunIdx((i) => (i + 1) % funMessages.length),
      3000,
    )
    return () => clearInterval(iv)
  }, [funMessages.length])
  const fun = useScramble(funMessages[funIdx] ?? '')

  const pct = ((Math.min(step, steps.length - 1) + 1) / steps.length) * 100

  return (
    <main className="w-full max-w-2xl bg-white brutal flex flex-col overflow-hidden">
      <header className="p-xl pb-6 bg-white relative overflow-hidden border-b-[3px] border-on-surface">
        <div className="flex justify-center items-center gap-2 mb-2">
          <span className="font-bold text-2xl uppercase tracking-tighter">FinStack</span>
          <Icon name="document_scanner" className="text-3xl" filled />
        </div>
        <h1 className="font-bold text-3xl uppercase text-center">{title}</h1>
      </header>

      {/* Ticker */}
      <div className="px-8 pt-6">
        <div className="h-12 w-full bg-surface-container-low brutal-thin flex items-center px-md overflow-hidden">
          <span className="font-mono-data text-lg font-bold tracking-widest truncate">
            {ticker}
          </span>
        </div>
      </div>

      {/* Hazard progress bar */}
      <div className="px-8 py-6">
        <div className="h-6 w-full bg-white brutal-thin relative overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 nb-hazard border-r-[3px] border-on-surface"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Step rows */}
      <div className="px-8 pb-6 flex flex-col gap-4">
        {steps.map((label, i) => {
          const done = i < step
          const active = i === step
          return (
            <div
              key={label}
              className={`flex items-center gap-4 p-3 border-[3px] ${
                done
                  ? 'bg-white border-on-surface opacity-60'
                  : active
                    ? 'bg-brand-yellow border-on-surface shadow-brutal-sm -translate-x-[2px] -translate-y-[2px]'
                    : 'bg-white border-on-surface-variant border-dashed'
              }`}
            >
              <div
                className={`w-8 h-8 border-[3px] border-on-surface flex items-center justify-center shrink-0 ${
                  done
                    ? 'bg-on-surface'
                    : active
                      ? 'nb-hazard'
                      : 'bg-surface-container-high nb-step-pending'
                }`}
              >
                <Icon
                  name={done ? 'check' : active ? 'sync' : 'hourglass_empty'}
                  className={active && !done ? 'text-on-surface animate-spin' : 'text-white'}
                  filled={done}
                />
              </div>
              <span
                className={`font-bold uppercase ${
                  active ? 'text-on-surface' : done ? 'text-on-surface' : 'text-on-surface-variant'
                }`}
              >
                {label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Rotating fun message */}
      <div className="px-8 pb-8">
        <div className="bg-surface-container-low border-[3px] border-on-surface p-4 flex items-center gap-3">
          <Icon name="auto_awesome" className="text-on-surface" filled />
          <span className="font-mono-data font-bold uppercase tracking-wide truncate">
            {fun}
          </span>
        </div>
      </div>
    </main>
  )
}
