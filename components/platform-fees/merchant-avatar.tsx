import { cn } from '@/lib/utils'

export function MerchantAvatar({
  name,
  size = 28,
  className,
}: {
  name: string
  size?: number
  className?: string
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
    .padEnd(1, '·')
    .slice(0, 2)

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-sm bg-accent text-accent-foreground font-mono font-semibold',
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden
    >
      {initials || '··'}
    </span>
  )
}
