import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-xl pb-md border-b-[3px] border-on-surface gap-4">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold uppercase tracking-tight text-on-surface">
          {title}
        </h1>
        {subtitle && (
          <p className="text-on-surface-variant mt-1 font-medium">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  )
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="brutal bg-white p-xl text-center font-bold text-on-surface-variant">
      {label}
    </div>
  )
}
