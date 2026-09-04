import { cn } from '../../lib/cn'

// Thin wrapper around Google Material Symbols Outlined (loaded in index.html).
export function Icon({
  name,
  className,
  filled = false,
  style,
}: {
  name: string
  className?: string
  filled?: boolean
  style?: React.CSSProperties
}) {
  return (
    <span
      className={cn('material-symbols-outlined', className)}
      style={{ ...(filled ? { fontVariationSettings: '"FILL" 1' } : {}), ...style }}
    >
      {name}
    </span>
  )
}
