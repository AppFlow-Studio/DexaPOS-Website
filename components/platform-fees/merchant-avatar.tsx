import { cn } from '@/lib/utils'

/**
 * An initials plate identifying a merchant. Structural, so it is neutral
 * (`bg-muted`), never a tint (UI-DESIGN-SYSTEM §3.5). Callers hide it below
 * `sm` (§13.4).
 */
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
        'inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground',
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden
    >
      {initials || '··'}
    </span>
  )
}
