import { useEffect, useRef, useState } from 'react'

// Counts a number up from 0 to `value` on mount, in 30 chunky steps
// over 0.8s using requestAnimationFrame. The `format` callback renders
// the intermediate value (use currency formatting).
export function CountUp({
  value,
  format,
  className,
}: {
  value: number
  format: (n: number) => string
  className?: string
}) {
  const [display, setDisplay] = useState(0)
  const frame = useRef<number | undefined>(undefined)

  useEffect(() => {
    const STEPS = 30
    const DURATION = 800
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION)
      const stepped = Math.min(STEPS, Math.ceil(t * STEPS)) / STEPS
      setDisplay(value * stepped)
      if (t < 1) frame.current = requestAnimationFrame(tick)
      else setDisplay(value)
    }
    frame.current = requestAnimationFrame(tick)
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [value])

  return <span className={className}>{format(display)}</span>
}
