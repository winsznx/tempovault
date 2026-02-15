import { ReactNode } from 'react'

type BadgeVariant = 'success' | 'warning' | 'error' | 'info'

interface BadgeProps {
  variant: BadgeVariant
  children: ReactNode
  className?: string
}

export function Badge({ variant, children, className = '' }: BadgeProps) {
  const classes = [
    'badge',
    `badge-${variant}`,
    className,
  ].filter(Boolean).join(' ')

  return <span className={classes}>{children}</span>
}
