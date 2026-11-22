import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { initials } from '../../lib/format'
import { Icon } from '../ui/Icon'
import { GlobalSearch } from './GlobalSearch'

export function Header({ title, onMenu, navOpen }: { title: string; onMenu: () => void; navOpen: boolean }) {
  const { user, isAdmin, members, activeMember, setActiveMemberId } = useAuth()
  const { pathname } = useLocation()
  const { theme, toggle } = useTheme()
  const [memberOpen, setMemberOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const memberPicker = useRef<HTMLDivElement>(null)
  const memberTrigger = useRef<HTMLButtonElement>(null)
  const searchTrigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || navOpen) return
      const fromEditor = event.target instanceof HTMLElement &&
        Boolean(event.target.closest('input, textarea, select, [contenteditable="true"]'))
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      if (isShortcut || (event.key === '/' && !fromEditor)) {
        event.preventDefault()
        setMemberOpen(false)
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [navOpen])

  useEffect(() => {
    if (!memberOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !memberPicker.current?.contains(event.target)) setMemberOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setMemberOpen(false)
      memberTrigger.current?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [memberOpen])

  const accountName = user?.name || activeMember?.name || 'Account'
  const shortcut = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'

  return (
    <header className="fin-topbar">
      <div className="fin-topbar-start">
        <button
          id="fin-menu-trigger"
          type="button"
          onClick={onMenu}
          className="fin-icon-button fin-menu-trigger"
          aria-label="Open navigation menu"
          aria-expanded={navOpen}
          aria-controls={navOpen ? 'fin-mobile-nav' : undefined}
        >
          <Icon name="menu" className="text-xl" />
        </button>
        <span className="fin-topbar-title">{title}</span>
        {pathname === '/dashboard' && isAdmin && activeMember && members.length > 0 && (
          <div className="fin-member-picker" ref={memberPicker}>
            <button
              type="button"
              ref={memberTrigger}
              onClick={() => setMemberOpen((open) => !open)}
              className="fin-member-trigger"
              aria-label={`Switch member view; currently ${activeMember.name}`}
              aria-expanded={memberOpen}
              aria-controls={memberOpen ? 'fin-member-options' : undefined}
            >
              <Icon name="person" className="text-base" />
              <span className="fin-view-label">View:</span>
              <span className="fin-member-name">{activeMember.name.split(' ')[0]}</span>
              <Icon name="expand_more" className="text-base" />
            </button>
            {memberOpen && (
              <div id="fin-member-options" className="fin-member-options nb-pop-menu" role="group" aria-label="Switch member view">
                <div className="fin-member-options-heading">Switch member view</div>
                {members.map((member) => (
                  <button
                    type="button"
                    key={member.id}
                    aria-pressed={member.id === activeMember.id}
                    className="fin-member-option"
                    onClick={() => {
                      setActiveMemberId(member.id)
                      setMemberOpen(false)
                      memberTrigger.current?.focus()
                    }}
                  >
                    <span className="fin-member-initials" aria-hidden="true">{initials(member.name)}</span>
                    <span className="fin-member-option-name">{member.name}</span>
                    <span className="fin-role-tag">{member.role}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="fin-topbar-actions">
        <button
          type="button"
          ref={searchTrigger}
          onClick={() => setSearchOpen(true)}
          className="fin-search-trigger"
          aria-label="Search"
          aria-haspopup="dialog"
        >
          <Icon name="search" className="text-lg" />
          <span className="fin-search-label">Search pages, transactions, vendors…</span>
          <kbd>{shortcut}</kbd>
        </button>
        <button
          type="button"
          onClick={toggle}
          className="fin-icon-button fin-topbar-theme"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-lg" />
        </button>
        <Link to="/notifications" className="fin-icon-button" aria-label="Notifications" title="Notifications">
          <Icon name="notifications" className="text-xl" />
        </Link>
        <Link to="/settings" className="fin-account-link" aria-label="Account settings" title="Account settings">
          <span aria-hidden="true">{initials(accountName)}</span>
        </Link>
      </div>
      <GlobalSearch
        open={searchOpen}
        onClose={() => {
          setSearchOpen(false)
          requestAnimationFrame(() => searchTrigger.current?.focus())
        }}
        initialQuery={searchQuery}
        onQueryChange={setSearchQuery}
      />
    </header>
  )
}
