import { Icon } from '../ui/Icon'
import { Button } from '../ui/Button'

interface UnsavedModalProps {
  open: boolean
  onStay: () => void
  onLeave: () => void
}

export function UnsavedModal({ open, onStay, onLeave }: UnsavedModalProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-on-surface/40"
      onClick={onStay}
    >
      <div
        className="bg-white border-[3px] border-on-surface shadow-brutal w-full max-w-[480px] relative"
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
