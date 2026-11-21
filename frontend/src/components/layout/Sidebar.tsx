import { useEffect, useRef } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { navItems } from './nav'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { initials } from '../../lib/format'
import { Icon } from '../ui/Icon'
import { prefetchRoute } from '../../lib/routePrefetch'

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()

  return (
    <>
      <div className="fin-sidebar-brand">
        <Link to="/" className="fin-brand-link" onClick={onNavigate}>
          <span className="fin-brand-initial" aria-hidden="true">F</span>
          <span>FinStack</span>
        </Link>
        {onNavigate && (
          <button type="button" className="fin-icon-button" aria-label="Close navigation menu" onClick={onNavigate}>
            <Icon name="close" className="text-xl" />
          </button>
        )}
      </div>

      <nav className="fin-sidebar-nav custom-scrollbar" aria-label="Primary navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard' || item.to === '/family'}
            onClick={onNavigate}
            onMouseEnter={() => prefetchRoute(item.to)}
            onFocus={() => prefetchRoute(item.to)}
            className="fin-nav-link"
          >
            <Icon name={item.icon} className="text-lg shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="fin-sidebar-footer">
        <Link to="/settings" className="fin-user" onClick={onNavigate}>
          <span className="fin-user-avatar" aria-hidden="true">{initials(user?.name ?? '')}</span>
          <span className="fin-user-text">
            <strong>{user?.name}</strong>
            {user?.role && <span className="fin-role-tag">{user.role}</span>}
          </span>
        </Link>
        <div className="fin-sidebar-actions">
          <button type="button" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-base" />
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button type="button" onClick={logout}>
            <Icon name="logout" className="text-base" />
            Logout
          </button>
        </div>
      </div>
    </>
  )
}

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const drawerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!mobileOpen) return
    drawerRef.current?.focus()
  }, [mobileOpen])

  return (
    <>
      <aside className="fin-sidebar fin-sidebar-desktop">
        <SidebarBody />
      </aside>
      {mobileOpen && (
        <>
          <div className="fin-nav-scrim" onClick={onClose} aria-hidden="true" />
          <aside
            id="fin-mobile-nav"
            ref={drawerRef}
            tabIndex={-1}
            className="fin-sidebar fin-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
              }
              if (event.key === 'Tab') {
                const items = drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)')
                if (!items?.length) return
                const first = items[0]
                const last = items[items.length - 1]
                if (event.shiftKey && (document.activeElement === first || document.activeElement === drawerRef.current)) {
                  event.preventDefault()
                  last.focus()
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault()
                  first.focus()
                }
              }
            }}
          >
            <SidebarBody onNavigate={onClose} />
          </aside>
        </>
      )}
    </>
  )
}
