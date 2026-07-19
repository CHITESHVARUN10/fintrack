import React from 'react'
import { Icon } from './Icon'

type DownloadVariant = 'pdf' | 'excel' | 'generic'
type DownloadSize = 'large' | 'small'

export interface DownloadButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  loading?: boolean
  variant?: DownloadVariant
  size?: DownloadSize
}

export function DownloadButton({
  label,
  loading = false,
  variant = 'generic',
  size = 'large',
  className = '',
  disabled,
  ...props
}: DownloadButtonProps) {
  // Map variant to icon
  const getIcon = () => {
    switch (variant) {
      case 'pdf':
        return 'picture_as_pdf'
      case 'excel':
        return 'table_chart'
      case 'generic':
      default:
        return 'download'
    }
  }

  // Size classes
  const isLarge = size === 'large'
  const padding = isLarge ? 'px-5 py-2.5' : 'px-3 py-1.5'
  const fontSize = isLarge ? 'text-sm tracking-wide' : 'text-xs'
  const shadow = isLarge ? 'shadow-[4px_4px_0px_0px_#1e1c10]' : 'shadow-[2px_2px_0px_0px_#1e1c10]'

  const isDisabled = disabled || loading

  return (
    <button
      {...props}
      disabled={isDisabled}
      className={`
        relative flex items-center justify-center gap-2
        bg-brand-yellow text-on-surface font-bold uppercase ${fontSize} ${padding}
        border-[3px] border-on-surface
        ${isDisabled ? 'opacity-80 pointer-events-none' : 'cursor-pointer'}
        transition-all duration-100 ease-in-out
        ${
          !isDisabled &&
          `hover:translate-x-[2px] hover:translate-y-[2px] ${
            isLarge
              ? 'hover:shadow-[2px_2px_0px_0px_#1e1c10]'
              : 'hover:shadow-[1px_1px_0px_0px_#1e1c10]'
          } active:translate-x-[4px] active:translate-y-[4px] active:shadow-none`
        }
        ${!isDisabled && !className.includes('shadow') ? shadow : ''}
        ${className}
      `}
    >
      {loading ? (
        <div className="w-4 h-4 border-[3px] border-on-surface border-t-transparent rounded-none animate-spin" />
      ) : (
        <Icon name={getIcon()} className={isLarge ? 'text-lg' : 'text-base'} />
      )}
      <span>{loading ? 'Generating...' : label}</span>
    </button>
  )
}
