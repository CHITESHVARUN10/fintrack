import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'yellow' | 'white' | 'cyan' | 'error'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  iconRight?: ReactNode
  block?: boolean
}

const sizeClasses: Record<Size, string> = {
  sm: 'min-h-8 px-3 py-1.5 text-[11.5px]',
  md: 'min-h-10 px-4 py-2 text-[12.5px]',
  lg: 'min-h-12 px-6 py-3 text-sm',
}

export function Button({
  variant = 'yellow',
  size = 'md',
  icon,
  iconRight,
  block,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'fin-button font-display inline-flex items-center justify-center gap-2 font-bold uppercase tracking-[0.05em]',
        sizeClasses[size],
        block && 'w-full',
        className,
      )}
      data-variant={variant}
      {...props}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  )
}
