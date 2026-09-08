import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Icon } from '../components/ui/Icon'
import { initials } from '../lib/format'
import type { FamilyMember } from '../types'
import { InviteMemberModal } from '../components/family/InviteMemberModal'
import { familyService } from '../services/api'
import { apiClient } from '../services/apiClient'

const AVATAR_COLORS = ['bg-brand-yellow', 'bg-tertiary-container', 'bg-error-container', 'bg-surface-variant']

export function Family() {
  const { members, loading, setActiveMemberId, isAdmin, user, removeMember } = useAuth()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [family, setFamily] = useState<{ _id: string; inviteCode?: string; name: string } | null>(null)
  const [requests, setRequests] = useState<{ _id: string; userId: { name: string; email: string } }[]>([])

  useEffect(() => {
    apiClient.get('/families/me').then((r) => {
      if (r.data?.family) {
        setFamily(r.data.family)
        familyService.requests(r.data.family._id).then((d) => setRequests(d.requests || [])).catch(() => {})
      }
    }).catch(() => {})
  }, [])

  async function handleReview(id: string, action: 'accept' | 'reject') {
    if (!family) return
    await familyService.review(family._id, id, action)
    setRequests((prev) => prev.filter((x) => x._id !== id))
  }

  if (loading) return <LoadingBlock label="Loading members…" />

  const hasNoFamily = !user?.familyAccountId || !family

  if (hasNoFamily) {
    return (
      <div className="min-w-0">
        <PageHeader
          title="Family Members"
          subtitle="You’re not in a family yet — create one or join with an invite code."
        />
        <div className="brutal bg-white p-lg sm:p-xl flex flex-col gap-md max-w-2xl max-w-full min-w-0">
          <div className="flex items-center gap-sm text-sm font-bold bg-brand-yellow border-[3px] border-on-surface p-sm">
            <Icon name="info" />
            Create a new family to become admin and invite members, or join an existing family with a code from your admin.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-md min-w-0">
            <a
              href="/family/create-join"
              className="brutal bg-brand-yellow p-lg flex flex-col items-center justify-center gap-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all text-center"
            >
              <Icon name="group_add" className="text-4xl" />
              <span className="font-bold text-lg uppercase">Create Family</span>
              <span className="text-xs font-medium text-on-surface-variant">Start a new household as admin</span>
            </a>
            <a
              href="/family/create-join"
              className="brutal bg-white p-lg flex flex-col items-center justify-center gap-sm hover:bg-surface-container-high hover:translate-x-[1px] hover:translate-y-[1px] transition-all text-center"
            >
              <Icon name="login" className="text-4xl" />
              <span className="font-bold text-lg uppercase">Join Family</span>
              <span className="text-xs font-medium text-on-surface-variant">Enter an invite code like VF7K92</span>
            </a>
          </div>
          <div className="text-xs font-bold text-on-surface-variant bg-surface-container-low border-[3px] border-on-surface p-sm">
            Tip: After creating or joining, you’ll unlock Import, Transactions, Budgets and the Invite Member button. Go to <span className="underline">Family Setup</span> in the sidebar.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title="Family Members"
        subtitle="Manage access, roles, and view spending for your household."
        action={
          isAdmin ? (
            <button
              onClick={() => setInviteOpen(true)}
              className="bg-brand-yellow border-[3px] border-on-surface px-4 py-2 font-bold uppercase shadow-brutal-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all flex items-center gap-2"
            >
              <Icon name="person_add" className="text-xl" />
              Invite Member
            </button>
          ) : undefined
        }
      />

      {family?.inviteCode && (
        <div className="brutal bg-brand-yellow p-sm flex flex-col sm:flex-row flex-wrap sm:items-center justify-between gap-2 mb-md min-w-0">
          <div className="min-w-0 break-words"><span className="text-xs font-bold uppercase tracking-wider">Invite Code</span><span className="ml-sm font-mono font-bold text-lg tracking-widest break-all">{family.inviteCode}</span></div>
          <div className="flex flex-wrap gap-xs">
            <button onClick={() => navigator.clipboard.writeText(family.inviteCode!)} className="brutal-thin bg-white px-sm py-xs text-xs font-bold uppercase">Copy</button>
            {isAdmin && <button onClick={async () => { const r = await familyService.rotateCode(family._id); setFamily(r.family) }} className="brutal-thin bg-white px-sm py-xs text-xs font-bold uppercase">Rotate</button>}
          </div>
        </div>
      )}

      {isAdmin && requests.length > 0 && (
        <div className="brutal bg-white p-md mb-md">
          <h3 className="font-bold uppercase tracking-tight mb-sm">Join Requests</h3>
          {requests.map((rq) => (
            <div key={rq._id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 brutal-thin p-sm mb-xs min-w-0">
              <span className="text-sm font-medium break-words min-w-0">{rq.userId?.name || rq.userId?.email}</span>
              <div className="flex flex-wrap gap-xs">
                <button onClick={() => handleReview(rq._id, 'accept')} className="brutal bg-brand-yellow px-sm py-xs text-xs font-bold uppercase">Accept</button>
                <button onClick={() => handleReview(rq._id, 'reject')} className="brutal bg-white px-sm py-xs text-xs font-bold uppercase">Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md min-w-0">
        {members.map((m: FamilyMember, i: number) => (
          <article key={m.id} className="bg-white brutal p-md flex flex-col gap-md nb-card-enter nb-card-hover min-w-0 max-w-full">
            <div className="flex flex-wrap justify-between items-start gap-2 border-b-[3px] border-on-surface pb-md min-w-0">
              <div className="flex items-center gap-sm min-w-0">
                <div
                  className={`w-16 h-16 border-[3px] border-on-surface flex items-center justify-center font-bold text-2xl ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
                >
                  {initials(m.name)}
                </div>
                <div>
                  <h2 className="text-xl font-bold leading-none break-words">{m.name}</h2>
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
            <div className="flex flex-col sm:flex-row flex-wrap justify-between sm:items-end gap-3 pt-xs min-w-0">
              <div>
                <p className="font-bold uppercase text-xs text-on-surface-variant tracking-wider">
                  Monthly Spend
                </p>
                <p className="text-2xl font-bold mt-1">—</p>
              </div>
              <div className="flex gap-sm">
                {isAdmin && m.role !== 'admin' && (
                  <button
                    onClick={() => setActiveMemberId(m.id)}
                    className="bg-white border-[3px] border-on-surface px-sm py-xs font-bold shadow-brutal-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all"
                  >
                    Dashboard
                  </button>
                )}
                {isAdmin && m.role !== 'admin' && m.id !== user?.id && (
                  <button
                    aria-label="Remove member"
                    title="Remove member"
                    onClick={async () => {
                      if (!window.confirm(`Remove ${m.name}?`)) return
                      try {
                        await removeMember(m.id)
                      } catch {
                        window.alert('Could not remove member.')
                      }
                    }}
                    className="bg-error-container text-on-error-container border-[3px] border-on-surface px-xs py-xs flex items-center justify-center shadow-brutal-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all"
                  >
                    <Icon name="delete" />
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}

        {isAdmin && (
          <button
            onClick={() => setInviteOpen(true)}
            className="w-full h-full min-h-[200px] border-[3px] border-dashed border-on-surface bg-white flex flex-col items-center justify-center gap-sm hover:bg-surface-container-high transition-colors group cursor-pointer shadow-brutal"
          >
            <div className="w-16 h-16 bg-brand-yellow border-[3px] border-on-surface flex items-center justify-center group-hover:-translate-y-1 transition-transform">
              <Icon name="add" className="text-4xl" />
            </div>
            <span className="text-xl font-bold">Invite Member</span>
          </button>
        )}
      </div>

      <InviteMemberModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  )
}
