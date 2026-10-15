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

