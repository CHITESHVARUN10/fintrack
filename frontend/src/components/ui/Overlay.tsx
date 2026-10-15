/* eslint-disable react-refresh/only-export-components */
import { useEffect, type CSSProperties, type ReactNode } from 'react'

/**
 * Core overlay primitives — single source of truth for all modals/drawers.
 *
 * Why this exists: panels styled only with `bg-white` (rgb(var(--c-white)/...))
 * resolve to transparent if the CSS var fails to resolve, and scrims styled
 * with `bg-on-surface/40` flip with dark mode (light wash). Every overlay
 * must use these opaque-by-default primitives.
 */

export const OPAQUE_PANEL_STYLE: CSSProperties = {
  backgroundColor: 'var(--bg-card, #ffffff)',
}

export const OPAQUE_HEADER_STYLE: CSSProperties = {
  backgroundColor: 'var(--bg-card, #ffffff)',
}

export const SOLID_SCRIM_STYLE: CSSProperties = {
  backgroundColor: 'rgba(10, 10, 10, 0.6)',
}

export function useOverlayOpen(open: boolean) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.dispatchEvent(new CustomEvent('overlay:escape'))
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
}

export function OverlayRoot({
  onClose,
  children,
  align = 'center',
  z = 'z-[100]',
}: {
  onClose: () => void
  children: ReactNode
  align?: 'center' | 'right' | 'top'
  z?: string
}) {
  useOverlayOpen(true)
  useEffect(() => {
    const handler = () => onClose()
    document.addEventListener('overlay:escape', handler)
    return () => document.removeEventListener('overlay:escape', handler)
  }, [onClose])

  const justify = align === 'right' ? 'justify-end' : align === 'top' ? 'items-start justify-center pt-[10vh]' : 'items-center justify-center'
  return (
    <div className={`fixed inset-0 ${z} flex ${justify} p-4`} role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" style={SOLID_SCRIM_STYLE} onClick={onClose} aria-hidden="true" />
      {children}
    </div>
  )
}

export function OverlayPanel({
  children,
  className = '',
  style,
  onClick,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  onClick?: (e: React.MouseEvent) => void
}) {
  return (
    <div
      className={`relative brutal bg-white ${className}`}
      style={{ ...OPAQUE_PANEL_STYLE, ...style }}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
