import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import '../../styles/payments.css'

/**
 * Route-scoped shell for Income / Add Income / Subscriptions /
 * Subscription Detail / Recurring / Investments.
 *
 * The prototype's five screens share one page rhythm (title block → viz strip
 * → card grid → dark total bar). This kit keeps that rhythm identical across
 * the routes and keeps all of its CSS inside `styles/payments.css`, which is
 * scoped under `.pmt-page` so nothing leaks into other routes.
 */

export function PaymentsPage({
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
    <div className="pmt-page">
      {top}
      <header className="pmt-head">
        <div className="pmt-head-text">
          <h1 className="pmt-title">{title}</h1>
          {subtitle ? <p className="pmt-sub">{subtitle}</p> : null}
        </div>
        {action ? <div className="pmt-head-actions">{action}</div> : null}
      </header>
      {children}
    </div>
  )
}

export function PaymentsLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="pmt-card pmt-loading" aria-busy="true" aria-label="Loading">
      <div className="pmt-skel pmt-skel-lg" style={{ width: '38%' }} />
      {Array.from({ length: rows }).map((_, index) => (
        <div className="pmt-skel" key={index} style={{ width: `${88 - index * 14}%` }} />
      ))}
    </div>
  )
}

export function PaymentsNotice({
  children,
  tone = 'info',
}: {
  children: ReactNode
  tone?: 'info' | 'error'
}) {
  return (
    <div className={`pmt-notice${tone === 'error' ? ' pmt-notice-error' : ''}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

export function PaymentsEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="pmt-empty">
      <div className="pmt-empty-title">{title}</div>
      {children ? <div className="pmt-empty-text">{children}</div> : null}
    </div>
  )
}

/** Overlay bound to the route stylesheet so these routes never depend on the
 *  global modal look for their dialogs. Escape and scrim both close. */
export function PaymentsOverlay({
  onClose,
  label,
  children,
}: {
  onClose: () => void
  label: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useDialogFocus(panelRef, onClose)

  return createPortal(
    <div
      ref={panelRef}
      tabIndex={-1}
      className="pmt-overlay"
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

export function PaymentsModal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <PaymentsOverlay onClose={onClose} label={title}>
      <div className={`pmt-modal${wide ? ' pmt-modal-wide' : ''}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="pmt-modal-head">
          <h2 className="pmt-modal-title">{title}</h2>
          <button type="button" className="pmt-icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="pmt-modal-body">{children}</div>
        {footer ? <div className="pmt-modal-foot">{footer}</div> : null}
      </div>
    </PaymentsOverlay>
  )
}
