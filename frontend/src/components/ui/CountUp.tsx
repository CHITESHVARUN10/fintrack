import { useEffect, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'
import { easeOutSoft } from '../motion/tokens'

// Animated number (react-bits-style): counts from 0 to `value` on mount
// via framer-motion. The `format` callback renders the intermediate value
// (use currency formatting). Honors the user's reduced-motion preference.
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
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) return
    const controls = animate(0, value, {
      duration: 0.8,
      ease: easeOutSoft,
      onUpdate: (v) => setDisplay(v),
    })
    return () => controls.stop()
  }, [value, reduceMotion])

  return <span className={className}>{format(reduceMotion ? value : display)}</span>
}
