import { cn } from '../../lib/cn'

export function ProgressBar({
  value,
  max = 100,
  color = 'bg-on-surface',
  className,
}: {
  value: number
  max?: number
  color?: string
  className?: string
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className={cn('h-4 border-2 border-on-surface bg-white overflow-hidden', className)}>
      <div className={cn('h-full', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}
