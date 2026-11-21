import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from '../../lib/cn'

const baseField =
  'fin-input w-full min-w-0 px-3 py-2.5 font-semibold'

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string
  children: ReactNode
  hint?: string
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1.5 min-w-0', className)}>
      <span className="font-mono font-bold text-[11px] uppercase tracking-[0.06em] text-on-surface">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs text-on-surface-variant">{hint}</span>}
    </label>
  )
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(baseField, className)} {...props} />
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(baseField, 'min-h-[90px]', className)} {...props} />
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(baseField, 'cursor-pointer', className)} {...props}>
      {children}
    </select>
  )
}
