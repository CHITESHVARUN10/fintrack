import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { Footer } from './Footer'
import { routeTitles } from './nav'

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

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <div className="flex-grow ml-[240px] flex flex-col h-screen overflow-hidden">
        <Header title={title} />
        <main className="flex-grow overflow-y-auto p-md md:p-xl bg-background">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  )
}
