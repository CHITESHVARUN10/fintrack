import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, Link } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { Footer } from './Footer'
import { routeTitles } from './nav'
import { useAuth } from '../../context/AuthContext'
import { Icon } from '../ui/Icon'

function resolveTitle(pathname: string): string {
  if (routeTitles[pathname]) return routeTitles[pathname]
  const match = Object.keys(routeTitles)
    .filter((k) => k !== '/' && pathname.startsWith(k))
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

  // Each route starts at the top: the app scrolls inside <main>, not the window.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!navOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNavOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navOpen])

  const [previousPath, setPreviousPath] = useState(pathname)
  if (previousPath !== pathname) {
    setPreviousPath(pathname)
    setNavOpen(false)
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-page)' }}>
      <Sidebar mobileOpen={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex-grow ml-0 lg:ml-[240px] flex flex-col h-screen overflow-hidden min-w-0" style={{ background: 'var(--bg-page)' }}>
        <Header title={title} onMenu={() => setNavOpen(true)} />
        {needsFamily && (
          <div className="mx-md md:mx-xl mt-md border-[3px] border-on-surface bg-brand-yellow p-sm flex flex-wrap items-center justify-between gap-sm shadow-brutal-sm">
            <div className="flex items-center gap-sm">
              <Icon name="group_add" className="text-xl" />
              <span className="font-bold text-sm text-on-surface">
                You’re not in a family yet — create a new family or join with an invite code to unlock Import, Transactions &amp; Budgets.
              </span>
            </div>
            <Link
              to="/settings#family"
              className="brutal bg-white px-md py-xs font-bold uppercase text-sm hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] transition-all whitespace-nowrap"
            >
              Create / Join Family
            </Link>
          </div>
        )}
        <main ref={mainRef} className="flex-grow overflow-y-auto custom-scrollbar p-md md:p-xl" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  )
}
