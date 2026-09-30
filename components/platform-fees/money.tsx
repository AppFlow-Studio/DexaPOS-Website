import { cn } from '@/lib/utils'

interface MoneyProps {
  /** `null` / `undefined` means unknown and renders "—"; a real zero renders `$0.00` (§4.9). */
  value: number | null | undefined
  className?: string
  signed?: boolean
}

export function Money({ value, className, signed = false }: MoneyProps) {
  const n = value == null ? NaN : Number(value)
  if (!Number.isFinite(n)) {
    return <span className={cn('text-muted-foreground tabular-nums', className)}>—</span>
  }

  const sign = n < 0 ? '−' : signed && n > 0 ? '+' : ''
  const amount = Math.abs(n).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })

  return (
    <span className={cn('whitespace-nowrap tabular-nums', className)}>
      {sign}
      {amount}
    </span>
  )
}
