import { memberService } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { useAuth } from '../context/AuthContext'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Icon } from '../components/ui/Icon'
import { initials } from '../lib/format'
import { formatCurrency } from '../lib/format'
import type { FamilyMember } from '../types'

const spendByMember: Record<string, number> = {
  m1: 68400,
  m2: 41200,
  m3: 18900,
}

const avatarColor: Record<string, string> = {
  m1: 'bg-brand-yellow',
  m2: 'bg-tertiary-container',
  m3: 'bg-error-container',
}

export function Family() {
  const { data, loading } = useAsync(() => memberService.list(), [])
  const { setActiveMemberId, isAdmin } = useAuth()

  if (loading || !data) return <LoadingBlock label="Loading members…" />

  return (
    <div>
      <PageHeader
        title="Family Members"
        subtitle="Manage access, roles, and view spending for your household."
        action={
          <button className="bg-brand-yellow border-[3px] border-on-surface px-4 py-2 font-bold uppercase shadow-brutal-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all flex items-center gap-2">
            <Icon name="person_add" className="text-xl" />
            Invite Member
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        {data.map((m: FamilyMember) => (
          <article key={m.id} className="bg-white brutal p-md flex flex-col gap-md">
            <div className="flex justify-between items-start border-b-[3px] border-on-surface pb-md">
              <div className="flex items-center gap-sm">
                <div
                  className={`w-16 h-16 border-[3px] border-on-surface flex items-center justify-center font-bold text-2xl ${avatarColor[m.id] ?? 'bg-white'}`}
                >
                  {initials(m.name)}
                </div>
                <div>
                  <h2 className="text-xl font-bold leading-none">{m.name}</h2>
                  <div
                    className={`mt-1 inline-block px-2 py-0.5 border-2 border-on-surface font-bold text-xs uppercase ${
                      m.role === 'admin' ? 'bg-on-surface text-white' : 'bg-white'
                    }`}
                  >
                    {m.role}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-between items-end pt-xs">
              <div>
                <p className="font-bold uppercase text-xs text-on-surface-variant tracking-wider">
                  Monthly Spend
                </p>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(spendByMember[m.id] ?? 0)}
                </p>
              </div>
              <div className="flex gap-sm">
                {isAdmin && m.role !== 'admin' && (
                  <button
                    onClick={() => setActiveMemberId(m.id)}
                    className="bg-white border-[3px] border-on-surface px-sm py-xs font-bold shadow-brutal-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
                  >
                    Dashboard
                  </button>
                )}
                {m.role !== 'admin' && (
                  <button
                    aria-label="Remove member"
                    className="bg-error-container text-on-error-container border-[3px] border-on-surface px-xs py-xs flex items-center justify-center shadow-brutal-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
                  >
                    <Icon name="delete" />
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}

        <button className="w-full h-full min-h-[200px] border-[3px] border-dashed border-on-surface bg-white flex flex-col items-center justify-center gap-sm hover:bg-surface-container-high transition-colors group cursor-pointer shadow-brutal">
          <div className="w-16 h-16 bg-brand-yellow border-[3px] border-on-surface flex items-center justify-center group-hover:-translate-y-1 transition-transform">
            <Icon name="add" className="text-4xl" />
          </div>
          <span className="text-xl font-bold">Invite Member</span>
        </button>
      </div>
    </div>
  )
}
