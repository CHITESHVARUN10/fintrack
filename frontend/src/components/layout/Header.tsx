import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { initials } from '../../lib/format'
import { Icon } from '../ui/Icon'
import { cn } from '../../lib/cn'

export function Header({ title }: { title: string }) {
  const { isAdmin, members, activeMember, setActiveMemberId } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <header className="h-[60px] w-full border-b-[3px] border-on-surface bg-white flex justify-between items-center px-md shrink-0 z-40 relative">
      <div className="flex items-center gap-sm">
        <h2 className="font-bold text-on-surface uppercase tracking-tight text-xl">
          {title}
        </h2>
        {isAdmin && (
          <div className="relative">
            <button
              onClick={() => setOpen((o) => !o)}
              className="brutal-sm flex items-center gap-1 px-2 py-1 bg-surface-container-low hover:bg-brand-yellow font-bold text-xs uppercase"
            >
              <Icon name="group" className="text-base" />
              View: {activeMember.name.split(' ')[0]}
              <Icon name="arrow_drop_down" className="text-base" />
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                <div className="absolute left-0 mt-1 z-20 w-56 brutal bg-white shadow-brutal">
                  <div className="px-3 py-2 border-b-2 border-on-surface font-bold text-xs uppercase text-on-surface-variant">
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
                        'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-brand-yellow font-bold',
                        m.id === activeMember.id && 'bg-surface-container-low',
                      )}
                    >
                      <span className="w-7 h-7 flex items-center justify-center border-2 border-on-surface text-xs bg-white">
                        {initials(m.name)}
                      </span>
                      <span className="flex-1 truncate">{m.name}</span>
                      <span className="text-[10px] uppercase text-on-surface-variant">
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
        <button
          className="p-1 hover:bg-surface-container-high border-2 border-transparent hover:border-on-surface transition-colors"
          title="Search"
        >
          <Icon name="search" className="text-2xl" />
        </button>
        <Link
          to="/notifications"
          className="relative p-1 hover:bg-surface-container-high border-2 border-transparent hover:border-on-surface transition-colors"
          title="Notifications"
        >
          <Icon name="notifications" className="text-2xl" />
          <span className="absolute top-0 right-0 w-3 h-3 bg-brand-yellow border-2 border-on-surface rounded-full nb-notification-badge" />
        </Link>
        <Link
          to="/settings"
          className="w-8 h-8 border-2 border-on-surface rounded-full overflow-hidden hover:shadow-brutal-sm transition-shadow ml-xs flex items-center justify-center bg-brand-yellow"
          title="Account"
        >
          <span className="font-bold text-xs">{initials(activeMember.name)}</span>
        </Link>
      </div>
    </header>
  )
}
