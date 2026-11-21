import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/ui/Icon'
import { useTheme } from '../../context/ThemeContext'

// Public header shared by /docs and /privacy only. The authenticated app shell
// is rendered by Layout for the routed product surfaces, so these two pages
// keep their own lightweight chrome.
export function PublicPageHeader({
  active,
  children,
}: {
  active: 'docs' | 'privacy'
  children?: ReactNode
}) {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  return (
    <header className="fdp-header">
      <Link to="/" className="fdp-brand" aria-label="FinStack home">
        <img className="fdp-brand-sq" src="/finstack-logo.png" alt="" />
        <span className="fdp-brand-word">FINSTACK</span>
      </Link>

      <div className="fdp-header-right">
        {active === 'docs' && <span className="fdp-active-label">Docs</span>}
        {children}
        {active === 'docs' ? (
          <Link to="/privacy" className="fdp-btn fdp-btn-white fdp-btn-sm">
            PRIVACY
          </Link>
        ) : (
          <Link to="/docs" className="fdp-btn fdp-btn-white fdp-btn-sm">
            <Icon name="menu_book" className="fdp-btn-icon" /> DOCS
          </Link>
        )}
        <button
          type="button"
          className="fdp-icon-btn"
          onClick={toggle}
          title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          <Icon name={isDark ? 'light_mode' : 'dark_mode'} />
        </button>
        <Link to="/login" className="fdp-btn fdp-btn-sm">
          LOG IN
        </Link>
      </div>
    </header>
  )
}
