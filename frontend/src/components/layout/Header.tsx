import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { initials } from '../../lib/format'
import { Icon } from '../ui/Icon'
import { cn } from '../../lib/cn'
import { GlobalSearch } from './GlobalSearch'

export function Header({ title, onMenu }: { title: string; onMenu?: () => void }) {
  const { isAdmin, members, activeMember, setActiveMemberId } = useAuth()
  const { theme, toggle } = useTheme()
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // keyboard shortcut Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
      // "/" to focus search when not typing in input
      if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <header className="h-[60px] w-full border-b-[3px] border-on-surface flex justify-between items-center px-md shrink-0 z-40 relative" style={{ background: 'var(--bg-header)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-sm min-w-0">
        {onMenu && (
          <button
            onClick={onMenu}
            className="lg:hidden p-1 border-2 hover:brightness-110 transition-colors shrink-0"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            aria-label="Open navigation menu"
          >
            <Icon name="menu" className="text-2xl" />
          </button>
        )}
        <h2 className="font-bold uppercase tracking-tight text-base sm:text-xl truncate" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h2>
        {isAdmin && (
          <div className="relative">
            <button
              onClick={() => setOpen((o) => !o)}
              className="brutal-sm flex items-center gap-1 px-2 py-1 font-bold text-xs uppercase hover:brightness-110"
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
            >
              <Icon name="group" className="text-base" />
              View: {activeMember.name.split(' ')[0]}
              <Icon name="arrow_drop_down" className="text-base" />
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                <div className="absolute left-0 mt-1 z-20 w-56 brutal shadow-brutal overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                  <div className="px-3 py-2 border-b-2 font-bold text-xs uppercase" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                    Switch member view
                  </div>
                  {members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setActiveMemberId(m.id)
                        setOpen(false)
                      }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-left font-bold hover:brightness-110',
                      )}
                      style={{ background: m.id === activeMember.id ? 'var(--bg-elevated)' : 'transparent', color: 'var(--text-primary)' }}
                    >
                      <span className="w-7 h-7 flex items-center justify-center border-2 text-xs" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                        {initials(m.name)}
                      </span>
                      <span className="flex-1 truncate">{m.name}</span>
                      <span className="text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>
                        {m.role}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-sm">
        {/* Desktop search — same styling as sidebar/header controls */}
        <div className="hidden md:flex items-center brutal-thin px-sm py-1 gap-sm min-w-[260px] lg:min-w-[360px]" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
          <Icon name="search" className="text-base shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              if (!searchOpen) setSearchOpen(true)
            }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search pages, transactions, vendors…"
            className="flex-1 bg-transparent outline-none text-xs font-bold min-w-0"
            style={{ color: 'var(--text-primary)' } as React.CSSProperties}
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="brutal-thin px-1 py-0.5 text-[10px] font-bold uppercase shrink-0"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              title="Clear"
            >
              ✕
            </button>
          ) : (
            <span className="hidden lg:flex items-center gap-1 brutal-thin px-1.5 py-0.5 text-[10px] font-bold uppercase shrink-0" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              ⌘ K
            </span>
          )}
        </div>

        {/* Mobile search icon */}
        <button
          onClick={() => setSearchOpen(true)}
          className="md:hidden p-1 border-2 border-transparent hover:border-on-surface transition-colors"
          style={{ color: 'var(--text-primary)' }}
          title="Search (⌘K)"
          aria-label="Search"
        >
          <Icon name="search" className="text-2xl" />
        </button>

        {/* Theme toggle — same component styling as search */}
        <button
          onClick={toggle}
          className="p-1.5 border-2 hover:brightness-110 transition-colors"
          style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-xl" />
        </button>

        <Link
          to="/notifications"
          className="relative p-1 border-2 border-transparent hover:border-on-surface transition-colors flex items-center justify-center"
          style={{ color: 'var(--text-primary)' }}
          title="Notifications"
        >
          <Icon name="notifications" className="text-2xl" />
          <span className="absolute top-0 right-0 w-3 h-3 bg-brand-yellow border-2 border-on-surface rounded-full nb-notification-badge" />
        </Link>
        <Link
          to="/settings"
          className="w-8 h-8 border-2 rounded-full overflow-hidden hover:brightness-110 transition-colors ml-xs flex items-center justify-center bg-brand-yellow"
          style={{ borderColor: 'var(--border)' }}
          title="Account"
        >
          <span className="font-bold text-xs" style={{ color: 'var(--accent-text)' }}>{initials(activeMember.name)}</span>
        </Link>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} initialQuery={searchQuery} onQueryChange={setSearchQuery} />
    </header>
  )
}
