import { Link } from 'react-router-dom'
import { Icon } from '../ui/Icon'

export function Footer() {
  return (
    <footer className="h-[44px] w-full border-t-[3px] flex justify-between items-center px-md shrink-0 font-bold text-xs z-40 relative" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
      <div className="flex items-center gap-sm">
        <span>FinStack 2026</span>
        <span className="hidden md:inline opacity-30">·</span>
        <Link to="/privacy" className="hover:underline underline-offset-2 decoration-2 hidden md:inline">Privacy</Link>
        <span className="hidden md:inline opacity-30">·</span>
        <Link to="/docs" className="hover:underline underline-offset-2 decoration-2 hidden md:inline">Docs</Link>
      </div>
      <div className="hidden md:block">July 2026</div>
      <div className="flex gap-2">
        <Link
          to="/docs"
          className="w-8 h-8 flex items-center justify-center hover:brightness-110 border-2 border-transparent hover:border-on-surface transition-colors"
          style={{ borderColor: 'transparent' }}
          title="Docs"
        >
          <Icon name="menu_book" className="text-lg" />
        </Link>
        <Link
          to="/privacy"
          className="w-8 h-8 flex items-center justify-center hover:brightness-110 border-2 border-transparent hover:border-on-surface transition-colors"
          style={{ borderColor: 'transparent' }}
          title="Privacy Policy"
        >
          <Icon name="shield" className="text-lg" />
        </Link>
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
