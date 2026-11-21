import { useState, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from './Icon'

// Password field with an inline visibility toggle.
export function PasswordInput({
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        className={cn(
          'fin-input w-full px-3 py-2.5 font-semibold pr-12',
          className,
        )}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-0 inset-y-0 flex items-center justify-center w-11 bg-transparent border-0 shadow-none"
        style={{ color: show ? 'var(--text-primary)' : 'var(--text-secondary)' }}
      >
        <Icon name={show ? 'visibility_off' : 'visibility'} className="text-[18px]" />
      </button>
    </div>
  )
}
