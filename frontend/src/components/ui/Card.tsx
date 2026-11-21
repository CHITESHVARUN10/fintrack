import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface CardProps {
  children: ReactNode
  className?: string
  color?: 'white' | 'yellow' | 'cyan' | 'surface'
  hover?: boolean
}

const colorClasses = {
  white: 'bg-white',
  yellow: 'fin-color-yellow',
  cyan: 'fin-color-cyan',
  surface: 'bg-surface-container-high',
}

export function Card({
  children,
  className,
  color = 'white',
  hover = false,
}: CardProps) {
  return (
    <div
      className={cn(
        'brutal p-5 flex flex-col gap-sm min-w-0',
        colorClasses[color],
        hover && 'brutal-hover cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex justify-between items-end', className)}>
      <h2 className="font-bold text-xl uppercase tracking-tight text-on-surface">
        {children}
      </h2>
      {action}
    </div>
  )
}
