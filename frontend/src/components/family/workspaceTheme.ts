// Palette + helpers for the family workspace routes (tax, reports, family
// dashboard, members, notifications, settings). Kept out of the component
// module so the charts file only exports components and stays Fast-Refresh
// clean — the same convention as components/charts/chartTheme.ts.

export const WORKSPACE_COLORS = {
  yellow: 'var(--nb-yellow)',
  cyan: 'var(--nb-cyan)',
  teal: 'var(--nb-teal)',
  pink: 'var(--nb-pink)',
  violet: 'var(--nb-violet)',
  orange: 'var(--nb-orange)',
} as const

// Stable ordering for categorical series. Yellow first matches the design
// system's preference for the accent as the primary data colour.
export const CATEGORY_SERIES = [
  WORKSPACE_COLORS.yellow,
  WORKSPACE_COLORS.cyan,
  WORKSPACE_COLORS.pink,
  WORKSPACE_COLORS.violet,
  WORKSPACE_COLORS.teal,
  WORKSPACE_COLORS.orange,
]

export const MODE_COLORS: Record<string, string> = {
  UPI: WORKSPACE_COLORS.cyan,
  CARD: WORKSPACE_COLORS.pink,
  BANK: WORKSPACE_COLORS.yellow,
  CASH: WORKSPACE_COLORS.teal,
  OTHER: WORKSPACE_COLORS.violet,
}

// Line strokes that stay legible on both the cream and ink palettes. Bright
// yellow is a fill, never a 2px stroke.
export const LINE_COLORS = {
  income: 'var(--chart-line-primary)',
  expense: 'var(--chart-line-secondary)',
  spend: 'var(--chart-line-accent)',
} as const

export function shareOf(value: number, total: number): number {
  if (!total) return 0
  return (value / total) * 100
}

export function percentLabel(value: number, total: number): string {
  return `${shareOf(value, total).toFixed(1)}%`
}
