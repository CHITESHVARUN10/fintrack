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
    <div className="space-y-6" aria-busy="true" aria-label={label}>
      <div className="h-2 nb-indeterminate" />
      <div className="nb-skeleton-card p-6 min-h-[120px]">
        <div className="h-5 w-[35%] nb-skeleton" />
        <div className="mt-4 space-y-2">
          <div className="h-3 w-[90%] nb-skeleton" />
          <div className="h-3 w-[70%] nb-skeleton" />
          <div className="h-3 w-[50%] nb-skeleton" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="nb-skeleton-card p-4 min-h-[100px]">
            <div className="h-3 w-[60%] nb-skeleton" />
            <div className="h-8 w-[80%] nb-skeleton mt-3" />
          </div>
        ))}
      </div>
    </div>
  )
}
