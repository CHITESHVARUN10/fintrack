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

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <div className="flex-grow ml-[240px] flex flex-col h-screen overflow-hidden">
        <Header title={title} />
        {needsFamily && pathname !== '/family/create-join' && (
          <div className="mx-md md:mx-xl mt-md border-[3px] border-on-surface bg-brand-yellow p-sm flex flex-wrap items-center justify-between gap-sm shadow-brutal-sm">
            <div className="flex items-center gap-sm">
              <Icon name="group_add" className="text-xl" />
              <span className="font-bold text-sm">
                You’re not in a family yet — create a new family or join with an invite code to unlock Import, Transactions & Budgets.
              </span>
            </div>
            <Link
              to="/family/create-join"
              className="brutal bg-white px-md py-xs font-bold uppercase text-sm hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] transition-all whitespace-nowrap"
            >
              Create / Join Family
            </Link>
          </div>
        )}
        <main className="flex-grow overflow-y-auto p-md md:p-xl bg-background">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  )
}
