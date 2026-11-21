import { motion } from 'framer-motion'
import { cn } from '../../lib/cn'
import { Icon } from './Icon'
import { CountUp } from './CountUp'
import { staggerItem } from '../motion/tokens'
import { formatCurrency } from '../../lib/format'

interface StatCardProps {
  label: string
  value: string
  valueNumber?: number
  delta?: number
  icon?: string
  color?: 'yellow' | 'white' | 'cyan'
}

const colorClasses = {
  yellow: 'fin-color-yellow',
  white: 'bg-white',
  cyan: 'fin-color-cyan',
}

export function StatCard({
  label,
  value,
  valueNumber,
  delta,
  icon,
  color = 'yellow',
}: StatCardProps) {
  const positive = (delta ?? 0) >= 0
  return (
    <motion.div
      variants={staggerItem}
      className={cn(
        'brutal p-5 min-w-0 flex flex-col gap-3 justify-between',
        colorClasses[color],
      )}
    >
      <div className="flex justify-between items-start">
        <h3 className="font-mono font-bold text-[11px] uppercase tracking-wider">
          {label}
        </h3>
        {icon && <Icon name={icon} className="text-2xl" />}
      </div>
      {valueNumber !== undefined ? (
        <CountUp value={valueNumber} format={formatCurrency} className="text-[clamp(0.95rem,4vw,1.875rem)] leading-tight font-mono font-bold tabular-nums break-words" />
      ) : (
        <div className="text-[clamp(0.95rem,4vw,1.875rem)] leading-tight font-mono font-bold tabular-nums break-words">{value}</div>
      )}
      {delta !== undefined && (
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.45, type: 'spring', stiffness: 300, damping: 16 }}
          className={cn(
            'flex items-center gap-1 w-fit px-1 py-0.5 brutal-thin text-xs font-bold',
            positive
              ? 'text-on-tertiary-container bg-tertiary-container'
              : 'text-on-error-container bg-error-container',
          )}
        >
          <Icon name={positive ? 'arrow_upward' : 'arrow_downward'} className="text-sm" />
          <span>
            {positive ? '+' : ''}
            {delta}%
          </span>
        </motion.div>
      )}
    </motion.div>
  )
}
