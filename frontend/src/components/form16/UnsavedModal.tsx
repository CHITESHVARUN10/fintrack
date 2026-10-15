import { Icon } from '../ui/Icon'
import { Button } from '../ui/Button'
import { OPAQUE_PANEL_STYLE, SOLID_SCRIM_STYLE } from '../ui/Overlay'

interface UnsavedModalProps {
  open: boolean
  onStay: () => void
  onLeave: () => void
}

export function UnsavedModal({ open, onStay, onLeave }: UnsavedModalProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onStay}
    >
      <div className="absolute inset-0 bg-black/60" style={SOLID_SCRIM_STYLE} aria-hidden="true" />
      <div
        className="relative bg-white border-[3px] border-on-surface shadow-brutal w-full max-w-[480px]"
        style={OPAQUE_PANEL_STYLE}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Red accent bar */}
        <div className="h-3 bg-error border-b-[3px] border-on-surface" />
        <div className="p-lg pt-16 relative">
          <div className="bg-error-container text-on-error-container brutal-thin w-16 h-16 flex items-center justify-center -mt-16 mb-md">
            <Icon name="warning" className="text-3xl" filled />
          </div>
          <h2 className="font-bold text-2xl uppercase mb-sm text-center">Unsaved Changes</h2>
          <p className="font-medium text-on-surface-variant mb-lg text-center max-w-[320px] mx-auto">
            You have unsaved changes in your Form 16. If you leave now your edits will be lost.
          </p>
          <div className="flex flex-col gap-sm w-full">
            <Button variant="yellow" block onClick={onStay}>
              Stay and Save
            </Button>
            <Button variant="white" block onClick={onLeave}>
              Leave Without Saving
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
