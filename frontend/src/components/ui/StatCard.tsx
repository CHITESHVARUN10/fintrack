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
  yellow: 'bg-brand-yellow',
  white: 'bg-white',
  cyan: 'bg-tertiary-container',
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
        'brutal p-md flex flex-col gap-sm nb-card-hover',
        colorClasses[color],
      )}
    >
      <div className="flex justify-between items-start">
        <h3 className="font-bold text-xs uppercase tracking-wider text-on-surface">
          {label}
        </h3>
        {icon && <Icon name={icon} className="text-2xl" />}
      </div>
      {valueNumber !== undefined ? (
        <CountUp value={valueNumber} format={formatCurrency} className="text-3xl font-bold text-on-surface" />
      ) : (
        <div className="text-3xl font-bold text-on-surface">{value}</div>
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
