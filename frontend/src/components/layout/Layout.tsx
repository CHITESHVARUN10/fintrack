import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, Link } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { Footer } from './Footer'
import { routeTitles } from './nav'
import { useAuth } from '../../context/AuthContext'
import { Icon } from '../ui/Icon'
import './FinStackShell.css'

function resolveTitle(pathname: string): string {
  if (routeTitles[pathname]) return routeTitles[pathname]
  const match = Object.keys(routeTitles)
    .filter((route) => pathname.startsWith(`${route}/`))
    .sort((a, b) => b.length - a.length)[0]
  return match ? routeTitles[match] : 'FinStack'
}

export function Layout() {
  const { pathname } = useLocation()
  const title = resolveTitle(pathname)
  const { user } = useAuth()
  const needsFamily = !user?.familyAccountId
  const [navOpen, setNavOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  useEffect(() => {
    if (!navOpen) return
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setNavOpen(false)
    }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [navOpen])

  const [previousPath, setPreviousPath] = useState(pathname)
  if (previousPath !== pathname) {
    setPreviousPath(pathname)
    setNavOpen(false)
  }

  return (
    <div className="fin-app-shell">
      {!navOpen && (
        <a className="fin-skip-link" href="#fin-main" onClick={(event) => {
          event.preventDefault()
          mainRef.current?.focus()
        }}>Skip to content</a>
      )}
      <Sidebar mobileOpen={navOpen} onClose={() => {
        setNavOpen(false)
        requestAnimationFrame(() => document.getElementById('fin-menu-trigger')?.focus())
      }} />
      <div className="fin-app-column" inert={navOpen}>
        <Header title={title} onMenu={() => setNavOpen(true)} navOpen={navOpen} />
        <div ref={scrollRef} className="fin-app-scroll custom-scrollbar bg-grid-pattern">
          <main id="fin-main" ref={mainRef} className="fin-app-content" tabIndex={-1}>
            {needsFamily && (
              <div className="fin-family-banner">
                <p><Icon name="group_add" className="text-xl shrink-0" /> Create or join a family to use Import, Transactions, and Budgets.</p>
                <Link to="/settings#family">Create or join a family</Link>
              </div>
            )}
            <Outlet />
          </main>
          <Footer />
        </div>
      </div>
    </div>
  )
}
