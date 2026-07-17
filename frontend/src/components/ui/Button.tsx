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

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-on-surface text-white hover:bg-brand-yellow hover:text-on-surface',
  yellow: 'bg-brand-yellow text-on-surface hover:bg-on-surface hover:text-white',
  white: 'bg-white text-on-surface hover:bg-on-surface hover:text-white',
  cyan: 'bg-tertiary-container text-on-surface hover:bg-on-surface hover:text-white',
  error:
    'bg-error-container text-on-error-container hover:bg-on-surface hover:text-white',
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
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
        'brutal-sm inline-flex items-center justify-center gap-2 font-bold uppercase tracking-wide transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        block && 'w-full',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  )
}
