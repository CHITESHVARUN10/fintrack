import { NavLink } from 'react-router-dom'
import { navItems } from './nav'
import { useAuth } from '../../context/AuthContext'
import { initials } from '../../lib/format'
import { Icon } from '../ui/Icon'
import { cn } from '../../lib/cn'

export function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="w-[240px] h-screen fixed left-0 top-0 bg-white border-r-[3px] border-on-surface shadow-layout z-50 flex flex-col">
      {/* Logo */}
      <div className="h-[60px] border-b-[3px] border-on-surface flex items-center px-md shrink-0 bg-white">
        <h1 className="font-bold text-2xl text-on-surface uppercase tracking-tighter">
          FinStack
        </h1>
      </div>

      {/* Menu */}
      <nav className="flex-grow overflow-y-auto py-sm px-xs flex flex-col gap-1 custom-scrollbar">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            className={({ isActive }) =>
              cn(
                'relative flex items-center gap-sm px-sm py-2 border-l-[3px] font-bold transition-colors',
                isActive
                  ? 'text-on-surface border-on-surface'
                  : 'text-on-surface-variant border-transparent hover:bg-surface-container-high hover:border-on-surface',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="nb-sidebar-fill is-active" />}
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
      <div className="border-t-[3px] border-on-surface p-sm bg-surface-container-low shrink-0 flex flex-col gap-sm">
        <div className="flex items-center gap-xs">
          <div className="w-10 h-10 bg-brand-yellow border-2 border-on-surface flex items-center justify-center font-bold shrink-0">
            {initials(user?.name ?? '')}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold truncate">{user?.name}</span>
            <span className="font-bold text-[11px] text-on-surface-variant bg-white border border-on-surface px-1 w-fit uppercase">
              {user?.role}
            </span>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full py-1 bg-white border-2 border-on-surface font-bold text-xs uppercase hover:bg-brand-yellow hover:translate-x-[1px] hover:translate-y-[1px] shadow-brutal-sm hover:shadow-none transition-all flex items-center justify-center gap-1"
        >
          <Icon name="logout" className="text-base" />
          Logout
        </button>
      </div>
    </aside>
  )
}
