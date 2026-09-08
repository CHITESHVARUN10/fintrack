import { NavLink } from 'react-router-dom'
import { navItems } from './nav'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { initials } from '../../lib/format'
import { Icon } from '../ui/Icon'
import { cn } from '../../lib/cn'
import { motion } from 'framer-motion'

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()

  return (
    <>
      {/* Logo */}
      <div className="h-[60px] border-b-[3px] border-on-surface flex items-center px-md shrink-0" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}>
        <h1 className="font-bold text-2xl uppercase tracking-tighter" style={{ color: 'var(--text-primary)' }}>
          FinStack
        </h1>
      </div>

      {/* Menu */}
      <nav className="flex-grow overflow-y-auto py-sm px-xs flex flex-col gap-1 custom-scrollbar">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard' || item.to === '/family'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'relative flex items-center gap-sm px-sm py-2 border-l-[3px] font-bold transition-colors',
                isActive
                  ? 'border-on-surface'
                  : 'border-transparent hover:bg-surface-container-high hover:border-on-surface hover:text-on-surface text-on-surface-variant',
              )
            }
            style={({ isActive }) => isActive ? { background: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'var(--accent)' } : { color: 'var(--text-secondary)' } as React.CSSProperties}
          >
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="sidebar-active-indicator" className="nb-sidebar-fill is-active" transition={{ duration: 0.18, ease: 'easeOut' }} />}
                <span className="relative z-10 flex items-center gap-sm">
                  <Icon name={item.icon} className="text-[20px]" />
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t-[3px] border-on-surface p-sm shrink-0 flex flex-col gap-sm" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-xs">
          <div className="w-10 h-10 bg-brand-yellow border-2 border-on-surface flex items-center justify-center font-bold shrink-0 text-on-surface" style={{ borderColor: 'var(--border-strong)' }}>
            {initials(user?.name ?? '')}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold truncate" style={{ color: 'var(--text-primary)' }}>{user?.name}</span>
            <span className="font-bold text-[11px] border px-1 w-fit uppercase" style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
              {user?.role}
            </span>
          </div>
        </div>
        <div className="flex gap-xs">
          <button
            onClick={toggle}
            className="flex-1 py-1 border-2 font-bold text-xs uppercase flex items-center justify-center gap-1"
            style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-base" />
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button
            onClick={logout}
            className="flex-1 py-1 border-2 font-bold text-xs uppercase hover:bg-brand-yellow hover:text-on-surface flex items-center justify-center gap-1"
            style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
          >
            <Icon name="logout" className="text-base" />
            Logout
          </button>
        </div>
      </div>
    </>
  )
}

export function Sidebar({ mobileOpen = false, onClose = () => {} }: { mobileOpen?: boolean; onClose?: () => void }) {
  return (
    <>
      {/* Desktop: fixed sidebar */}
      <aside className="hidden lg:flex w-[240px] h-screen fixed left-0 top-0 border-r-[3px] border-on-surface shadow-layout z-50 flex-col" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}>
        <SidebarBody />
      </aside>

      {/* Mobile: slide-in drawer + backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={cn(
          'lg:hidden w-[280px] max-w-[85vw] h-screen fixed left-0 top-0 border-r-[3px] border-on-surface shadow-layout z-50 flex flex-col transition-transform duration-200 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
        aria-hidden={!mobileOpen}
      >
        <SidebarBody onNavigate={onClose} />
      </aside>
    </>
  )
}
