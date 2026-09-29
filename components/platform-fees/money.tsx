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

  const isNegative = n < 0
  // Round to whole cents before splitting, or 2.996 renders as "$2.100".
  const totalCents = Math.round(Math.abs(n) * 100)
  const dollars = Math.floor(totalCents / 100)
  const cents = totalCents % 100
  const dollarStr = dollars.toLocaleString('en-US')
  const centsStr = cents.toString().padStart(2, '0')

  const sign = isNegative ? '−' : signed && n > 0 ? '+' : ''

  return (
    <span className={cn('whitespace-nowrap tabular-nums', className)}>
      {sign}
      <span>${dollarStr}</span>
      <span className="font-normal text-muted-foreground">.{centsStr}</span>
    </span>
  )
}
