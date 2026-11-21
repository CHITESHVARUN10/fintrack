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
    <div className="flex flex-wrap justify-between items-end mb-6 pb-[18px] border-b-2 border-token-border gap-4 min-w-0">
      <div className="min-w-0 max-w-full">
        <h1 className="text-[clamp(1.75rem,4vw,2.125rem)] leading-[1.05] font-bold uppercase tracking-[-0.03em] text-on-surface break-words max-w-full">
          {title}
        </h1>
        {subtitle && (
          <p className="text-on-surface-variant mt-1.5 text-sm font-medium break-words">{subtitle}</p>
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
