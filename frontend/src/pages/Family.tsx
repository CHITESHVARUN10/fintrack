import { useConfirmation } from '../hooks/useConfirmation'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Icon } from '../components/ui/Icon'
import { formatCurrency, initials } from '../lib/format'
import type { FamilyMember } from '../types'
import { InviteMemberModal } from '../components/family/InviteMemberModal'
import { analyticsService, familyService } from '../services/api'
import { apiClient } from '../services/apiClient'
import './family-workspace.css'

const AVATAR_COLORS = [
  'var(--accent)',
  'var(--nb-cyan)',
  'var(--nb-teal)',
  'var(--nb-violet)',
  'var(--nb-orange)',
  'var(--nb-pink)',
]

interface JoinRequest {
  _id: string
  userId: { name: string; email: string }
}

interface FamilyRecord {
  _id: string
  inviteCode?: string
  name: string
}

function currentMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  return { from, to: now.toISOString().slice(0, 10) }
}

export function Family() {
  const confirmAction = useConfirmation()
  const navigate = useNavigate()
  const { refreshSession, members, loading, setActiveMemberId, isAdmin, user, removeMember } = useAuth()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [family, setFamily] = useState<FamilyRecord | null>(null)
  const [requests, setRequests] = useState<JoinRequest[]>([])
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [spendByMember, setSpendByMember] = useState<Record<string, number> | null>(null)

  const loadFamily = useCallback(() => {
    apiClient
      .get('/families/me')
      .then((r) => {
        const f = r.data?.family
        if (!f) return
        setFamily(f)
        const amAdmin = r.data?.membership?.role === 'ADMIN'
        if (amAdmin) {
          familyService
            .requests(f._id)
            .then((d) => setRequests(d.requests || []))
            .catch(() => setRequests([]))
        }
      })
      .catch(() => {})
  }, [])

  // Spend per member for the current month, from the same analytics endpoint
  // the family dashboard uses. Best-effort: the cards still render without it.
  useEffect(() => {
    analyticsService
      .family(currentMonthRange())
      .then((d) => {
        const map: Record<string, number> = {}
        for (const row of d.byMember || []) map[row.memberId] = row.spend
        setSpendByMember(map)
      })
      .catch(() => setSpendByMember({}))
  }, [])

  useEffect(() => {
    loadFamily()
  }, [loadFamily])

  async function handleReview(id: string, action: 'accept' | 'reject') {
    if (!family) return
    setActionError(null)
    try {
      await familyService.review(family._id, id, action)
      setRequests((prev) => prev.filter((x) => x._id !== id))
      await refreshSession()
    } catch {
      setActionError(`Could not ${action} that join request. Please try again.`)
    }
  }

  async function handleRemove(member: FamilyMember) {
    setActionError(null)
    if (!(await confirmAction(`Remove ${member.name}?`, 'They will lose access to this household.', 'Remove'))) return
    setRemovingId(member.id)
    try {
      await removeMember(member.id)
    } catch {
      setActionError(`Could not remove ${member.name}. Please try again.`)
    } finally {
      setRemovingId(null)
    }
  }

  async function copyInviteCode() {
    if (!family?.inviteCode) return
    try {
      await navigator.clipboard.writeText(family.inviteCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setActionError('Could not copy the invite code — select it and copy manually.')
    }
  }

  async function rotateCode() {
    if (!family) return
    setActionError(null)
    setRotating(true)
    try {
      const r = await familyService.rotateCode(family._id)
      setFamily(r.family)
    } catch {
      setActionError('Could not rotate the invite code. Please try again.')
    } finally {
      setRotating(false)
    }
  }

  function openMemberDashboard(member: FamilyMember) {
    setActiveMemberId(member.id)
    navigate('/dashboard')
  }

  if (loading) return <LoadingBlock label="Loading members…" />

  const hasNoFamily = !user?.familyAccountId || !family

  if (hasNoFamily) {
    return (
      <div className="fw-page">
        <PageHeader
          title="Family Members"
          subtitle="You’re not in a family yet — create one or join with an invite code."
        />
        <div className="fw-card fw-stack">
          <div className="fw-status" style={{ background: 'var(--accent)', color: 'var(--ink-fixed)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="info" className="text-base" />
              Create a new family to become admin and invite members, or join an existing family
              with a code from your admin.
            </span>
          </div>

          <div className="fw-grid-2">
            <a href="/settings#family" className="fw-choice fw-choice--accent">
              <Icon name="group_add" className="text-4xl" />
              <span className="fw-choice__title">Create Family</span>
              <span className="fw-choice__sub">Start a new household as admin</span>
            </a>
            <a href="/settings#family" className="fw-choice">
              <Icon name="login" className="text-4xl" />
              <span className="fw-choice__title">Join Family</span>
              <span className="fw-choice__sub">Use an invite code from your admin</span>
            </a>
          </div>

          <p className="fw-muted" style={{ fontSize: 12 }}>
            After creating or joining, Import, Transactions, Budgets and the Invite Member button
            unlock. Setup lives in Settings → Family.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="fw-page">
      <PageHeader
        title="Family Members"
        subtitle="Manage access, roles, and view spending for your household."
        action={
          isAdmin ? (
            <button type="button" className="fw-btn" onClick={() => setInviteOpen(true)}>
              <Icon name="person_add" className="text-base" />
              INVITE MEMBER
            </button>
          ) : undefined
        }
      />

      <div className="fw-flow">
        {actionError && (
          <div className="fw-status fw-status--error" role="alert">
            {actionError}
          </div>
        )}

        {family.inviteCode ? (
          <div className="fw-invitebar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', minWidth: 0 }}>
              <span className="fw-label">INVITE CODE</span>
              <span className="fw-invitebar__code">{family.inviteCode}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="fw-btn fw-btn--white fw-btn--sm" onClick={copyInviteCode}>
                {copied ? 'COPIED' : 'COPY'}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  className="fw-btn fw-btn--white fw-btn--sm"
                  onClick={rotateCode}
                  disabled={rotating}
                >
                  {rotating ? 'ROTATING…' : 'ROTATE'}
                </button>
              )}
            </div>
          </div>
        ) : (
          isAdmin && (
            <div className="fw-card fw-split">
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 14.5 }}>No invite code yet</p>
                <p className="fw-muted" style={{ fontSize: 13, marginTop: 3 }}>
                  Generate one so people can request to join this household.
                </p>
              </div>
              <button
                type="button"
                className="fw-btn"
                onClick={rotateCode}
                disabled={rotating}
              >
                {rotating ? 'GENERATING…' : 'GENERATE CODE'}
              </button>
            </div>
          )
        )}

        {isAdmin && requests.length > 0 && (
          <section className="fw-card fw-stack">
            <h2 className="fw-h2" style={{ fontSize: 16 }}>
              Join requests
            </h2>
            {requests.map((rq) => (
              <div
                key={rq._id}
                className="fw-ranked"
                style={{ padding: '12px 14px', backgroundColor: 'var(--bg-card)' }}
              >
                <span style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
                  {rq.userId?.name || rq.userId?.email || 'Pending applicant'}
                </span>
                <span style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="fw-btn fw-btn--sm"
                    onClick={() => handleReview(rq._id, 'accept')}
                  >
                    ACCEPT
                  </button>
                  <button
                    type="button"
                    className="fw-btn fw-btn--white fw-btn--sm"
                    onClick={() => handleReview(rq._id, 'reject')}
                  >
                    REJECT
                  </button>
                </span>
              </div>
            ))}
            <p className="fw-muted" style={{ fontSize: 12 }}>
              Accepting adds the member to the household immediately; rejecting keeps the code
              valid for someone else.
            </p>
          </section>
        )}

        <div className="fw-grid-2">
          {members.map((m: FamilyMember, i: number) => {
            const isAdminMember = m.role === 'admin'
            return (
              <article key={m.id} className="fw-card fw-member">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                  <div className="fw-avatar" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                    {initials(m.name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h2 className="fw-member__name">{m.name}</h2>
                    <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span className={`fw-tag${isAdminMember ? ' fw-tag--dark' : ''}`}>
                        {isAdminMember ? 'ADMIN' : 'MEMBER'}
                      </span>
                      {!m.isActive && <span className="fw-tag fw-tag--accent">INACTIVE</span>}
                    </div>
                    {m.email && (
                      <p className="fw-muted" style={{ fontSize: 12, marginTop: 6, overflowWrap: 'anywhere' }}>
                        {m.email}
                      </p>
                    )}
                  </div>
                </div>

                <div className="fw-member__divider" />

                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <span className="fw-label" style={{ color: 'var(--text-secondary)' }}>
                      MONTHLY SPEND
                    </span>
                    <div className="fw-member__spend">
                      {spendByMember === null
                        ? '—'
                        : spendByMember[m.id] !== undefined
                          ? formatCurrency(spendByMember[m.id])
                          : formatCurrency(0)}
                    </div>
                    <span className="fw-muted" style={{ fontSize: 11 }}>
                      {m.isActive ? 'This month, as recorded in the ledger' : 'Inactive member'}
                    </span>
                  </div>

                  {isAdmin && !isAdminMember && m.id !== user?.id && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="fw-btn fw-btn--white fw-btn--sm"
                        onClick={() => openMemberDashboard(m)}
                      >
                        DASHBOARD
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${m.name}`}
                        title={`Remove ${m.name}`}
                        className="fw-btn fw-btn--danger fw-btn--icon"
                        onClick={() => handleRemove(m)}
                        disabled={removingId === m.id}
                      >
                        <Icon name="delete" className="text-base" />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}

          {members.length === 0 && (
            <div className="fw-card">
              <div className="fw-empty">No active members yet — send an invite to get started.</div>
            </div>
          )}

          {isAdmin && (
            <button type="button" className="fw-dashed" onClick={() => setInviteOpen(true)}>
              <span className="fw-dashed__plus">+</span>
              <span className="fw-dashed__title">Invite Member</span>
              <span className="fw-muted" style={{ fontSize: 12 }}>
                They get an activation link to set a password
              </span>
            </button>
          )}
        </div>
      </div>

      <InviteMemberModal
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false)
          loadFamily()
        }}
      />
    </div>
  )
}
