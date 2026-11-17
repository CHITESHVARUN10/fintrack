// Non-component chart tokens live here so the component module stays
// Fast-Refresh clean (a module may only export components).

export const CAT_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
  'var(--chart-3)',
]

export const AXIS_TICK = {
  fontSize: 10,
  fontWeight: 700,
  fill: 'var(--chart-axis-text)',
  letterSpacing: '0.04em',
} as const

export function compactINR(value: number): string {
  const n = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (n >= 1e7) return `${sign}₹${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1)}Cr`
  if (n >= 1e5) return `${sign}₹${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)}L`
  if (n >= 1e3) return `${sign}₹${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`
  return `${sign}₹${Math.round(n)}`
}

export function sharePct(value: number, total: number): string {
  if (!total) return '0%'
  return `${((value / total) * 100).toFixed(1)}%`
}
