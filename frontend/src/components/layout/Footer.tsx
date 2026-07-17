import { Icon } from '../ui/Icon'

export function Footer() {
  return (
    <footer className="h-[44px] w-full border-t-[3px] border-on-surface bg-surface-container-low flex justify-between items-center px-md shrink-0 font-bold text-xs z-40 relative text-on-surface-variant">
      <div>FinStack 2026</div>
      <div>July 2026</div>
      <div className="flex gap-2">
        <button
          className="w-8 h-8 flex items-center justify-center hover:bg-surface-container-high border-2 border-transparent hover:border-on-surface transition-colors"
          title="Help"
        >
          <Icon name="help" className="text-lg" />
        </button>
        <button
          className="w-8 h-8 flex items-center justify-center hover:bg-surface-container-high border-2 border-transparent hover:border-on-surface transition-colors"
          title="Feedback"
        >
          <Icon name="feedback" className="text-lg" />
        </button>
      </div>
    </footer>
  )
}
