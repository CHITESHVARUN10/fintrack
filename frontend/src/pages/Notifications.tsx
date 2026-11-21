import { useState } from 'react'
import { Link } from 'react-router-dom'
import { notificationService } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Icon } from '../components/ui/Icon'
import { formatDate } from '../lib/format'
import type { AppNotification, NotificationType } from '../types'
import './family-workspace.css'

const typeIcon: Record<NotificationType, string> = {
  subscription: 'payments',
  emi: 'real_estate_agent',
  insurance: 'health_and_safety',
  fd: 'savings',
  sip: 'trending_up',
  report: 'assessment',
  budget: 'warning',
}

const typeTint: Record<NotificationType, string> = {
  subscription: 'var(--nb-cyan)',
  emi: 'var(--nb-pink)',
  insurance: 'var(--nb-violet)',
  fd: 'var(--accent)',
  sip: 'var(--nb-teal)',
  report: 'var(--bg-warm)',
  budget: 'var(--nb-orange)',
}

const tabMap: { label: string; value: 'all' | NotificationType }[] = [
  { label: 'All', value: 'all' },
  { label: 'Payments', value: 'subscription' },
  { label: 'Investments', value: 'sip' },
  { label: 'Reports', value: 'report' },
]

export function Notifications() {
  const { data, loading, error } = useAsync(() => notificationService.list(), [])
  const [tab, setTab] = useState<'all' | NotificationType>('all')
  const [read, setRead] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)

  if (loading) return <LoadingBlock label="Loading notifications…" />

  if (!data) {
    return (
      <div className="fw-page">
        <PageHeader title="Notifications" subtitle="Alerts from your subscriptions, budgets and reports." />
        <div className="fw-status fw-status--error" role="alert">
          Could not load notifications{error ? ` — ${error}` : ''}. Reload to try again.
        </div>
      </div>
    )
  }

  const unreadCount = data.filter((n) => !n.isRead && !read.has(n.id)).length
  const filtered = tab === 'all' ? data : data.filter((n) => n.type === tab)

  const markAllRead = async () => {
    setActionError(null)
    const previous = read
    setRead(new Set(data.map((n) => n.id)))
    try {
      await notificationService.markAllRead()
    } catch {
      setRead(previous)
      setActionError('Could not mark all notifications as read. Please try again.')
    }
  }

  const subtitle =
    unreadCount > 0
      ? `You have ${unreadCount} unread alert${unreadCount === 1 ? '' : 's'}.`
      : 'All caught up — 0 unread alerts.'

  return (
    <div className="fw-page">
      <PageHeader
        title="Notifications"
        subtitle={subtitle}
        action={
          <button
            type="button"
            className="fw-btn fw-btn--white fw-btn--sm"
            onClick={markAllRead}
            disabled={unreadCount === 0}
          >
            <Icon name="done_all" className="text-base" />
            ALL READ
          </button>
        }
      />

      <div className="fw-flow">
        {actionError && (
          <div className="fw-status fw-status--error" role="alert">
            {actionError}
          </div>
        )}

        <div className="fw-tabs" role="tablist" aria-label="Notification categories">
          {tabMap.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={`fw-btn fw-btn--sm${tab === t.value ? '' : ' fw-btn--white'}`}
            >
              {t.label.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="fw-notif">
          {filtered.length === 0 && <div className="fw-empty">No notifications in this category.</div>}

          {filtered.map((n: AppNotification) => {
            const isUnread = !n.isRead && !read.has(n.id)
            const destination = n.relatedModule ? `/${n.relatedModule}` : '/dashboard'
            return (
              <Link
                key={n.id}
                to={destination}
                className={`fw-notif__row${isUnread ? ' is-unread' : ''}`}
                onClick={() => {
                  if (!isUnread) return
                  setRead((prev) => new Set(prev).add(n.id))
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                  <span
                    className="fw-notif__icon"
                    style={{ background: typeTint[n.type] ?? 'var(--bg-warm)', color: 'var(--ink-fixed)' }}
                  >
                    <Icon name={typeIcon[n.type] ?? 'notifications'} className="text-base" />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="fw-notif__msg" style={{ fontWeight: isUnread ? 800 : 600 }}>
                      {n.message}
                    </div>
                    <div className="fw-notif__date">{formatDate(n.scheduledAt)}</div>
                  </div>
                </div>
                {isUnread && <span className="fw-unread" title="Unread" aria-label="Unread" />}
              </Link>
            )
          })}
        </div>

        <p className="fw-muted" style={{ fontSize: 12 }}>
          Opening an alert takes you to the matching record. Reading a single alert only clears the
          badge in this tab — use <strong>ALL READ</strong> to clear it everywhere.
        </p>
      </div>
    </div>
  )
}
