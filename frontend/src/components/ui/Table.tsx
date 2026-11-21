import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface Column<T> {
  key: string
  header: ReactNode
  render?: (row: T) => ReactNode
  className?: string
  align?: 'left' | 'right' | 'center'
}

interface TableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  emptyMessage?: string
  onRowClick?: (row: T) => void
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = 'No records found.',
  onRowClick,
}: TableProps<T>) {
  return (
    <div className="brutal min-w-0 bg-token-card">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="fin-table-head">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-left',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-on-surface-variant"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-t border-on-surface/20 transition-none hover:bg-surface-container-high',
                    i % 2 === 1 && 'bg-surface-container-low',
                    onRowClick && 'cursor-pointer hover:bg-brand-yellow',
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-4 py-3 font-medium text-on-surface',
                        col.align === 'right' && 'text-right',
                        col.align === 'center' && 'text-center',
                        col.className,
                      )}
                    >
                      {col.render ? col.render(row) : (row as Record<string, ReactNode>)[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
