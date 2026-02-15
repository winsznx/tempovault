import { ReactNode } from 'react'

interface StatTileProps {
  label: string
  value: string | number
  change?: {
    value: string
    positive: boolean
  }
  icon?: ReactNode
  className?: string
}

export function StatTile({ label, value, change, icon, className = '' }: StatTileProps) {
  return (
    <div className={`stat-tile ${className}`}>
      {icon && (
        <div className="text-accent mb-2">
          {icon}
        </div>
      )}
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {change && (
        <div className={`stat-change ${change.positive ? 'positive' : 'negative'}`}>
          {change.positive ? '+' : ''}{change.value}
        </div>
      )}
    </div>
  )
}
