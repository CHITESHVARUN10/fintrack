import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

// Shared easing curve — fast start, soft landing (matches App.tsx page exits)
export const easeOutSoft = [0.22, 0.61, 0.36, 1] as const

// Page transition constants (used by AnimatedRoutes in App.tsx)
export const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
}
export const pageTransition = { duration: 0.18, ease: easeOutSoft }

// Staggered grid/list entrance — children rise in sequence
export const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
}
export const staggerItem = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: easeOutSoft } },
}

export function StaggerList({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div
      className={className}
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div className={className} variants={staggerItem}>
      {children}
    </motion.div>
  )
}

// Scroll-reveal: fades + rises once when entering the viewport
export function Reveal({
  children,
  className,
  delay = 0,
  y = 16,
}: {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.35, delay, ease: easeOutSoft }}
    >
      {children}
    </motion.div>
  )
}
