import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { easeOutSoft } from '../motion/tokens'
import { Icon } from './Icon'
import { OPAQUE_HEADER_STYLE, OPAQUE_PANEL_STYLE, SOLID_SCRIM_STYLE } from './Overlay'

const modalStack: HTMLElement[] = []
let savedOverflow = ''

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const close = useEffectEvent(onClose)
  useEffect(() => {
    if (!open || !panelRef.current) return
    const panel = panelRef.current
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!modalStack.length) { savedOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden' }
    modalStack.push(panel)
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter(el => !el.hidden && el.getAttribute('aria-hidden') !== 'true')
    const timer = window.setTimeout(() => (focusable()[0] || panel).focus(), 0)
    const onKey = (event: KeyboardEvent) => {
      if (modalStack.at(-1) !== panel) return
      if (event.key === 'Escape') { event.preventDefault(); close() }
      if (event.key === 'Tab') {
        const items = focusable(); const first = items[0]; const last = items.at(-1)
        if (!first) { event.preventDefault(); panel.focus(); return }
        if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', onKey)
      const top = modalStack.at(-1) === panel
      const index = modalStack.indexOf(panel); if (index >= 0) modalStack.splice(index, 1)
      if (!modalStack.length) document.body.style.overflow = savedOverflow
      if (top) previousFocus?.focus()
    }
  }, [open])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="absolute inset-0 bg-black/60" style={SOLID_SCRIM_STYLE} aria-hidden="true" />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            className={`relative brutal bg-white w-full ${width} max-h-[90vh] overflow-y-auto`}
            style={OPAQUE_PANEL_STYLE}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.18, ease: easeOutSoft }}
          >
            <div className="flex items-center justify-between border-b-[3px] border-on-surface px-4 py-3 sticky top-0 bg-white z-10" style={OPAQUE_HEADER_STYLE}>
              <h3 id={titleId} className="font-bold text-lg uppercase tracking-tight">{title}</h3>
              <button
                onClick={onClose}
                className="brutal-sm w-8 h-8 flex items-center justify-center bg-white hover:bg-brand-yellow"
                aria-label="Close"
              >
                <Icon name="close" className="text-xl" />
              </button>
            </div>
            <div className="p-4">{children}</div>
            {footer && (
              <div className="flex justify-end gap-2 border-t-[3px] border-on-surface px-4 py-3 bg-surface-container-low sticky bottom-0">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
