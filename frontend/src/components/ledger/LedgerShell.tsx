import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import '../../styles/ledger.css'

export function LedgerPage({
  title,
  subtitle,
  action,
  top,
  children,
}: {
  title: string
  subtitle?: ReactNode
  action?: ReactNode
  top?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="led-page">
      {top ? <div className="led-row">{top}</div> : null}
      <header className="led-page-head">
        <div style={{ minWidth: 0, maxWidth: '100%' }}>
          <h1 className="led-page-title">{title}</h1>
          {subtitle ? <p className="led-page-sub">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </div>
  )
}

export function LedgerNotice({
  children,
  tone = 'info',
}: {
  children: ReactNode
  tone?: 'info' | 'yellow' | 'error'
}) {
  const toneClass = tone === 'yellow' ? ' led-notice-yellow' : tone === 'error' ? ' led-notice-error' : ''
  return (
    <div className={`led-notice${toneClass}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

export function LedgerEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="led-empty">
      <div className="led-empty-title">{title}</div>
      {children ? <div className="led-empty-text">{children}</div> : null}
    </div>
  )
}

export function LedgerLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="led-card led-loading" aria-busy="true" aria-label="Loading">
      <div className="led-skel led-skel-lg" style={{ width: '38%' }} />
      {Array.from({ length: rows }).map((_, index) => (
        <div className="led-skel" key={index} style={{ width: `${88 - index * 14}%` }} />
      ))}
    </div>
  )
}

export function LedgerOverlay({
  onClose,
  align = 'center',
  label,
  children,
}: {
  onClose: () => void
  align?: 'center' | 'right'
  label: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useDialogFocus(panelRef, onClose)

  return createPortal(
    <div
      className={`led-overlay${align === 'right' ? ' led-overlay-right' : ''}`}
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
