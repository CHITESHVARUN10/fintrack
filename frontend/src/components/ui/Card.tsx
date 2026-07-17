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
  yellow: 'bg-brand-yellow',
  cyan: 'bg-tertiary-container',
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
        'brutal p-md flex flex-col gap-sm',
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
