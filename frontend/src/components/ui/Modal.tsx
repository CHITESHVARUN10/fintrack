import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { easeOutSoft } from '../motion/tokens'
import { Icon } from './Icon'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { OPAQUE_HEADER_STYLE, OPAQUE_PANEL_STYLE, SOLID_SCRIM_STYLE } from './Overlay'

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-lg',
  zIndex,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  width?: string
  zIndex?: number
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogFocus(panelRef, onClose, open)

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={zIndex === undefined ? undefined : { zIndex }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="absolute inset-0 bg-black/60" style={SOLID_SCRIM_STYLE} aria-hidden="true" />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            className={`relative brutal bg-white w-full ${width} max-h-[calc(100dvh-32px)] flex flex-col overflow-hidden fin-modal-panel`}
            style={OPAQUE_PANEL_STYLE}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.18, ease: easeOutSoft }}
          >
            <div className="flex items-center justify-between gap-4 shrink-0 border-b-2 border-token-border px-5 py-4" style={OPAQUE_HEADER_STYLE}>
              <h3 id={titleId} className="font-display font-bold text-[17px] uppercase tracking-wide break-words">{title}</h3>
              <button
                onClick={onClose}
                className="fin-icon-button"
                aria-label="Close"
              >
                <Icon name="close" className="text-xl" />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto custom-scrollbar p-5">{children}</div>
            {footer && (
              <div className="flex flex-wrap justify-end gap-2 shrink-0 border-t-2 border-token-border px-5 py-3 bg-token-card">
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
