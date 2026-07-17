import type { ReactNode } from 'react'
import { Icon } from './Icon'

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
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-on-surface/40"
      onClick={onClose}
    >
      <div
        className={`brutal bg-white w-full ${width} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-[3px] border-on-surface px-4 py-3 sticky top-0 bg-white z-10">
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
      </div>
    </div>
  )
}
