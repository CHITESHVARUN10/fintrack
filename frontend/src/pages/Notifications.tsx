import { useState } from 'react'
import { Link } from 'react-router-dom'
import { notificationService } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { PageHeader, LoadingBlock } from '../components/ui/PageHeader'
import { Icon } from '../components/ui/Icon'
import { formatDate } from '../lib/format'
import type { AppNotification, NotificationType } from '../types'

const typeIcon: Record<NotificationType, string> = {
  subscription: 'payments',
  emi: 'real_estate_agent',
  insurance: 'health_and_safety',
  fd: 'savings',
  sip: 'trending_up',
  report: 'assessment',
  budget: 'warning',
}

const typeColor: Record<NotificationType, string> = {
  subscription: 'bg-tertiary-container',
  emi: 'bg-error-container',
  insurance: 'bg-surface-variant',
  fd: 'bg-brand-yellow',
  sip: 'bg-tertiary-container',
  report: 'bg-secondary-container',
  budget: 'bg-error-container',
}

const tabMap: { label: string; value: 'all' | NotificationType }[] = [
  { label: 'All', value: 'all' },
  { label: 'Payments', value: 'subscription' },
  { label: 'Investments', value: 'sip' },
  { label: 'Reports', value: 'report' },
]

export function Notifications() {
  const { data, loading } = useAsync(() => notificationService.list(), [])
  const [tab, setTab] = useState<'all' | NotificationType>('all')
  const [read, setRead] = useState<Set<string>>(new Set())

  if (loading || !data) return <LoadingBlock label="Loading notifications…" />

  const unreadCount = data.filter((n) => !n.isRead && !read.has(n.id)).length
  const filtered = tab === 'all' ? data : data.filter((n) => n.type === tab)

  const markAllRead = async () => {
    setRead(new Set(data.map((n) => n.id)))
    try {
      await notificationService.markAllRead()
    } catch {
      // Optimistic: keep the local visual state even if the request fails.
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Notifications"
        subtitle={`You have ${unreadCount} unread alerts.`}
        action={
          <button
            onClick={markAllRead}
            className="bg-white border-[3px] border-on-surface py-2 px-sm font-bold shadow-brutal-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all flex items-center gap-2"
          >
            <Icon name="done_all" className="text-lg" /> All read
          </button>
        }
      />

      <div className="flex flex-wrap gap-sm mb-lg border-b-[3px] border-on-surface pb-md">
        {tabMap.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`border-[3px] border-on-surface py-2 px-sm font-bold uppercase shadow-brutal-sm transition-all ${
              tab === t.value
                ? 'bg-brand-yellow translate-x-[1px] translate-y-[1px] shadow-none'
                : 'bg-white hover:bg-surface-container-high'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="border-[3px] border-on-surface bg-white">
        {filtered.length === 0 && (
          <div className="p-xl text-center font-bold text-on-surface-variant">
            No notifications.
          </div>
        )}
        {filtered.map((n: AppNotification, i) => {
          const isUnread = !n.isRead && !read.has(n.id)
          return (
            <Link
              key={n.id}
              to={`/${n.relatedModule}`}
              className={`flex items-start p-md border-b-[3px] border-on-surface relative group hover:bg-surface-container-low transition-colors ${
                i === filtered.length - 1 ? 'border-b-0' : ''
              } ${isUnread ? '' : 'bg-surface-container-lowest'}`}
            >
              {isUnread && (
                <div className="absolute left-0 top-0 bottom-0 w-2 bg-brand-yellow" />
              )}
              <div
                className={`w-12 h-12 border-[3px] border-on-surface flex-shrink-0 flex items-center justify-center mr-sm ${typeColor[n.type]}`}
              >
                <Icon name={typeIcon[n.type]} />
              </div>
              <div className="flex-1 pr-sm">
                <p className="font-medium text-on-surface leading-tight mb-1">{n.message}</p>
                <p className="font-bold text-xs text-on-surface-variant">
                  {formatDate(n.scheduledAt)}
                </p>
              </div>
              {isUnread && <div className="w-3 h-3 bg-on-surface mt-2" />}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
