import { useState, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from './Icon'

// Password field with an inline eye toggle. Wraps the input in a relative
// container so the toggle can sit inside the right edge (vertically centered,
// no border/shadow). The visible-state icon turns black to signal "shown".
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
          'brutal-thin w-full px-3 py-2 bg-white text-on-surface font-medium outline-none focus:bg-brand-yellow placeholder:text-on-surface-variant/60 pr-12',
          className,
        )}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center p-2 bg-transparent border-0 shadow-none"
        style={{ color: show ? 'var(--text-primary)' : 'var(--text-secondary)' }}
      >
        <Icon name={show ? 'visibility_off' : 'visibility'} className="text-[18px]" />
      </button>
    </div>
  )
}
