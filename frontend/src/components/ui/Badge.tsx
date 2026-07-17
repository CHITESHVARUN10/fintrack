import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type BadgeColor =
  | 'yellow'
  | 'cyan'
  | 'white'
  | 'error'
  | 'surface'
  | 'green'

const colorClasses: Record<BadgeColor, string> = {
  yellow: 'bg-brand-yellow text-on-surface',
  cyan: 'bg-tertiary-container text-on-surface',
  white: 'bg-white text-on-surface',
  error: 'bg-error-container text-on-error-container',
  surface: 'bg-surface-container-high text-on-surface',
  green: 'bg-tertiary-container text-on-tertiary-container',
}

export function Badge({
  children,
  color = 'surface',
  className,
}: {
  children: ReactNode
  color?: BadgeColor
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold border-2 border-on-surface',
        colorClasses[color],
        className,
      )}
    >
      {children}
    </span>
  )
}
