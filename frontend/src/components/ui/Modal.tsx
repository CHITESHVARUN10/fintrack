import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { easeOutSoft } from '../motion'
import { Icon } from './Icon'
import { OPAQUE_HEADER_STYLE, OPAQUE_PANEL_STYLE, SOLID_SCRIM_STYLE } from './Overlay'

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
  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute inset-0 bg-black/60" style={SOLID_SCRIM_STYLE} aria-hidden="true" />
          <motion.div
            className={`relative brutal bg-white w-full ${width} max-h-[90vh] overflow-y-auto`}
            style={OPAQUE_PANEL_STYLE}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.18, ease: easeOutSoft }}
          >
            <div className="flex items-center justify-between border-b-[3px] border-on-surface px-4 py-3 sticky top-0 bg-white z-10" style={OPAQUE_HEADER_STYLE}>
              <h3 className="font-bold text-lg uppercase tracking-tight">{title}</h3>
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
    </AnimatePresence>
  )
}
